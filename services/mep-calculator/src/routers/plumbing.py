"""
Plumbing router — endpoint for plumbing calculations.

Accepts fixture list and pipe run lengths, returns pipe sizing,
fixture units, and drainage slope.  All calculations cite IPC
(International Plumbing Code) references.
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.plumbing_agent import PlumbingAgent
from src.models.plumbing import PlumbingRequest, PlumbingResult

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/mep/plumbing", tags=["plumbing"])

CACHE_TTL = 3600


@router.post(
    "/calculate",
    response_model=PlumbingResult,
    status_code=status.HTTP_200_OK,
    summary="Calculate plumbing pipe sizing and drainage",
    description=(
        "Performs plumbing calculations per IPC (International Plumbing Code).  "
        "Accepts a fixture list and returns fixture unit values (per IPC 604.4), "
        "supply pipe sizing, drainage pipe sizing (per IPC 710.1), and drainage "
        "slope requirements (per IPC 704.1: minimum 1/4 inch per foot)."
    ),
)
async def calculate_plumbing(
    request: PlumbingRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> PlumbingResult:
    """Calculate plumbing fixture units, pipe sizing, and drainage.

    Steps:
    1. Look up fixture unit values per IPC Table 604.4
    2. Sum supply and drainage fixture units
    3. Size supply pipes based on total fixture units
    4. Size drainage pipes per IPC Table 710.1(2)
    5. Calculate drainage slope per IPC 704.1
    6. Size vent pipes per IPC Table 916.1
    """
    logger.info(
        "plumbing_calculation_start",
        project_id=request.project_id,
        room_id=request.room_id,
        fixture_count=len(request.fixtures),
        user_id=user_id,
    )

    # Check cache
    cache_key = f"mep:plumbing:{request.project_id}:{request.room_id}"
    cached = await cache_get(cache_key)
    if cached:
        logger.info("plumbing_cache_hit", cache_key=cache_key)
        return PlumbingResult(**cached)

    agent = PlumbingAgent()
    try:
        state = await agent.invoke(request=request)
        result_data = state.get("result")
        if not result_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Plumbing calculation produced no result",
            )

        result = PlumbingResult(**result_data)

        await cache_set(cache_key, result.model_dump(mode="json"), ttl=CACHE_TTL)

        logger.info(
            "plumbing_calculation_complete",
            project_id=request.project_id,
            room_id=request.room_id,
            total_supply_fu=result.total_supply_fixture_units,
            total_drainage_fu=result.total_drainage_fixture_units,
            supply_pipe=result.supply_pipe.nominal_size_inches,
            drain_pipe=result.drainage.pipe_size_inches,
        )

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "plumbing_calculation_failed",
            project_id=request.project_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Plumbing calculation failed: {exc}",
        ) from exc
