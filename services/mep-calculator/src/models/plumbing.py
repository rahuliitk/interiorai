"""
Plumbing calculation models.

Request/response schemas for fixture unit calculations, pipe sizing,
and drainage slope calculations per IPC (International Plumbing Code).
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class FixtureType(str, Enum):
    """Standard plumbing fixture types."""

    TOILET = "toilet"
    LAVATORY = "lavatory"
    BATHTUB = "bathtub"
    SHOWER = "shower"
    KITCHEN_SINK = "kitchen_sink"
    DISHWASHER = "dishwasher"
    WASHING_MACHINE = "washing_machine"
    FLOOR_DRAIN = "floor_drain"
    BIDET = "bidet"
    UTILITY_SINK = "utility_sink"
    WATER_HEATER = "water_heater"


class FixtureUnit(BaseModel):
    """A plumbing fixture with its fixture unit value."""

    fixture_type: FixtureType
    name: str
    quantity: Annotated[int, Field(gt=0)] = 1
    fixture_units: float = Field(
        description="Fixture unit value per IPC Table 604.4"
    )
    drainage_fixture_units: float = Field(
        description="Drainage fixture unit value per IPC Table 709.1"
    )
    min_trap_size_inches: float = Field(
        description="Minimum trap size in inches per IPC Table 709.1"
    )
    min_drain_size_inches: float = Field(
        description="Minimum drain pipe size in inches"
    )
    standard_reference: str = Field(
        default="Per IPC Table 604.4 / Table 709.1"
    )


class PipeSpec(BaseModel):
    """Pipe specification for a plumbing run."""

    pipe_type: str = Field(description="Supply or drainage")
    nominal_size_inches: float = Field(description="Nominal pipe diameter in inches")
    material: str = Field(default="CPVC", description="Pipe material (CPVC, PVC, copper)")
    total_fixture_units: float
    flow_rate_gpm: float | None = Field(
        default=None,
        description="Design flow rate in gallons per minute",
    )
    standard_reference: str = Field(default="Per IPC Table 604.4")


class DrainageCalc(BaseModel):
    """Drainage calculation result."""

    pipe_size_inches: float
    slope_inches_per_foot: float = Field(
        description="Required drainage slope (minimum 1/4 inch per foot per IPC 704.1)"
    )
    total_drainage_fixture_units: float
    pipe_material: str = Field(default="PVC")
    vent_size_inches: float = Field(
        description="Required vent pipe size"
    )
    standard_reference: str = Field(
        default="Per IPC 704.1 (slope), IPC Table 710.1 (pipe sizing)"
    )


class PipeRun(BaseModel):
    """A pipe run with length for pressure drop calculation."""

    from_fixture: str
    to_point: str
    length_feet: Annotated[float, Field(gt=0)]
    fittings_count: int = Field(default=0, description="Number of fittings (elbows, tees)")


class PlumbingRequest(BaseModel):
    """Request body for plumbing calculation."""

    project_id: str
    room_id: str
    fixtures: list[dict[str, int]] = Field(
        description="Dict of fixture_type -> quantity (e.g. {'toilet': 1, 'lavatory': 2})"
    )
    pipe_runs: list[PipeRun] = Field(default_factory=list)
    hot_water_required: bool = True


class PlumbingResult(BaseModel):
    """Complete plumbing calculation result."""

    project_id: str
    room_id: str
    fixture_units: list[FixtureUnit]
    total_supply_fixture_units: float
    total_drainage_fixture_units: float
    supply_pipe: PipeSpec
    drainage: DrainageCalc
    hot_water_pipe: PipeSpec | None = None
    cold_water_pipe: PipeSpec | None = None
    notes: list[str] = Field(default_factory=list)
    standard_references: list[str] = Field(
        default_factory=lambda: [
            "IPC Table 604.4 — Fixture unit values",
            "IPC Table 709.1 — Drainage fixture units and trap sizes",
            "IPC Table 710.1 — Drainage pipe sizing",
            "IPC 704.1 — Drainage slope requirements",
        ]
    )
