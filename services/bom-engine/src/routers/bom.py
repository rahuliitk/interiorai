"""
BOM API router.

Endpoints:
    POST /api/v1/bom/generate   -- Generate a BOM from a design variant.
    GET  /api/v1/bom/{id}       -- Retrieve a completed BOM result.
    GET  /api/v1/bom/{id}/export -- Export a BOM as Excel, CSV, or PDF.

All endpoints require Bearer-token authentication.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response

from openlintel_shared.auth import get_current_user
from openlintel_shared.db import get_session_factory
from openlintel_shared.job_worker import (
    get_design_variant,
    update_job_status,
    write_bom_result,
)
from openlintel_shared.redis_client import cache_get, cache_set
from openlintel_shared.schemas.job_request import JobRequest

from src.agents.bom_agent import BOMAgent
from src.models.bom import (
    BOMGenerateRequest,
    BOMGenerateResponse,
    BOMResult,
    BOMStatus,
    ExportFormat,
)
from src.services.export import export_to_csv, export_to_excel, export_to_pdf

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/bom", tags=["bom"])

# In-memory store for BOM results (production would use a database)
_bom_store: dict[str, dict[str, Any]] = {}

# Cache TTL for BOM results (24 hours)
_BOM_CACHE_TTL = 86400


# -- POST /api/v1/bom/generate ---------------------------------------------

@router.post(
    "/generate",
    response_model=BOMGenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate a Bill of Materials",
    description=(
        "Accepts a room and design variant, runs the AI-powered BOM pipeline "
        "(material extraction, quantity calculation, pricing, and optional budget "
        "optimization), and returns a BOM job ID for polling."
    ),
)
async def generate_bom(
    request: BOMGenerateRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> BOMGenerateResponse:
    """Generate a BOM from a design variant."""
    bom_id = str(uuid.uuid4())

    logger.info(
        "bom_generate_request",
        bom_id=bom_id,
        project_id=request.project_id,
        room_id=request.room.id,
        design_variant_id=request.design_variant.id,
        user_id=user_id,
    )

    # Kick off the BOM agent
    agent = BOMAgent()

    try:
        result = await agent.invoke(
            bom_id=bom_id,
            project_id=request.project_id,
            room_id=request.room.id,
            room_name=request.room.name,
            room_type=request.room.type.value,
            room_dimensions={
                "length_mm": request.room.dimensions.length_mm,
                "width_mm": request.room.dimensions.width_mm,
                "height_mm": request.room.dimensions.height_mm,
            },
            design_variant_id=request.design_variant.id,
            design_style=request.design_variant.style.value,
            budget_tier=request.design_variant.budget_tier.value,
            spec_json=request.design_variant.spec_json,
            target_budget=request.target_budget,
            currency=request.currency,
            include_substitutions=request.include_substitutions,
        )

        # Store result in memory and cache
        bom_result = result.get("bom_result")
        if bom_result:
            _bom_store[bom_id] = bom_result
            await cache_set(f"bom:{bom_id}", bom_result, ttl=_BOM_CACHE_TTL)

        return BOMGenerateResponse(
            bom_id=bom_id,
            status=BOMStatus.COMPLETE,
            message="BOM generation complete.",
        )

    except Exception as exc:
        logger.error("bom_generate_failed", bom_id=bom_id, error=str(exc))

        # Store error state
        error_result = {
            "id": bom_id,
            "project_id": request.project_id,
            "room_id": request.room.id,
            "design_variant_id": request.design_variant.id,
            "status": BOMStatus.FAILED,
            "items": [],
            "error_message": str(exc),
        }
        _bom_store[bom_id] = error_result

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"BOM generation failed: {exc}",
        ) from exc


# -- POST /api/v1/bom/job — Internal endpoint (called by tRPC) ---------------

async def _run_bom_job(
    request: JobRequest,
) -> None:
    """Background task: run the BOM agent, persist results to PostgreSQL."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            await update_job_status(db, request.job_id, status="running", progress=10)

            # Fetch design variant for spec_json context
            variant = await get_design_variant(db, request.design_variant_id)
            if not variant:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error=f"Design variant {request.design_variant_id} not found",
                )
                return

            agent = BOMAgent()
            result = await agent.invoke(
                bom_id=str(uuid.uuid4()),
                project_id=variant.get("project_id", ""),
                room_id=request.room.id,
                room_name="",
                room_type=request.room.type,
                room_dimensions={
                    "length_mm": request.room.length_mm,
                    "width_mm": request.room.width_mm,
                    "height_mm": request.room.height_mm,
                },
                design_variant_id=request.design_variant_id,
                design_style=request.style or variant.get("style", "modern"),
                budget_tier=request.budget_tier or variant.get("budget_tier", "mid_range"),
                spec_json=variant.get("spec_json"),
                target_budget=None,
                currency="INR",
                include_substitutions=True,
            )

            bom_result = result.get("bom_result", {})
            items = bom_result.get("items", [])
            summary = bom_result.get("summary", {})
            total_cost = summary.get("total_cost", 0.0)

            # Persist to PostgreSQL
            result_id = await write_bom_result(
                db,
                design_variant_id=request.design_variant_id,
                job_id=request.job_id,
                items=items,
                total_cost=total_cost,
                currency=summary.get("currency", "INR"),
                metadata={
                    "category_breakdown": summary.get("category_breakdown"),
                    "optimization": bom_result.get("optimization"),
                },
            )

            await update_job_status(
                db, request.job_id, status="completed", progress=100,
                output_json={"bom_result_id": result_id, "total_cost": total_cost},
            )

            logger.info("bom_job_completed", job_id=request.job_id, result_id=result_id)

        except Exception as exc:
            logger.error("bom_job_failed", job_id=request.job_id, error=str(exc))
            await update_job_status(
                db, request.job_id, status="failed", error=str(exc),
            )


@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Internal job endpoint for tRPC fire-and-forget calls",
)
async def run_bom_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a JobRequest from tRPC and run the BOM pipeline in the background."""
    background_tasks.add_task(_run_bom_job, request)
    logger.info("bom_job_dispatched", job_id=request.job_id)
    return {"status": "accepted", "job_id": request.job_id}


# -- GET /api/v1/bom/{id} --------------------------------------------------

@router.get(
    "/{bom_id}",
    response_model=BOMResult,
    summary="Get a BOM result",
    description="Retrieve a previously generated BOM by its ID.",
)
async def get_bom(
    bom_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> BOMResult:
    """Return a BOM result by ID."""
    # Check in-memory store first
    bom_data = _bom_store.get(bom_id)

    if bom_data is None:
        # Try Redis cache
        cached = await cache_get(f"bom:{bom_id}")
        if cached and isinstance(cached, dict):
            bom_data = cached
            _bom_store[bom_id] = bom_data

    if bom_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM '{bom_id}' not found.",
        )

    return BOMResult(**bom_data)


# -- GET /api/v1/bom/{id}/export -------------------------------------------

@router.get(
    "/{bom_id}/export",
    summary="Export a BOM",
    description=(
        "Export a BOM result in the specified format. Supported formats: "
        "excel (.xlsx), csv (.csv), pdf (.pdf)."
    ),
    responses={
        200: {
            "description": "The exported file",
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                "text/csv": {},
                "application/pdf": {},
            },
        },
    },
)
async def export_bom(
    bom_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    format: ExportFormat = Query(
        default=ExportFormat.EXCEL,
        description="Export format: excel, csv, or pdf",
    ),
) -> Response:
    """Export a BOM in the requested format."""
    # Retrieve BOM
    bom_data = _bom_store.get(bom_id)

    if bom_data is None:
        cached = await cache_get(f"bom:{bom_id}")
        if cached and isinstance(cached, dict):
            bom_data = cached

    if bom_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM '{bom_id}' not found.",
        )

    bom = BOMResult(**bom_data)

    if bom.status != BOMStatus.COMPLETE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"BOM is in '{bom.status}' state and cannot be exported.",
        )

    logger.info("bom_export", bom_id=bom_id, format=format.value)

    if format == ExportFormat.EXCEL:
        content = export_to_excel(bom)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="bom_{bom_id}.xlsx"',
            },
        )

    if format == ExportFormat.CSV:
        content = export_to_csv(bom)
        return Response(
            content=content,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="bom_{bom_id}.csv"',
            },
        )

    if format == ExportFormat.PDF:
        content = export_to_pdf(bom)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="bom_{bom_id}.pdf"',
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported format: {format}",
    )
