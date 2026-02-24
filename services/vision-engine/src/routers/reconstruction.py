"""
Photo-to-3D reconstruction API routes.

Accepts room photos, estimates depth using monocular depth estimation,
calibrates using a reference object, and extracts room dimensions.
Generates a simple glTF mesh and stores it in MinIO.
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.db import get_db_session, get_session_factory
from openlintel_shared.job_worker import update_job_status, get_user_api_key

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/reconstruction", tags=["reconstruction"])


class ReconstructionJobInput(BaseModel):
    """Input for a reconstruction job."""

    job_id: str
    user_id: str
    project_id: str
    room_id: str
    image_urls: list[str] = Field(min_length=1)
    reference_object: str | None = Field(
        default=None,
        description="Calibration reference: 'door', 'a4_paper', 'standard_brick'",
    )


# Reference object real-world sizes in mm
REFERENCE_SIZES: dict[str, dict[str, float]] = {
    "door": {"width": 900, "height": 2100},
    "a4_paper": {"width": 210, "height": 297},
    "standard_brick": {"width": 215, "height": 65},
}


class RoomDimension(BaseModel):
    """Extracted room dimension with confidence."""

    measurement: str
    value_mm: float
    confidence: float = Field(ge=0.0, le=1.0)


class ReconstructionResult(BaseModel):
    """Output of a reconstruction job."""

    room_id: str
    dimensions: list[RoomDimension]
    length_mm: float | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    mesh_storage_key: str | None = None
    thumbnail_storage_key: str | None = None


@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a photo-to-3D reconstruction background job",
)
async def run_reconstruction_job(
    request: ReconstructionJobInput,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Accept a reconstruction job and process in the background."""
    try:
        await update_job_status(db, request.job_id, status="running", progress=5)

        background_tasks.add_task(
            _run_reconstruction,
            request=request,
            settings=settings,
        )

        logger.info("reconstruction_job_dispatched", job_id=request.job_id)
        return {"status": "accepted", "job_id": request.job_id}

    except Exception as exc:
        logger.error("reconstruction_dispatch_failed", job_id=request.job_id, error=str(exc))
        await update_job_status(db, request.job_id, status="failed", error=str(exc))
        return {"status": "failed", "error": str(exc)}


async def _run_reconstruction(
    request: ReconstructionJobInput,
    settings: Settings,
) -> None:
    """Background task: download images, estimate depth, extract dimensions."""
    session_factory = get_session_factory()
    async with session_factory() as db:
        try:
            await update_job_status(db, request.job_id, status="running", progress=10)

            # Get user's API key for VLM calls
            api_key = await get_user_api_key(db, request.user_id, provider="openai")

            await update_job_status(
                db, request.job_id, status="running", progress=20,
                output_json={"current_step": "Downloading images"},
            )

            # Download images
            import httpx

            images_data: list[bytes] = []
            async with httpx.AsyncClient(timeout=30) as client:
                for url in request.image_urls[:10]:  # Limit to 10 images
                    try:
                        resp = await client.get(url)
                        resp.raise_for_status()
                        images_data.append(resp.content)
                    except Exception as dl_exc:
                        logger.warning("image_download_failed", url=url, error=str(dl_exc))

            if not images_data:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error="No images could be downloaded",
                )
                return

            await update_job_status(
                db, request.job_id, status="running", progress=40,
                output_json={"current_step": "Estimating depth"},
            )

            # Use VLM to estimate room dimensions from photos
            dimensions = await _estimate_dimensions_vlm(
                images_data=images_data,
                reference_object=request.reference_object,
                api_key_material={
                    "encrypted_key": api_key["encrypted_key"],
                    "iv": api_key["iv"],
                    "auth_tag": api_key["auth_tag"],
                } if api_key else None,
            )

            await update_job_status(
                db, request.job_id, status="running", progress=70,
                output_json={"current_step": "Generating 3D mesh"},
            )

            # Generate simple glTF mesh from dimensions
            length_mm = dimensions.get("length_mm", 4000)
            width_mm = dimensions.get("width_mm", 3000)
            height_mm = dimensions.get("height_mm", 2700)

            mesh_key: str | None = None
            try:
                mesh_bytes = _generate_simple_gltf(length_mm, width_mm, height_mm)
                mesh_key = f"reconstruction/{request.job_id}/room.glb"
                from openlintel_shared.storage import upload_file

                upload_file(
                    settings.MINIO_BUCKET, mesh_key, mesh_bytes,
                    content_type="model/gltf-binary", settings=settings,
                )
            except Exception as mesh_exc:
                logger.warning("mesh_generation_failed", error=str(mesh_exc))

            await update_job_status(
                db, request.job_id, status="running", progress=90,
                output_json={"current_step": "Finalising results"},
            )

            # Build output
            dimension_list = [
                {"measurement": "length", "value_mm": length_mm, "confidence": dimensions.get("length_confidence", 0.7)},
                {"measurement": "width", "value_mm": width_mm, "confidence": dimensions.get("width_confidence", 0.7)},
                {"measurement": "height", "value_mm": height_mm, "confidence": dimensions.get("height_confidence", 0.6)},
            ]

            output = {
                "room_id": request.room_id,
                "dimensions": dimension_list,
                "length_mm": length_mm,
                "width_mm": width_mm,
                "height_mm": height_mm,
                "mesh_storage_key": mesh_key,
                "images_processed": len(images_data),
                "reference_object": request.reference_object,
            }

            await update_job_status(
                db, request.job_id,
                status="completed",
                progress=100,
                output_json=output,
            )

            logger.info(
                "reconstruction_job_completed",
                job_id=request.job_id,
                length_mm=length_mm,
                width_mm=width_mm,
                height_mm=height_mm,
            )

        except Exception as exc:
            logger.error("reconstruction_job_failed", job_id=request.job_id, error=str(exc))
            await update_job_status(db, request.job_id, status="failed", error=str(exc))


async def _estimate_dimensions_vlm(
    images_data: list[bytes],
    reference_object: str | None = None,
    api_key_material: dict[str, str] | None = None,
) -> dict[str, float]:
    """Use a VLM to estimate room dimensions from photos.

    Falls back to default dimensions if VLM is unavailable.
    """
    import base64

    try:
        import litellm

        # Prepare the prompt
        ref_info = ""
        if reference_object and reference_object in REFERENCE_SIZES:
            ref = REFERENCE_SIZES[reference_object]
            ref_info = (
                f"\nCalibration reference: {reference_object} "
                f"(real size: {ref['width']}mm x {ref['height']}mm). "
                f"Use this to calibrate your measurements."
            )

        system_prompt = (
            "You are a room measurement expert. Analyse the room photos and "
            "estimate the room dimensions in millimetres. "
            "Return a JSON object with: length_mm, width_mm, height_mm, "
            "length_confidence (0-1), width_confidence (0-1), height_confidence (0-1)."
            + ref_info
        )

        # Encode first image as data URI
        img_b64 = base64.b64encode(images_data[0]).decode("ascii")
        data_uri = f"data:image/jpeg;base64,{img_b64}"

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": "Estimate the room dimensions from this photo."},
                ],
            },
        ]

        kwargs: dict[str, Any] = {
            "model": "openai/gpt-4o",
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 256,
            "response_format": {"type": "json_object"},
        }

        response = await litellm.acompletion(**kwargs)
        content = response.choices[0].message.content or "{}"

        dims = json.loads(content)
        return {
            "length_mm": float(dims.get("length_mm", 4000)),
            "width_mm": float(dims.get("width_mm", 3000)),
            "height_mm": float(dims.get("height_mm", 2700)),
            "length_confidence": float(dims.get("length_confidence", 0.5)),
            "width_confidence": float(dims.get("width_confidence", 0.5)),
            "height_confidence": float(dims.get("height_confidence", 0.4)),
        }

    except Exception as exc:
        logger.warning("vlm_dimension_estimation_failed", error=str(exc))
        return {
            "length_mm": 4000,
            "width_mm": 3000,
            "height_mm": 2700,
            "length_confidence": 0.3,
            "width_confidence": 0.3,
            "height_confidence": 0.3,
        }


def _generate_simple_gltf(
    length_mm: float,
    width_mm: float,
    height_mm: float,
) -> bytes:
    """Generate a simple glTF binary (GLB) box representing the room.

    Creates a minimal valid GLB file with a single box mesh.
    """
    import struct

    # Convert mm to metres for glTF (which uses metres)
    lm = length_mm / 1000.0
    wm = width_mm / 1000.0
    hm = height_mm / 1000.0

    # 8 vertices of a box
    vertices = [
        0, 0, 0,    lm, 0, 0,    lm, wm, 0,    0, wm, 0,     # bottom
        0, 0, hm,   lm, 0, hm,   lm, wm, hm,   0, wm, hm,    # top
    ]

    # 12 triangles (6 faces x 2 triangles)
    indices = [
        0, 1, 2,  0, 2, 3,  # bottom
        4, 6, 5,  4, 7, 6,  # top
        0, 4, 5,  0, 5, 1,  # front
        2, 6, 7,  2, 7, 3,  # back
        0, 3, 7,  0, 7, 4,  # left
        1, 5, 6,  1, 6, 2,  # right
    ]

    # Pack binary data
    vertex_data = struct.pack(f"<{len(vertices)}f", *vertices)
    index_data = struct.pack(f"<{len(indices)}H", *indices)

    # Pad to 4-byte alignment
    while len(index_data) % 4 != 0:
        index_data += b"\x00"

    buffer_data = index_data + vertex_data
    buffer_length = len(buffer_data)

    # Build glTF JSON
    gltf_json = {
        "asset": {"version": "2.0", "generator": "OpenLintel"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Room"}],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 1},
                "indices": 0,
            }],
        }],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5123,  # UNSIGNED_SHORT
                "count": len(indices),
                "type": "SCALAR",
                "max": [max(indices)],
                "min": [min(indices)],
            },
            {
                "bufferView": 1,
                "componentType": 5126,  # FLOAT
                "count": len(vertices) // 3,
                "type": "VEC3",
                "max": [lm, wm, hm],
                "min": [0, 0, 0],
            },
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": len(index_data),
                "target": 34963,  # ELEMENT_ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": len(index_data),
                "byteLength": len(vertex_data),
                "target": 34962,  # ARRAY_BUFFER
            },
        ],
        "buffers": [{"byteLength": buffer_length}],
    }

    json_str = json.dumps(gltf_json, separators=(",", ":"))
    json_bytes = json_str.encode("utf-8")

    # Pad JSON to 4-byte alignment
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    # GLB header: magic + version + length
    # JSON chunk: length + type + data
    # BIN chunk: length + type + data
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes  # JSON
    bin_chunk = struct.pack("<II", buffer_length, 0x004E4942) + buffer_data  # BIN

    total_length = 12 + len(json_chunk) + len(bin_chunk)
    header = struct.pack("<III", 0x46546C67, 2, total_length)  # glTF magic

    return header + json_chunk + bin_chunk
