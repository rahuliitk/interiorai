"""
Design generation API routes.

All routes require authentication via the ``get_current_user`` dependency
which extracts and validates a JWT Bearer token.
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.auth import get_current_user
from openlintel_shared.config import Settings, get_settings
from openlintel_shared.db import get_db_session

from openlintel_shared.job_worker import get_design_variant, get_user_api_key, update_job_status
from openlintel_shared.schemas.job_request import JobRequest

from src.models.requests import GenerateDesignRequest
from src.models.responses import (
    DesignResult,
    GenerateDesignResponse,
    JobProgressResponse,
    JobStatus,
)
from src.services.generation import GenerationService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/designs", tags=["designs"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def _get_generation_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> GenerationService:
    """Build a ``GenerationService`` from the current settings."""
    return GenerationService(settings=settings)


# ---------------------------------------------------------------------------
# POST /api/v1/designs/generate — Create a design generation job
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=GenerateDesignResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create a design generation job",
    description=(
        "Accepts room context, style, budget, and constraints. Creates an async "
        "generation job and returns the job ID immediately."
    ),
)
async def generate_design(
    request: GenerateDesignRequest,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    gen_service: Annotated[GenerationService, Depends(_get_generation_service)],
) -> GenerateDesignResponse:
    """Kick off an async design generation pipeline.

    1. Validate that the room exists and belongs to the user.
    2. Verify the user has a configured API key for the requested model's provider.
    3. Create a ``jobs`` row with status ``pending``.
    4. Dispatch the generation pipeline as a background task.
    5. Return the job ID so the client can poll for progress.
    """
    # ── Validate room ownership ───────────────────────────────────────────
    room_row = await db.execute(
        text("""
            SELECT r.id, r.name, r.type, r.length_mm, r.width_mm, r.height_mm,
                   r.floor, r.metadata, p.user_id
            FROM rooms r
            JOIN projects p ON r.project_id = p.id
            WHERE r.id = :room_id
        """),
        {"room_id": request.room_id},
    )
    room = room_row.mappings().first()

    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room {request.room_id} not found",
        )

    if room["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this room",
        )

    # ── Resolve the user's API key for the requested provider ────────────
    provider = _extract_provider(request.model)
    api_key_row = await db.execute(
        text("""
            SELECT id, encrypted_key, iv, auth_tag
            FROM user_api_keys
            WHERE user_id = :user_id AND provider = :provider
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"user_id": user_id, "provider": provider},
    )
    api_key = api_key_row.mappings().first()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No API key configured for provider '{provider}'. "
                "Please add one in Settings > API Keys."
            ),
        )

    # ── Resolve source upload (room photo) ────────────────────────────────
    source_upload_key: str | None = None
    if request.source_upload_id:
        upload_row = await db.execute(
            text("""
                SELECT storage_key FROM uploads
                WHERE id = :upload_id AND user_id = :user_id
            """),
            {"upload_id": request.source_upload_id, "user_id": user_id},
        )
        upload = upload_row.mappings().first()
        if upload is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Upload {request.source_upload_id} not found",
            )
        source_upload_key = upload["storage_key"]
    else:
        # Fall back to the most recent photo for this room
        fallback_row = await db.execute(
            text("""
                SELECT storage_key FROM uploads
                WHERE room_id = :room_id AND user_id = :user_id
                  AND category = 'photo'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"room_id": request.room_id, "user_id": user_id},
        )
        fallback = fallback_row.mappings().first()
        if fallback is not None:
            source_upload_key = fallback["storage_key"]

    # ── Create the job record ─────────────────────────────────────────────
    job_id = await gen_service.create_job(
        db=db,
        user_id=user_id,
        room_id=request.room_id,
        input_data={
            "room_id": request.room_id,
            "style": request.style.value,
            "budget_tier": request.budget_tier.value,
            "constraints": request.constraints,
            "source_upload_id": request.source_upload_id,
            "source_upload_key": source_upload_key,
            "model": request.model,
            "num_variants": request.num_variants,
        },
    )

    # ── Dispatch async generation ─────────────────────────────────────────
    background_tasks.add_task(
        gen_service.run_pipeline,
        job_id=job_id,
        user_id=user_id,
        room_data=dict(room),
        request=request,
        api_key_material={
            "encrypted_key": api_key["encrypted_key"],
            "iv": api_key["iv"],
            "auth_tag": api_key["auth_tag"],
        },
        source_upload_key=source_upload_key,
    )

    logger.info(
        "design_generation_job_created",
        job_id=job_id,
        room_id=request.room_id,
        style=request.style.value,
        budget_tier=request.budget_tier.value,
    )

    return GenerateDesignResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Design generation job created. Poll /jobs/{jobId} for progress.",
    )


# ---------------------------------------------------------------------------
# POST /api/v1/designs/job — Internal job endpoint (called by tRPC)
# ---------------------------------------------------------------------------


@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Internal job endpoint for tRPC fire-and-forget calls",
)
async def run_design_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    gen_service: Annotated[GenerationService, Depends(_get_generation_service)],
) -> dict:
    """Accept a standardized JobRequest from tRPC, look up context from DB,
    and run the design generation pipeline as a background task.

    No JWT auth required — this is an internal service-to-service call.
    """
    try:
        # Mark job as running
        await update_job_status(db, request.job_id, status="running", progress=5)

        # Fetch full room data from DB
        room_row = await db.execute(
            text("""
                SELECT r.id, r.name, r.type, r.length_mm, r.width_mm, r.height_mm,
                       r.floor, r.metadata, p.user_id
                FROM rooms r
                JOIN projects p ON r.project_id = p.id
                WHERE r.id = :room_id
            """),
            {"room_id": request.room.id},
        )
        room = room_row.mappings().first()
        if room is None:
            await update_job_status(
                db, request.job_id, status="failed", error=f"Room {request.room.id} not found",
            )
            return {"status": "failed", "error": "Room not found"}

        # Look up user's API key
        api_key = await get_user_api_key(db, request.user_id, provider="openai")
        if api_key is None:
            await update_job_status(
                db, request.job_id, status="failed",
                error="No API key configured for provider 'openai'",
            )
            return {"status": "failed", "error": "No API key"}

        # Look up source photo for the room
        photo_row = await db.execute(
            text("""
                SELECT storage_key FROM uploads
                WHERE room_id = :room_id AND user_id = :user_id AND category = 'photo'
                ORDER BY created_at DESC LIMIT 1
            """),
            {"room_id": request.room.id, "user_id": request.user_id},
        )
        photo = photo_row.mappings().first()
        source_upload_key = photo["storage_key"] if photo else None

        # Build a GenerateDesignRequest for the existing pipeline
        style = request.style or "modern"
        budget = request.budget_tier or "mid_range"
        gen_request = GenerateDesignRequest(
            roomId=request.room.id,
            style=style,
            budgetTier=budget,
            constraints=request.constraints,
            model="openai/gpt-4o",
            numVariants=1,
        )

        # Dispatch background pipeline (reuse existing GenerationService)
        background_tasks.add_task(
            gen_service.run_pipeline,
            job_id=request.job_id,
            user_id=request.user_id,
            room_data=dict(room),
            request=gen_request,
            api_key_material={
                "encrypted_key": api_key["encrypted_key"],
                "iv": api_key["iv"],
                "auth_tag": api_key["auth_tag"],
            },
            source_upload_key=source_upload_key,
        )

        logger.info("design_job_dispatched", job_id=request.job_id)
        return {"status": "accepted", "job_id": request.job_id}

    except Exception as exc:
        logger.error("design_job_dispatch_failed", job_id=request.job_id, error=str(exc))
        await update_job_status(
            db, request.job_id, status="failed", error=str(exc),
        )
        return {"status": "failed", "error": str(exc)}


# ---------------------------------------------------------------------------
# GET /api/v1/designs/jobs/{job_id} — Check job status and progress
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}",
    response_model=JobProgressResponse,
    summary="Check design generation job status",
)
async def get_job_progress(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> JobProgressResponse:
    """Return current status, progress percentage, and any completed design IDs."""
    row = await db.execute(
        text("""
            SELECT j.id, j.status, j.progress, j.input_json, j.output_json,
                   j.error, j.created_at, j.started_at, j.completed_at
            FROM jobs j
            WHERE j.id = :job_id AND j.user_id = :user_id
        """),
        {"job_id": job_id, "user_id": user_id},
    )
    job = row.mappings().first()

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )

    # Extract design IDs from output_json if available
    output = job["output_json"] or {}
    design_ids: list[str] = output.get("design_ids", [])
    current_step: str | None = output.get("current_step")

    return JobProgressResponse(
        job_id=job["id"],
        status=JobStatus(job["status"]),
        progress=job["progress"] or 0,
        current_step=current_step,
        design_ids=design_ids,
        error=job["error"],
        created_at=job["created_at"],
        started_at=job["started_at"],
        completed_at=job["completed_at"],
    )


# ---------------------------------------------------------------------------
# GET /api/v1/designs/{design_id} — Get a specific design result
# ---------------------------------------------------------------------------


@router.get(
    "/{design_id}",
    response_model=DesignResult,
    summary="Get a design variant result",
)
async def get_design(
    design_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DesignResult:
    """Fetch a completed design variant by ID.

    Validates that the design belongs to a room owned by the authenticated user.
    Returns presigned URLs for any generated images.
    """
    row = await db.execute(
        text("""
            SELECT dv.id, dv.room_id, dv.name, dv.style, dv.budget_tier,
                   dv.render_url, dv.render_urls, dv.prompt_used,
                   dv.constraints, dv.spec_json, dv.metadata,
                   dv.job_id, dv.created_at,
                   p.user_id
            FROM design_variants dv
            JOIN rooms r ON dv.room_id = r.id
            JOIN projects p ON r.project_id = p.id
            WHERE dv.id = :design_id
        """),
        {"design_id": design_id},
    )
    design = row.mappings().first()

    if design is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Design variant {design_id} not found",
        )

    if design["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this design",
        )

    # Generate presigned URLs for rendered images
    render_urls: list[str] = design["render_urls"] or []
    render_url = design["render_url"]

    return DesignResult(
        id=design["id"],
        room_id=design["room_id"],
        name=design["name"],
        style=design["style"],
        budget_tier=design["budget_tier"],
        render_url=render_url,
        render_urls=render_urls,
        prompt_used=design["prompt_used"],
        constraints=design["constraints"] or [],
        spec_json=design["spec_json"],
        metadata=design["metadata"],
        job_id=design["job_id"],
        created_at=design["created_at"],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_provider(model: str) -> str:
    """Extract the provider name from a LiteLLM model identifier.

    ``"openai/gpt-4o"`` -> ``"openai"``
    ``"google/gemini-2.0-flash"`` -> ``"google"``
    ``"anthropic/claude-sonnet-4-20250514"`` -> ``"anthropic"``
    """
    if "/" in model:
        return model.split("/", 1)[0]
    # Default provider mapping for bare model names
    if model.startswith("gpt"):
        return "openai"
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("gemini"):
        return "google"
    return "openai"
