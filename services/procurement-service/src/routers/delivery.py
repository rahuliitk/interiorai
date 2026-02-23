"""
Delivery tracking API routes.

Provides endpoints for updating delivery status and retrieving delivery
information for purchase orders, including delay alerts and comparison
of expected vs actual delivery dates.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.models.order import (
    DeliveryStatus,
    DeliveryStatusEnum,
    DeliveryStatusResponse,
    DeliveryTrackRequest,
    DeliveryUpdate,
)
from src.services.delivery_tracker import DeliveryTracker

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/delivery", tags=["delivery"])

DELIVERY_CACHE_PREFIX = "delivery:"
ORDER_CACHE_PREFIX = "order:"
CACHE_TTL = 3600 * 24 * 7  # 7 days

_tracker = DeliveryTracker()


# ---------------------------------------------------------------------------
# POST /api/v1/delivery/track — Update delivery status
# ---------------------------------------------------------------------------


@router.post(
    "/track",
    response_model=DeliveryStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Update delivery status for an order",
    description=(
        "Create or update the delivery tracking record for a purchase order. "
        "Automatically detects delays and generates alert messages."
    ),
)
async def track_delivery(
    request: DeliveryTrackRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> DeliveryStatusResponse:
    """Update delivery tracking for a purchase order.

    If no delivery record exists for the order, one is created. Otherwise
    the existing record is updated with the new status.
    """
    # Check that the order exists
    order_cached = await cache_get(f"{ORDER_CACHE_PREFIX}{request.order_id}")
    if order_cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {request.order_id} not found",
        )

    # Load or create delivery record
    delivery_cached = await cache_get(f"{DELIVERY_CACHE_PREFIX}{request.order_id}")

    if delivery_cached is not None:
        delivery = DeliveryStatus(**delivery_cached)
    else:
        # Create new delivery record
        expected = request.expected_date
        if expected is None:
            expected_str = order_cached.get("expected_delivery_date")
            if expected_str:
                expected = date.fromisoformat(expected_str)

        delivery = _tracker.create_delivery_record(
            order_id=request.order_id,
            expected_date=expected,
        )

    # Apply the status update
    delivery = _tracker.update_status(
        delivery=delivery,
        new_status=request.status,
        tracking_number=request.tracking_number,
        carrier=request.carrier,
        location=request.location,
        expected_date=request.expected_date,
        actual_date=request.actual_date,
        delay_reason=request.delay_reason,
        notes=request.notes,
    )

    # Persist to cache
    await cache_set(
        f"{DELIVERY_CACHE_PREFIX}{request.order_id}",
        delivery.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    # Update the order's delivery status too
    if order_cached:
        if delivery.actual_date:
            order_cached["actual_delivery_date"] = delivery.actual_date.isoformat()
        if request.status == DeliveryStatusEnum.DELIVERED:
            order_cached["status"] = "delivered"
        elif request.status in (DeliveryStatusEnum.DISPATCHED, DeliveryStatusEnum.IN_TRANSIT, DeliveryStatusEnum.OUT_FOR_DELIVERY):
            order_cached["status"] = "ordered"
        await cache_set(
            f"{ORDER_CACHE_PREFIX}{request.order_id}",
            order_cached,
            ttl=CACHE_TTL,
        )

    # Generate delay alert if applicable
    is_delayed = delivery.delay_days > 0
    delay_alert = _tracker.generate_delay_alert(delivery)

    if delay_alert:
        logger.warning(
            "delivery_delayed",
            order_id=request.order_id,
            delay_days=delivery.delay_days,
            alert=delay_alert,
        )

    logger.info(
        "delivery_tracked",
        order_id=request.order_id,
        status=delivery.status.value,
        delay_days=delivery.delay_days,
    )

    return DeliveryStatusResponse(
        delivery=delivery,
        is_delayed=is_delayed,
        delay_alert=delay_alert,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/delivery/{order_id} — Get delivery status
# ---------------------------------------------------------------------------


@router.get(
    "/{order_id}",
    response_model=DeliveryStatusResponse,
    summary="Get delivery status for an order",
    description="Returns the full delivery tracking record including timeline updates and delay information.",
)
async def get_delivery_status(
    order_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> DeliveryStatusResponse:
    """Retrieve the delivery tracking record for a purchase order."""
    delivery_cached = await cache_get(f"{DELIVERY_CACHE_PREFIX}{order_id}")

    if delivery_cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery record for order {order_id} not found",
        )

    delivery = DeliveryStatus(**delivery_cached)

    # Recompute delay (in case time has passed since last update)
    delivery.delay_days = _tracker.compute_delay_days(delivery)
    is_delayed = delivery.delay_days > 0
    delay_alert = _tracker.generate_delay_alert(delivery)

    return DeliveryStatusResponse(
        delivery=delivery,
        is_delayed=is_delayed,
        delay_alert=delay_alert,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/delivery/project/{project_id} — Get all deliveries for a project
# ---------------------------------------------------------------------------


@router.get(
    "/project/{project_id}",
    summary="Get all delivery statuses for a project",
    description="Returns delivery tracking for all orders in a project with delay summary.",
)
async def get_project_deliveries(
    project_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> dict[str, Any]:
    """Retrieve all delivery records for a project and generate a summary."""
    # Load project order IDs
    from src.routers.orders import PROJECT_ORDERS_PREFIX
    order_ids = await cache_get(f"{PROJECT_ORDERS_PREFIX}{project_id}")

    if order_ids is None or not isinstance(order_ids, list):
        return {
            "project_id": project_id,
            "deliveries": [],
            "summary": _tracker.compare_expected_vs_actual([]),
        }

    deliveries: list[DeliveryStatus] = []
    delivery_responses: list[dict[str, Any]] = []

    for order_id in order_ids:
        delivery_cached = await cache_get(f"{DELIVERY_CACHE_PREFIX}{order_id}")
        if delivery_cached:
            delivery = DeliveryStatus(**delivery_cached)
            delivery.delay_days = _tracker.compute_delay_days(delivery)
            deliveries.append(delivery)

            delay_alert = _tracker.generate_delay_alert(delivery)
            delivery_responses.append({
                "delivery": delivery.model_dump(mode="json"),
                "is_delayed": delivery.delay_days > 0,
                "delay_alert": delay_alert,
            })

    summary = _tracker.compare_expected_vs_actual(deliveries)

    return {
        "project_id": project_id,
        "deliveries": delivery_responses,
        "summary": summary,
    }
