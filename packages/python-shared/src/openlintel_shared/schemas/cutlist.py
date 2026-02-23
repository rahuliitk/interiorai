"""
Cut-list Pydantic models — mirrors ``@openlintel/core`` TypeScript types.

Used by the cut-list engine service for CNC panel nesting and optimisation.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class PanelMaterial(str, Enum):
    """Panel substrate materials."""

    BWR_PLYWOOD = "bwr_plywood"
    MR_PLYWOOD = "mr_plywood"
    MDF = "mdf"
    PARTICLE_BOARD = "particle_board"
    HDHMR = "hdhmr"
    SOLID_WOOD = "solid_wood"
    MARINE_PLYWOOD = "marine_plywood"


class EdgeBanding(BaseModel):
    """Edge-banding specification for a panel."""

    top: bool = False
    bottom: bool = False
    left: bool = False
    right: bool = False
    material: str | None = None
    thickness_mm: Annotated[float | None, Field(default=None, gt=0)]


class CutListPanel(BaseModel):
    """A single panel entry in the cut list for CNC manufacturing."""

    id: str
    furniture_unit_id: str = Field(alias="furnitureUnitId")
    part_name: str = Field(alias="partName")
    length_mm: Annotated[float, Field(gt=0, alias="length_mm")]
    width_mm: Annotated[float, Field(gt=0, alias="width_mm")]
    thickness_mm: Annotated[float, Field(gt=0, alias="thickness_mm")]
    material: PanelMaterial
    grain_direction: Literal["length", "width", "none"] = Field(alias="grainDirection")
    face_laminate: str | None = Field(default=None, alias="faceLaminate")
    edge_banding: EdgeBanding = Field(alias="edgeBanding")
    quantity: Annotated[int, Field(gt=0)]

    model_config = {"populate_by_name": True}

    @property
    def area_mm2(self) -> float:
        """Surface area of a single panel in mm^2."""
        return self.length_mm * self.width_mm

    @property
    def total_area_mm2(self) -> float:
        """Total surface area of all copies of this panel in mm^2."""
        return self.area_mm2 * self.quantity
