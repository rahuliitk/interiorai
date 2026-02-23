"""
Quantity calculation engine with waste factor application.

Takes raw material extractions from the LLM and computes precise quantities
considering room geometry, laying patterns, and applicable waste factors.
All internal measurements are in millimetres; output quantities are in the
material's native unit (sqft, rft, nos, etc.).
"""

from __future__ import annotations

import math
from typing import Any

import structlog

from src.agents.material_db import (
    EXTENDED_WASTE_FACTORS,
    MATERIAL_DATABASE,
    get_waste_factor,
)

logger = structlog.get_logger(__name__)

# Conversion constants
MM_TO_FT = 1 / 304.8
MM2_TO_SQFT = 1 / (304.8 * 304.8)
MM_TO_M = 1 / 1000
MM2_TO_SQM = 1 / (1000 * 1000)


def calculate_material_quantities(
    materials: list[dict[str, Any]],
    room_dimensions: dict[str, float],
) -> list[dict[str, Any]]:
    """Calculate precise quantities for each extracted material.

    Parameters
    ----------
    materials:
        List of material dicts from the LLM extraction step.
        Each dict should have ``material_key``, ``unit``, ``area_or_count``,
        and optionally ``laying_pattern``.
    room_dimensions:
        Room dimensions in mm: ``{length_mm, width_mm, height_mm}``.

    Returns
    -------
    list[dict[str, Any]]
        Updated material dicts with ``quantity`` and ``waste_factor`` added.
    """
    length_mm = room_dimensions.get("length_mm", 3000)
    width_mm = room_dimensions.get("width_mm", 3000)
    height_mm = room_dimensions.get("height_mm", 2700)

    floor_area_sqft = length_mm * width_mm * MM2_TO_SQFT
    wall_area_sqft = 2 * (length_mm + width_mm) * height_mm * MM2_TO_SQFT
    ceiling_area_sqft = floor_area_sqft
    perimeter_rft = 2 * (length_mm + width_mm) * MM_TO_FT

    calculated: list[dict[str, Any]] = []

    for mat in materials:
        try:
            result = _calculate_single_material(
                material=mat,
                floor_area_sqft=floor_area_sqft,
                wall_area_sqft=wall_area_sqft,
                ceiling_area_sqft=ceiling_area_sqft,
                perimeter_rft=perimeter_rft,
                room_dimensions=room_dimensions,
            )
            calculated.append(result)
        except Exception:
            logger.warning("quantity_calculation_failed", material=mat, exc_info=True)
            # Pass through with raw quantity
            mat.setdefault("quantity", mat.get("area_or_count", 0))
            mat.setdefault("waste_factor", 0.05)
            calculated.append(mat)

    return calculated


def _calculate_single_material(
    material: dict[str, Any],
    floor_area_sqft: float,
    wall_area_sqft: float,
    ceiling_area_sqft: float,
    perimeter_rft: float,
    room_dimensions: dict[str, float],
) -> dict[str, Any]:
    """Calculate quantity for a single material, applying waste factors.

    Parameters
    ----------
    material:
        The raw material dict from extraction.
    floor_area_sqft:
        Calculated floor area in sqft.
    wall_area_sqft:
        Calculated total wall area in sqft.
    ceiling_area_sqft:
        Calculated ceiling area in sqft.
    perimeter_rft:
        Room perimeter in running feet.
    room_dimensions:
        Raw room dimensions in mm.

    Returns
    -------
    dict[str, Any]
        Updated material dict with computed ``quantity`` and ``waste_factor``.
    """
    result = {**material}
    material_key = material.get("material_key", "")
    unit = material.get("unit", "nos").lower()
    category = material.get("category", "").lower()
    laying_pattern = material.get("laying_pattern")
    raw_quantity = float(material.get("area_or_count", 0))

    # Determine the waste factor
    waste_factor = get_waste_factor(material_key, laying_pattern)
    result["waste_factor"] = waste_factor

    # Validate and refine quantity based on unit and category
    if raw_quantity <= 0:
        raw_quantity = _estimate_quantity_from_room(
            category=category,
            unit=unit,
            floor_area_sqft=floor_area_sqft,
            wall_area_sqft=wall_area_sqft,
            ceiling_area_sqft=ceiling_area_sqft,
            perimeter_rft=perimeter_rft,
        )

    # Apply rounding based on unit type
    if unit in ("nos", "pair", "set", "bag"):
        # Discrete units: round up to nearest integer
        quantity = math.ceil(raw_quantity * (1 + waste_factor))
        # Store the pre-waste quantity separately
        result["quantity"] = quantity
        # Reset waste factor since we already applied it
        result["waste_factor"] = 0.0
    elif unit in ("sqft", "sqm"):
        # Area units: keep one decimal
        quantity = round(raw_quantity, 1)
        result["quantity"] = quantity
    elif unit in ("rft", "rm", "m"):
        # Linear units: keep one decimal
        quantity = round(raw_quantity, 1)
        result["quantity"] = quantity
    else:
        result["quantity"] = round(raw_quantity, 1)

    return result


def _estimate_quantity_from_room(
    category: str,
    unit: str,
    floor_area_sqft: float,
    wall_area_sqft: float,
    ceiling_area_sqft: float,
    perimeter_rft: float,
) -> float:
    """Estimate a reasonable quantity when the LLM did not provide one.

    Uses category and unit heuristics based on room geometry.
    """
    if category == "flooring":
        if unit in ("sqft", "sqm"):
            return floor_area_sqft
        return floor_area_sqft

    if category == "painting":
        if unit in ("sqft", "sqm"):
            return wall_area_sqft
        return wall_area_sqft

    if category == "false_ceiling":
        if unit in ("sqft", "sqm"):
            return ceiling_area_sqft * 0.6  # Partial false ceiling
        return ceiling_area_sqft * 0.6

    if category == "electrical":
        if unit == "rft":
            return perimeter_rft * 2
        if unit == "nos":
            return max(2, floor_area_sqft / 40)
        return perimeter_rft

    if category == "plumbing":
        if unit == "rft":
            return perimeter_rft * 0.5
        return perimeter_rft * 0.5

    if category == "carpentry":
        if unit in ("sqft", "sqm"):
            return floor_area_sqft * 0.3
        if unit == "rft":
            return perimeter_rft * 0.5
        return floor_area_sqft * 0.3

    if category == "hardware":
        if unit in ("nos", "pair"):
            return max(2, floor_area_sqft / 15)
        return 4

    if category == "civil":
        if unit == "bag":
            return max(1, floor_area_sqft / 30)
        if unit == "cft":
            return max(2, floor_area_sqft / 10)
        return floor_area_sqft * 0.1

    # Default fallback
    if unit in ("sqft", "sqm"):
        return floor_area_sqft * 0.2
    if unit == "rft":
        return perimeter_rft
    if unit in ("nos", "pair"):
        return max(1, floor_area_sqft / 30)

    return 1.0


def calculate_tile_quantity(
    area_sqft: float,
    tile_size_mm: tuple[float, float],
    laying_pattern: str = "straight",
) -> dict[str, Any]:
    """Calculate tile quantities with pattern-specific waste.

    Parameters
    ----------
    area_sqft:
        Area to be tiled in square feet.
    tile_size_mm:
        Tile dimensions as ``(length_mm, width_mm)``.
    laying_pattern:
        Laying pattern: ``"straight"``, ``"diagonal"``, or ``"herringbone"``.

    Returns
    -------
    dict
        Contains ``tiles_needed``, ``boxes_needed`` (assuming 4 tiles/box),
        ``waste_factor``, and ``total_area_sqft``.
    """
    waste_key = f"tiles_{laying_pattern}"
    waste_factor = EXTENDED_WASTE_FACTORS.get(waste_key, 0.05)

    tile_area_sqft = (tile_size_mm[0] * tile_size_mm[1]) * MM2_TO_SQFT
    total_area_with_waste = area_sqft * (1 + waste_factor)

    tiles_needed = math.ceil(total_area_with_waste / tile_area_sqft)
    tiles_per_box = 4
    boxes_needed = math.ceil(tiles_needed / tiles_per_box)

    return {
        "tiles_needed": tiles_needed,
        "boxes_needed": boxes_needed,
        "waste_factor": waste_factor,
        "total_area_sqft": round(total_area_with_waste, 1),
        "tile_area_sqft": round(tile_area_sqft, 3),
    }


def calculate_paint_quantity(
    wall_area_sqft: float,
    coats: int = 2,
    coverage_sqft_per_litre: float = 120.0,
) -> dict[str, Any]:
    """Calculate paint quantity including primer and putty requirements.

    Parameters
    ----------
    wall_area_sqft:
        Total wall area in sqft.
    coats:
        Number of paint coats (default 2).
    coverage_sqft_per_litre:
        Coverage rate per litre of paint.

    Returns
    -------
    dict
        Contains ``paint_litres``, ``primer_litres``, ``putty_kg``,
        and ``total_area_sqft``.
    """
    waste_factor = EXTENDED_WASTE_FACTORS.get("paint", 0.03)
    effective_area = wall_area_sqft * (1 + waste_factor)

    paint_litres = math.ceil((effective_area * coats) / coverage_sqft_per_litre)
    primer_litres = math.ceil(effective_area / 150)  # Primer covers ~150 sqft/L
    putty_kg = math.ceil(effective_area / 20)  # Putty covers ~20 sqft/kg

    return {
        "paint_litres": paint_litres,
        "primer_litres": primer_litres,
        "putty_kg": putty_kg,
        "total_area_sqft": round(effective_area, 1),
        "waste_factor": waste_factor,
    }


def calculate_plywood_quantity(
    furniture_area_sqft: float,
    include_laminate: bool = True,
    include_edge_banding: bool = True,
) -> dict[str, Any]:
    """Calculate plywood, laminate, and edge banding quantities for carpentry.

    Parameters
    ----------
    furniture_area_sqft:
        Total furniture panel area in sqft.
    include_laminate:
        Whether to include laminate sheet calculation.
    include_edge_banding:
        Whether to include edge banding calculation.

    Returns
    -------
    dict
        Contains ``plywood_sqft``, ``laminate_sqft``, ``edge_banding_rft``,
        ``sheets_8x4`` (number of 8x4 ft sheets), and waste factors.
    """
    plywood_waste = EXTENDED_WASTE_FACTORS.get("plywood", 0.08)
    plywood_sqft = furniture_area_sqft * (1 + plywood_waste)

    sheet_area = 8 * 4  # sqft per 8x4 sheet
    sheets_needed = math.ceil(plywood_sqft / sheet_area)

    result: dict[str, Any] = {
        "plywood_sqft": round(plywood_sqft, 1),
        "sheets_8x4": sheets_needed,
        "plywood_waste_factor": plywood_waste,
    }

    if include_laminate:
        laminate_waste = EXTENDED_WASTE_FACTORS.get("plywood", 0.08)
        # Laminate covers both sides of exposed panels (approx 1.2x plywood area)
        laminate_sqft = furniture_area_sqft * 1.2 * (1 + laminate_waste)
        laminate_sheets = math.ceil(laminate_sqft / sheet_area)
        result["laminate_sqft"] = round(laminate_sqft, 1)
        result["laminate_sheets_8x4"] = laminate_sheets
        result["laminate_waste_factor"] = laminate_waste

    if include_edge_banding:
        eb_waste = EXTENDED_WASTE_FACTORS.get("edge_banding", 0.10)
        # Estimate edge length as perimeter of panels: ~0.8 rft per sqft
        edge_banding_rft = furniture_area_sqft * 0.8 * (1 + eb_waste)
        result["edge_banding_rft"] = round(edge_banding_rft, 1)
        result["edge_banding_waste_factor"] = eb_waste

    return result
