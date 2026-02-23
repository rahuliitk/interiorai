"""
Panel models for the Cut List Engine.

Mirrors the TypeScript ``CutListPanel`` type from ``@openlintel/core`` with
additional fields needed for nesting and manufacturing.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class PanelMaterial(str, Enum):
    """Panel substrate materials commonly used in interior woodwork."""

    BWR_PLYWOOD = "bwr_plywood"
    MR_PLYWOOD = "mr_plywood"
    MDF = "mdf"
    PARTICLE_BOARD = "particle_board"
    HDHMR = "hdhmr"
    SOLID_WOOD = "solid_wood"
    MARINE_PLYWOOD = "marine_plywood"


class EdgeBandingSpec(BaseModel):
    """Edge-banding specification for a single panel.

    Each side can be independently flagged for banding.  ``material`` and
    ``thickness_mm`` describe the banding strip to be applied.
    """

    top: bool = False
    bottom: bool = False
    left: bool = False
    right: bool = False
    material: str | None = Field(default=None, description="Edge banding material (e.g. PVC, ABS)")
    thickness_mm: Annotated[float | None, Field(default=None, gt=0)]


class CutListPanel(BaseModel):
    """A single panel entry in the cut list for CNC manufacturing."""

    id: str
    furniture_unit_id: str = Field(description="ID of the furniture unit this panel belongs to")
    part_name: str = Field(description="Human-readable part name (e.g. 'Top Shelf', 'Side Panel')")
    length_mm: Annotated[float, Field(gt=0, description="Panel length in mm (grain direction)")]
    width_mm: Annotated[float, Field(gt=0, description="Panel width in mm")]
    thickness_mm: Annotated[float, Field(gt=0, description="Panel thickness in mm")]
    material: PanelMaterial
    grain_direction: Literal["length", "width", "none"] = Field(
        default="length",
        description="Grain runs along this dimension; 'none' for MDF/particle board",
    )
    face_laminate: str | None = Field(
        default=None,
        description="Laminate/veneer finish code applied to the face",
    )
    edge_banding: EdgeBandingSpec = Field(default_factory=EdgeBandingSpec)
    quantity: Annotated[int, Field(gt=0)]

    @property
    def area_mm2(self) -> float:
        """Surface area of a single panel in mm^2."""
        return self.length_mm * self.width_mm

    @property
    def total_area_mm2(self) -> float:
        """Total surface area of all copies of this panel in mm^2."""
        return self.area_mm2 * self.quantity


class FurnitureSpec(BaseModel):
    """Specification for a single furniture unit sent by the BOM/design engine."""

    furniture_unit_id: str
    name: str = Field(description="Furniture unit name (e.g. 'Kitchen Base Unit 600mm')")
    category: str = Field(description="Category: wardrobe, kitchen_base, kitchen_wall, vanity, etc.")
    width_mm: Annotated[float, Field(gt=0)]
    height_mm: Annotated[float, Field(gt=0)]
    depth_mm: Annotated[float, Field(gt=0)]
    material: PanelMaterial = PanelMaterial.BWR_PLYWOOD
    thickness_mm: float = 18.0
    face_laminate: str | None = None
    notes: str | None = None


class CutListRequest(BaseModel):
    """Request body for cut list generation."""

    project_id: str
    room_id: str
    furniture_specs: list[FurnitureSpec] = Field(min_length=1)
    include_hardware: bool = True
    include_edge_banding: bool = True
    sheet_size: str = Field(
        default="8x4",
        description="Preferred sheet size: 8x4, 7x4, 6x4, 8x3",
    )


class CutListResult(BaseModel):
    """Complete cut list result returned to the caller."""

    id: str
    project_id: str
    room_id: str
    panels: list[CutListPanel]
    total_panels: int
    total_area_mm2: float
    sheets_required: int
    waste_percentage: float
    edge_banding_total_mm: float
    status: str = "completed"
