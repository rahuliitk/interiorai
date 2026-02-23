"""
Site log API routes.

Provides endpoints for creating and listing site log entries that record
daily progress, issues, weather conditions, and labour counts on the
construction site.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.models.site_log import SiteLogCreate, SiteLogEntry, SiteLogListResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/site-logs", tags=["site-logs"])

SITE_LOG_CACHE_PREFIX = "site_logs:"
SITE_LOG_CACHE_TTL = 3600 * 24 * 7  # 7 days


# ---------------------------------------------------------------------------
# POST /api/v1/site-logs — Create a site log entry
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SiteLogEntry,
    status_code=status.HTTP_201_CREATED,
    summary="Create a site log entry",
    description=(
        "Record a new site log entry with daily progress, weather, labour counts, "
        "issues, and photos.  The entry is associated with a project."
    ),
)
async def create_site_log(
    request: SiteLogCreate,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SiteLogEntry:
    """Create a new site log entry and store it in cache.

    In production this would persist to the database; here we use Redis
    as the interim store.
    """
    now = datetime.now(tz=timezone.utc)
    log_id = str(uuid.uuid4())

    entry = SiteLogEntry(
        id=log_id,
        project_id=request.project_id,
        log_date=request.log_date,
        weather=request.weather,
        summary=request.summary,
        details=request.details,
        severity=request.severity,
        labour=request.labour,
        tasks_progressed=request.tasks_progressed,
        issues=request.issues,
        photos=request.photos,
        metadata=request.metadata,
        created_by=user_id,
        created_at=now,
    )

    # Store in a per-project list in Redis
    cache_key = f"{SITE_LOG_CACHE_PREFIX}{request.project_id}"
    existing_logs = await cache_get(cache_key)
    if existing_logs is None:
        existing_logs = []
    if not isinstance(existing_logs, list):
        existing_logs = []

    existing_logs.append(entry.model_dump(mode="json"))

    await cache_set(cache_key, existing_logs, ttl=SITE_LOG_CACHE_TTL)

    logger.info(
        "site_log_created",
        log_id=log_id,
        project_id=request.project_id,
        log_date=request.log_date.isoformat(),
        severity=request.severity.value,
    )

    return entry


# ---------------------------------------------------------------------------
# GET /api/v1/site-logs/{project_id} — List site logs for a project
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}",
    response_model=SiteLogListResponse,
    summary="List site logs for a project",
    description="Returns all site log entries for a given project, ordered by date descending.",
)
async def list_site_logs(
    project_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200, description="Max entries to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> SiteLogListResponse:
    """Retrieve site log entries from cache for a project."""
    cache_key = f"{SITE_LOG_CACHE_PREFIX}{project_id}"
    logs = await cache_get(cache_key)

    if logs is None:
        logs = []
    if not isinstance(logs, list):
        logs = []

    # Sort by log_date descending, then by created_at descending
    sorted_logs = sorted(
        logs,
        key=lambda entry: (
            entry.get("log_date", "0000-00-00"),
            entry.get("created_at", ""),
        ),
        reverse=True,
    )

    # Apply pagination
    total = len(sorted_logs)
    paginated = sorted_logs[offset : offset + limit]

    return SiteLogListResponse(
        project_id=project_id,
        total=total,
        logs=[SiteLogEntry(**log) for log in paginated],
    )
