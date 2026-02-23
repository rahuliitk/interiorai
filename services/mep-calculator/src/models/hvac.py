"""
HVAC calculation models.

Request/response schemas for cooling/heating load calculations,
equipment sizing, and duct sizing per ASHRAE Manual J (simplified).
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class Orientation(str, Enum):
    """Room orientation relative to the sun."""

    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"
    NORTHEAST = "northeast"
    NORTHWEST = "northwest"
    SOUTHEAST = "southeast"
    SOUTHWEST = "southwest"


class InsulationLevel(str, Enum):
    """Insulation quality of the building envelope."""

    POOR = "poor"
    AVERAGE = "average"
    GOOD = "good"
    EXCELLENT = "excellent"


class ClimateZone(str, Enum):
    """ASHRAE climate zones (simplified)."""

    HOT_HUMID = "hot_humid"
    HOT_DRY = "hot_dry"
    MIXED = "mixed"
    COLD = "cold"
    VERY_COLD = "very_cold"
    TROPICAL = "tropical"


class CoolingLoad(BaseModel):
    """Cooling load calculation result."""

    sensible_load_btu: float = Field(
        description="Sensible cooling load in BTU/hr (per ASHRAE Manual J)"
    )
    latent_load_btu: float = Field(
        description="Latent cooling load in BTU/hr"
    )
    total_load_btu: float = Field(
        description="Total cooling load (sensible + latent) in BTU/hr"
    )
    load_tons: float = Field(
        description="Total cooling load in refrigeration tons (1 ton = 12,000 BTU/hr)"
    )
    breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Load breakdown by component (walls, windows, occupants, etc.)",
    )
    standard_reference: str = Field(
        default="Per ASHRAE Manual J (simplified residential load calculation)"
    )


class HeatingLoad(BaseModel):
    """Heating load calculation result."""

    total_load_btu: float = Field(
        description="Total heating load in BTU/hr"
    )
    breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Load breakdown by component",
    )
    standard_reference: str = Field(
        default="Per ASHRAE Manual J (simplified heating load calculation)"
    )


class DuctSize(BaseModel):
    """Duct sizing result."""

    supply_cfm: float = Field(
        description="Required supply airflow in CFM"
    )
    duct_width_inches: float = Field(
        description="Rectangular duct width in inches"
    )
    duct_height_inches: float = Field(
        description="Rectangular duct height in inches"
    )
    round_duct_diameter_inches: float = Field(
        description="Equivalent round duct diameter in inches"
    )
    velocity_fpm: float = Field(
        description="Air velocity in feet per minute"
    )
    standard_reference: str = Field(
        default="Per ASHRAE Fundamentals, Chapter 21 (duct design)"
    )


class EquipmentSpec(BaseModel):
    """Recommended equipment specification."""

    equipment_type: str = Field(description="e.g. 'Split AC', 'Window AC', 'Central ducted'")
    capacity_btu: float
    capacity_tons: float
    energy_rating: str = Field(default="BEE 3-star minimum recommended")
    notes: str | None = None


class HVACRequest(BaseModel):
    """Request body for HVAC calculation."""

    project_id: str
    room_id: str
    room_length_mm: Annotated[float, Field(gt=0)]
    room_width_mm: Annotated[float, Field(gt=0)]
    room_height_mm: Annotated[float, Field(gt=0)]
    orientation: Orientation = Orientation.SOUTH
    insulation: InsulationLevel = InsulationLevel.AVERAGE
    climate_zone: ClimateZone = ClimateZone.HOT_HUMID
    occupancy: Annotated[int, Field(gt=0)] = 2
    window_area_sqft: float = Field(default=20.0, ge=0)
    num_external_walls: Annotated[int, Field(ge=0, le=4)] = 2
    equipment_heat_watts: float = Field(
        default=500.0,
        ge=0,
        description="Heat from computers, appliances, etc.",
    )
    lighting_watts: float = Field(default=200.0, ge=0)


class HVACResult(BaseModel):
    """Complete HVAC calculation result."""

    project_id: str
    room_id: str
    cooling_load: CoolingLoad
    heating_load: HeatingLoad
    duct_sizing: DuctSize
    recommended_equipment: list[EquipmentSpec]
    notes: list[str] = Field(default_factory=list)
    standard_references: list[str] = Field(
        default_factory=lambda: [
            "ASHRAE Manual J — Residential load calculation",
            "ASHRAE Fundamentals, Chapter 18 — Nonresidential cooling/heating load",
            "ASHRAE Fundamentals, Chapter 21 — Duct design",
        ]
    )
