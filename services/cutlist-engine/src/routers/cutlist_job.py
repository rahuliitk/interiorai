"""
Internal job endpoint for cut list generation, called by tRPC fire-and-forget.

Bridges the gap between the lightweight ``JobRequest`` payload and the full
``CutListAgent`` pipeline by deriving furniture specifications from the
design variant's ``spec_json``.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, status

from openlintel_shared.db import get_session_factory
from openlintel_shared.job_worker import (
    get_design_variant,
    update_job_status,
    write_cutlist_result,
)
from openlintel_shared.schemas.job_request import JobRequest

from src.agents.cutlist_agent import CutListAgent
from src.agents.hardware_agent import generate_hardware_schedule_standard
from src.models.panels import CutListPanel, EdgeBandingSpec, FurnitureSpec
from src.services.edge_banding import calculate_edge_banding
from src.services.nesting import nest_panels

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/cutlist", tags=["cutlist-job"])


# ---------------------------------------------------------------------------
# Bridge logic: derive FurnitureSpec list from a design variant spec_json
# ---------------------------------------------------------------------------

_DEFAULT_FURNITURE: dict[str, list[dict[str, Any]]] = {
    "bedroom": [
        {"name": "Wardrobe 2-Door", "category": "wardrobe", "width_mm": 1200, "height_mm": 2100, "depth_mm": 600},
        {"name": "Bedside Table", "category": "side_table", "width_mm": 450, "height_mm": 500, "depth_mm": 400},
        {"name": "Study Desk", "category": "desk", "width_mm": 1200, "height_mm": 750, "depth_mm": 600},
    ],
    "kitchen": [
        {"name": "Kitchen Base Unit 600", "category": "kitchen_base", "width_mm": 600, "height_mm": 850, "depth_mm": 560},
        {"name": "Kitchen Wall Unit 600", "category": "kitchen_wall", "width_mm": 600, "height_mm": 720, "depth_mm": 300},
        {"name": "Kitchen Tall Unit", "category": "kitchen_tall", "width_mm": 600, "height_mm": 2100, "depth_mm": 560},
    ],
    "bathroom": [
        {"name": "Vanity Unit", "category": "vanity", "width_mm": 750, "height_mm": 850, "depth_mm": 450},
    ],
    "living_room": [
        {"name": "TV Unit", "category": "tv_unit", "width_mm": 1800, "height_mm": 500, "depth_mm": 400},
        {"name": "Bookshelf", "category": "shelf", "width_mm": 900, "height_mm": 1800, "depth_mm": 300},
    ],
}


def _derive_furniture_specs(
    room_type: str,
    spec_json: dict[str, Any] | None,
) -> list[FurnitureSpec]:
    """Extract or generate furniture specs from design data."""
    specs: list[FurnitureSpec] = []

    # Try extracting from spec_json first
    if spec_json:
        furniture_list = spec_json.get("furniture", spec_json.get("items", []))
        for item in furniture_list:
            if isinstance(item, dict) and "name" in item:
                specs.append(FurnitureSpec(
                    furniture_unit_id=item.get("id", str(uuid.uuid4())),
                    name=item["name"],
                    category=item.get("category", "general"),
                    width_mm=item.get("width_mm", 600),
                    height_mm=item.get("height_mm", 800),
                    depth_mm=item.get("depth_mm", 500),
                    material=item.get("material", "bwr_plywood"),
                    thickness_mm=item.get("thickness_mm", 18.0),
                    face_laminate=item.get("face_laminate"),
                ))

    # Fall back to defaults for the room type
    if not specs:
        defaults = _DEFAULT_FURNITURE.get(room_type, _DEFAULT_FURNITURE.get("bedroom", []))
        for d in defaults:
            specs.append(FurnitureSpec(
                furniture_unit_id=str(uuid.uuid4()),
                **d,
            ))

    return specs


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

async def _run_cutlist_job(
    request: JobRequest,
) -> None:
    """Background task: run the full cutlist pipeline and persist results."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            await update_job_status(db, request.job_id, status="running", progress=10)

            variant = await get_design_variant(db, request.design_variant_id)
            if not variant:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error=f"Design variant {request.design_variant_id} not found",
                )
                return

            # Derive furniture specs from design variant
            furniture_specs = _derive_furniture_specs(
                request.room.type,
                variant.get("spec_json"),
            )

            await update_job_status(db, request.job_id, status="running", progress=20,
                                    output_json={"current_step": "Breaking down panels"})

            # Step 1: Run CutListAgent
            agent = CutListAgent()
            result = await agent.invoke(
                furniture_specs=[spec.model_dump() for spec in furniture_specs],
            )
            raw_panels = result.get("panels", [])

            # Parse panels
            panels: list[CutListPanel] = []
            for raw in raw_panels:
                try:
                    eb_data = raw.get("edge_banding", {})
                    edge_banding = EdgeBandingSpec(**eb_data) if isinstance(eb_data, dict) else eb_data
                    panels.append(CutListPanel(
                        id=raw.get("id", str(uuid.uuid4())),
                        furniture_unit_id=raw["furniture_unit_id"],
                        part_name=raw["part_name"],
                        length_mm=raw["length_mm"],
                        width_mm=raw["width_mm"],
                        thickness_mm=raw["thickness_mm"],
                        material=raw["material"],
                        grain_direction=raw.get("grain_direction", "length"),
                        face_laminate=raw.get("face_laminate"),
                        edge_banding=edge_banding,
                        quantity=raw.get("quantity", 1),
                    ))
                except Exception as exc:
                    logger.warning("cutlist_panel_parse_error", error=str(exc))

            if not panels:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error="No valid panels generated from furniture specifications",
                )
                return

            await update_job_status(db, request.job_id, status="running", progress=50,
                                    output_json={"current_step": "Nesting panels"})

            # Step 2: Edge banding
            edge_banding_result = calculate_edge_banding(panels)

            # Step 3: Nest panels
            nesting_result = nest_panels(panels=panels, sheet_size="8x4", cutlist_id=request.job_id)

            # Step 4: Hardware schedule
            hardware_schedule = generate_hardware_schedule_standard(
                specs=furniture_specs,
                project_id=variant.get("project_id", ""),
                room_id=request.room.id,
            )

            await update_job_status(db, request.job_id, status="running", progress=80,
                                    output_json={"current_step": "Saving results"})

            # Persist to PostgreSQL
            result_id = await write_cutlist_result(
                db,
                design_variant_id=request.design_variant_id,
                job_id=request.job_id,
                panels=[p.model_dump(mode="json") for p in panels],
                hardware=hardware_schedule.model_dump(mode="json").get("items", []) if hardware_schedule else [],
                nesting_result=nesting_result.model_dump(mode="json"),
                total_sheets=nesting_result.total_sheets,
                waste_percent=nesting_result.waste_percentage,
            )

            await update_job_status(
                db, request.job_id, status="completed", progress=100,
                output_json={
                    "cutlist_result_id": result_id,
                    "total_panels": sum(p.quantity for p in panels),
                    "sheets_required": nesting_result.total_sheets,
                    "waste_percentage": nesting_result.waste_percentage,
                },
            )

            logger.info("cutlist_job_completed", job_id=request.job_id, result_id=result_id)

        except Exception as exc:
            logger.error("cutlist_job_failed", job_id=request.job_id, error=str(exc))
            await update_job_status(db, request.job_id, status="failed", error=str(exc))


# ---------------------------------------------------------------------------
# POST /api/v1/cutlist/job — Internal endpoint (called by tRPC)
# ---------------------------------------------------------------------------

@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Internal job endpoint for tRPC fire-and-forget calls",
)
async def run_cutlist_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a JobRequest from tRPC and run the cutlist pipeline in the background."""
    background_tasks.add_task(_run_cutlist_job, request)
    logger.info("cutlist_job_dispatched", job_id=request.job_id)
    return {"status": "accepted", "job_id": request.job_id}
