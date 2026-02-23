"""
Style definitions database — furniture vocabulary, colour palettes, and material
preferences indexed by design style.

Each ``StyleDefinition`` captures the visual language of a style so that prompt
templates can be hydrated with concrete nouns, colours, and textures rather than
relying on the VLM's implicit knowledge alone.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class StyleDefinition(BaseModel):
    """Complete visual vocabulary for a single interior design style."""

    name: str = Field(description="Human-readable style name")
    slug: str = Field(description="Machine-friendly identifier (e.g. 'modern')")

    # Colour palette — ordered from dominant to accent
    primary_colors: list[str] = Field(
        description="3-5 dominant colours (CSS-style names or hex codes)"
    )
    accent_colors: list[str] = Field(description="1-3 accent colours for pops of interest")

    # Materials & textures
    preferred_materials: list[str] = Field(
        description="Ordered list of preferred materials (e.g. 'oak wood', 'brushed steel')"
    )
    texture_keywords: list[str] = Field(
        description="Adjectives describing the tactile feel (e.g. 'matte', 'ribbed', 'raw')"
    )

    # Furniture vocabulary per room type
    furniture_vocabulary: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Mapping of room_type -> list of characteristic furniture pieces",
    )

    # Spatial & layout traits
    layout_principles: list[str] = Field(
        description="Core spatial rules (e.g. 'open plan', 'symmetrical arrangement')"
    )

    # Budget scaling hints
    economy_substitutions: dict[str, str] = Field(
        default_factory=dict,
        description="Premium material -> economy alternative (e.g. 'marble' -> 'quartz laminate')",
    )
    luxury_upgrades: dict[str, str] = Field(
        default_factory=dict,
        description="Standard material -> luxury alternative (e.g. 'oak veneer' -> 'solid walnut')",
    )

    # Lighting style
    lighting_keywords: list[str] = Field(
        description="Characteristic lighting descriptors (e.g. 'warm ambient', 'task spotlights')"
    )


# ---------------------------------------------------------------------------
# Pre-built style definitions
# ---------------------------------------------------------------------------

_MODERN = StyleDefinition(
    name="Modern",
    slug="modern",
    primary_colors=["#FFFFFF", "#F5F5F5", "#2C2C2C", "#B0B0B0"],
    accent_colors=["#E85D04", "#0077B6"],
    preferred_materials=[
        "tempered glass",
        "brushed stainless steel",
        "engineered wood",
        "polished concrete",
        "leather",
    ],
    texture_keywords=["sleek", "smooth", "matte", "polished"],
    furniture_vocabulary={
        "living_room": [
            "low-profile sectional sofa",
            "geometric coffee table",
            "floating media console",
            "accent armchair with metal legs",
            "minimalist floor lamp",
        ],
        "bedroom": [
            "platform bed with upholstered headboard",
            "wall-mounted nightstands",
            "linear dresser",
            "pendant bedside lights",
        ],
        "kitchen": [
            "handle-less flat-panel cabinets",
            "waterfall island countertop",
            "integrated appliances",
            "under-cabinet LED strip",
        ],
        "bathroom": [
            "wall-hung vanity",
            "frameless glass shower enclosure",
            "freestanding oval bathtub",
            "backlit mirror",
        ],
    },
    layout_principles=[
        "clean horizontal lines",
        "open floor plan where possible",
        "negative space is intentional",
        "furniture floats away from walls",
    ],
    economy_substitutions={
        "tempered glass": "acrylic panel",
        "brushed stainless steel": "powder-coated metal",
        "leather": "high-quality PU leather",
        "polished concrete": "concrete-effect porcelain tile",
    },
    luxury_upgrades={
        "engineered wood": "solid European oak",
        "brushed stainless steel": "brushed brass",
        "leather": "full-grain Italian leather",
        "tempered glass": "low-iron crystal glass",
    },
    lighting_keywords=["recessed downlights", "linear LED profiles", "sculptural pendant"],
)

_MINIMALIST = StyleDefinition(
    name="Minimalist",
    slug="minimalist",
    primary_colors=["#FFFFFF", "#FAFAFA", "#E0E0E0"],
    accent_colors=["#000000"],
    preferred_materials=[
        "white oak",
        "matte lacquer",
        "linen",
        "natural stone",
        "plaster",
    ],
    texture_keywords=["smooth", "matte", "natural grain", "soft"],
    furniture_vocabulary={
        "living_room": [
            "simple two-seater sofa in neutral fabric",
            "round wooden side table",
            "single statement artwork",
            "hidden storage bench",
        ],
        "bedroom": [
            "low wooden bed frame without headboard",
            "single pendant light",
            "built-in wardrobe with push-latch doors",
            "linen bedding in white or oatmeal",
        ],
        "kitchen": [
            "all-white slab-door cabinetry",
            "integrated handles",
            "flush-mount ceiling light",
            "single open shelf for ceramics",
        ],
        "bathroom": [
            "wall-mounted basin with stone top",
            "frameless mirror",
            "walk-in wet room with linear drain",
            "matte-black tapware",
        ],
    },
    layout_principles=[
        "less is more — every object must earn its place",
        "mono-material continuity across surfaces",
        "concealed storage to eliminate visual clutter",
        "generous breathing room between furniture",
    ],
    economy_substitutions={
        "natural stone": "stone-effect engineered quartz",
        "white oak": "birch plywood with whitewash finish",
        "linen": "cotton-linen blend",
    },
    luxury_upgrades={
        "white oak": "bleached French oak",
        "natural stone": "Calacatta marble",
        "matte lacquer": "hand-finished Japanese lacquer",
    },
    lighting_keywords=["diffused ambient glow", "single statement pendant", "concealed cove LED"],
)

_SCANDINAVIAN = StyleDefinition(
    name="Scandinavian",
    slug="scandinavian",
    primary_colors=["#FFFFFF", "#F7F3EE", "#D4C9B8", "#A69E94"],
    accent_colors=["#5B8C5A", "#D4A373"],
    preferred_materials=[
        "light birch",
        "ash wood",
        "wool",
        "sheepskin",
        "ceramic",
        "cotton",
    ],
    texture_keywords=["cozy", "organic", "woven", "knitted", "raw-edge"],
    furniture_vocabulary={
        "living_room": [
            "wide-arm linen sofa",
            "Wegner-style lounge chair",
            "round birch coffee table",
            "woven wool area rug",
            "potted fiddle-leaf fig",
        ],
        "bedroom": [
            "slatted headboard in light wood",
            "chunky knit throw blanket",
            "ceramic table lamp with linen shade",
            "floating wooden shelves",
        ],
        "kitchen": [
            "two-tone cabinets (white upper, wood lower)",
            "subway tile backsplash",
            "butcher-block countertop",
            "open shelving with ceramics",
        ],
        "bathroom": [
            "terrazzo floor tiles",
            "round wall mirror",
            "wooden bath stool",
            "matte white freestanding tub",
        ],
    },
    layout_principles=[
        "hygge — warmth and coziness as design drivers",
        "natural light maximisation",
        "organic curves balance straight lines",
        "layered textiles for warmth",
    ],
    economy_substitutions={
        "ash wood": "pine with clear coat",
        "wool": "acrylic knit",
        "sheepskin": "faux sheepskin",
        "terrazzo": "terrazzo-effect vinyl",
    },
    luxury_upgrades={
        "light birch": "Danish oiled oak",
        "wool": "Icelandic wool",
        "ceramic": "hand-thrown stoneware",
    },
    lighting_keywords=[
        "warm-white pendant clusters",
        "candle-like table lamps",
        "natural daylight emphasis",
    ],
)

_INDUSTRIAL = StyleDefinition(
    name="Industrial",
    slug="industrial",
    primary_colors=["#3C3C3C", "#6B6B6B", "#A0A0A0", "#1A1A1A"],
    accent_colors=["#C97B3D", "#8B0000"],
    preferred_materials=[
        "exposed brick",
        "raw steel",
        "reclaimed wood",
        "concrete",
        "aged leather",
        "iron pipe",
    ],
    texture_keywords=["rough", "raw", "distressed", "patinated", "riveted"],
    furniture_vocabulary={
        "living_room": [
            "tufted leather Chesterfield sofa",
            "factory cart coffee table",
            "iron bookshelf",
            "Edison-bulb floor lamp",
            "salvaged wood media unit",
        ],
        "bedroom": [
            "iron-frame bed with exposed bolts",
            "pipe-fitting nightstands",
            "exposed filament pendant",
            "metal locker wardrobe",
        ],
        "kitchen": [
            "open metal shelving",
            "stainless steel countertop",
            "subway tile in matte black",
            "vintage bar stools",
        ],
        "bathroom": [
            "exposed copper piping",
            "concrete vessel sink",
            "iron-frame mirror",
            "cage light fixture",
        ],
    },
    layout_principles=[
        "exposed structural elements as features",
        "high ceilings and open plans",
        "raw finishes left unpolished",
        "mix of heavy and utilitarian furniture",
    ],
    economy_substitutions={
        "exposed brick": "brick-effect wall panel",
        "raw steel": "powder-coated mild steel",
        "reclaimed wood": "distressed-finish pine",
        "aged leather": "distressed PU leather",
    },
    luxury_upgrades={
        "raw steel": "blackened patina steel",
        "reclaimed wood": "antique barnwood",
        "concrete": "polished micro-cement",
        "aged leather": "vintage full-grain saddle leather",
    },
    lighting_keywords=["exposed Edison bulbs", "pendant cage lights", "articulated desk lamps"],
)

_TRADITIONAL = StyleDefinition(
    name="Traditional",
    slug="traditional",
    primary_colors=["#F5EDE3", "#D4B896", "#8B6F4E", "#3D2B1F"],
    accent_colors=["#6B2D3E", "#1B4D3E"],
    preferred_materials=[
        "mahogany",
        "cherry wood",
        "silk",
        "velvet",
        "marble",
        "brass",
    ],
    texture_keywords=["ornate", "carved", "tufted", "draped", "gilded"],
    furniture_vocabulary={
        "living_room": [
            "rolled-arm sofa in velvet",
            "ornate carved coffee table",
            "wingback armchair",
            "crystal chandelier",
            "Persian area rug",
        ],
        "bedroom": [
            "four-poster bed in dark wood",
            "matching bedside tables with drawers",
            "vanity with triple mirror",
            "silk curtains with valance",
        ],
        "kitchen": [
            "raised-panel cabinet doors",
            "crown moulding at ceiling",
            "marble countertop with ogee edge",
            "porcelain farmhouse sink",
        ],
        "bathroom": [
            "clawfoot bathtub",
            "pedestal sink",
            "framed ornate mirror",
            "wainscoting wall panels",
        ],
    },
    layout_principles=[
        "symmetrical furniture arrangement",
        "focal point anchoring (fireplace, artwork)",
        "layered window treatments",
        "formal seating groups",
    ],
    economy_substitutions={
        "mahogany": "mahogany-stained poplar",
        "marble": "cultured marble",
        "silk": "polyester satin",
        "velvet": "microfiber velvet",
    },
    luxury_upgrades={
        "cherry wood": "solid American black cherry",
        "marble": "Carrara marble with book-matched slabs",
        "brass": "hand-polished unlacquered brass",
        "velvet": "Italian cotton velvet",
    },
    lighting_keywords=["crystal chandeliers", "silk-shaded table lamps", "wall sconces with shades"],
)

_BOHEMIAN = StyleDefinition(
    name="Bohemian",
    slug="bohemian",
    primary_colors=["#F5E6D3", "#E8D5B7", "#C4A882"],
    accent_colors=["#C74B50", "#4A7C59", "#E8A52B", "#5B3A8C"],
    preferred_materials=[
        "rattan",
        "jute",
        "macrame cord",
        "kilim fabric",
        "terracotta",
        "hand-dyed cotton",
    ],
    texture_keywords=["woven", "layered", "fringed", "hand-crafted", "eclectic"],
    furniture_vocabulary={
        "living_room": [
            "low-slung daybed with assorted cushions",
            "rattan peacock chair",
            "vintage kilim rug",
            "macrame wall hanging",
            "floor poufs in mixed patterns",
        ],
        "bedroom": [
            "canopy bed draped with fabric",
            "mixed-pattern bedding",
            "hanging planter clusters",
            "carved wooden trunk as nightstand",
        ],
        "kitchen": [
            "open shelving with collected ceramics",
            "patterned tile backsplash",
            "woven pendant light",
            "herb garden on windowsill",
        ],
        "bathroom": [
            "mosaic tile floor",
            "woven basket storage",
            "round jute mirror",
            "plants on every surface",
        ],
    },
    layout_principles=[
        "more is more — curated abundance",
        "mix patterns at different scales",
        "ground-level and floor seating encouraged",
        "travel souvenirs and artisan pieces as decor",
    ],
    economy_substitutions={
        "rattan": "paper rope",
        "kilim fabric": "printed cotton kilim-style",
        "terracotta": "terracotta-finish ceramic",
    },
    luxury_upgrades={
        "rattan": "hand-woven Balinese rattan",
        "jute": "hand-spun hemp",
        "kilim fabric": "antique Turkish kilim",
    },
    lighting_keywords=["Moroccan lanterns", "woven rattan pendants", "string fairy lights"],
)

_MID_CENTURY = StyleDefinition(
    name="Mid-Century Modern",
    slug="mid_century",
    primary_colors=["#FFFFFF", "#F5E6CA", "#8B4513"],
    accent_colors=["#D4732A", "#1B6B4A", "#DAA520"],
    preferred_materials=[
        "walnut",
        "teak",
        "molded plywood",
        "fiberglass",
        "bouclé fabric",
        "brass",
    ],
    texture_keywords=["organic curves", "tapered", "sculptural", "smooth grain"],
    furniture_vocabulary={
        "living_room": [
            "Eames-style lounge chair and ottoman",
            "tapered-leg credenza",
            "Noguchi-style coffee table",
            "Sputnik chandelier",
            "sunburst wall clock",
        ],
        "bedroom": [
            "walnut bed frame with angled legs",
            "tulip-style nightstand",
            "teak tallboy dresser",
            "arc floor lamp",
        ],
        "kitchen": [
            "flat-panel cabinets with finger pulls",
            "laminate countertop with metal edge",
            "pendant globe lights",
            "molded dining chairs",
        ],
        "bathroom": [
            "coloured porcelain fixtures",
            "mosaic penny-round floor tile",
            "teak vanity unit",
            "globe sconce lights",
        ],
    },
    layout_principles=[
        "furniture on tapered legs creates visual lightness",
        "organic and geometric forms coexist",
        "connection between indoor and outdoor spaces",
        "functional pieces double as statement art",
    ],
    economy_substitutions={
        "walnut": "walnut-veneered MDF",
        "teak": "acacia with teak finish",
        "bouclé fabric": "textured polyester bouclé",
        "brass": "brass-plated steel",
    },
    luxury_upgrades={
        "molded plywood": "original vintage Eames shell",
        "walnut": "solid black walnut with hand-rubbed oil finish",
        "brass": "solid unlacquered brass hardware",
    },
    lighting_keywords=["Sputnik chandeliers", "globe pendants", "arc floor lamps"],
)

_JAPANDI = StyleDefinition(
    name="Japandi",
    slug="japandi",
    primary_colors=["#F5F0EB", "#D9CDBF", "#8C7A6B", "#3D3228"],
    accent_colors=["#5B7553", "#2C3E50"],
    preferred_materials=[
        "hinoki cypress",
        "bamboo",
        "washi paper",
        "linen",
        "stoneware",
        "shou sugi ban wood",
    ],
    texture_keywords=["wabi-sabi", "imperfect", "natural grain", "hand-finished", "earthy"],
    furniture_vocabulary={
        "living_room": [
            "low tatami-style sofa",
            "round oak coffee table",
            "rice-paper floor lamp",
            "bonsai or ikebana arrangement",
            "minimal floating shelf",
        ],
        "bedroom": [
            "low futon-style platform bed",
            "shoji screen room divider",
            "single ceramic vase on nightstand",
            "linen roller blind",
        ],
        "kitchen": [
            "natural wood cabinets with concealed pulls",
            "stone countertop in warm grey",
            "open shelf with curated pottery",
            "woven pendant light",
        ],
        "bathroom": [
            "soaking ofuro-style tub",
            "stone vessel basin",
            "bamboo bath mat",
            "cedar wood accents",
        ],
    },
    layout_principles=[
        "ma (negative space) is respected",
        "craftsmanship over decoration",
        "natural materials connect to outdoors",
        "neutral palette with green plant accents only",
    ],
    economy_substitutions={
        "hinoki cypress": "pine with light wash",
        "shou sugi ban wood": "charred-effect laminate",
        "stoneware": "stoneware-finish ceramic",
    },
    luxury_upgrades={
        "bamboo": "Japanese madake bamboo",
        "linen": "hand-woven Belgian linen",
        "stoneware": "Bizen pottery",
    },
    lighting_keywords=["rice-paper lanterns", "warm concealed cove lighting", "single pendant akari"],
)

_ART_DECO = StyleDefinition(
    name="Art Deco",
    slug="art_deco",
    primary_colors=["#1C1C1C", "#2B2B2B", "#D4AF37", "#FFFFFF"],
    accent_colors=["#006D6F", "#800020"],
    preferred_materials=[
        "lacquered wood",
        "polished brass",
        "mirror",
        "marble",
        "velvet",
        "shagreen",
    ],
    texture_keywords=["glamorous", "geometric", "faceted", "high-gloss", "luxurious"],
    furniture_vocabulary={
        "living_room": [
            "curved velvet sofa in jewel tone",
            "mirrored cocktail table",
            "lacquered sideboard with brass inlay",
            "geometric patterned rug",
            "tiered chandelier",
        ],
        "bedroom": [
            "upholstered bed with sunburst headboard",
            "mirrored dressing table",
            "lacquered bedside cabinets",
            "fan-shaped wall sconces",
        ],
        "kitchen": [
            "high-gloss lacquered cabinets",
            "marble countertop with waterfall edge",
            "brass bar cart",
            "geometric tile floor",
        ],
        "bathroom": [
            "black-and-white geometric floor tile",
            "gold-framed mirror",
            "marble clad walls",
            "crystal sconce lighting",
        ],
    },
    layout_principles=[
        "bold geometric patterns at every scale",
        "symmetry and strong axial alignment",
        "metallic accents as linking element",
        "dark palette punctuated by gold",
    ],
    economy_substitutions={
        "polished brass": "gold-effect PVD coating",
        "marble": "marble-effect porcelain",
        "shagreen": "textured vinyl",
        "velvet": "polyester crushed velvet",
    },
    luxury_upgrades={
        "lacquered wood": "piano-finish lacquer with 12 coats",
        "polished brass": "24k gold-plated brass",
        "marble": "Nero Marquina marble",
        "velvet": "silk velvet",
    },
    lighting_keywords=[
        "tiered crystal chandeliers",
        "frosted glass fan sconces",
        "backlit onyx panels",
    ],
)

_RUSTIC = StyleDefinition(
    name="Rustic",
    slug="rustic",
    primary_colors=["#E8DCC8", "#B5A18E", "#7A6552", "#4A3728"],
    accent_colors=["#8B2500", "#2E5E3E"],
    preferred_materials=[
        "rough-hewn timber",
        "stone",
        "wrought iron",
        "burlap",
        "clay",
        "hand-forged metal",
    ],
    texture_keywords=["rough", "knotted", "hand-hewn", "unfinished", "earthy"],
    furniture_vocabulary={
        "living_room": [
            "heavy timber-frame sofa with linen cushions",
            "live-edge wood coffee table",
            "stone fireplace surround",
            "wrought iron candelabra",
            "hand-woven rug",
        ],
        "bedroom": [
            "log bed frame",
            "antique wooden chest at foot of bed",
            "iron bedside lantern",
            "patchwork quilt",
        ],
        "kitchen": [
            "open timber shelving",
            "farmhouse apron sink",
            "butcher block countertop",
            "cast-iron pot rack",
        ],
        "bathroom": [
            "natural stone basin",
            "wooden vanity from reclaimed barn wood",
            "copper faucet",
            "mason jar sconces",
        ],
    },
    layout_principles=[
        "celebrate natural imperfections",
        "heavy grounding pieces anchor the room",
        "nature-found objects as decoration",
        "visible joinery and construction",
    ],
    economy_substitutions={
        "rough-hewn timber": "distressed pine",
        "stone": "stone-veneer panel",
        "wrought iron": "tubular steel with black finish",
    },
    luxury_upgrades={
        "rough-hewn timber": "antique hand-hewn barn beam",
        "stone": "stacked fieldstone",
        "wrought iron": "hand-forged artisan ironwork",
    },
    lighting_keywords=["iron lantern pendants", "candle-style chandeliers", "mason jar sconces"],
)

_COASTAL = StyleDefinition(
    name="Coastal",
    slug="coastal",
    primary_colors=["#FFFFFF", "#E8F1F5", "#B5D3E7", "#F5E6CA"],
    accent_colors=["#2E86AB", "#D4A373"],
    preferred_materials=[
        "whitewashed wood",
        "seagrass",
        "linen",
        "driftwood",
        "rope",
        "light rattan",
    ],
    texture_keywords=["breezy", "weathered", "woven", "sun-bleached", "airy"],
    furniture_vocabulary={
        "living_room": [
            "slipcovered sofa in white linen",
            "driftwood coffee table",
            "seagrass storage baskets",
            "blue-and-white striped cushions",
            "large potted palm",
        ],
        "bedroom": [
            "whitewashed wood bed frame",
            "linen curtains floor to ceiling",
            "woven pendant light",
            "coral or shell decorative accents",
        ],
        "kitchen": [
            "shaker-style cabinets in white",
            "butcher block or quartz countertop",
            "open shelving with blue ceramics",
            "woven bar stools",
        ],
        "bathroom": [
            "pebble tile shower floor",
            "beadboard wainscoting",
            "rope-frame mirror",
            "light blue painted vanity",
        ],
    },
    layout_principles=[
        "maximise natural light — sheer window coverings",
        "open and airy floor plan",
        "neutral base with ocean-inspired accent colours",
        "indoor-outdoor flow",
    ],
    economy_substitutions={
        "driftwood": "whitewashed pine",
        "seagrass": "paper rope",
        "linen": "cotton duck cloth",
    },
    luxury_upgrades={
        "whitewashed wood": "reclaimed teak with white ceruse",
        "linen": "stonewashed Belgian linen",
        "light rattan": "hand-woven abaca",
    },
    lighting_keywords=[
        "rope-wrapped pendants",
        "capiz shell chandeliers",
        "nautical sconces",
    ],
)


class StyleDB:
    """In-memory registry of all built-in style definitions.

    Provides fast look-up by slug, iteration, and room-specific vocabulary
    extraction.  Services and agents use this as a read-only reference.
    """

    _STYLES: dict[str, StyleDefinition] = {
        "modern": _MODERN,
        "minimalist": _MINIMALIST,
        "scandinavian": _SCANDINAVIAN,
        "industrial": _INDUSTRIAL,
        "traditional": _TRADITIONAL,
        "bohemian": _BOHEMIAN,
        "mid_century": _MID_CENTURY,
        "japandi": _JAPANDI,
        "art_deco": _ART_DECO,
        "rustic": _RUSTIC,
        "coastal": _COASTAL,
    }

    @classmethod
    def get(cls, slug: str) -> StyleDefinition:
        """Return the ``StyleDefinition`` for *slug*, or raise ``KeyError``."""
        try:
            return cls._STYLES[slug]
        except KeyError:
            available = ", ".join(sorted(cls._STYLES))
            raise KeyError(
                f"Unknown style '{slug}'. Available: {available}"
            ) from None

    @classmethod
    def list_slugs(cls) -> list[str]:
        """Return a sorted list of all registered style slugs."""
        return sorted(cls._STYLES)

    @classmethod
    def all_styles(cls) -> list[StyleDefinition]:
        """Return all registered ``StyleDefinition`` objects."""
        return list(cls._STYLES.values())

    @classmethod
    def furniture_for(cls, slug: str, room_type: str) -> list[str]:
        """Return the furniture vocabulary for a style + room type combination.

        Falls back to an empty list if the room type is not explicitly covered.
        """
        style = cls.get(slug)
        return style.furniture_vocabulary.get(room_type, [])

    @classmethod
    def colors_for(cls, slug: str) -> dict[str, list[str]]:
        """Return primary and accent colours for a style."""
        style = cls.get(slug)
        return {
            "primary": style.primary_colors,
            "accent": style.accent_colors,
        }

    @classmethod
    def materials_for_budget(
        cls, slug: str, budget_tier: str
    ) -> list[str]:
        """Return the material list adjusted for a budget tier.

        For ``economy`` the preferred materials are swapped via
        ``economy_substitutions``.  For ``luxury`` they are upgraded via
        ``luxury_upgrades``.  ``mid_range`` and ``premium`` return the base
        preferred materials as-is.
        """
        style = cls.get(slug)
        base = list(style.preferred_materials)

        if budget_tier == "economy":
            return [
                style.economy_substitutions.get(m, m) for m in base
            ]
        if budget_tier == "luxury":
            return [
                style.luxury_upgrades.get(m, m) for m in base
            ]
        return base

    @classmethod
    def register(cls, definition: StyleDefinition) -> None:
        """Register a custom ``StyleDefinition`` (for plug-in styles)."""
        cls._STYLES[definition.slug] = definition
