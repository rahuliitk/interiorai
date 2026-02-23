"""
Milestone management API routes.

Provides endpoints for listing and updating milestones within a project
schedule.  Milestones are auto-generated during schedule creation but can
be manually updated as work progresses on site.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.models.schedule import MilestoneStatus

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/milestones", tags=["milestones"])

SCHEDULE_CACHE_PREFIX = "schedule:"
SCHEDULE_CACHE_TTL = 3600 * 24  # 24 hours


# -- Request models ---------------------------------------------------------


class MilestoneUpdateRequest(BaseModel):
    """Request body for updating a milestone."""

    status: MilestoneStatus | None = None
    actual_date: date | None = None
    name: str | None = None
    description: str | None = None


class MilestoneResponse(BaseModel):
    """Response containing a milestone."""

    milestone: dict[str, Any]
    message: str = ""


class MilestoneListResponse(BaseModel):
    """Response for listing milestones."""

    schedule_id: str
    total: int
    milestones: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# GET /api/v1/milestones/{schedule_id} — List milestones for a schedule
# ---------------------------------------------------------------------------


@router.get(
    "/{schedule_id}",
    response_model=MilestoneListResponse,
    summary="List milestones for a schedule",
    description="Returns all milestones for a given schedule, ordered by target date.",
)
async def list_milestones(
    schedule_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> MilestoneListResponse:
    """Retrieve milestones from the cached schedule data."""
    cached = await cache_get(f"{SCHEDULE_CACHE_PREFIX}{schedule_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    milestones = cached.get("milestones", [])

    # Sort by target date
    milestones_sorted = sorted(
        milestones,
        key=lambda m: m.get("target_date", "9999-12-31"),
    )

    return MilestoneListResponse(
        schedule_id=schedule_id,
        total=len(milestones_sorted),
        milestones=milestones_sorted,
    )


# ---------------------------------------------------------------------------
# PUT /api/v1/milestones/{milestone_id} — Update a milestone
# ---------------------------------------------------------------------------


@router.put(
    "/{milestone_id}",
    response_model=MilestoneResponse,
    summary="Update a milestone status",
    description=(
        "Update the status, actual date, or description of a milestone. "
        "Requires the schedule_id as a query parameter to locate the schedule."
    ),
)
async def update_milestone(
    milestone_id: str,
    request: MilestoneUpdateRequest,
    schedule_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> MilestoneResponse:
    """Update a specific milestone within a schedule.

    The schedule is loaded from cache, the milestone is updated, and the
    modified schedule is written back to cache.
    """
    cached = await cache_get(f"{SCHEDULE_CACHE_PREFIX}{schedule_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    milestones = cached.get("milestones", [])
    target_milestone: dict[str, Any] | None = None
    target_index: int = -1

    for idx, ms in enumerate(milestones):
        if ms.get("id") == milestone_id:
            target_milestone = ms
            target_index = idx
            break

    if target_milestone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone {milestone_id} not found in schedule {schedule_id}",
        )

    # Apply updates
    if request.status is not None:
        target_milestone["status"] = request.status.value
    if request.actual_date is not None:
        target_milestone["actual_date"] = request.actual_date.isoformat()
    if request.name is not None:
        target_milestone["name"] = request.name
    if request.description is not None:
        target_milestone["description"] = request.description

    # Write back to cache
    milestones[target_index] = target_milestone
    cached["milestones"] = milestones
    await cache_set(
        f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
        cached,
        ttl=SCHEDULE_CACHE_TTL,
    )

    logger.info(
        "milestone_updated",
        milestone_id=milestone_id,
        schedule_id=schedule_id,
        status=target_milestone.get("status"),
    )

    return MilestoneResponse(
        milestone=target_milestone,
        message=f"Milestone '{target_milestone.get('name')}' updated successfully.",
    )
