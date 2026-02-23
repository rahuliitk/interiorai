"""
Drawing generation API router.

Provides the internal ``POST /api/v1/drawings/job`` endpoint called by tRPC
fire-and-forget, as well as a placeholder for future authenticated endpoints.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, status

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.db import get_session_factory
from openlintel_shared.job_worker import (
    get_design_variant,
    get_user_api_key,
    update_job_status,
    write_drawing_result,
)
from openlintel_shared.schemas.job_request import JobRequest
from openlintel_shared.storage import upload_file

from src.agents.drawing_agent import DrawingAgent
from src.services.dxf_writer import create_dxf_drawing
from src.services.svg_writer import create_svg_drawing

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/drawings", tags=["drawings"])


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

async def _run_drawing_job(
    request: JobRequest,
    settings: Settings,
) -> None:
    """Background task: run DrawingAgent for each drawing type, persist results."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            await update_job_status(db, request.job_id, status="running", progress=5)

            variant = await get_design_variant(db, request.design_variant_id)
            if not variant:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error=f"Design variant {request.design_variant_id} not found",
                )
                return

            # Look up user API key for LLM calls
            api_key = await get_user_api_key(db, request.user_id)

            drawing_types = request.drawing_types or [
                "floor_plan", "furnished_plan", "elevation", "electrical_layout",
            ]

            result_ids: list[str] = []
            total = len(drawing_types)

            for idx, dtype in enumerate(drawing_types):
                progress = 10 + int((idx / total) * 80)
                await update_job_status(
                    db, request.job_id, status="running", progress=progress,
                    output_json={"current_step": f"Generating {dtype}"},
                )

                try:
                    agent = DrawingAgent()
                    state = await agent.invoke(
                        drawing_id=str(uuid.uuid4()),
                        project_id=variant.get("project_id", ""),
                        room_id=request.room.id,
                        room_type=request.room.type,
                        room_dimensions={
                            "length_mm": request.room.length_mm,
                            "width_mm": request.room.width_mm,
                            "height_mm": request.room.height_mm,
                        },
                        design_variant_id=request.design_variant_id,
                        design_style=request.style or variant.get("style", "modern"),
                        spec_json=variant.get("spec_json") or {},
                        drawing_types=[dtype],
                        encrypted_key=api_key["encrypted_key"] if api_key else None,
                        iv=api_key["iv"] if api_key else None,
                        auth_tag=api_key["auth_tag"] if api_key else None,
                    )

                    drawing_data = state.get("drawing_data")

                    dxf_key: str | None = None
                    svg_key: str | None = None

                    if drawing_data:
                        # Generate DXF and upload to MinIO
                        dxf_bytes = create_dxf_drawing(drawing_data, drawing_type=dtype)
                        dxf_key = f"drawings/{request.job_id}/{dtype}.dxf"
                        upload_file(
                            settings.MINIO_BUCKET, dxf_key, dxf_bytes,
                            content_type="application/dxf", settings=settings,
                        )

                        # Generate SVG preview and upload
                        svg_bytes = create_svg_drawing(drawing_data, drawing_type=dtype)
                        svg_key = f"drawings/{request.job_id}/{dtype}.svg"
                        upload_file(
                            settings.MINIO_BUCKET, svg_key, svg_bytes,
                            content_type="image/svg+xml", settings=settings,
                        )

                    # Persist to DB
                    rid = await write_drawing_result(
                        db,
                        design_variant_id=request.design_variant_id,
                        job_id=request.job_id,
                        drawing_type=dtype,
                        dxf_storage_key=dxf_key,
                        svg_storage_key=svg_key,
                        metadata={"scale": "1:50"},
                    )
                    result_ids.append(rid)

                except Exception as exc:
                    logger.error(
                        "drawing_type_failed", job_id=request.job_id,
                        drawing_type=dtype, error=str(exc),
                    )
                    # Continue with other drawing types

            await update_job_status(
                db, request.job_id, status="completed", progress=100,
                output_json={"drawing_result_ids": result_ids, "types_generated": drawing_types},
            )

            logger.info("drawing_job_completed", job_id=request.job_id, count=len(result_ids))

        except Exception as exc:
            logger.error("drawing_job_failed", job_id=request.job_id, error=str(exc))
            await update_job_status(db, request.job_id, status="failed", error=str(exc))


# ---------------------------------------------------------------------------
# POST /api/v1/drawings/job — Internal endpoint (called by tRPC)
# ---------------------------------------------------------------------------

@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Internal job endpoint for tRPC fire-and-forget calls",
)
async def run_drawing_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a JobRequest from tRPC and generate drawings in the background."""
    settings = get_settings()
    background_tasks.add_task(_run_drawing_job, request, settings)
    logger.info("drawing_job_dispatched", job_id=request.job_id)
    return {"status": "accepted", "job_id": request.job_id}
