"""
Nesting models for the Cut List Engine.

Describes sheet layouts produced by the bin-packing algorithm, including
placed panel positions and reusable offcuts.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class PlacedPanel(BaseModel):
    """A panel placed onto a sheet by the nesting algorithm."""

    panel_id: str = Field(description="Reference to CutListPanel.id")
    part_name: str
    x_mm: Annotated[float, Field(ge=0, description="X position on sheet (from left)")]
    y_mm: Annotated[float, Field(ge=0, description="Y position on sheet (from bottom)")]
    length_mm: Annotated[float, Field(gt=0)]
    width_mm: Annotated[float, Field(gt=0)]
    rotated: bool = Field(
        default=False,
        description="True if the panel was rotated 90 degrees from its original orientation",
    )
    grain_direction_on_sheet: str = Field(
        default="horizontal",
        description="Actual grain direction as placed on the sheet",
    )


class Offcut(BaseModel):
    """A reusable offcut remaining after nesting on a sheet."""

    id: str
    sheet_index: int
    x_mm: Annotated[float, Field(ge=0)]
    y_mm: Annotated[float, Field(ge=0)]
    length_mm: Annotated[float, Field(gt=0)]
    width_mm: Annotated[float, Field(gt=0)]
    area_mm2: float
    reusable: bool = Field(
        default=True,
        description="Whether this offcut is large enough to be reusable (min 200x200mm)",
    )


class SheetLayout(BaseModel):
    """Layout of panels on a single sheet."""

    sheet_index: int = Field(ge=0)
    sheet_length_mm: Annotated[float, Field(gt=0)]
    sheet_width_mm: Annotated[float, Field(gt=0)]
    material: str
    thickness_mm: float
    panels: list[PlacedPanel]
    offcuts: list[Offcut] = Field(default_factory=list)
    utilization_percentage: float = Field(
        ge=0,
        le=100,
        description="Percentage of sheet area used by panels",
    )


class NestingResult(BaseModel):
    """Complete nesting result across all sheets."""

    cutlist_id: str
    sheets: list[SheetLayout]
    total_sheets: int
    total_sheet_area_mm2: float
    total_panel_area_mm2: float
    total_waste_area_mm2: float
    waste_percentage: float
    reusable_offcuts: list[Offcut] = Field(default_factory=list)
    sheet_size_used: str = Field(description="Sheet size code used (e.g. '8x4')")
