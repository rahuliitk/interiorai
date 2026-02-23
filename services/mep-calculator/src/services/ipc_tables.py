"""
IPC (International Plumbing Code) lookup tables and calculation helpers.

All values reference specific IPC tables and sections.  This module
provides fixture unit values, pipe sizing, drainage calculations,
and vent sizing.
"""

from __future__ import annotations

import math

import structlog

from src.models.plumbing import DrainageCalc, FixtureType, FixtureUnit, PipeSpec

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# IPC Table 604.4 — Water supply fixture unit values
# ---------------------------------------------------------------------------
SUPPLY_FIXTURE_UNITS: dict[str, float] = {
    "toilet": 4.0,
    "lavatory": 1.0,
    "bathtub": 2.0,
    "shower": 2.0,
    "kitchen_sink": 2.0,
    "dishwasher": 2.0,
    "washing_machine": 3.0,
    "floor_drain": 0.0,  # No supply connection
    "bidet": 1.0,
    "utility_sink": 2.0,
    "water_heater": 0.0,  # Sized separately
}

# ---------------------------------------------------------------------------
# IPC Table 709.1 — Drainage fixture unit values and trap/drain sizes
# ---------------------------------------------------------------------------
DRAINAGE_FIXTURE_UNITS: dict[str, dict[str, float]] = {
    "toilet": {"dfu": 4.0, "trap_inches": 3.0, "drain_inches": 3.0},
    "lavatory": {"dfu": 1.0, "trap_inches": 1.25, "drain_inches": 1.25},
    "bathtub": {"dfu": 2.0, "trap_inches": 1.5, "drain_inches": 1.5},
    "shower": {"dfu": 2.0, "trap_inches": 2.0, "drain_inches": 2.0},
    "kitchen_sink": {"dfu": 2.0, "trap_inches": 1.5, "drain_inches": 1.5},
    "dishwasher": {"dfu": 2.0, "trap_inches": 1.5, "drain_inches": 1.5},
    "washing_machine": {"dfu": 3.0, "trap_inches": 2.0, "drain_inches": 2.0},
    "floor_drain": {"dfu": 1.0, "trap_inches": 2.0, "drain_inches": 2.0},
    "bidet": {"dfu": 1.0, "trap_inches": 1.25, "drain_inches": 1.25},
    "utility_sink": {"dfu": 2.0, "trap_inches": 1.5, "drain_inches": 1.5},
    "water_heater": {"dfu": 0.0, "trap_inches": 0.0, "drain_inches": 0.75},
}

# ---------------------------------------------------------------------------
# IPC Table 710.1(2) — Horizontal fixture branches and stacks (building drain)
# Maximum DFU per pipe size
# ---------------------------------------------------------------------------
DRAIN_PIPE_SIZING: list[tuple[float, float]] = [
    # (pipe_size_inches, max_drainage_fixture_units)
    (1.25, 1.0),
    (1.5, 3.0),
    (2.0, 6.0),
    (2.5, 12.0),
    (3.0, 20.0),
    (4.0, 160.0),
    (5.0, 360.0),
    (6.0, 620.0),
]

# ---------------------------------------------------------------------------
# Supply pipe sizing by total fixture units
# Based on IPC Table 604.4 and AWWA guidelines
# ---------------------------------------------------------------------------
SUPPLY_PIPE_SIZING: list[tuple[float, float]] = [
    # (pipe_size_inches, max_fixture_units)
    (0.5, 2.0),
    (0.75, 6.0),
    (1.0, 18.0),
    (1.25, 36.0),
    (1.5, 72.0),
    (2.0, 150.0),
    (2.5, 300.0),
    (3.0, 500.0),
]

# ---------------------------------------------------------------------------
# Vent pipe sizing (simplified, per IPC Table 916.1)
# ---------------------------------------------------------------------------
VENT_PIPE_SIZING: list[tuple[float, float]] = [
    # (vent_size_inches, max_drainage_fixture_units)
    (1.25, 2.0),
    (1.5, 8.0),
    (2.0, 24.0),
    (2.5, 48.0),
    (3.0, 84.0),
    (4.0, 256.0),
]


def get_fixture_unit(fixture_type: str, quantity: int = 1) -> FixtureUnit:
    """Look up fixture unit values for a given fixture type.

    Per IPC Table 604.4 (supply) and IPC Table 709.1 (drainage).

    Parameters
    ----------
    fixture_type:
        The fixture type key (e.g. 'toilet', 'lavatory').
    quantity:
        Number of this fixture type.

    Returns
    -------
    FixtureUnit
        Complete fixture unit data including supply and drainage values.
    """
    supply_fu = SUPPLY_FIXTURE_UNITS.get(fixture_type, 1.0)
    drainage = DRAINAGE_FIXTURE_UNITS.get(fixture_type, {
        "dfu": 1.0, "trap_inches": 1.5, "drain_inches": 1.5
    })

    return FixtureUnit(
        fixture_type=FixtureType(fixture_type),
        name=fixture_type.replace("_", " ").title(),
        quantity=quantity,
        fixture_units=supply_fu * quantity,
        drainage_fixture_units=drainage["dfu"] * quantity,
        min_trap_size_inches=drainage["trap_inches"],
        min_drain_size_inches=drainage["drain_inches"],
        standard_reference=(
            f"Per IPC Table 604.4: {fixture_type} = {supply_fu} FU (supply), "
            f"Per IPC Table 709.1: {drainage['dfu']} DFU (drainage)"
        ),
    )


def size_supply_pipe(total_fixture_units: float, pipe_material: str = "CPVC") -> PipeSpec:
    """Determine supply pipe size based on total fixture units.

    Per IPC Table 604.4 sizing methodology.

    Parameters
    ----------
    total_fixture_units:
        Sum of all fixture unit values.
    pipe_material:
        Pipe material (CPVC, copper, PEX).

    Returns
    -------
    PipeSpec
        The required supply pipe specification.
    """
    selected_size = 0.5
    for size, max_fu in SUPPLY_PIPE_SIZING:
        if max_fu >= total_fixture_units:
            selected_size = size
            break
    else:
        selected_size = SUPPLY_PIPE_SIZING[-1][0]

    return PipeSpec(
        pipe_type="supply",
        nominal_size_inches=selected_size,
        material=pipe_material,
        total_fixture_units=total_fixture_units,
        standard_reference=(
            f"Per IPC Table 604.4: {total_fixture_units} FU requires "
            f"{selected_size}\" {pipe_material} supply pipe"
        ),
    )


def size_drainage_pipe(total_dfu: float, pipe_material: str = "PVC") -> float:
    """Determine drainage pipe size based on total drainage fixture units.

    Per IPC Table 710.1(2).

    Parameters
    ----------
    total_dfu:
        Sum of all drainage fixture unit values.
    pipe_material:
        Pipe material (PVC, cast iron, ABS).

    Returns
    -------
    float
        Required drainage pipe size in inches.
    """
    for size, max_dfu in DRAIN_PIPE_SIZING:
        if max_dfu >= total_dfu:
            return size

    return DRAIN_PIPE_SIZING[-1][0]


def size_vent_pipe(total_dfu: float) -> float:
    """Determine vent pipe size based on total drainage fixture units.

    Per IPC Table 916.1.

    Parameters
    ----------
    total_dfu:
        Sum of all drainage fixture unit values.

    Returns
    -------
    float
        Required vent pipe size in inches.
    """
    for size, max_dfu in VENT_PIPE_SIZING:
        if max_dfu >= total_dfu:
            return size

    return VENT_PIPE_SIZING[-1][0]


def calculate_drainage(
    total_dfu: float,
    pipe_material: str = "PVC",
) -> DrainageCalc:
    """Calculate complete drainage specification.

    Per IPC 704.1: minimum slope for horizontal drainage is 1/4 inch per foot
    for pipes 3 inches and smaller, 1/8 inch per foot for pipes 4 inches
    and larger.

    Parameters
    ----------
    total_dfu:
        Sum of all drainage fixture unit values.
    pipe_material:
        Pipe material.

    Returns
    -------
    DrainageCalc
        Complete drainage calculation with pipe size, slope, and vent.
    """
    drain_size = size_drainage_pipe(total_dfu, pipe_material)
    vent_size = size_vent_pipe(total_dfu)

    # Per IPC 704.1: slope requirements
    if drain_size <= 3.0:
        slope = 0.25  # 1/4 inch per foot
    else:
        slope = 0.125  # 1/8 inch per foot

    return DrainageCalc(
        pipe_size_inches=drain_size,
        slope_inches_per_foot=slope,
        total_drainage_fixture_units=total_dfu,
        pipe_material=pipe_material,
        vent_size_inches=vent_size,
        standard_reference=(
            f"Per IPC Table 710.1(2): {total_dfu} DFU requires {drain_size}\" drain; "
            f"Per IPC 704.1: {slope}\" per foot slope; "
            f"Per IPC Table 916.1: {vent_size}\" vent pipe"
        ),
    )
