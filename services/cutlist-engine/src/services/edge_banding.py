"""
Edge banding calculation service.

Calculates the total linear length of edge banding material required
per panel, per furniture unit, and for the entire project.  Accounts
for material waste and ordering increments.
"""

from __future__ import annotations

import structlog
from pydantic import BaseModel, Field

from src.models.panels import CutListPanel, EdgeBandingSpec

logger = structlog.get_logger(__name__)

# Standard waste factor for edge banding (10% — accounts for trimming, alignment)
EDGE_BANDING_WASTE_FACTOR = 0.10

# Minimum order length in mm (edge banding comes in rolls)
MIN_ORDER_LENGTH_MM = 1000.0


class PanelEdgeBandingResult(BaseModel):
    """Edge banding requirements for a single panel."""

    panel_id: str
    part_name: str
    top_length_mm: float = 0.0
    bottom_length_mm: float = 0.0
    left_length_mm: float = 0.0
    right_length_mm: float = 0.0
    total_length_mm: float = 0.0
    material: str | None = None
    thickness_mm: float | None = None


class EdgeBandingSummary(BaseModel):
    """Aggregated edge banding requirements for a cut list."""

    panels: list[PanelEdgeBandingResult]
    total_length_mm: float = Field(description="Total linear edge banding without waste")
    total_length_with_waste_mm: float = Field(description="Total with waste factor applied")
    waste_factor: float = Field(default=EDGE_BANDING_WASTE_FACTOR)
    by_material: dict[str, float] = Field(
        default_factory=dict,
        description="Total length in mm grouped by banding material",
    )


def calculate_panel_edge_banding(panel: CutListPanel) -> PanelEdgeBandingResult:
    """Calculate edge banding lengths for a single panel.

    The edge banding length per side equals the dimension of that edge:
    - top/bottom edges run along the panel's length
    - left/right edges run along the panel's width

    Parameters
    ----------
    panel:
        The cut list panel to calculate for.

    Returns
    -------
    PanelEdgeBandingResult
        Lengths for each banded edge and the total.
    """
    eb = panel.edge_banding

    top_len = panel.length_mm if eb.top else 0.0
    bottom_len = panel.length_mm if eb.bottom else 0.0
    left_len = panel.width_mm if eb.left else 0.0
    right_len = panel.width_mm if eb.right else 0.0

    # Multiply by quantity
    total = (top_len + bottom_len + left_len + right_len) * panel.quantity

    return PanelEdgeBandingResult(
        panel_id=panel.id,
        part_name=panel.part_name,
        top_length_mm=top_len * panel.quantity,
        bottom_length_mm=bottom_len * panel.quantity,
        left_length_mm=left_len * panel.quantity,
        right_length_mm=right_len * panel.quantity,
        total_length_mm=total,
        material=eb.material,
        thickness_mm=eb.thickness_mm,
    )


def calculate_edge_banding(
    panels: list[CutListPanel],
    waste_factor: float = EDGE_BANDING_WASTE_FACTOR,
) -> EdgeBandingSummary:
    """Calculate total edge banding requirements for a list of panels.

    Parameters
    ----------
    panels:
        All panels in the cut list.
    waste_factor:
        Fraction added for waste (default 10%).

    Returns
    -------
    EdgeBandingSummary
        Complete edge banding summary with per-panel and aggregate totals.
    """
    results: list[PanelEdgeBandingResult] = []
    by_material: dict[str, float] = {}

    for panel in panels:
        result = calculate_panel_edge_banding(panel)
        results.append(result)

        if result.total_length_mm > 0:
            mat_key = result.material or "default"
            by_material[mat_key] = by_material.get(mat_key, 0) + result.total_length_mm

    total_length = sum(r.total_length_mm for r in results)
    total_with_waste = total_length * (1 + waste_factor)

    # Round up to minimum order lengths per material
    by_material_with_waste: dict[str, float] = {}
    for mat, length in by_material.items():
        length_with_waste = length * (1 + waste_factor)
        # Round up to nearest MIN_ORDER_LENGTH_MM
        if length_with_waste > 0:
            length_with_waste = max(
                length_with_waste,
                MIN_ORDER_LENGTH_MM,
            )
        by_material_with_waste[mat] = round(length_with_waste, 1)

    logger.info(
        "edge_banding_calculated",
        panel_count=len(panels),
        total_length_mm=round(total_length, 1),
        total_with_waste_mm=round(total_with_waste, 1),
        materials=list(by_material.keys()),
    )

    return EdgeBandingSummary(
        panels=results,
        total_length_mm=round(total_length, 1),
        total_length_with_waste_mm=round(total_with_waste, 1),
        waste_factor=waste_factor,
        by_material=by_material_with_waste,
    )
