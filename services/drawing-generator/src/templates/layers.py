"""
Standard CAD layer definitions for OpenLintel technical drawings.

Each layer has a canonical name, colour (AutoCAD ACI index), lineweight,
line type, and a description.  These mirror the layer conventions used in
professional interior-design CAD workflows.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LayerDef:
    """Definition for a single CAD layer."""

    name: str
    color: int              # AutoCAD ACI colour index (1-255)
    lineweight: float       # Lineweight in mm (0.13, 0.25, 0.35, 0.50, etc.)
    linetype: str           # "Continuous", "DASHED", "CENTER", etc.
    description: str


# -- Standard layers --------------------------------------------------------

LAYER_WALLS = LayerDef(
    name="A-WALL",
    color=7,        # White/Black
    lineweight=0.50,
    linetype="Continuous",
    description="Architectural walls (external and internal)",
)

LAYER_WALLS_INTERNAL = LayerDef(
    name="A-WALL-INT",
    color=8,        # Dark grey
    lineweight=0.35,
    linetype="Continuous",
    description="Internal partition walls",
)

LAYER_WALLS_HIDDEN = LayerDef(
    name="A-WALL-HIDN",
    color=8,
    lineweight=0.18,
    linetype="DASHED",
    description="Hidden/above walls",
)

LAYER_DOORS = LayerDef(
    name="A-DOOR",
    color=1,        # Red
    lineweight=0.25,
    linetype="Continuous",
    description="Doors and door swings",
)

LAYER_WINDOWS = LayerDef(
    name="A-GLAZ",
    color=5,        # Blue
    lineweight=0.25,
    linetype="Continuous",
    description="Windows and glazing",
)

LAYER_FURNITURE = LayerDef(
    name="I-FURN",
    color=3,        # Green
    lineweight=0.25,
    linetype="Continuous",
    description="Furniture items",
)

LAYER_FURNITURE_OUTLINE = LayerDef(
    name="I-FURN-OUTL",
    color=3,
    lineweight=0.18,
    linetype="Continuous",
    description="Furniture outlines and details",
)

LAYER_DIMENSIONS = LayerDef(
    name="A-ANNO-DIMS",
    color=2,        # Yellow
    lineweight=0.18,
    linetype="Continuous",
    description="Dimension lines and text",
)

LAYER_ANNOTATIONS = LayerDef(
    name="A-ANNO-NOTE",
    color=7,
    lineweight=0.13,
    linetype="Continuous",
    description="Annotations, labels, and notes",
)

LAYER_ELECTRICAL = LayerDef(
    name="E-LITE",
    color=1,        # Red
    lineweight=0.25,
    linetype="Continuous",
    description="Electrical: lighting fixtures",
)

LAYER_ELECTRICAL_POWER = LayerDef(
    name="E-POWR",
    color=1,
    lineweight=0.25,
    linetype="Continuous",
    description="Electrical: power outlets and switches",
)

LAYER_ELECTRICAL_WIRING = LayerDef(
    name="E-WIRE",
    color=1,
    lineweight=0.13,
    linetype="DASHED",
    description="Electrical: wiring runs",
)

LAYER_PLUMBING = LayerDef(
    name="P-SANR",
    color=4,        # Cyan
    lineweight=0.25,
    linetype="Continuous",
    description="Plumbing: sanitary fixtures and pipes",
)

LAYER_PLUMBING_SUPPLY = LayerDef(
    name="P-DOMW",
    color=4,
    lineweight=0.18,
    linetype="Continuous",
    description="Plumbing: domestic water supply lines",
)

LAYER_PLUMBING_DRAIN = LayerDef(
    name="P-DRAN",
    color=4,
    lineweight=0.18,
    linetype="DASHED",
    description="Plumbing: drainage lines",
)

LAYER_CEILING = LayerDef(
    name="A-CLNG",
    color=6,        # Magenta
    lineweight=0.25,
    linetype="Continuous",
    description="Ceiling: false ceiling outlines",
)

LAYER_CEILING_GRID = LayerDef(
    name="A-CLNG-GRID",
    color=6,
    lineweight=0.13,
    linetype="Continuous",
    description="Ceiling: grid lines and panels",
)

LAYER_FLOORING = LayerDef(
    name="I-FLOR",
    color=30,       # Orange
    lineweight=0.18,
    linetype="Continuous",
    description="Flooring: tile/material layouts",
)

LAYER_FLOORING_PATTERN = LayerDef(
    name="I-FLOR-PATT",
    color=30,
    lineweight=0.09,
    linetype="Continuous",
    description="Flooring: tile patterns and grout lines",
)

LAYER_HATCH = LayerDef(
    name="A-AREA-IDEN",
    color=252,      # Light grey
    lineweight=0.09,
    linetype="Continuous",
    description="Area hatches and fills",
)

LAYER_SECTION_CUT = LayerDef(
    name="A-SECT",
    color=1,
    lineweight=0.70,
    linetype="Continuous",
    description="Section cut lines (thick)",
)

LAYER_SECTION_BEYOND = LayerDef(
    name="A-SECT-BYND",
    color=8,
    lineweight=0.18,
    linetype="Continuous",
    description="Elements beyond the section cut",
)

LAYER_TITLE_BLOCK = LayerDef(
    name="A-ANNO-TTLB",
    color=7,
    lineweight=0.35,
    linetype="Continuous",
    description="Title block and border",
)

LAYER_VIEWPORT = LayerDef(
    name="DEFPOINTS",
    color=7,
    lineweight=0.0,
    linetype="Continuous",
    description="Non-printing viewport layer",
)


# -- Collected registry -----------------------------------------------------

ALL_LAYERS: list[LayerDef] = [
    LAYER_WALLS,
    LAYER_WALLS_INTERNAL,
    LAYER_WALLS_HIDDEN,
    LAYER_DOORS,
    LAYER_WINDOWS,
    LAYER_FURNITURE,
    LAYER_FURNITURE_OUTLINE,
    LAYER_DIMENSIONS,
    LAYER_ANNOTATIONS,
    LAYER_ELECTRICAL,
    LAYER_ELECTRICAL_POWER,
    LAYER_ELECTRICAL_WIRING,
    LAYER_PLUMBING,
    LAYER_PLUMBING_SUPPLY,
    LAYER_PLUMBING_DRAIN,
    LAYER_CEILING,
    LAYER_CEILING_GRID,
    LAYER_FLOORING,
    LAYER_FLOORING_PATTERN,
    LAYER_HATCH,
    LAYER_SECTION_CUT,
    LAYER_SECTION_BEYOND,
    LAYER_TITLE_BLOCK,
    LAYER_VIEWPORT,
]


def get_layer_names() -> list[str]:
    """Return all layer names."""
    return [layer.name for layer in ALL_LAYERS]


def get_layer_by_name(name: str) -> LayerDef | None:
    """Look up a layer definition by name."""
    for layer in ALL_LAYERS:
        if layer.name == name:
            return layer
    return None
