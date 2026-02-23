"""
Purchase order API routes.

Provides endpoints for generating purchase orders from BOM data, retrieving
individual orders, and updating order status.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.config import Settings, get_settings
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.phasing_agent import PhasingAgent
from src.agents.procurement_agent import ProcurementAgent
from src.models.order import (
    OrderGenerateRequest,
    OrderGenerateResponse,
    OrderStatus,
    OrderStatusUpdateRequest,
    PurchaseOrder,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])

ORDER_CACHE_PREFIX = "order:"
PROJECT_ORDERS_PREFIX = "project_orders:"
CACHE_TTL = 3600 * 24  # 24 hours


# ---------------------------------------------------------------------------
# POST /api/v1/orders/generate — Generate POs from BOM
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=OrderGenerateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate purchase orders from BOM",
    description=(
        "Accepts BOM items, optional vendor list, and schedule milestones. "
        "Groups items by category, optimises vendor selection, and creates "
        "phased purchase orders aligned with the construction timeline."
    ),
)
async def generate_orders(
    request: OrderGenerateRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OrderGenerateResponse:
    """Generate purchase orders using the ProcurementAgent and PhasingAgent.

    1. Run ProcurementAgent to create vendor-optimised POs.
    2. If schedule milestones are provided, run PhasingAgent to set order timing.
    3. Cache all orders and return the result.
    """
    # Step 1: Run procurement agent
    procurement_agent = ProcurementAgent()
    procurement_result = await procurement_agent.invoke(
        project_id=request.project_id,
        bom_items=[item.model_dump() for item in request.bom_items],
        vendors=[v.model_dump() for v in request.vendors] if request.vendors else [],
        target_budget=request.target_budget,
        currency=request.currency,
    )

    purchase_orders = procurement_result.get("purchase_orders", [])
    total_order_value = procurement_result.get("total_order_value", 0.0)
    total_shipping = procurement_result.get("total_shipping", 0.0)

    # Step 2: Phase orders if milestones are provided
    phase_count = 0
    if request.schedule_milestones and purchase_orders:
        try:
            phasing_agent = PhasingAgent()
            phasing_result = await phasing_agent.invoke(
                project_id=request.project_id,
                purchase_orders=purchase_orders,
                schedule_milestones=[m.model_dump() for m in request.schedule_milestones],
            )

            phased_orders = phasing_result.get("phased_orders")
            if phased_orders:
                purchase_orders = phased_orders

            phase_summary = phasing_result.get("phase_summary", {})
            phase_count = phase_summary.get("total_phases", 0)

            logger.info(
                "orders_phased",
                project_id=request.project_id,
                phase_count=phase_count,
            )

        except Exception as exc:
            logger.warning(
                "order_phasing_failed",
                project_id=request.project_id,
                error=str(exc),
            )
            # Continue with unphased orders

    # Step 3: Cache each order individually and the project-level index
    order_ids: list[str] = []
    po_models: list[PurchaseOrder] = []

    for po_data in purchase_orders:
        order_id = po_data.get("id", str(uuid.uuid4()))
        order_ids.append(order_id)

        await cache_set(
            f"{ORDER_CACHE_PREFIX}{order_id}",
            po_data,
            ttl=CACHE_TTL,
        )

        po_models.append(PurchaseOrder(**po_data))

    # Store project-level order index
    await cache_set(
        f"{PROJECT_ORDERS_PREFIX}{request.project_id}",
        order_ids,
        ttl=CACHE_TTL,
    )

    vendor_ids = set(po.get("vendor_id", "") for po in purchase_orders if po.get("vendor_id"))

    logger.info(
        "orders_generated",
        project_id=request.project_id,
        order_count=len(purchase_orders),
        vendor_count=len(vendor_ids),
        total_value=total_order_value,
    )

    return OrderGenerateResponse(
        project_id=request.project_id,
        orders=po_models,
        total_order_value=round(total_order_value, 2),
        total_shipping=round(total_shipping, 2),
        vendor_count=len(vendor_ids),
        phase_count=phase_count,
        message=f"Generated {len(purchase_orders)} purchase orders across {len(vendor_ids)} vendors.",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/orders/{order_id} — Get a purchase order
# ---------------------------------------------------------------------------


@router.get(
    "/{order_id}",
    response_model=PurchaseOrder,
    summary="Get a purchase order by ID",
)
async def get_order(
    order_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> PurchaseOrder:
    """Retrieve a purchase order from cache."""
    cached = await cache_get(f"{ORDER_CACHE_PREFIX}{order_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found",
        )

    return PurchaseOrder(**cached)


# ---------------------------------------------------------------------------
# PUT /api/v1/orders/{order_id}/status — Update order status
# ---------------------------------------------------------------------------


@router.put(
    "/{order_id}/status",
    response_model=PurchaseOrder,
    summary="Update a purchase order status",
    description="Transition a purchase order to a new status (e.g. draft -> approved -> ordered).",
)
async def update_order_status(
    order_id: str,
    request: OrderStatusUpdateRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> PurchaseOrder:
    """Update the status of a purchase order."""
    cached = await cache_get(f"{ORDER_CACHE_PREFIX}{order_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found",
        )

    # Validate status transition
    current_status = cached.get("status", "draft")
    valid_transitions: dict[str, list[str]] = {
        "draft": ["pending_approval", "approved", "cancelled"],
        "pending_approval": ["approved", "cancelled"],
        "approved": ["ordered", "cancelled"],
        "ordered": ["partially_delivered", "delivered", "cancelled"],
        "partially_delivered": ["delivered", "cancelled"],
        "delivered": [],
        "cancelled": [],
    }

    allowed = valid_transitions.get(current_status, [])
    if request.status.value not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition: {current_status} -> {request.status.value}. "
                f"Allowed transitions: {allowed}"
            ),
        )

    cached["status"] = request.status.value
    cached["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
    if request.notes:
        cached["notes"] = (cached.get("notes", "") + f"\n{request.notes}").strip()

    await cache_set(
        f"{ORDER_CACHE_PREFIX}{order_id}",
        cached,
        ttl=CACHE_TTL,
    )

    logger.info(
        "order_status_updated",
        order_id=order_id,
        old_status=current_status,
        new_status=request.status.value,
    )

    return PurchaseOrder(**cached)
