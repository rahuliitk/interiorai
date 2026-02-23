"""
NEC (National Electrical Code) lookup tables and calculation helpers.

All values reference specific NEC articles and tables.  This module
provides deterministic lookup functions for wire ampacity, breaker
sizing, and conduit fill calculations.
"""

from __future__ import annotations

import math

import structlog

from src.models.electrical import ConduitSpec, WireSpec

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# NEC 310.16 — Allowable ampacities of insulated conductors
# Copper conductors, THHN/THWN insulation, 75 deg C column
# ---------------------------------------------------------------------------
WIRE_AMPACITY: dict[str, float] = {
    "14AWG": 15.0,
    "12AWG": 20.0,
    "10AWG": 30.0,
    "8AWG": 40.0,
    "6AWG": 55.0,
    "4AWG": 70.0,
    "3AWG": 85.0,
    "2AWG": 95.0,
    "1AWG": 110.0,
    "1/0AWG": 125.0,
    "2/0AWG": 145.0,
    "3/0AWG": 165.0,
    "4/0AWG": 195.0,
}

# Wire cross-sectional area in square inches (for conduit fill)
WIRE_AREA_SQIN: dict[str, float] = {
    "14AWG": 0.0097,
    "12AWG": 0.0133,
    "10AWG": 0.0211,
    "8AWG": 0.0366,
    "6AWG": 0.0507,
    "4AWG": 0.0824,
    "3AWG": 0.0973,
    "2AWG": 0.1158,
    "1AWG": 0.1562,
    "1/0AWG": 0.1855,
    "2/0AWG": 0.2223,
    "3/0AWG": 0.2679,
    "4/0AWG": 0.3237,
}

# Standard breaker sizes (amps) per NEC 240.6(A)
STANDARD_BREAKER_SIZES = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 125, 150, 200]

# Conduit internal area in square inches per NEC Chapter 9, Table 4
CONDUIT_AREA_SQIN: dict[float, float] = {
    0.5: 0.122,
    0.75: 0.213,
    1.0: 0.346,
    1.25: 0.598,
    1.5: 0.814,
    2.0: 1.342,
    2.5: 2.054,
    3.0: 3.000,
    3.5: 4.090,
    4.0: 5.452,
}

# Maximum conduit fill percentages per NEC Chapter 9, Table 1
CONDUIT_FILL_LIMITS: dict[int, float] = {
    1: 53.0,   # 1 conductor: 53%
    2: 31.0,   # 2 conductors: 31%
    3: 40.0,   # 3 or more conductors: 40%
}


def select_wire_gauge(
    amperage: float,
    material: str = "copper",
) -> WireSpec:
    """Select the appropriate wire gauge for a given amperage.

    Per NEC 310.16, the conductor ampacity must be equal to or greater
    than the circuit load.

    Parameters
    ----------
    amperage:
        Required circuit amperage.
    material:
        Conductor material (currently only copper is supported).

    Returns
    -------
    WireSpec
        The selected wire specification.
    """
    for gauge, capacity in WIRE_AMPACITY.items():
        if capacity >= amperage:
            return WireSpec(
                gauge_awg=gauge,
                ampacity=capacity,
                material=material,
                insulation="THHN",
                standard_reference=f"Per NEC 310.16: {gauge} copper THHN rated {capacity}A",
            )

    # If amperage exceeds table, use largest available
    largest = list(WIRE_AMPACITY.keys())[-1]
    return WireSpec(
        gauge_awg=largest,
        ampacity=WIRE_AMPACITY[largest],
        material=material,
        insulation="THHN",
        standard_reference=f"Per NEC 310.16: {largest} copper THHN (load exceeds standard table)",
    )


def select_breaker_size(amperage: float, continuous: bool = False) -> int:
    """Select the standard breaker size for a given load.

    Per NEC 210.20(A), continuous loads must not exceed 80% of the
    breaker rating.  Non-continuous loads must not exceed 100%.

    Parameters
    ----------
    amperage:
        Design load in amps.
    continuous:
        Whether the load is continuous (>3 hours).

    Returns
    -------
    int
        Standard breaker size in amps.
    """
    if continuous:
        # Per NEC 210.20(A): continuous load <= 80% of breaker rating
        required = amperage / 0.80
    else:
        required = amperage

    for size in STANDARD_BREAKER_SIZES:
        if size >= required:
            return size

    return STANDARD_BREAKER_SIZES[-1]


def calculate_conduit_size(
    wire_gauge: str,
    wire_count: int,
    conduit_type: str = "EMT",
) -> ConduitSpec:
    """Calculate the required conduit size for a bundle of wires.

    Per NEC Chapter 9, Table 1:
    - 1 wire: 53% fill
    - 2 wires: 31% fill
    - 3+ wires: 40% fill

    Parameters
    ----------
    wire_gauge:
        Wire gauge string (e.g. "12AWG").
    wire_count:
        Number of conductors in the conduit.
    conduit_type:
        Conduit type (EMT, PVC, rigid).

    Returns
    -------
    ConduitSpec
        The required conduit specification.
    """
    wire_area = WIRE_AREA_SQIN.get(wire_gauge, 0.0133)  # Default to 12AWG
    total_wire_area = wire_area * wire_count

    # Determine fill limit
    if wire_count == 1:
        max_fill = CONDUIT_FILL_LIMITS[1]
    elif wire_count == 2:
        max_fill = CONDUIT_FILL_LIMITS[2]
    else:
        max_fill = CONDUIT_FILL_LIMITS[3]

    required_conduit_area = total_wire_area / (max_fill / 100.0)

    # Find smallest conduit that fits
    selected_size = 0.5
    for size, area in sorted(CONDUIT_AREA_SQIN.items()):
        if area >= required_conduit_area:
            selected_size = size
            break
    else:
        selected_size = max(CONDUIT_AREA_SQIN.keys())

    actual_fill = (
        (total_wire_area / CONDUIT_AREA_SQIN[selected_size]) * 100.0
        if CONDUIT_AREA_SQIN[selected_size] > 0
        else 0
    )

    return ConduitSpec(
        size_inches=selected_size,
        type=conduit_type,
        fill_percentage=round(actual_fill, 1),
        max_fill_percentage=max_fill,
        wire_count=wire_count,
        standard_reference=(
            f"Per NEC Chapter 9, Table 1: {wire_count} conductors, "
            f"max {max_fill}% fill in {selected_size}\" {conduit_type}"
        ),
    )


def calculate_demand_factor(
    connected_load_watts: float,
    circuit_type: str,
) -> float:
    """Apply NEC demand factors to connected load.

    Per NEC 220.42 (lighting) and NEC 220.53 (appliances):
    - Lighting: first 3000W at 100%, remainder at 35%
    - General appliances: first 10kW at 100%, remainder at 40%
    - Dedicated circuits: 100% (no demand factor)

    Parameters
    ----------
    connected_load_watts:
        Total connected load in watts.
    circuit_type:
        Type of circuit for demand factor selection.

    Returns
    -------
    float
        Demand load in watts after applying factors.
    """
    if circuit_type == "lighting":
        # Per NEC 220.42: lighting demand factors
        if connected_load_watts <= 3000:
            return connected_load_watts
        return 3000 + (connected_load_watts - 3000) * 0.35

    if circuit_type == "general_power":
        # Per NEC 220.53: appliance demand factors
        if connected_load_watts <= 10000:
            return connected_load_watts
        return 10000 + (connected_load_watts - 10000) * 0.40

    # Dedicated circuits: no demand reduction
    return connected_load_watts
