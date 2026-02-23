"""
Electrical router — endpoint for electrical load calculation.

Accepts room dimensions, appliance list, and lighting plan, then returns
circuit schedule, wire gauge, conduit size, and panel schedule.
All calculations cite NEC (National Electrical Code) references.
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.electrical_agent import ElectricalAgent
from src.models.electrical import ElectricalRequest, ElectricalResult

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/mep/electrical", tags=["electrical"])

CACHE_TTL = 3600


@router.post(
    "/calculate",
    response_model=ElectricalResult,
    status_code=status.HTTP_200_OK,
    summary="Calculate electrical load and circuit schedule",
    description=(
        "Performs electrical load calculation per NEC 310.16.  Accepts room "
        "dimensions, appliance list, and lighting plan.  Returns circuit "
        "schedule with wire gauge, breaker sizing, and conduit fill."
    ),
)
async def calculate_electrical(
    request: ElectricalRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> ElectricalResult:
    """Calculate electrical loads, circuit grouping, and panel schedule.

    The calculation follows these steps (all per NEC):
    1. Calculate connected loads for all appliances and lighting
    2. Apply demand factors per NEC Article 220
    3. Group loads into circuits per NEC 210.11
    4. Select wire gauge per NEC 310.16
    5. Select breaker sizes per NEC 240.6(A)
    6. Calculate conduit fill per NEC Chapter 9, Table 1
    7. Build panel schedule per NEC Article 408
    """
    logger.info(
        "electrical_calculation_start",
        project_id=request.project_id,
        room_id=request.room_id,
        appliance_count=len(request.appliances),
        lighting_count=len(request.lighting),
        user_id=user_id,
    )

    # Check cache
    cache_key = f"mep:electrical:{request.project_id}:{request.room_id}"
    cached = await cache_get(cache_key)
    if cached:
        logger.info("electrical_cache_hit", cache_key=cache_key)
        return ElectricalResult(**cached)

    agent = ElectricalAgent()
    try:
        state = await agent.invoke(request=request)
        result_data = state.get("result")
        if not result_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Electrical calculation produced no result",
            )

        result = ElectricalResult(**result_data)

        # Cache the result
        await cache_set(cache_key, result.model_dump(mode="json"), ttl=CACHE_TTL)

        logger.info(
            "electrical_calculation_complete",
            project_id=request.project_id,
            room_id=request.room_id,
            total_demand_watts=result.total_demand_load_watts,
            main_breaker_amps=result.recommended_main_breaker_amps,
            circuit_count=len(result.panel_schedule.circuits),
        )

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "electrical_calculation_failed",
            project_id=request.project_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Electrical calculation failed: {exc}",
        ) from exc
