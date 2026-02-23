"""
Prompt builder for the design generation agent.

Constructs detailed VLM prompts from room context, style preferences,
budget tier, and user constraints.  Includes room-type-specific templates
that incorporate spatial context from prior room analysis.
"""

from __future__ import annotations

from typing import Any

from openlintel_shared.schemas.design import BudgetTier, DesignStyle
from openlintel_shared.schemas.room import RoomType


# ---------------------------------------------------------------------------
# Style descriptions for prompt context
# ---------------------------------------------------------------------------

_STYLE_DESCRIPTIONS: dict[str, str] = {
    DesignStyle.MODERN: (
        "Clean lines, neutral color palette, open floor plans, minimal ornamentation. "
        "Materials: glass, steel, concrete, natural wood. Furniture with geometric forms."
    ),
    DesignStyle.CONTEMPORARY: (
        "Current trends, curved lines, bold accent colors, textural variety. "
        "Mix of materials, statement lighting, organic and geometric shapes coexisting."
    ),
    DesignStyle.MINIMALIST: (
        "Extreme simplicity, 'less is more' philosophy, monochromatic palette with one accent. "
        "Hidden storage, streamlined furniture, ample negative space, no clutter."
    ),
    DesignStyle.SCANDINAVIAN: (
        "Light and airy, white/light wood tones, functional yet cozy (hygge). "
        "Natural materials, simple forms, textured textiles (wool, linen), green plants."
    ),
    DesignStyle.INDUSTRIAL: (
        "Exposed brick, ductwork, and structural elements. Raw materials: metal, reclaimed wood, concrete. "
        "Edison bulbs, metal shelving, neutral palette with rust/black accents."
    ),
    DesignStyle.TRADITIONAL: (
        "Classic elegance, symmetry, rich wood tones, ornate details. "
        "Crown moldings, wainscoting, upholstered furniture, damask/floral patterns."
    ),
    DesignStyle.TRANSITIONAL: (
        "Blend of traditional warmth and contemporary simplicity. "
        "Neutral palette, clean lines with subtle curves, mix of textures, not overly ornate."
    ),
    DesignStyle.BOHEMIAN: (
        "Eclectic, colorful, layered textures and patterns. Global-inspired decor, "
        "mixed prints, macrame, rattan, collected-over-time aesthetic, warm jewel tones."
    ),
    DesignStyle.MID_CENTURY: (
        "1950s-60s inspired, organic curves, tapered legs, bold graphic patterns. "
        "Teak/walnut wood, mustard/teal/orange accents, iconic furniture forms."
    ),
    DesignStyle.ART_DECO: (
        "Glamorous, bold geometric patterns, rich colors (gold, navy, emerald). "
        "Luxurious materials: marble, brass, velvet, lacquer. Symmetry and opulence."
    ),
    DesignStyle.JAPANDI: (
        "Japanese minimalism meets Scandinavian coziness. Natural materials, earthy tones, "
        "wabi-sabi imperfection, functional simplicity, thoughtful craft details."
    ),
    DesignStyle.RUSTIC: (
        "Warm, natural, rugged charm. Reclaimed wood, stone, wrought iron. "
        "Earth tones, exposed beams, handcrafted elements, cozy textiles."
    ),
    DesignStyle.COASTAL: (
        "Light, breezy, beach-inspired. White/blue/sand palette, natural fibers (jute, rattan). "
        "Driftwood accents, sheer curtains, ocean-inspired accessories."
    ),
}


# ---------------------------------------------------------------------------
# Budget tier material guidance
# ---------------------------------------------------------------------------

_BUDGET_GUIDANCE: dict[str, str] = {
    BudgetTier.ECONOMY: (
        "Budget-conscious selections. Use laminate/vinyl flooring instead of hardwood, "
        "MDF instead of solid wood, basic hardware, standard lighting fixtures. "
        "Ready-to-assemble furniture, fabric upholstery, basic tile options. "
        "Focus on paint and soft furnishing changes for maximum impact at lowest cost."
    ),
    BudgetTier.MID_RANGE: (
        "Good quality mid-range materials. Engineered hardwood, quartz countertops, "
        "quality hardware, semi-custom cabinetry, well-made furniture brands. "
        "Mix of statement pieces and practical basics. Good quality tiles, "
        "decorative light fixtures, quality textiles."
    ),
    BudgetTier.PREMIUM: (
        "High-quality materials throughout. Solid hardwood, natural stone, "
        "custom cabinetry, designer furniture, premium hardware and fixtures. "
        "Quality brands, attention to detail, cohesive material palette."
    ),
    BudgetTier.LUXURY: (
        "Top-tier, no-compromise selections. Exotic hardwoods, Italian marble, "
        "bespoke/custom furniture, designer lighting (Flos, Moooi, etc.), "
        "integrated smart home features, premium appliances (Sub-Zero, Miele), "
        "handcrafted details, rare/artisan materials."
    ),
}


# ---------------------------------------------------------------------------
# Room-type-specific prompt templates
# ---------------------------------------------------------------------------

_ROOM_TEMPLATES: dict[str, str] = {
    RoomType.LIVING_ROOM: (
        "Design a {style} living room. Consider seating arrangement for conversation, "
        "TV/entertainment placement, traffic flow, and a focal point (fireplace/art wall/window view). "
        "Include ambient, task, and accent lighting layers. "
        "Ensure comfortable circulation paths (minimum 900mm between furniture)."
    ),
    RoomType.BEDROOM: (
        "Design a {style} bedroom. Prioritize restful ambiance, bed placement (ideally not directly "
        "facing the door), adequate storage (wardrobe/closet), bedside lighting, and blackout capability. "
        "Include a reading nook or vanity area if space permits. "
        "Consider acoustic comfort and soft textures."
    ),
    RoomType.KITCHEN: (
        "Design a {style} kitchen. Optimize the work triangle (sink-stove-fridge), include adequate "
        "counter workspace, storage (upper and lower cabinets), and task lighting over work surfaces. "
        "Consider ventilation, backsplash material, and easy-clean surfaces. "
        "Include dining/breakfast area if space allows."
    ),
    RoomType.BATHROOM: (
        "Design a {style} bathroom. Prioritize waterproofing, ventilation, non-slip flooring, "
        "and adequate lighting (both task and ambient). Include storage for toiletries, "
        "proper mirror placement with lighting, and consider towel storage/warming. "
        "Ensure fixture placement allows comfortable use."
    ),
    RoomType.DINING: (
        "Design a {style} dining room. Center the dining table with adequate space for chair movement "
        "(minimum 900mm from table edge to wall). Include a statement pendant/chandelier over the table, "
        "sideboard/buffet for storage, and consider table sizing for the household. "
        "Create an atmosphere suited for both daily meals and entertaining."
    ),
    RoomType.STUDY: (
        "Design a {style} study/home office. Prioritize ergonomic desk setup with proper lighting "
        "(natural light from the side, task lighting), cable management, bookshelves/storage, "
        "and acoustic privacy. Include comfortable seating for focused work "
        "and a secondary seating area for reading if space permits."
    ),
    RoomType.BALCONY: (
        "Design a {style} balcony space. Consider weather-resistant materials, "
        "space-efficient furniture, planters/greenery, privacy screening if needed, "
        "and outdoor lighting. Create a cozy retreat for relaxation or morning coffee. "
        "Account for sun exposure direction and wind patterns."
    ),
    RoomType.FOYER: (
        "Design a {style} foyer/entryway. Include console table or wall shelf, "
        "key/coat storage, mirror, adequate lighting for a welcoming first impression. "
        "Consider durable flooring materials for high-traffic area and shoe storage solutions."
    ),
    RoomType.POOJA_ROOM: (
        "Design a {style} pooja room. Create a serene, sacred atmosphere with appropriate "
        "altar/mandir placement, marble or wood platform, brass/copper accents, "
        "warm lighting (diyas/LED alternatives), incense ventilation, and storage "
        "for prayer items. Use calming colors and minimal distractions."
    ),
}

# Default template for room types not specifically listed
_DEFAULT_ROOM_TEMPLATE = (
    "Design a {style} {room_type} space. Consider the room's primary function, "
    "traffic flow, lighting needs, storage requirements, and overall comfort. "
    "Ensure the design is practical and visually cohesive."
)


class PromptBuilder:
    """Builds detailed VLM prompts for room design generation.

    Composes prompts from room analysis context, style preferences,
    budget constraints, and user-specified constraints.
    """

    def build_design_prompt(
        self,
        *,
        style: DesignStyle,
        budget_tier: BudgetTier,
        room_type: str,
        constraints: list[str],
        room_analysis: dict[str, Any] | None = None,
        room_name: str = "",
        dimensions: dict[str, float] | None = None,
        variant_index: int = 0,
    ) -> str:
        """Build a complete design generation prompt.

        Parameters
        ----------
        style:
            Target design style.
        budget_tier:
            Budget bracket.
        room_type:
            Room type string (should match ``RoomType`` enum values).
        constraints:
            User-specified constraints.
        room_analysis:
            VLM analysis of the room photo (from ``RoomAnalyzer``).
        room_name:
            Human-readable room name (e.g. "Master Bedroom").
        dimensions:
            Known room dimensions ``{length_mm, width_mm, height_mm}``.
        variant_index:
            Which variant is being generated (0-based). Used to add variation
            instructions for multiple variants.

        Returns
        -------
        str
            The complete VLM prompt.
        """
        sections: list[str] = []

        # ── Header ────────────────────────────────────────────────────────
        room_label = room_name or room_type.replace("_", " ").title()
        sections.append(
            f"# Interior Design Brief: {room_label}\n"
            f"Generate a detailed {style.value.replace('_', ' ')} interior design "
            f"proposal for this {room_type.replace('_', ' ')}."
        )

        # ── Room-specific template ────────────────────────────────────────
        try:
            rt_enum = RoomType(room_type)
            template = _ROOM_TEMPLATES.get(rt_enum, _DEFAULT_ROOM_TEMPLATE)
        except ValueError:
            template = _DEFAULT_ROOM_TEMPLATE

        sections.append(
            "## Room Design Requirements\n"
            + template.format(
                style=style.value.replace("_", " "),
                room_type=room_type.replace("_", " "),
            )
        )

        # ── Style guidance ────────────────────────────────────────────────
        style_desc = _STYLE_DESCRIPTIONS.get(style, "")
        if style_desc:
            sections.append(f"## Style: {style.value.replace('_', ' ').title()}\n{style_desc}")

        # ── Budget guidance ───────────────────────────────────────────────
        budget_desc = _BUDGET_GUIDANCE.get(budget_tier, "")
        if budget_desc:
            sections.append(
                f"## Budget Tier: {budget_tier.value.replace('_', ' ').title()}\n{budget_desc}"
            )

        # ── Spatial context from room analysis ────────────────────────────
        if room_analysis and not room_analysis.get("parse_error"):
            sections.append(self._format_room_context(room_analysis))

        # ── Known dimensions from DB ──────────────────────────────────────
        if dimensions:
            length_m = dimensions.get("length_mm", 0) / 1000
            width_m = dimensions.get("width_mm", 0) / 1000
            height_m = dimensions.get("height_mm", 2700) / 1000
            if length_m > 0 and width_m > 0:
                sections.append(
                    f"## Known Room Dimensions\n"
                    f"- Length: {length_m:.1f}m\n"
                    f"- Width: {width_m:.1f}m\n"
                    f"- Height: {height_m:.1f}m\n"
                    f"- Area: {length_m * width_m:.1f} sq.m"
                )

        # ── User constraints ──────────────────────────────────────────────
        if constraints:
            constraint_lines = "\n".join(f"- {c}" for c in constraints)
            sections.append(
                f"## MANDATORY Constraints (must be strictly followed)\n{constraint_lines}"
            )

        # ── Variant variation instructions ────────────────────────────────
        if variant_index > 0:
            variation_hints = [
                "Explore a different furniture layout while keeping the same style.",
                "Use an alternative color accent while maintaining the overall palette.",
                "Vary the lighting design and fixture choices.",
                "Try a different focal point arrangement.",
            ]
            hint = variation_hints[variant_index % len(variation_hints)]
            sections.append(
                f"## Variant #{variant_index + 1} Instructions\n"
                f"This is variant {variant_index + 1}. {hint} "
                f"Make this design distinctly different from previous variants "
                f"while staying within the {style.value.replace('_', ' ')} style."
            )

        # ── Output format ─────────────────────────────────────────────────
        sections.append(self._output_format_instructions())

        return "\n\n".join(sections)

    def build_refinement_prompt(
        self,
        *,
        original_prompt: str,
        evaluation_feedback: str,
        iteration: int,
    ) -> str:
        """Build a refinement prompt based on evaluation feedback.

        Used when a generated design does not pass evaluation and needs
        to be regenerated with corrections.

        Parameters
        ----------
        original_prompt:
            The prompt that produced the unsatisfactory design.
        evaluation_feedback:
            Feedback from the evaluator explaining what needs improvement.
        iteration:
            Current iteration number (1-based).

        Returns
        -------
        str
            Refined prompt incorporating the feedback.
        """
        return (
            f"{original_prompt}\n\n"
            f"## Refinement (Iteration {iteration})\n"
            f"The previous design attempt did not meet quality criteria. "
            f"Please address the following feedback and generate an improved version:\n\n"
            f"{evaluation_feedback}\n\n"
            f"Focus specifically on the issues mentioned above while maintaining "
            f"all other design requirements and constraints."
        )

    @staticmethod
    def _format_room_context(analysis: dict[str, Any]) -> str:
        """Format room analysis data into prompt context.

        Parameters
        ----------
        analysis:
            Structured room analysis from ``RoomAnalyzer``.

        Returns
        -------
        str
            Formatted context section for the prompt.
        """
        parts: list[str] = ["## Current Room Analysis (from photo)"]

        # Current style
        current_style = analysis.get("current_style")
        if current_style and current_style != "unknown":
            parts.append(f"- Current style: {current_style}")

        # Condition
        condition = analysis.get("condition")
        if condition:
            parts.append(f"- Room condition: {condition}")

        # Existing furniture
        furniture = analysis.get("existing_furniture", [])
        if furniture:
            items = ", ".join(
                f['item'] if isinstance(f, dict) else str(f) for f in furniture[:8]
            )
            parts.append(f"- Existing furniture: {items}")

        # Materials
        materials = analysis.get("current_materials", {})
        if materials:
            mat_parts = []
            if materials.get("flooring"):
                mat_parts.append(f"floors: {materials['flooring']}")
            if materials.get("walls"):
                mat_parts.append(f"walls: {materials['walls']}")
            if materials.get("ceiling"):
                mat_parts.append(f"ceiling: {materials['ceiling']}")
            if mat_parts:
                parts.append(f"- Current materials: {', '.join(mat_parts)}")

        # Lighting
        lighting = analysis.get("lighting", {})
        if lighting.get("natural_light_quality"):
            parts.append(f"- Natural light: {lighting['natural_light_quality']}")

        # Architectural features
        arch = analysis.get("architectural_features", {})
        notable = arch.get("notable_features", [])
        if notable:
            parts.append(f"- Notable features: {', '.join(notable[:5])}")

        windows = arch.get("windows", {})
        if windows.get("count"):
            parts.append(f"- Windows: {windows['count']} ({windows.get('type', 'standard')})")

        # Constraints detected
        detected_constraints = analysis.get("constraints_detected", [])
        if detected_constraints:
            parts.append(
                "- Structural constraints detected: "
                + ", ".join(detected_constraints[:5])
            )

        # Design opportunities
        opportunities = analysis.get("design_opportunities", [])
        if opportunities:
            parts.append("- Design opportunities: " + ", ".join(opportunities[:5]))

        return "\n".join(parts)

    @staticmethod
    def _output_format_instructions() -> str:
        """Return the structured output format instructions for the VLM."""
        return """\
## Required Output Format

Provide your design as a detailed description followed by a JSON specification:

1. **Written Description** — A paragraph describing the overall design concept, key choices, and how they address the brief.

2. **Design Specification** — A JSON block with the following structure:

```json
{
  "concept_name": "<creative name for this design>",
  "color_palette": {
    "primary": "<hex color>",
    "secondary": "<hex color>",
    "accent": "<hex color>",
    "neutral": "<hex color>"
  },
  "furniture": [
    {
      "item": "<name>",
      "material": "<material>",
      "color": "<color>",
      "placement": "<where in the room>",
      "estimated_cost_usd": <number>
    }
  ],
  "materials": {
    "flooring": {"type": "<material>", "color": "<color>"},
    "walls": {"type": "<finish>", "color": "<color>"},
    "ceiling": {"type": "<finish>", "color": "<color>"}
  },
  "lighting": [
    {
      "fixture": "<name/type>",
      "placement": "<where>",
      "purpose": "ambient | task | accent"
    }
  ],
  "textiles": [
    {"item": "<curtains/rugs/cushions/etc.>", "material": "<fabric>", "color": "<color>"}
  ],
  "decor": [
    {"item": "<art/plants/accessories>", "placement": "<where>"}
  ],
  "estimated_total_cost_usd": <number>,
  "design_rationale": "<why these specific choices work together>"
}
```"""
