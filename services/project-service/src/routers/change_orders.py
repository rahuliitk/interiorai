"""
Change order API routes.

Provides endpoints for creating change orders and running impact analysis
to understand how proposed changes affect the project schedule and budget.
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

from src.agents.impact_agent import ImpactAgent
from src.models.change_order import (
    ChangeOrder,
    ChangeOrderAnalyzeRequest,
    ChangeOrderCreate,
    ChangeOrderResponse,
    ChangeOrderStatus,
    ImpactAnalysis,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/change-orders", tags=["change-orders"])

CHANGE_ORDER_CACHE_PREFIX = "change_order:"
SCHEDULE_CACHE_PREFIX = "schedule:"
CACHE_TTL = 3600 * 24  # 24 hours


# ---------------------------------------------------------------------------
# POST /api/v1/change-orders — Create a change order
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ChangeOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a change order",
    description="Create a new change order for a project. The change order starts in DRAFT status.",
)
async def create_change_order(
    request: ChangeOrderCreate,
    user_id: Annotated[str, Depends(get_current_user)],
) -> ChangeOrderResponse:
    """Create a change order and store it in cache."""
    now = datetime.now(tz=timezone.utc)
    order_id = str(uuid.uuid4())

    change_order = ChangeOrder(
        id=order_id,
        project_id=request.project_id,
        schedule_id=request.schedule_id,
        type=request.type,
        title=request.title,
        description=request.description,
        requested_by=user_id,
        status=ChangeOrderStatus.DRAFT,
        change_details=request.change_details,
        impact_analysis=None,
        created_at=now,
        updated_at=now,
    )

    await cache_set(
        f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}",
        change_order.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    logger.info(
        "change_order_created",
        order_id=order_id,
        project_id=request.project_id,
        type=request.type.value,
    )

    return ChangeOrderResponse(
        change_order=change_order,
        message="Change order created. Use POST /change-orders/{id}/analyze to run impact analysis.",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/change-orders/{order_id} — Get a change order
# ---------------------------------------------------------------------------


@router.get(
    "/{order_id}",
    response_model=ChangeOrderResponse,
    summary="Get a change order by ID",
)
async def get_change_order(
    order_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> ChangeOrderResponse:
    """Retrieve a change order from cache."""
    cached = await cache_get(f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Change order {order_id} not found",
        )

    return ChangeOrderResponse(
        change_order=ChangeOrder(**cached),
        message="",
    )


# ---------------------------------------------------------------------------
# POST /api/v1/change-orders/{order_id}/analyze — Analyze impact
# ---------------------------------------------------------------------------


@router.post(
    "/{order_id}/analyze",
    response_model=ChangeOrderResponse,
    summary="Analyze change order impact",
    description=(
        "Run impact analysis on a change order to determine its effect on "
        "the project schedule and budget. Optionally provide current schedule "
        "and BOM data for more accurate analysis."
    ),
)
async def analyze_change_order(
    order_id: str,
    request: ChangeOrderAnalyzeRequest,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChangeOrderResponse:
    """Run the ImpactAgent to analyse the change order's effects.

    If schedule/BOM data is not provided in the request body, the endpoint
    attempts to load it from cache using the schedule_id stored on the
    change order.
    """
    cached = await cache_get(f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Change order {order_id} not found",
        )

    change_order = ChangeOrder(**cached)

    # Load schedule data if not provided
    schedule_data = request.schedule_data
    if not schedule_data:
        schedule_cached = await cache_get(f"{SCHEDULE_CACHE_PREFIX}{change_order.schedule_id}")
        if schedule_cached:
            schedule_data = schedule_cached

    bom_data = request.bom_data

    # Update status to analyzing
    change_order.status = ChangeOrderStatus.ANALYZING
    change_order.updated_at = datetime.now(tz=timezone.utc)
    await cache_set(
        f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}",
        change_order.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    # Run impact analysis
    try:
        agent = ImpactAgent()
        result = await agent.invoke(
            change_order_id=order_id,
            change_order_type=change_order.type.value,
            change_title=change_order.title,
            change_description=change_order.description,
            change_details=change_order.change_details,
            schedule_data=schedule_data,
            bom_data=bom_data,
        )

        impact_data = result.get("impact_analysis")
        if impact_data:
            change_order.impact_analysis = ImpactAnalysis(**impact_data)
            change_order.status = ChangeOrderStatus.ANALYZED
        else:
            change_order.status = ChangeOrderStatus.DRAFT

        change_order.updated_at = datetime.now(tz=timezone.utc)

        await cache_set(
            f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}",
            change_order.model_dump(mode="json"),
            ttl=CACHE_TTL,
        )

        logger.info(
            "change_order_analyzed",
            order_id=order_id,
            risk_level=change_order.impact_analysis.risk_level if change_order.impact_analysis else None,
        )

        return ChangeOrderResponse(
            change_order=change_order,
            message="Impact analysis complete.",
        )

    except Exception as exc:
        logger.error(
            "change_order_analysis_failed",
            order_id=order_id,
            error=str(exc),
            exc_info=True,
        )

        change_order.status = ChangeOrderStatus.DRAFT
        change_order.updated_at = datetime.now(tz=timezone.utc)
        await cache_set(
            f"{CHANGE_ORDER_CACHE_PREFIX}{order_id}",
            change_order.model_dump(mode="json"),
            ttl=CACHE_TTL,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Impact analysis failed: {exc}",
        ) from exc
