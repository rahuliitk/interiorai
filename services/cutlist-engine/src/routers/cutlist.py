"""
Cut list router — endpoints for generating panel cut lists, retrieving
results, downloading nesting layouts, and exporting CNC-ready DXF files.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.redis_client import cache_get, cache_set

from src.agents.cutlist_agent import CutListAgent
from src.agents.hardware_agent import (
    HardwareAgent,
    generate_hardware_schedule_standard,
)
from src.models.hardware import HardwareSchedule
from src.models.nesting import NestingResult
from src.models.panels import CutListPanel, CutListRequest, CutListResult, EdgeBandingSpec
from src.services.dxf_output import generate_dxf
from src.services.edge_banding import calculate_edge_banding
from src.services.nesting import nest_panels
from src.services.offcut_tracker import offcut_inventory

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/cutlist", tags=["cutlist"])

# Cache TTL for cut list results (1 hour)
CACHE_TTL = 3600


def _cache_key(cutlist_id: str) -> str:
    return f"cutlist:{cutlist_id}"


def _nesting_cache_key(cutlist_id: str) -> str:
    return f"cutlist:{cutlist_id}:nesting"


@router.post(
    "/generate",
    response_model=CutListResult,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a panel cut list from furniture specifications",
    description=(
        "Accepts a list of furniture specifications and produces an optimized "
        "panel cut list with nesting, edge banding calculations, and optional "
        "hardware scheduling."
    ),
)
async def generate_cutlist(
    request: CutListRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> CutListResult:
    """Generate a complete cut list from furniture specifications.

    Steps:
    1. Run CutListAgent to break furniture specs into panels
    2. Calculate edge banding requirements
    3. Nest panels onto standard sheets
    4. Optionally generate hardware schedule
    5. Track reusable offcuts
    """
    cutlist_id = str(uuid.uuid4())

    logger.info(
        "cutlist_generation_start",
        cutlist_id=cutlist_id,
        project_id=request.project_id,
        room_id=request.room_id,
        furniture_count=len(request.furniture_specs),
        user_id=user_id,
    )

    # Step 1: Run the CutList Agent to break down furniture into panels
    agent = CutListAgent()
    try:
        result = await agent.invoke(
            furniture_specs=[spec.model_dump() for spec in request.furniture_specs]
        )
        raw_panels = result.get("panels", [])
        errors = result.get("errors", [])

        if errors:
            logger.warning(
                "cutlist_agent_warnings",
                cutlist_id=cutlist_id,
                errors=errors,
            )
    except Exception as exc:
        logger.error(
            "cutlist_agent_failed",
            cutlist_id=cutlist_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Panel breakdown failed: {exc}",
        ) from exc

    # Convert raw panel dicts to CutListPanel models
    panels: list[CutListPanel] = []
    for raw in raw_panels:
        try:
            eb_data = raw.get("edge_banding", {})
            if isinstance(eb_data, dict):
                edge_banding = EdgeBandingSpec(**eb_data)
            else:
                edge_banding = eb_data

            panel = CutListPanel(
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
            )
            panels.append(panel)
        except Exception as exc:
            logger.warning(
                "cutlist_panel_parse_error",
                cutlist_id=cutlist_id,
                part_name=raw.get("part_name"),
                error=str(exc),
            )

    if not panels:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No valid panels could be generated from the furniture specifications",
        )

    # Step 2: Calculate edge banding
    edge_banding_result = calculate_edge_banding(panels)

    # Step 3: Nest panels onto sheets
    nesting_result = nest_panels(
        panels=panels,
        sheet_size=request.sheet_size,
        cutlist_id=cutlist_id,
    )

    # Step 4: Track offcuts
    for sheet in nesting_result.sheets:
        offcut_inventory.add_offcuts_from_nesting(
            offcuts=sheet.offcuts,
            cutlist_id=cutlist_id,
            material=sheet.material,
            thickness_mm=sheet.thickness_mm,
        )

    # Step 5: Optionally generate hardware schedule
    hardware_schedule: HardwareSchedule | None = None
    if request.include_hardware:
        hardware_schedule = generate_hardware_schedule_standard(
            specs=request.furniture_specs,
            project_id=request.project_id,
            room_id=request.room_id,
        )

    # Build result
    total_area = sum(p.total_area_mm2 for p in panels)
    cutlist_result = CutListResult(
        id=cutlist_id,
        project_id=request.project_id,
        room_id=request.room_id,
        panels=panels,
        total_panels=sum(p.quantity for p in panels),
        total_area_mm2=total_area,
        sheets_required=nesting_result.total_sheets,
        waste_percentage=nesting_result.waste_percentage,
        edge_banding_total_mm=edge_banding_result.total_length_with_waste_mm,
        status="completed",
    )

    # Cache the results
    await cache_set(
        _cache_key(cutlist_id),
        cutlist_result.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )
    await cache_set(
        _nesting_cache_key(cutlist_id),
        nesting_result.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    logger.info(
        "cutlist_generation_complete",
        cutlist_id=cutlist_id,
        total_panels=cutlist_result.total_panels,
        sheets_required=cutlist_result.sheets_required,
        waste_percentage=cutlist_result.waste_percentage,
    )

    return cutlist_result


@router.get(
    "/{cutlist_id}",
    response_model=CutListResult,
    summary="Get a cut list result by ID",
)
async def get_cutlist(
    cutlist_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> CutListResult:
    """Retrieve a previously generated cut list result."""
    cached = await cache_get(_cache_key(cutlist_id))
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cut list '{cutlist_id}' not found or has expired",
        )

    return CutListResult(**cached)


@router.get(
    "/{cutlist_id}/nesting",
    response_model=NestingResult,
    summary="Get the nesting layout for a cut list",
)
async def get_nesting(
    cutlist_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> NestingResult:
    """Retrieve the nesting layout (sheet assignments and panel placements)."""
    cached = await cache_get(_nesting_cache_key(cutlist_id))
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nesting layout for cut list '{cutlist_id}' not found or has expired",
        )

    return NestingResult(**cached)


@router.get(
    "/{cutlist_id}/dxf",
    summary="Download CNC-ready DXF file for a cut list",
    response_class=Response,
)
async def download_dxf(
    cutlist_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> Response:
    """Generate and download a CNC-ready DXF file for the nesting layout."""
    cached = await cache_get(_nesting_cache_key(cutlist_id))
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nesting layout for cut list '{cutlist_id}' not found or has expired",
        )

    nesting_result = NestingResult(**cached)
    dxf_bytes = generate_dxf(nesting_result)

    return Response(
        content=dxf_bytes,
        media_type="application/dxf",
        headers={
            "Content-Disposition": f'attachment; filename="cutlist_{cutlist_id}.dxf"',
        },
    )


@router.get(
    "/{cutlist_id}/hardware",
    response_model=HardwareSchedule,
    summary="Get the hardware schedule for a cut list",
)
async def get_hardware_schedule(
    cutlist_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> HardwareSchedule:
    """Retrieve the hardware schedule associated with a cut list."""
    cached_key = f"cutlist:{cutlist_id}:hardware"
    cached = await cache_get(cached_key)
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hardware schedule for cut list '{cutlist_id}' not found",
        )

    return HardwareSchedule(**cached)
