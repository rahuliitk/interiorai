"""
Material specifications database and waste factor constants.

Provides a reference database of common interior-design materials with their
default properties, waste factors, pricing tiers, and unit information.  This
data feeds into the BOM agent's quantity calculations and cost estimates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from openlintel_shared.schemas.bom import MaterialCategory
from openlintel_shared.schemas.design import BudgetTier


# -- Default waste factors --------------------------------------------------

DEFAULT_WASTE_FACTORS: dict[str, float] = {
    "tiles_straight": 0.05,
    "tiles_diagonal": 0.10,
    "tiles_herringbone": 0.12,
    "paint": 0.03,
    "plywood": 0.08,
    "edge_banding": 0.10,
    "wire": 0.15,
    "pipe": 0.10,
}

# Extended waste factors for additional material types
EXTENDED_WASTE_FACTORS: dict[str, float] = {
    **DEFAULT_WASTE_FACTORS,
    "laminate_flooring": 0.08,
    "vinyl_flooring": 0.05,
    "marble": 0.10,
    "granite": 0.10,
    "wallpaper": 0.08,
    "glass": 0.05,
    "gypsum_board": 0.07,
    "mdf": 0.08,
    "particle_board": 0.06,
    "cement": 0.02,
    "sand": 0.02,
    "putty": 0.03,
    "primer": 0.03,
    "pvc_conduit": 0.10,
    "copper_pipe": 0.08,
    "cpvc_pipe": 0.08,
    "switch_plate": 0.0,
    "light_fixture": 0.0,
    "hardware_fitting": 0.0,
    "adhesive": 0.05,
    "sealant": 0.05,
    "wood_polish": 0.05,
}


# -- Material specification -------------------------------------------------

@dataclass
class MaterialSpec:
    """Specification for a single material type."""

    name: str
    category: MaterialCategory
    unit: str
    waste_factor: float
    price_tiers: dict[str, float] = field(default_factory=dict)
    specifications: dict[str, Any] = field(default_factory=dict)
    substitutes: list[str] = field(default_factory=list)
    description: str = ""


# -- Material database (Indian market focus) --------------------------------

MATERIAL_DATABASE: dict[str, MaterialSpec] = {
    # -- Flooring --
    "vitrified_tiles_600x600": MaterialSpec(
        name="Vitrified Tiles 600x600mm",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["tiles_straight"],
        price_tiers={
            BudgetTier.ECONOMY: 35.0,
            BudgetTier.MID_RANGE: 65.0,
            BudgetTier.PREMIUM: 120.0,
            BudgetTier.LUXURY: 250.0,
        },
        specifications={"size_mm": "600x600", "thickness_mm": 10, "finish": "glossy"},
        substitutes=["vitrified_tiles_800x800", "ceramic_tiles_600x600"],
        description="Standard vitrified floor tile, glossy finish",
    ),
    "vitrified_tiles_800x800": MaterialSpec(
        name="Vitrified Tiles 800x800mm",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["tiles_straight"],
        price_tiers={
            BudgetTier.ECONOMY: 45.0,
            BudgetTier.MID_RANGE: 85.0,
            BudgetTier.PREMIUM: 160.0,
            BudgetTier.LUXURY: 350.0,
        },
        specifications={"size_mm": "800x800", "thickness_mm": 10, "finish": "glossy"},
        substitutes=["vitrified_tiles_600x600", "porcelain_tiles_800x800"],
        description="Large-format vitrified floor tile",
    ),
    "ceramic_tiles_600x600": MaterialSpec(
        name="Ceramic Tiles 600x600mm",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["tiles_straight"],
        price_tiers={
            BudgetTier.ECONOMY: 25.0,
            BudgetTier.MID_RANGE: 45.0,
            BudgetTier.PREMIUM: 80.0,
            BudgetTier.LUXURY: 150.0,
        },
        specifications={"size_mm": "600x600", "thickness_mm": 8, "finish": "matt"},
        substitutes=["vitrified_tiles_600x600"],
        description="Standard ceramic floor tile",
    ),
    "marble_flooring": MaterialSpec(
        name="Italian Marble Flooring",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["marble"],
        price_tiers={
            BudgetTier.ECONOMY: 80.0,
            BudgetTier.MID_RANGE: 200.0,
            BudgetTier.PREMIUM: 450.0,
            BudgetTier.LUXURY: 1200.0,
        },
        specifications={"thickness_mm": 18, "finish": "polished"},
        substitutes=["vitrified_tiles_800x800", "granite_flooring"],
        description="Natural marble flooring, polished finish",
    ),
    "granite_flooring": MaterialSpec(
        name="Granite Flooring",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["granite"],
        price_tiers={
            BudgetTier.ECONOMY: 60.0,
            BudgetTier.MID_RANGE: 120.0,
            BudgetTier.PREMIUM: 250.0,
            BudgetTier.LUXURY: 500.0,
        },
        specifications={"thickness_mm": 18, "finish": "polished"},
        substitutes=["vitrified_tiles_800x800", "marble_flooring"],
        description="Natural granite flooring",
    ),
    "laminate_flooring": MaterialSpec(
        name="Laminate Flooring",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["laminate_flooring"],
        price_tiers={
            BudgetTier.ECONOMY: 50.0,
            BudgetTier.MID_RANGE: 90.0,
            BudgetTier.PREMIUM: 160.0,
            BudgetTier.LUXURY: 300.0,
        },
        specifications={"thickness_mm": 8, "type": "click-lock"},
        substitutes=["vinyl_flooring", "engineered_wood_flooring"],
        description="Laminate wood-look flooring, click-lock system",
    ),
    "vinyl_flooring": MaterialSpec(
        name="Vinyl Flooring (SPC/LVT)",
        category=MaterialCategory.FLOORING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["vinyl_flooring"],
        price_tiers={
            BudgetTier.ECONOMY: 40.0,
            BudgetTier.MID_RANGE: 75.0,
            BudgetTier.PREMIUM: 130.0,
            BudgetTier.LUXURY: 250.0,
        },
        specifications={"thickness_mm": 5, "type": "SPC click-lock"},
        substitutes=["laminate_flooring"],
        description="Stone polymer composite / luxury vinyl tile",
    ),

    # -- Painting --
    "interior_emulsion": MaterialSpec(
        name="Interior Emulsion Paint",
        category=MaterialCategory.PAINTING,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["paint"],
        price_tiers={
            BudgetTier.ECONOMY: 8.0,
            BudgetTier.MID_RANGE: 14.0,
            BudgetTier.PREMIUM: 22.0,
            BudgetTier.LUXURY: 35.0,
        },
        specifications={"coats": 2, "coverage_sqft_per_litre": 120, "finish": "matt"},
        substitutes=["texture_paint", "wallpaper"],
        description="Interior wall emulsion paint including primer and putty",
    ),
    "texture_paint": MaterialSpec(
        name="Texture Paint",
        category=MaterialCategory.PAINTING,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["paint"],
        price_tiers={
            BudgetTier.ECONOMY: 18.0,
            BudgetTier.MID_RANGE: 30.0,
            BudgetTier.PREMIUM: 50.0,
            BudgetTier.LUXURY: 80.0,
        },
        specifications={"coats": 1, "finish": "textured"},
        substitutes=["interior_emulsion", "wallpaper"],
        description="Decorative textured wall finish",
    ),
    "wall_primer": MaterialSpec(
        name="Wall Primer",
        category=MaterialCategory.PAINTING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["primer"],
        price_tiers={
            BudgetTier.ECONOMY: 3.0,
            BudgetTier.MID_RANGE: 4.5,
            BudgetTier.PREMIUM: 6.0,
            BudgetTier.LUXURY: 8.0,
        },
        specifications={"coats": 1, "coverage_sqft_per_litre": 150},
        substitutes=[],
        description="Wall primer coat before emulsion paint",
    ),
    "wall_putty": MaterialSpec(
        name="Wall Putty",
        category=MaterialCategory.PAINTING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["putty"],
        price_tiers={
            BudgetTier.ECONOMY: 4.0,
            BudgetTier.MID_RANGE: 5.5,
            BudgetTier.PREMIUM: 7.0,
            BudgetTier.LUXURY: 9.0,
        },
        specifications={"coats": 2, "coverage_sqft_per_kg": 20},
        substitutes=[],
        description="Wall putty for smooth surface preparation",
    ),

    # -- Carpentry --
    "bwr_plywood_18mm": MaterialSpec(
        name="BWR Plywood 18mm",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["plywood"],
        price_tiers={
            BudgetTier.ECONOMY: 55.0,
            BudgetTier.MID_RANGE: 75.0,
            BudgetTier.PREMIUM: 100.0,
            BudgetTier.LUXURY: 140.0,
        },
        specifications={"thickness_mm": 18, "grade": "BWR", "size_ft": "8x4"},
        substitutes=["mr_plywood_18mm", "hdhmr_18mm", "mdf_18mm"],
        description="Boiling Water Resistant plywood, 18mm thick",
    ),
    "mr_plywood_18mm": MaterialSpec(
        name="MR Plywood 18mm",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["plywood"],
        price_tiers={
            BudgetTier.ECONOMY: 40.0,
            BudgetTier.MID_RANGE: 55.0,
            BudgetTier.PREMIUM: 75.0,
            BudgetTier.LUXURY: 100.0,
        },
        specifications={"thickness_mm": 18, "grade": "MR", "size_ft": "8x4"},
        substitutes=["bwr_plywood_18mm", "mdf_18mm"],
        description="Moisture Resistant plywood, 18mm thick",
    ),
    "mdf_18mm": MaterialSpec(
        name="MDF Board 18mm",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["mdf"],
        price_tiers={
            BudgetTier.ECONOMY: 28.0,
            BudgetTier.MID_RANGE: 38.0,
            BudgetTier.PREMIUM: 50.0,
            BudgetTier.LUXURY: 70.0,
        },
        specifications={"thickness_mm": 18, "density": "medium"},
        substitutes=["mr_plywood_18mm", "particle_board_18mm"],
        description="Medium Density Fibreboard, 18mm thick",
    ),
    "hdhmr_18mm": MaterialSpec(
        name="HDHMR Board 18mm",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["mdf"],
        price_tiers={
            BudgetTier.ECONOMY: 45.0,
            BudgetTier.MID_RANGE: 60.0,
            BudgetTier.PREMIUM: 80.0,
            BudgetTier.LUXURY: 110.0,
        },
        specifications={"thickness_mm": 18, "density": "high"},
        substitutes=["bwr_plywood_18mm", "mdf_18mm"],
        description="High Density High Moisture Resistant board",
    ),
    "particle_board_18mm": MaterialSpec(
        name="Particle Board 18mm",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["particle_board"],
        price_tiers={
            BudgetTier.ECONOMY: 20.0,
            BudgetTier.MID_RANGE: 30.0,
            BudgetTier.PREMIUM: 40.0,
            BudgetTier.LUXURY: 55.0,
        },
        specifications={"thickness_mm": 18},
        substitutes=["mdf_18mm"],
        description="Pre-laminated particle board",
    ),
    "laminate_sheet": MaterialSpec(
        name="Laminate Sheet (1mm)",
        category=MaterialCategory.CARPENTRY,
        unit="sqft",
        waste_factor=DEFAULT_WASTE_FACTORS["plywood"],
        price_tiers={
            BudgetTier.ECONOMY: 15.0,
            BudgetTier.MID_RANGE: 28.0,
            BudgetTier.PREMIUM: 50.0,
            BudgetTier.LUXURY: 90.0,
        },
        specifications={"thickness_mm": 1, "size_ft": "8x4"},
        substitutes=["veneer_sheet", "acrylic_sheet"],
        description="High pressure decorative laminate",
    ),
    "edge_banding_pvc": MaterialSpec(
        name="PVC Edge Banding",
        category=MaterialCategory.CARPENTRY,
        unit="rft",
        waste_factor=DEFAULT_WASTE_FACTORS["edge_banding"],
        price_tiers={
            BudgetTier.ECONOMY: 3.0,
            BudgetTier.MID_RANGE: 5.0,
            BudgetTier.PREMIUM: 8.0,
            BudgetTier.LUXURY: 12.0,
        },
        specifications={"width_mm": 22, "thickness_mm": 2},
        substitutes=["edge_banding_abs"],
        description="PVC edge banding tape for panel edges",
    ),

    # -- Electrical --
    "copper_wire_1_5mm": MaterialSpec(
        name="Copper Wire 1.5mm",
        category=MaterialCategory.ELECTRICAL,
        unit="rft",
        waste_factor=DEFAULT_WASTE_FACTORS["wire"],
        price_tiers={
            BudgetTier.ECONOMY: 8.0,
            BudgetTier.MID_RANGE: 10.0,
            BudgetTier.PREMIUM: 12.0,
            BudgetTier.LUXURY: 15.0,
        },
        specifications={"gauge": "1.5 sq mm", "type": "FR"},
        substitutes=[],
        description="Flame retardant copper wiring for lights",
    ),
    "copper_wire_2_5mm": MaterialSpec(
        name="Copper Wire 2.5mm",
        category=MaterialCategory.ELECTRICAL,
        unit="rft",
        waste_factor=DEFAULT_WASTE_FACTORS["wire"],
        price_tiers={
            BudgetTier.ECONOMY: 12.0,
            BudgetTier.MID_RANGE: 15.0,
            BudgetTier.PREMIUM: 18.0,
            BudgetTier.LUXURY: 22.0,
        },
        specifications={"gauge": "2.5 sq mm", "type": "FR"},
        substitutes=[],
        description="Flame retardant copper wiring for power sockets",
    ),
    "modular_switch_plate": MaterialSpec(
        name="Modular Switch Plate",
        category=MaterialCategory.ELECTRICAL,
        unit="nos",
        waste_factor=EXTENDED_WASTE_FACTORS["switch_plate"],
        price_tiers={
            BudgetTier.ECONOMY: 150.0,
            BudgetTier.MID_RANGE: 350.0,
            BudgetTier.PREMIUM: 700.0,
            BudgetTier.LUXURY: 1500.0,
        },
        specifications={"modules": 6, "type": "modular"},
        substitutes=[],
        description="Modular electrical switch plate with cover",
    ),
    "led_downlight": MaterialSpec(
        name="LED Downlight 12W",
        category=MaterialCategory.ELECTRICAL,
        unit="nos",
        waste_factor=EXTENDED_WASTE_FACTORS["light_fixture"],
        price_tiers={
            BudgetTier.ECONOMY: 250.0,
            BudgetTier.MID_RANGE: 500.0,
            BudgetTier.PREMIUM: 1200.0,
            BudgetTier.LUXURY: 3000.0,
        },
        specifications={"wattage": 12, "colour_temp": "4000K", "cutout_mm": 150},
        substitutes=["led_panel_light", "led_cob_light"],
        description="Recessed LED downlight for false ceiling",
    ),
    "pvc_conduit_20mm": MaterialSpec(
        name="PVC Conduit 20mm",
        category=MaterialCategory.ELECTRICAL,
        unit="rft",
        waste_factor=EXTENDED_WASTE_FACTORS["pvc_conduit"],
        price_tiers={
            BudgetTier.ECONOMY: 5.0,
            BudgetTier.MID_RANGE: 7.0,
            BudgetTier.PREMIUM: 9.0,
            BudgetTier.LUXURY: 12.0,
        },
        specifications={"diameter_mm": 20, "type": "heavy gauge"},
        substitutes=[],
        description="PVC electrical conduit pipe, 20mm",
    ),

    # -- Plumbing --
    "cpvc_pipe_15mm": MaterialSpec(
        name="CPVC Pipe 15mm",
        category=MaterialCategory.PLUMBING,
        unit="rft",
        waste_factor=DEFAULT_WASTE_FACTORS["pipe"],
        price_tiers={
            BudgetTier.ECONOMY: 18.0,
            BudgetTier.MID_RANGE: 22.0,
            BudgetTier.PREMIUM: 28.0,
            BudgetTier.LUXURY: 35.0,
        },
        specifications={"diameter_mm": 15, "type": "CPVC", "pressure_rating": "SDR-11"},
        substitutes=["copper_pipe_15mm"],
        description="CPVC hot and cold water supply pipe",
    ),
    "pvc_drainage_75mm": MaterialSpec(
        name="PVC Drainage Pipe 75mm",
        category=MaterialCategory.PLUMBING,
        unit="rft",
        waste_factor=DEFAULT_WASTE_FACTORS["pipe"],
        price_tiers={
            BudgetTier.ECONOMY: 25.0,
            BudgetTier.MID_RANGE: 35.0,
            BudgetTier.PREMIUM: 45.0,
            BudgetTier.LUXURY: 60.0,
        },
        specifications={"diameter_mm": 75, "type": "SWR PVC"},
        substitutes=[],
        description="SWR PVC drainage and waste pipe",
    ),

    # -- False Ceiling --
    "gypsum_board_12mm": MaterialSpec(
        name="Gypsum Board 12.5mm",
        category=MaterialCategory.FALSE_CEILING,
        unit="sqft",
        waste_factor=EXTENDED_WASTE_FACTORS["gypsum_board"],
        price_tiers={
            BudgetTier.ECONOMY: 55.0,
            BudgetTier.MID_RANGE: 75.0,
            BudgetTier.PREMIUM: 100.0,
            BudgetTier.LUXURY: 140.0,
        },
        specifications={"thickness_mm": 12.5, "size_ft": "8x4"},
        substitutes=["calcium_silicate_board"],
        description="Gypsum false ceiling board with GI framework, per sqft installed",
    ),

    # -- Civil --
    "cement_opc_43": MaterialSpec(
        name="OPC 43 Grade Cement",
        category=MaterialCategory.CIVIL,
        unit="bag",
        waste_factor=EXTENDED_WASTE_FACTORS["cement"],
        price_tiers={
            BudgetTier.ECONOMY: 350.0,
            BudgetTier.MID_RANGE: 380.0,
            BudgetTier.PREMIUM: 420.0,
            BudgetTier.LUXURY: 450.0,
        },
        specifications={"weight_kg": 50, "grade": "OPC 43"},
        substitutes=["cement_ppc"],
        description="Ordinary Portland Cement, 43 grade, 50 kg bag",
    ),
    "river_sand": MaterialSpec(
        name="River Sand",
        category=MaterialCategory.CIVIL,
        unit="cft",
        waste_factor=EXTENDED_WASTE_FACTORS["sand"],
        price_tiers={
            BudgetTier.ECONOMY: 45.0,
            BudgetTier.MID_RANGE: 55.0,
            BudgetTier.PREMIUM: 65.0,
            BudgetTier.LUXURY: 75.0,
        },
        specifications={"type": "river", "grade": "zone-II"},
        substitutes=["m_sand"],
        description="Fine aggregate for plastering and masonry",
    ),

    # -- Hardware --
    "cabinet_hinge_soft_close": MaterialSpec(
        name="Soft-Close Cabinet Hinge",
        category=MaterialCategory.HARDWARE,
        unit="nos",
        waste_factor=EXTENDED_WASTE_FACTORS["hardware_fitting"],
        price_tiers={
            BudgetTier.ECONOMY: 40.0,
            BudgetTier.MID_RANGE: 80.0,
            BudgetTier.PREMIUM: 180.0,
            BudgetTier.LUXURY: 400.0,
        },
        specifications={"type": "soft-close", "opening_angle": 110},
        substitutes=["cabinet_hinge_standard"],
        description="Concealed soft-close cabinet hinge",
    ),
    "drawer_channel_18inch": MaterialSpec(
        name="Drawer Telescopic Channel 18in",
        category=MaterialCategory.HARDWARE,
        unit="pair",
        waste_factor=EXTENDED_WASTE_FACTORS["hardware_fitting"],
        price_tiers={
            BudgetTier.ECONOMY: 120.0,
            BudgetTier.MID_RANGE: 250.0,
            BudgetTier.PREMIUM: 500.0,
            BudgetTier.LUXURY: 1200.0,
        },
        specifications={"length_inch": 18, "type": "full-extension", "load_kg": 35},
        substitutes=[],
        description="Full-extension telescopic ball-bearing drawer slides, 18 inch",
    ),
}


def get_material(material_key: str) -> MaterialSpec | None:
    """Look up a material by its canonical key."""
    return MATERIAL_DATABASE.get(material_key)


def get_materials_by_category(category: MaterialCategory) -> list[MaterialSpec]:
    """Return all materials belonging to a given category."""
    return [m for m in MATERIAL_DATABASE.values() if m.category == category]


def get_waste_factor(material_key: str, pattern: str | None = None) -> float:
    """Return the waste factor for a material, considering laying pattern.

    Parameters
    ----------
    material_key:
        Canonical material key in the database.
    pattern:
        Optional laying pattern (e.g. ``"diagonal"``, ``"herringbone"``).
        If the pattern has a specific waste factor it overrides the default.

    Returns
    -------
    float
        Waste factor as a decimal (e.g. 0.10 for 10%).
    """
    spec = MATERIAL_DATABASE.get(material_key)
    if spec is None:
        return 0.05  # conservative default

    # Check if there is a pattern-specific override
    if pattern:
        pattern_key = f"tiles_{pattern}"
        if pattern_key in DEFAULT_WASTE_FACTORS:
            return DEFAULT_WASTE_FACTORS[pattern_key]

    return spec.waste_factor


def get_price_for_tier(material_key: str, budget_tier: BudgetTier) -> float | None:
    """Return the unit price for a material at a given budget tier.

    Returns ``None`` if the material or tier is not found.
    """
    spec = MATERIAL_DATABASE.get(material_key)
    if spec is None:
        return None
    return spec.price_tiers.get(budget_tier)


def find_substitutes(material_key: str) -> list[MaterialSpec]:
    """Return all substitute materials for a given material."""
    spec = MATERIAL_DATABASE.get(material_key)
    if spec is None:
        return []
    return [
        MATERIAL_DATABASE[sub_key]
        for sub_key in spec.substitutes
        if sub_key in MATERIAL_DATABASE
    ]
