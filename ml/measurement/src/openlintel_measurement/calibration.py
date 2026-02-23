"""
Standard reference objects for depth-to-metric calibration.

Each ``ReferenceObject`` stores the known real-world dimensions of a
commonly-found item that can be detected in room photographs.  The
measurement pipeline uses these to convert relative depth values into
millimetres.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReferenceObject(BaseModel):
    """A reference object with known real-world dimensions."""

    name: str = Field(description="Human-readable name")
    slug: str = Field(description="Machine-friendly identifier")

    # Known dimensions in millimetres
    height_mm: float | None = Field(default=None, description="Known height in mm")
    width_mm: float | None = Field(default=None, description="Known width in mm")
    depth_mm: float | None = Field(default=None, description="Known depth in mm")

    # Which dimension is most reliably visible in photos
    primary_dimension: str = Field(
        default="height",
        description="Which dimension (height/width/depth) is most reliably visible",
    )
    primary_dimension_mm: float = Field(
        description="The value of the primary visible dimension in mm"
    )

    # Detection hints for VLM
    detection_description: str = Field(
        default="",
        description="Description to help the VLM identify this reference",
    )

    # Tolerance for variation in the real world
    tolerance_mm: float = Field(
        default=50.0,
        description="Expected variation from the standard dimension (+/- mm)",
    )


# ---------------------------------------------------------------------------
# Standard reference objects
# ---------------------------------------------------------------------------

_STANDARD_DOOR = ReferenceObject(
    name="Standard Interior Door",
    slug="door",
    height_mm=2100.0,
    width_mm=900.0,
    depth_mm=44.0,
    primary_dimension="height",
    primary_dimension_mm=2100.0,
    detection_description="Standard interior door (not main/entrance door)",
    tolerance_mm=100.0,  # Doors vary from 2000-2200mm
)

_STANDARD_DOOR_INDIAN = ReferenceObject(
    name="Standard Indian Interior Door",
    slug="door_indian",
    height_mm=2100.0,
    width_mm=900.0,
    depth_mm=35.0,
    primary_dimension="height",
    primary_dimension_mm=2100.0,
    detection_description="Standard Indian interior door",
    tolerance_mm=100.0,
)

_A4_PAPER = ReferenceObject(
    name="A4 Paper",
    slug="a4_paper",
    height_mm=297.0,
    width_mm=210.0,
    depth_mm=0.1,
    primary_dimension="height",
    primary_dimension_mm=297.0,
    detection_description="A4 sheet of paper (portrait orientation)",
    tolerance_mm=1.0,
)

_LETTER_PAPER = ReferenceObject(
    name="US Letter Paper",
    slug="letter_paper",
    height_mm=279.4,
    width_mm=215.9,
    depth_mm=0.1,
    primary_dimension="height",
    primary_dimension_mm=279.4,
    detection_description="US Letter sheet of paper (portrait orientation)",
    tolerance_mm=1.0,
)

_STANDARD_BRICK = ReferenceObject(
    name="Standard Brick (Indian/Metric)",
    slug="brick",
    height_mm=75.0,
    width_mm=110.0,
    depth_mm=230.0,
    primary_dimension="depth",
    primary_dimension_mm=230.0,
    detection_description="Standard metric brick visible in wall or as reference",
    tolerance_mm=10.0,
)

_MODULAR_BRICK = ReferenceObject(
    name="Modular Brick",
    slug="brick_modular",
    height_mm=75.0,
    width_mm=90.0,
    depth_mm=190.0,
    primary_dimension="depth",
    primary_dimension_mm=190.0,
    detection_description="Modular brick",
    tolerance_mm=10.0,
)

_CREDIT_CARD = ReferenceObject(
    name="Credit/Debit Card",
    slug="credit_card",
    height_mm=53.98,
    width_mm=85.60,
    depth_mm=0.76,
    primary_dimension="width",
    primary_dimension_mm=85.60,
    detection_description="Standard ISO/IEC 7810 ID-1 card (credit card, debit card)",
    tolerance_mm=0.5,
)

_STANDARD_TILE_300 = ReferenceObject(
    name="300x300mm Floor Tile",
    slug="tile_300",
    height_mm=300.0,
    width_mm=300.0,
    depth_mm=10.0,
    primary_dimension="width",
    primary_dimension_mm=300.0,
    detection_description="Square floor tile (30cm x 30cm)",
    tolerance_mm=5.0,
)

_STANDARD_TILE_600 = ReferenceObject(
    name="600x600mm Floor Tile",
    slug="tile_600",
    height_mm=600.0,
    width_mm=600.0,
    depth_mm=10.0,
    primary_dimension="width",
    primary_dimension_mm=600.0,
    detection_description="Large square floor tile (60cm x 60cm)",
    tolerance_mm=5.0,
)

_STANDARD_WINDOW = ReferenceObject(
    name="Standard Window",
    slug="window",
    height_mm=1200.0,
    width_mm=900.0,
    depth_mm=150.0,
    primary_dimension="height",
    primary_dimension_mm=1200.0,
    detection_description="Standard single window panel",
    tolerance_mm=200.0,  # Windows vary considerably
)

_CEILING_HEIGHT = ReferenceObject(
    name="Standard Ceiling Height",
    slug="ceiling_height",
    height_mm=2700.0,
    width_mm=0.0,
    depth_mm=0.0,
    primary_dimension="height",
    primary_dimension_mm=2700.0,
    detection_description="Floor-to-ceiling measurement",
    tolerance_mm=300.0,  # 2400-3000mm range is common
)

_LIGHT_SWITCH = ReferenceObject(
    name="Light Switch Plate",
    slug="light_switch",
    height_mm=114.0,
    width_mm=70.0,
    depth_mm=10.0,
    primary_dimension="height",
    primary_dimension_mm=114.0,
    detection_description="Standard light switch plate / gang box cover",
    tolerance_mm=10.0,
)

_POWER_OUTLET = ReferenceObject(
    name="Power Outlet Plate",
    slug="power_outlet",
    height_mm=114.0,
    width_mm=70.0,
    depth_mm=10.0,
    primary_dimension="height",
    primary_dimension_mm=114.0,
    detection_description="Standard power outlet / socket plate",
    tolerance_mm=10.0,
)


class CalibrationDB:
    """Registry of standard reference objects for measurement calibration.

    Provides fast lookup by slug, iteration, and dimension queries.
    """

    _REFERENCES: dict[str, ReferenceObject] = {
        "door": _STANDARD_DOOR,
        "door_indian": _STANDARD_DOOR_INDIAN,
        "a4_paper": _A4_PAPER,
        "letter_paper": _LETTER_PAPER,
        "brick": _STANDARD_BRICK,
        "brick_modular": _MODULAR_BRICK,
        "credit_card": _CREDIT_CARD,
        "tile_300": _STANDARD_TILE_300,
        "tile_600": _STANDARD_TILE_600,
        "window": _STANDARD_WINDOW,
        "ceiling_height": _CEILING_HEIGHT,
        "light_switch": _LIGHT_SWITCH,
        "power_outlet": _POWER_OUTLET,
    }

    @classmethod
    def get(cls, slug: str) -> ReferenceObject:
        """Return the ``ReferenceObject`` for *slug*, or raise ``KeyError``."""
        try:
            return cls._REFERENCES[slug]
        except KeyError:
            available = ", ".join(sorted(cls._REFERENCES))
            raise KeyError(
                f"Unknown reference object '{slug}'. Available: {available}"
            ) from None

    @classmethod
    def list_slugs(cls) -> list[str]:
        """Return a sorted list of all registered reference slugs."""
        return sorted(cls._REFERENCES)

    @classmethod
    def all_references(cls) -> list[ReferenceObject]:
        """Return all registered reference objects."""
        return list(cls._REFERENCES.values())

    @classmethod
    def get_primary_dimension_mm(cls, slug: str) -> float:
        """Return the primary visible dimension in mm for a reference."""
        ref = cls.get(slug)
        return ref.primary_dimension_mm

    @classmethod
    def register(cls, reference: ReferenceObject) -> None:
        """Register a custom reference object."""
        cls._REFERENCES[reference.slug] = reference

    @classmethod
    def best_reference_for_scale(cls, target_mm: float) -> ReferenceObject:
        """Find the reference object whose primary dimension is closest to *target_mm*.

        Useful when a service knows approximately how large something is and
        wants to suggest the best calibration reference.
        """
        refs = cls.all_references()
        return min(refs, key=lambda r: abs(r.primary_dimension_mm - target_mm))
