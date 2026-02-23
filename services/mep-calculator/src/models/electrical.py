"""
Electrical calculation models.

Request/response schemas for electrical load calculations, circuit
scheduling, wire gauge selection, and panel board layout.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class CircuitType(str, Enum):
    """Standard residential circuit types."""

    LIGHTING = "lighting"
    GENERAL_POWER = "general_power"
    DEDICATED = "dedicated"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    HVAC = "hvac"


class Appliance(BaseModel):
    """An electrical appliance or load point."""

    name: str
    wattage: Annotated[float, Field(gt=0, description="Power consumption in watts")]
    voltage: float = Field(default=240.0, description="Operating voltage")
    quantity: Annotated[int, Field(gt=0)] = 1
    circuit_type: CircuitType = CircuitType.GENERAL_POWER
    is_continuous: bool = Field(
        default=False,
        description="True if the load runs continuously (>3 hours)",
    )
    dedicated_circuit: bool = Field(
        default=False,
        description="True if this appliance requires a dedicated circuit",
    )


class LightingPoint(BaseModel):
    """A lighting fixture in the plan."""

    name: str
    wattage: Annotated[float, Field(gt=0)]
    quantity: Annotated[int, Field(gt=0)] = 1
    circuit_group: str = "main_lighting"


class WireSpec(BaseModel):
    """Wire specification for a circuit."""

    gauge_awg: str = Field(description="Wire gauge (e.g. '14AWG', '12AWG')")
    ampacity: float = Field(description="Maximum current capacity in amps (per NEC 310.16)")
    material: str = Field(default="copper", description="Conductor material")
    insulation: str = Field(default="THHN", description="Insulation type")
    standard_reference: str = Field(
        default="Per NEC 310.16",
        description="Code reference for this selection",
    )


class ConduitSpec(BaseModel):
    """Conduit specification."""

    size_inches: float = Field(description="Conduit nominal size in inches")
    type: str = Field(default="EMT", description="Conduit type (EMT, PVC, rigid)")
    fill_percentage: float = Field(
        description="Calculated fill percentage (per NEC Chapter 9, Table 1)"
    )
    max_fill_percentage: float = Field(
        default=40.0,
        description="Maximum allowed fill for 3+ conductors (per NEC Chapter 9, Table 1)",
    )
    wire_count: int
    standard_reference: str = Field(default="Per NEC Chapter 9, Table 1")


class CircuitSchedule(BaseModel):
    """A single circuit in the panel schedule."""

    circuit_number: int
    name: str
    circuit_type: CircuitType
    breaker_amps: int = Field(description="Breaker rating in amps")
    wire_spec: WireSpec
    conduit_spec: ConduitSpec
    connected_load_watts: float
    demand_load_watts: float = Field(
        description="Load after applying demand factors (per NEC 220)"
    )
    loads: list[str] = Field(description="Appliances/fixtures on this circuit")
    standard_reference: str = Field(default="Per NEC Article 220")


class PanelSchedule(BaseModel):
    """Complete electrical panel schedule."""

    panel_name: str = Field(default="Main Distribution Board")
    main_breaker_amps: int
    bus_voltage: float = Field(default=240.0)
    phases: int = Field(default=1)
    circuits: list[CircuitSchedule]
    total_connected_load_watts: float
    total_demand_load_watts: float
    spare_circuits: int = Field(
        default=2,
        description="Number of spare circuit positions (per NEC 408.30)",
    )
    standard_reference: str = Field(
        default="Panel schedule per NEC Article 408"
    )


class ElectricalRequest(BaseModel):
    """Request body for electrical load calculation."""

    project_id: str
    room_id: str
    room_length_mm: Annotated[float, Field(gt=0)]
    room_width_mm: Annotated[float, Field(gt=0)]
    appliances: list[Appliance] = Field(default_factory=list)
    lighting: list[LightingPoint] = Field(default_factory=list)
    voltage: float = Field(default=240.0)


class ElectricalResult(BaseModel):
    """Complete electrical calculation result."""

    project_id: str
    room_id: str
    panel_schedule: PanelSchedule
    total_connected_load_watts: float
    total_demand_load_watts: float
    total_current_amps: float
    recommended_main_breaker_amps: int
    notes: list[str] = Field(default_factory=list)
    standard_references: list[str] = Field(
        default_factory=lambda: [
            "NEC 310.16 — Conductor ampacity",
            "NEC Article 220 — Branch circuit and feeder calculations",
            "NEC Article 408 — Switchboards and panelboards",
            "NEC Chapter 9, Table 1 — Conduit fill",
        ]
    )
