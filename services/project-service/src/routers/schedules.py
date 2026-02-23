"""
Schedule generation API routes.

Provides endpoints for generating construction schedules from project data,
BOM, and design variants, as well as retrieving schedule details and Gantt
chart data.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.config import Settings, get_settings
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.schedule_agent import ScheduleAgent
from src.models.schedule import (
    Schedule,
    ScheduleGenerateRequest,
    ScheduleGenerateResponse,
    ScheduleStatus,
)
from src.services.gantt_export import export_gantt_json

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/schedules", tags=["schedules"])

SCHEDULE_CACHE_PREFIX = "schedule:"
SCHEDULE_CACHE_TTL = 3600  # 1 hour


# ---------------------------------------------------------------------------
# POST /api/v1/schedules/generate — Generate a construction schedule
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=ScheduleGenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate a construction schedule from project data",
    description=(
        "Accepts project rooms, BOM data, and design variants.  Creates an async "
        "schedule generation job using the ScheduleAgent and returns immediately."
    ),
)
async def generate_schedule(
    request: ScheduleGenerateRequest,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ScheduleGenerateResponse:
    """Kick off schedule generation as a background task.

    The client can poll ``GET /api/v1/schedules/{id}`` to check progress.
    """
    schedule_id = str(uuid.uuid4())

    # Store a placeholder in Redis so the client can poll for status
    await cache_set(
        f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
        {
            "id": schedule_id,
            "project_id": request.project_id,
            "status": ScheduleStatus.PENDING.value,
        },
        ttl=SCHEDULE_CACHE_TTL,
    )

    background_tasks.add_task(
        _run_schedule_generation,
        schedule_id=schedule_id,
        request=request,
        user_id=user_id,
    )

    logger.info(
        "schedule_generation_started",
        schedule_id=schedule_id,
        project_id=request.project_id,
        room_count=len(request.rooms),
    )

    return ScheduleGenerateResponse(
        schedule_id=schedule_id,
        status=ScheduleStatus.PENDING,
        message="Schedule generation started. Poll GET /api/v1/schedules/{id} for progress.",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/schedules/{schedule_id} — Get a schedule
# ---------------------------------------------------------------------------


@router.get(
    "/{schedule_id}",
    summary="Get a schedule by ID",
    description="Returns the full schedule including tasks, dependencies, milestones, and Gantt data.",
)
async def get_schedule(
    schedule_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> dict[str, Any]:
    """Return the schedule from cache.

    In production this would query the database; here we use Redis as
    the interim store while the schedule is being generated.
    """
    cached = await cache_get(f"{SCHEDULE_CACHE_PREFIX}{schedule_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    # If the schedule is complete, include Gantt export
    if cached.get("status") == ScheduleStatus.COMPLETE.value and "tasks" in cached:
        try:
            schedule_model = Schedule(**cached)
            gantt_data = export_gantt_json(schedule_model)
            cached["gantt"] = gantt_data
        except Exception:
            logger.warning("gantt_export_failed", schedule_id=schedule_id, exc_info=True)

    return cached


# ---------------------------------------------------------------------------
# GET /api/v1/schedules/{schedule_id}/gantt — Get Gantt chart data
# ---------------------------------------------------------------------------


@router.get(
    "/{schedule_id}/gantt",
    summary="Get Gantt chart data for a schedule",
    description="Returns the schedule formatted for frontend Gantt chart rendering.",
)
async def get_gantt(
    schedule_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> dict[str, Any]:
    """Export Gantt chart JSON for a completed schedule."""
    cached = await cache_get(f"{SCHEDULE_CACHE_PREFIX}{schedule_id}")

    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    if cached.get("status") != ScheduleStatus.COMPLETE.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Schedule is not yet complete (status: {cached.get('status')})",
        )

    try:
        schedule_model = Schedule(**cached)
        return export_gantt_json(schedule_model)
    except Exception as exc:
        logger.error("gantt_export_error", schedule_id=schedule_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate Gantt data",
        ) from exc


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------


async def _run_schedule_generation(
    schedule_id: str,
    request: ScheduleGenerateRequest,
    user_id: str,
) -> None:
    """Run the ScheduleAgent in the background and store the result."""
    try:
        # Update status to generating
        await cache_set(
            f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
            {
                "id": schedule_id,
                "project_id": request.project_id,
                "status": ScheduleStatus.GENERATING.value,
            },
            ttl=SCHEDULE_CACHE_TTL,
        )

        agent = ScheduleAgent()
        result = await agent.invoke(
            schedule_id=schedule_id,
            project_id=request.project_id,
            project_name=request.project_name,
            rooms=[r.model_dump() for r in request.rooms],
            bom_items=[b.model_dump() for b in request.bom_items],
            design_variants=[d.model_dump() for d in request.design_variants],
            start_date=request.start_date.isoformat(),
            working_days_per_week=request.working_days_per_week,
        )

        schedule_data = result.get("schedule_result", {})
        if schedule_data:
            await cache_set(
                f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
                schedule_data,
                ttl=SCHEDULE_CACHE_TTL * 24,  # Keep for 24 hours
            )
        else:
            await cache_set(
                f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
                {
                    "id": schedule_id,
                    "project_id": request.project_id,
                    "status": ScheduleStatus.FAILED.value,
                    "error": result.get("error", "No schedule result produced"),
                },
                ttl=SCHEDULE_CACHE_TTL,
            )

        logger.info(
            "schedule_generation_complete",
            schedule_id=schedule_id,
            project_id=request.project_id,
        )

    except Exception as exc:
        logger.error(
            "schedule_generation_failed",
            schedule_id=schedule_id,
            error=str(exc),
            exc_info=True,
        )
        await cache_set(
            f"{SCHEDULE_CACHE_PREFIX}{schedule_id}",
            {
                "id": schedule_id,
                "project_id": request.project_id,
                "status": ScheduleStatus.FAILED.value,
                "error": str(exc),
            },
            ttl=SCHEDULE_CACHE_TTL,
        )
