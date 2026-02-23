"""Vision (floor plan digitization) API routes."""

from __future__ import annotations

import json
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.db import get_db_session, get_session_factory
from openlintel_shared.job_worker import update_job_status, get_user_api_key
from openlintel_shared.config import Settings, get_settings

from src.agents.vision_agent import detect_rooms_from_image

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/vision", tags=["vision"])


class VisionJobRequest:
    """Simple request model for vision jobs."""
    pass


from pydantic import BaseModel, Field


class VisionJobInput(BaseModel):
    job_id: str
    user_id: str
    project_id: str
    image_url: str
    upload_id: str | None = None


@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run floor plan digitization as a background job",
)
async def run_vision_job(
    request: VisionJobInput,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Accept a vision job request, run room detection in the background."""
    try:
        await update_job_status(db, request.job_id, status="running", progress=5)

        background_tasks.add_task(
            _run_detection,
            job_id=request.job_id,
            user_id=request.user_id,
            image_url=request.image_url,
        )

        logger.info("vision_job_dispatched", job_id=request.job_id)
        return {"status": "accepted", "job_id": request.job_id}

    except Exception as exc:
        logger.error("vision_job_dispatch_failed", job_id=request.job_id, error=str(exc))
        await update_job_status(db, request.job_id, status="failed", error=str(exc))
        return {"status": "failed", "error": str(exc)}


async def _run_detection(
    job_id: str,
    user_id: str,
    image_url: str,
) -> None:
    """Background task: run VLM room detection and persist results."""
    session_factory = get_session_factory()
    async with session_factory() as db:
        try:
            await update_job_status(db, job_id, status="running", progress=20)

            # Get user's API key for OpenAI
            api_key = await get_user_api_key(db, user_id, provider="openai")
            if api_key is None:
                await update_job_status(
                    db, job_id, status="failed",
                    error="No API key configured for provider 'openai'",
                )
                return

            await update_job_status(db, job_id, status="running", progress=40)

            # Run VLM detection
            result = await detect_rooms_from_image(
                image_url=image_url,
                api_key_material={
                    "encrypted_key": api_key["encrypted_key"],
                    "iv": api_key["iv"],
                    "auth_tag": api_key["auth_tag"],
                },
            )

            await update_job_status(db, job_id, status="running", progress=80)

            # Persist result as job output
            output = {
                "rooms": [
                    {
                        "id": f"room_{i}",
                        "name": room.name,
                        "type": room.type,
                        "polygon": [{"x": p.x, "y": p.y} for p in room.polygon],
                        "lengthMm": room.length_mm,
                        "widthMm": room.width_mm,
                        "areaSqMm": room.area_sq_mm,
                    }
                    for i, room in enumerate(result.rooms)
                ],
                "width": result.width,
                "height": result.height,
                "scale": result.scale,
            }

            await update_job_status(
                db, job_id,
                status="completed",
                progress=100,
                output_json=output,
            )

            logger.info(
                "vision_job_completed",
                job_id=job_id,
                rooms_detected=len(result.rooms),
            )

        except Exception as exc:
            logger.error("vision_job_failed", job_id=job_id, error=str(exc))
            await update_job_status(db, job_id, status="failed", error=str(exc))
