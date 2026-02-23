"""
ASHRAE Manual J simplified load calculation methods.

Provides cooling and heating load calculations for residential and
light commercial interior spaces.  All calculations reference ASHRAE
Manual J methodology with simplified assumptions.
"""

from __future__ import annotations

import math

import structlog

from src.models.hvac import (
    ClimateZone,
    CoolingLoad,
    DuctSize,
    EquipmentSpec,
    HeatingLoad,
    InsulationLevel,
    Orientation,
)

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# ASHRAE Manual J — Load factors and assumptions
# ---------------------------------------------------------------------------

# BTU per square foot per hour — base cooling load by climate zone
# (Simplified from ASHRAE Manual J Table 1)
BASE_COOLING_LOAD_BTU_SQFT: dict[str, float] = {
    "hot_humid": 30.0,
    "hot_dry": 28.0,
    "mixed": 22.0,
    "cold": 18.0,
    "very_cold": 15.0,
    "tropical": 35.0,
}

# Base heating load BTU per square foot per hour by climate zone
BASE_HEATING_LOAD_BTU_SQFT: dict[str, float] = {
    "hot_humid": 8.0,
    "hot_dry": 12.0,
    "mixed": 20.0,
    "cold": 30.0,
    "very_cold": 40.0,
    "tropical": 5.0,
}

# Insulation adjustment factors (multiplied against base load)
INSULATION_FACTOR: dict[str, float] = {
    "poor": 1.30,
    "average": 1.00,
    "good": 0.80,
    "excellent": 0.65,
}

# Orientation solar gain factors (additional BTU/sqft for exposed walls)
ORIENTATION_SOLAR_FACTOR: dict[str, float] = {
    "north": 0.0,
    "south": 3.0,
    "east": 4.0,
    "west": 5.0,
    "northeast": 2.0,
    "northwest": 2.5,
    "southeast": 3.5,
    "southwest": 4.5,
}

# Heat gain per occupant (BTU/hr) — sensible + latent
# Per ASHRAE Fundamentals, Chapter 18, Table 1
OCCUPANT_SENSIBLE_BTU = 230.0
OCCUPANT_LATENT_BTU = 190.0

# Window solar heat gain (BTU/hr per sqft of window area)
# Simplified from ASHRAE Manual J, varies by orientation
WINDOW_SOLAR_GAIN_BTU_SQFT: dict[str, float] = {
    "north": 20.0,
    "south": 40.0,
    "east": 55.0,
    "west": 60.0,
    "northeast": 30.0,
    "northwest": 35.0,
    "southeast": 45.0,
    "southwest": 55.0,
}

# Watts to BTU/hr conversion
WATTS_TO_BTU = 3.412

# CFM per ton of cooling
CFM_PER_TON = 400.0

# Maximum duct velocity for residential (FPM)
MAX_DUCT_VELOCITY_FPM = 900.0

# Standard duct aspect ratio
DUCT_ASPECT_RATIO = 1.5


def calculate_cooling_load(
    room_area_sqft: float,
    orientation: str = "south",
    insulation: str = "average",
    climate_zone: str = "hot_humid",
    occupancy: int = 2,
    window_area_sqft: float = 20.0,
    num_external_walls: int = 2,
    equipment_heat_watts: float = 500.0,
    lighting_watts: float = 200.0,
) -> CoolingLoad:
    """Calculate cooling load using simplified ASHRAE Manual J method.

    The total cooling load is the sum of:
    1. Envelope load (walls, roof, floor)
    2. Window solar gain
    3. Occupant heat gain (sensible + latent)
    4. Equipment heat gain
    5. Lighting heat gain
    6. Ventilation/infiltration load

    Parameters
    ----------
    room_area_sqft:
        Room floor area in square feet.
    orientation:
        Primary wall orientation.
    insulation:
        Insulation quality level.
    climate_zone:
        ASHRAE climate zone.
    occupancy:
        Number of occupants.
    window_area_sqft:
        Total window area in square feet.
    num_external_walls:
        Number of walls exposed to outside.
    equipment_heat_watts:
        Internal equipment heat generation in watts.
    lighting_watts:
        Lighting power in watts.

    Returns
    -------
    CoolingLoad
        Complete cooling load calculation with breakdown.
    """
    breakdown: dict[str, float] = {}

    # 1. Envelope load
    base_load = BASE_COOLING_LOAD_BTU_SQFT.get(climate_zone, 25.0)
    insulation_mult = INSULATION_FACTOR.get(insulation, 1.0)
    wall_factor = num_external_walls / 4.0  # Scale by exposure
    envelope_load = room_area_sqft * base_load * insulation_mult * max(wall_factor, 0.5)
    breakdown["envelope_btu"] = round(envelope_load, 0)

    # 2. Solar orientation adjustment
    solar_factor = ORIENTATION_SOLAR_FACTOR.get(orientation, 3.0)
    orientation_load = room_area_sqft * solar_factor * wall_factor
    breakdown["solar_orientation_btu"] = round(orientation_load, 0)

    # 3. Window solar gain
    window_solar = WINDOW_SOLAR_GAIN_BTU_SQFT.get(orientation, 40.0)
    window_load = window_area_sqft * window_solar
    breakdown["window_solar_btu"] = round(window_load, 0)

    # 4. Occupant heat gain
    occupant_sensible = occupancy * OCCUPANT_SENSIBLE_BTU
    occupant_latent = occupancy * OCCUPANT_LATENT_BTU
    breakdown["occupant_sensible_btu"] = round(occupant_sensible, 0)
    breakdown["occupant_latent_btu"] = round(occupant_latent, 0)

    # 5. Equipment heat gain
    equipment_btu = equipment_heat_watts * WATTS_TO_BTU
    breakdown["equipment_btu"] = round(equipment_btu, 0)

    # 6. Lighting heat gain
    lighting_btu = lighting_watts * WATTS_TO_BTU
    breakdown["lighting_btu"] = round(lighting_btu, 0)

    # 7. Ventilation/infiltration (estimate 15% of sensible load)
    sensible_subtotal = (
        envelope_load + orientation_load + window_load
        + occupant_sensible + equipment_btu + lighting_btu
    )
    ventilation_load = sensible_subtotal * 0.15
    breakdown["ventilation_infiltration_btu"] = round(ventilation_load, 0)

    # Totals
    total_sensible = sensible_subtotal + ventilation_load
    total_latent = occupant_latent + (ventilation_load * 0.3)  # Latent from ventilation
    total = total_sensible + total_latent
    tons = total / 12000.0

    logger.info(
        "cooling_load_calculated",
        room_area_sqft=room_area_sqft,
        total_btu=round(total, 0),
        tons=round(tons, 2),
        climate_zone=climate_zone,
    )

    return CoolingLoad(
        sensible_load_btu=round(total_sensible, 0),
        latent_load_btu=round(total_latent, 0),
        total_load_btu=round(total, 0),
        load_tons=round(tons, 2),
        breakdown=breakdown,
        standard_reference=(
            f"Per ASHRAE Manual J (simplified): "
            f"Base {base_load} BTU/sqft for {climate_zone} zone, "
            f"insulation factor {insulation_mult}, "
            f"{occupancy} occupants at {OCCUPANT_SENSIBLE_BTU}+{OCCUPANT_LATENT_BTU} BTU/hr each"
        ),
    )


def calculate_heating_load(
    room_area_sqft: float,
    insulation: str = "average",
    climate_zone: str = "hot_humid",
    num_external_walls: int = 2,
    window_area_sqft: float = 20.0,
) -> HeatingLoad:
    """Calculate heating load using simplified ASHRAE Manual J method.

    Heating load considers:
    1. Envelope heat loss (walls, roof, floor)
    2. Window heat loss
    3. Infiltration heat loss

    Parameters
    ----------
    room_area_sqft:
        Room floor area in square feet.
    insulation:
        Insulation quality level.
    climate_zone:
        ASHRAE climate zone.
    num_external_walls:
        Number of walls exposed to outside.
    window_area_sqft:
        Total window area in square feet.

    Returns
    -------
    HeatingLoad
        Complete heating load calculation.
    """
    breakdown: dict[str, float] = {}

    base_load = BASE_HEATING_LOAD_BTU_SQFT.get(climate_zone, 20.0)
    insulation_mult = INSULATION_FACTOR.get(insulation, 1.0)
    wall_factor = num_external_walls / 4.0

    # Envelope heat loss
    envelope_loss = room_area_sqft * base_load * insulation_mult * max(wall_factor, 0.5)
    breakdown["envelope_btu"] = round(envelope_loss, 0)

    # Window heat loss (U-value based, simplified)
    # Average double-pane window: ~25 BTU/hr/sqft heat loss in cold climates
    window_loss_factor = 25.0 if climate_zone in ("cold", "very_cold") else 15.0
    window_loss = window_area_sqft * window_loss_factor * insulation_mult
    breakdown["window_btu"] = round(window_loss, 0)

    # Infiltration (10% of envelope)
    infiltration = envelope_loss * 0.10
    breakdown["infiltration_btu"] = round(infiltration, 0)

    total = envelope_loss + window_loss + infiltration

    return HeatingLoad(
        total_load_btu=round(total, 0),
        breakdown=breakdown,
        standard_reference=(
            f"Per ASHRAE Manual J (simplified): "
            f"Base {base_load} BTU/sqft for {climate_zone} zone, "
            f"insulation factor {insulation_mult}"
        ),
    )


def calculate_duct_sizing(cooling_load_btu: float) -> DuctSize:
    """Calculate duct sizing based on cooling load.

    Per ASHRAE Fundamentals, Chapter 21:
    - CFM = cooling load (BTU/hr) / 12000 * 400 CFM/ton
    - Duct area = CFM / velocity
    - Standard residential velocity: 600-900 FPM

    Parameters
    ----------
    cooling_load_btu:
        Total cooling load in BTU/hr.

    Returns
    -------
    DuctSize
        Duct dimensions and airflow specifications.
    """
    tons = cooling_load_btu / 12000.0
    supply_cfm = tons * CFM_PER_TON

    # Target velocity (keep below residential maximum)
    target_velocity = min(MAX_DUCT_VELOCITY_FPM, max(600.0, supply_cfm * 2))

    # Required duct cross-sectional area in square inches
    duct_area_sqft = supply_cfm / target_velocity
    duct_area_sqin = duct_area_sqft * 144.0

    # Round duct diameter
    round_diameter = math.sqrt(4 * duct_area_sqin / math.pi)

    # Rectangular duct (aspect ratio ~1.5:1)
    duct_height = math.sqrt(duct_area_sqin / DUCT_ASPECT_RATIO)
    duct_width = duct_height * DUCT_ASPECT_RATIO

    # Round to nearest standard size
    round_diameter = math.ceil(round_diameter)
    duct_width = math.ceil(duct_width)
    duct_height = math.ceil(duct_height)

    return DuctSize(
        supply_cfm=round(supply_cfm, 0),
        duct_width_inches=float(duct_width),
        duct_height_inches=float(duct_height),
        round_duct_diameter_inches=float(round_diameter),
        velocity_fpm=round(target_velocity, 0),
        standard_reference=(
            f"Per ASHRAE Fundamentals Ch.21: "
            f"{round(tons, 2)} tons at {CFM_PER_TON} CFM/ton = {round(supply_cfm, 0)} CFM, "
            f"velocity {round(target_velocity, 0)} FPM"
        ),
    )


def recommend_equipment(
    cooling_load_btu: float,
    heating_load_btu: float,
) -> list[EquipmentSpec]:
    """Recommend HVAC equipment based on calculated loads.

    Equipment is sized with a 10% safety margin rounded up to the
    nearest standard size (0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0 tons).

    Parameters
    ----------
    cooling_load_btu:
        Total cooling load in BTU/hr.
    heating_load_btu:
        Total heating load in BTU/hr.

    Returns
    -------
    list[EquipmentSpec]
        Recommended equipment options.
    """
    raw_tons = cooling_load_btu / 12000.0
    # Add 10% safety margin
    required_tons = raw_tons * 1.10

    # Standard equipment sizes in tons
    standard_sizes = [0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]
    selected_tons = 0.75
    for size in standard_sizes:
        if size >= required_tons:
            selected_tons = size
            break
    else:
        selected_tons = standard_sizes[-1]

    selected_btu = selected_tons * 12000.0

    recommendations: list[EquipmentSpec] = []

    # Split AC option
    recommendations.append(
        EquipmentSpec(
            equipment_type="Split AC (inverter)",
            capacity_btu=selected_btu,
            capacity_tons=selected_tons,
            energy_rating="BEE 3-star minimum recommended, 5-star preferred",
            notes=(
                f"Sized at {selected_tons} tons for {round(raw_tons, 2)} ton calculated load "
                f"(10% safety margin). Inverter type recommended for energy efficiency."
            ),
        )
    )

    # If load is small enough, window AC option
    if selected_tons <= 2.0:
        recommendations.append(
            EquipmentSpec(
                equipment_type="Window AC",
                capacity_btu=selected_btu,
                capacity_tons=selected_tons,
                energy_rating="BEE 3-star minimum",
                notes="Window AC suitable for smaller rooms. Less efficient than split systems.",
            )
        )

    # If load is large, suggest ducted option
    if selected_tons >= 2.5:
        recommendations.append(
            EquipmentSpec(
                equipment_type="Central ducted system",
                capacity_btu=selected_btu,
                capacity_tons=selected_tons,
                energy_rating="BEE 3-star minimum, SEER 16+ recommended",
                notes=(
                    "Central ducted system recommended for larger spaces. "
                    "Requires ductwork installation."
                ),
            )
        )

    return recommendations
