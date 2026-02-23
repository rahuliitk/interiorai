"""
HVAC router — endpoint for cooling/heating load calculations.

Accepts room dimensions, occupancy, orientation, and insulation details,
then returns cooling/heating load (BTU/ton), duct sizing, and equipment
recommendations.  All calculations cite ASHRAE Manual J references.
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.hvac_agent import HVACAgent
from src.models.hvac import HVACRequest, HVACResult

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/mep/hvac", tags=["hvac"])

CACHE_TTL = 3600


@router.post(
    "/calculate",
    response_model=HVACResult,
    status_code=status.HTTP_200_OK,
    summary="Calculate HVAC cooling/heating load and equipment sizing",
    description=(
        "Performs HVAC load calculation per ASHRAE Manual J (simplified).  "
        "Accepts room dimensions, occupancy, orientation, and insulation level.  "
        "Returns cooling load (sensible + latent), heating load, duct sizing "
        "(per ASHRAE Fundamentals Ch.21), and equipment recommendations."
    ),
)
async def calculate_hvac(
    request: HVACRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> HVACResult:
    """Calculate HVAC cooling/heating loads and recommend equipment.

    Steps:
    1. Calculate cooling load per ASHRAE Manual J:
       - Envelope load (walls, roof) adjusted by insulation and orientation
       - Window solar heat gain
       - Occupant heat gain (sensible + latent)
       - Equipment and lighting internal gains
       - Ventilation/infiltration load
    2. Calculate heating load per ASHRAE Manual J:
       - Envelope heat loss
       - Window heat loss
       - Infiltration losses
    3. Size ductwork per ASHRAE Fundamentals, Chapter 21
    4. Recommend equipment with 10% safety margin
    """
    logger.info(
        "hvac_calculation_start",
        project_id=request.project_id,
        room_id=request.room_id,
        orientation=request.orientation.value,
        climate_zone=request.climate_zone.value,
        occupancy=request.occupancy,
        user_id=user_id,
    )

    # Check cache
    cache_key = f"mep:hvac:{request.project_id}:{request.room_id}"
    cached = await cache_get(cache_key)
    if cached:
        logger.info("hvac_cache_hit", cache_key=cache_key)
        return HVACResult(**cached)

    agent = HVACAgent()
    try:
        state = await agent.invoke(request=request)
        result_data = state.get("result")
        if not result_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="HVAC calculation produced no result",
            )

        result = HVACResult(**result_data)

        await cache_set(cache_key, result.model_dump(mode="json"), ttl=CACHE_TTL)

        logger.info(
            "hvac_calculation_complete",
            project_id=request.project_id,
            room_id=request.room_id,
            cooling_btu=result.cooling_load.total_load_btu,
            cooling_tons=result.cooling_load.load_tons,
            heating_btu=result.heating_load.total_load_btu,
            equipment_count=len(result.recommended_equipment),
        )

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "hvac_calculation_failed",
            project_id=request.project_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HVAC calculation failed: {exc}",
        ) from exc
