"""
Unified MEP job endpoint for tRPC fire-and-forget calls.

Routes to the correct agent (Electrical / Plumbing / HVAC) based on
``calc_type``, generates sensible default inputs from room type and
dimensions, persists results to ``mep_calculations``, and manages
the ``jobs`` lifecycle.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, status

from openlintel_shared.db import get_session_factory
from openlintel_shared.job_worker import (
    get_design_variant,
    update_job_status,
    write_mep_result,
)
from openlintel_shared.schemas.job_request import JobRequest

from src.agents.electrical_agent import ElectricalAgent
from src.agents.plumbing_agent import PlumbingAgent
from src.agents.hvac_agent import HVACAgent
from src.models.electrical import Appliance, CircuitType, ElectricalRequest, LightingPoint
from src.models.plumbing import PlumbingRequest
from src.models.hvac import HVACRequest

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/mep", tags=["mep-job"])


# ---------------------------------------------------------------------------
# Bridge logic: generate default inputs from room info
# ---------------------------------------------------------------------------

_ROOM_APPLIANCES: dict[str, list[dict[str, Any]]] = {
    "bedroom": [
        {"name": "AC Split Unit", "wattage": 1500, "circuit_type": "hvac", "dedicated_circuit": True, "is_continuous": True},
        {"name": "Fan", "wattage": 75, "quantity": 1},
        {"name": "Phone Charger", "wattage": 20, "quantity": 2},
    ],
    "kitchen": [
        {"name": "Refrigerator", "wattage": 250, "dedicated_circuit": True, "is_continuous": True},
        {"name": "Microwave", "wattage": 1200, "circuit_type": "kitchen", "dedicated_circuit": True},
        {"name": "Dishwasher", "wattage": 1800, "circuit_type": "kitchen", "dedicated_circuit": True},
        {"name": "Kitchen Exhaust", "wattage": 200},
        {"name": "Water Purifier", "wattage": 60},
    ],
    "bathroom": [
        {"name": "Geyser/Water Heater", "wattage": 2000, "circuit_type": "bathroom", "dedicated_circuit": True},
        {"name": "Exhaust Fan", "wattage": 30},
    ],
    "living_room": [
        {"name": "AC Split Unit", "wattage": 2000, "circuit_type": "hvac", "dedicated_circuit": True, "is_continuous": True},
        {"name": "Television", "wattage": 150},
        {"name": "Fan", "wattage": 75, "quantity": 2},
    ],
}

_ROOM_LIGHTING: dict[str, list[dict[str, Any]]] = {
    "bedroom": [
        {"name": "Ceiling LED Panel", "wattage": 40, "quantity": 1},
        {"name": "Bedside Wall Light", "wattage": 10, "quantity": 2},
    ],
    "kitchen": [
        {"name": "Ceiling LED Panel", "wattage": 40, "quantity": 2},
        {"name": "Under-cabinet LED", "wattage": 15, "quantity": 4},
    ],
    "bathroom": [
        {"name": "Mirror Light", "wattage": 15, "quantity": 1},
        {"name": "Ceiling Downlight", "wattage": 10, "quantity": 2},
    ],
    "living_room": [
        {"name": "Ceiling LED Panel", "wattage": 60, "quantity": 2},
        {"name": "Accent Spot", "wattage": 7, "quantity": 4},
        {"name": "Floor Lamp Socket", "wattage": 60, "quantity": 1},
    ],
}

_ROOM_FIXTURES: dict[str, list[dict[str, int]]] = {
    "bathroom": [{"toilet": 1, "lavatory": 1, "shower": 1}],
    "kitchen": [{"kitchen_sink": 1, "dishwasher": 1}],
}


def _build_electrical_request(request: JobRequest, variant: dict[str, Any]) -> ElectricalRequest:
    room_type = request.room.type
    appliances = [
        Appliance(
            name=a["name"],
            wattage=a["wattage"],
            quantity=a.get("quantity", 1),
            circuit_type=CircuitType(a.get("circuit_type", "general_power")),
            dedicated_circuit=a.get("dedicated_circuit", False),
            is_continuous=a.get("is_continuous", False),
        )
        for a in _ROOM_APPLIANCES.get(room_type, _ROOM_APPLIANCES["bedroom"])
    ]
    lighting = [
        LightingPoint(name=lp["name"], wattage=lp["wattage"], quantity=lp.get("quantity", 1))
        for lp in _ROOM_LIGHTING.get(room_type, _ROOM_LIGHTING["bedroom"])
    ]
    return ElectricalRequest(
        project_id=variant.get("project_id", ""),
        room_id=request.room.id,
        room_length_mm=request.room.length_mm,
        room_width_mm=request.room.width_mm,
        appliances=appliances,
        lighting=lighting,
    )


def _build_plumbing_request(request: JobRequest, variant: dict[str, Any]) -> PlumbingRequest:
    room_type = request.room.type
    fixtures = _ROOM_FIXTURES.get(room_type, [{"lavatory": 1}])
    return PlumbingRequest(
        project_id=variant.get("project_id", ""),
        room_id=request.room.id,
        fixtures=fixtures,
        hot_water_required=room_type in ("bathroom", "kitchen"),
    )


def _build_hvac_request(request: JobRequest, variant: dict[str, Any]) -> HVACRequest:
    # Estimate window area from room perimeter (assume 15% of wall area is windows)
    perimeter_mm = 2 * (request.room.length_mm + request.room.width_mm)
    wall_area_sqft = (perimeter_mm * request.room.height_mm) / (304.8 * 304.8)
    window_area_sqft = wall_area_sqft * 0.15

    return HVACRequest(
        project_id=variant.get("project_id", ""),
        room_id=request.room.id,
        room_length_mm=request.room.length_mm,
        room_width_mm=request.room.width_mm,
        room_height_mm=request.room.height_mm,
        window_area_sqft=round(window_area_sqft, 1),
    )


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

async def _run_mep_job(
    request: JobRequest,
) -> None:
    """Background task: run the appropriate MEP agent and persist results."""
    calc_type = request.calc_type or "electrical"
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

            await update_job_status(
                db, request.job_id, status="running", progress=20,
                output_json={"current_step": f"Running {calc_type} calculation"},
            )

            result_data: dict[str, Any] | None = None
            standards_cited: list[str] = []

            if calc_type == "electrical":
                req = _build_electrical_request(request, variant)
                agent = ElectricalAgent()
                state = await agent.invoke(request=req)
                result_data = state.get("result")
                if result_data:
                    standards_cited = result_data.get("standard_references", [])

            elif calc_type == "plumbing":
                req = _build_plumbing_request(request, variant)
                agent = PlumbingAgent()
                state = await agent.invoke(request=req)
                result_data = state.get("result")
                if result_data:
                    standards_cited = result_data.get("standard_references", [])

            elif calc_type == "hvac":
                req = _build_hvac_request(request, variant)
                agent = HVACAgent()
                state = await agent.invoke(request=req)
                result_data = state.get("result")
                if result_data:
                    standards_cited = result_data.get("standard_references", [])

            else:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error=f"Unknown calc_type: {calc_type}",
                )
                return

            if not result_data:
                await update_job_status(
                    db, request.job_id, status="failed",
                    error=f"{calc_type} calculation produced no result",
                )
                return

            # Persist to PostgreSQL
            result_id = await write_mep_result(
                db,
                design_variant_id=request.design_variant_id,
                job_id=request.job_id,
                calc_type=calc_type,
                result=result_data,
                standards_cited=standards_cited,
            )

            await update_job_status(
                db, request.job_id, status="completed", progress=100,
                output_json={"mep_result_id": result_id, "calc_type": calc_type},
            )

            logger.info("mep_job_completed", job_id=request.job_id, calc_type=calc_type, result_id=result_id)

        except Exception as exc:
            logger.error("mep_job_failed", job_id=request.job_id, calc_type=calc_type, error=str(exc))
            await update_job_status(db, request.job_id, status="failed", error=str(exc))


# ---------------------------------------------------------------------------
# POST /api/v1/mep/job — Internal endpoint (called by tRPC)
# ---------------------------------------------------------------------------

@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Internal MEP job endpoint for tRPC fire-and-forget calls",
)
async def run_mep_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a JobRequest from tRPC and run the MEP calculation in the background."""
    background_tasks.add_task(_run_mep_job, request)
    logger.info("mep_job_dispatched", job_id=request.job_id, calc_type=request.calc_type)
    return {"status": "accepted", "job_id": request.job_id}
