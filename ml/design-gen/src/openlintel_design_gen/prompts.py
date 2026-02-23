"""
VLM prompt templates for design generation.

Templates are parameterised by room type, design style, and budget tier.
The ``PromptBuilder`` class hydrates templates with concrete vocabulary
from ``StyleDB`` so the VLM receives grounded, specific instructions
rather than vague style names.
"""

from __future__ import annotations

from typing import Any

from openlintel_design_gen.style_db import StyleDB

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are OpenLintel, an expert interior designer AI.  You analyse room
photographs, understand spatial constraints, and produce detailed design
specifications.  Your designs are practical, buildable, and budget-aware.

Rules:
- Dimensions are always in millimetres (mm).
- Respond ONLY with valid JSON — no prose, no markdown fences.
- Every furniture piece must include name, approximate dimensions (L x W x H
  in mm), material, colour, and placement coordinates relative to the room
  origin (top-left corner of the floor plan, in mm).
- Include lighting plan, colour scheme, and material schedule.
"""

# ---------------------------------------------------------------------------
# Room analysis prompt (used with a room photo)
# ---------------------------------------------------------------------------

ROOM_ANALYSIS_TEMPLATE = """\
Analyse this room photograph and return a JSON object with:

{{
  "room_type": "<detected room type>",
  "estimated_dimensions": {{
    "length_mm": <int>,
    "width_mm": <int>,
    "height_mm": <int>
  }},
  "existing_elements": [
    {{
      "type": "<wall|floor|ceiling|window|door|column|beam|outlet|switch>",
      "position": "<description>",
      "material": "<detected material>",
      "condition": "<good|fair|poor>"
    }}
  ],
  "natural_light": {{
    "direction": "<N|S|E|W|NE|NW|SE|SW|unknown>",
    "intensity": "<low|medium|high>",
    "window_count": <int>
  }},
  "constraints": [
    "<any structural or spatial constraints you observe>"
  ]
}}
"""

# ---------------------------------------------------------------------------
# Design generation prompt
# ---------------------------------------------------------------------------

DESIGN_GENERATION_TEMPLATE = """\
Design a {style_name} interior for this {room_type}.

Room analysis:
{room_analysis_json}

Style vocabulary:
- Furniture: {furniture_list}
- Materials (budget: {budget_tier}): {materials_list}
- Colour palette — primary: {primary_colors}, accent: {accent_colors}
- Textures: {texture_keywords}
- Layout rules: {layout_principles}
- Lighting: {lighting_keywords}

Budget tier: {budget_tier}

Return a JSON object:
{{
  "design_name": "<creative name for this design>",
  "style": "{style_slug}",
  "budget_tier": "{budget_tier}",
  "colour_scheme": {{
    "walls": "<colour>",
    "ceiling": "<colour>",
    "floor": "<material and colour>",
    "accent": "<colour>"
  }},
  "furniture": [
    {{
      "name": "<piece name>",
      "category": "<seating|table|storage|lighting|decor|textile>",
      "material": "<material>",
      "colour": "<colour>",
      "dimensions_mm": {{ "length": <int>, "width": <int>, "height": <int> }},
      "position_mm": {{ "x": <int>, "y": <int>, "z": <int> }},
      "rotation_deg": <float>,
      "estimated_cost_usd": <float>
    }}
  ],
  "lighting_plan": [
    {{
      "type": "<ambient|task|accent|decorative>",
      "fixture": "<fixture description>",
      "position_mm": {{ "x": <int>, "y": <int>, "z": <int> }},
      "colour_temp_k": <int>,
      "lumens": <int>
    }}
  ],
  "material_schedule": [
    {{
      "surface": "<walls|floor|ceiling|backsplash|countertop|...>",
      "material": "<material name>",
      "finish": "<finish type>",
      "area_sqm": <float>,
      "estimated_cost_per_sqm_usd": <float>
    }}
  ],
  "total_estimated_cost_usd": <float>,
  "design_notes": "<brief rationale for key decisions>"
}}
"""

# ---------------------------------------------------------------------------
# Evaluation prompt
# ---------------------------------------------------------------------------

EVALUATION_TEMPLATE = """\
You are a senior interior design reviewer.  Evaluate the following design
specification against the original room analysis and style requirements.

Room analysis:
{room_analysis_json}

Style requested: {style_name} ({style_slug})
Budget tier: {budget_tier}

Design specification:
{design_spec_json}

Score each criterion from 1-10 and provide feedback.  Return JSON:
{{
  "scores": {{
    "style_coherence": <int>,
    "spatial_feasibility": <int>,
    "budget_adherence": <int>,
    "lighting_adequacy": <int>,
    "material_consistency": <int>,
    "overall": <int>
  }},
  "issues": [
    {{
      "severity": "<critical|major|minor>",
      "category": "<spatial|style|budget|lighting|material>",
      "description": "<what is wrong>",
      "suggestion": "<how to fix>"
    }}
  ],
  "approved": <true if overall >= 7 and no critical issues, else false>,
  "revision_instructions": "<if not approved, specific instructions for the designer>"
}}
"""

# ---------------------------------------------------------------------------
# Image generation prompt (for text-to-image models)
# ---------------------------------------------------------------------------

IMAGE_PROMPT_TEMPLATE = """\
Photorealistic interior design render, {style_name} style {room_type}.
{furniture_description}
Materials: {materials_description}.
Colour palette: {colors_description}.
Lighting: {lighting_description}.
Professional architectural photography, wide-angle lens, eye-level perspective,
natural daylight complemented by {lighting_keywords}.
8K resolution, ultra-detailed, award-winning interior photography.
"""


class PromptBuilder:
    """Hydrate prompt templates with style-specific vocabulary.

    This class bridges the ``StyleDB`` definitions and the raw prompt
    templates, producing fully-formed prompt strings ready for VLM
    consumption.
    """

    @staticmethod
    def room_analysis() -> tuple[str, str]:
        """Return ``(system_prompt, user_prompt)`` for room analysis.

        The user prompt is designed to accompany a room photograph as
        a multi-modal message.
        """
        return SYSTEM_PROMPT.strip(), ROOM_ANALYSIS_TEMPLATE.strip()

    @staticmethod
    def design_generation(
        room_type: str,
        style_slug: str,
        budget_tier: str,
        room_analysis_json: str,
    ) -> tuple[str, str]:
        """Build the design generation prompt.

        Parameters
        ----------
        room_type:
            Room type slug (e.g. ``"living_room"``).
        style_slug:
            Style slug (e.g. ``"modern"``).
        budget_tier:
            One of ``economy``, ``mid_range``, ``premium``, ``luxury``.
        room_analysis_json:
            Serialised JSON from the room-analysis step.

        Returns
        -------
        tuple[str, str]
            ``(system_prompt, user_prompt)``
        """
        style = StyleDB.get(style_slug)
        furniture = StyleDB.furniture_for(style_slug, room_type)
        materials = StyleDB.materials_for_budget(style_slug, budget_tier)
        colors = StyleDB.colors_for(style_slug)

        user_prompt = DESIGN_GENERATION_TEMPLATE.format(
            style_name=style.name,
            style_slug=style_slug,
            room_type=room_type.replace("_", " "),
            room_analysis_json=room_analysis_json,
            budget_tier=budget_tier,
            furniture_list=", ".join(furniture) if furniture else "use style-appropriate pieces",
            materials_list=", ".join(materials),
            primary_colors=", ".join(colors["primary"]),
            accent_colors=", ".join(colors["accent"]),
            texture_keywords=", ".join(style.texture_keywords),
            layout_principles="; ".join(style.layout_principles),
            lighting_keywords=", ".join(style.lighting_keywords),
        )

        return SYSTEM_PROMPT.strip(), user_prompt.strip()

    @staticmethod
    def evaluation(
        style_slug: str,
        budget_tier: str,
        room_analysis_json: str,
        design_spec_json: str,
    ) -> tuple[str, str]:
        """Build the evaluation / QA prompt.

        Returns
        -------
        tuple[str, str]
            ``(system_prompt, user_prompt)``
        """
        style = StyleDB.get(style_slug)

        user_prompt = EVALUATION_TEMPLATE.format(
            style_name=style.name,
            style_slug=style_slug,
            budget_tier=budget_tier,
            room_analysis_json=room_analysis_json,
            design_spec_json=design_spec_json,
        )

        return SYSTEM_PROMPT.strip(), user_prompt.strip()

    @staticmethod
    def image_generation(
        room_type: str,
        style_slug: str,
        budget_tier: str,
        design_spec: dict[str, Any],
    ) -> str:
        """Build a text-to-image prompt from the design specification.

        Returns a single prompt string (no system prompt needed for
        image-generation APIs).
        """
        style = StyleDB.get(style_slug)
        materials = StyleDB.materials_for_budget(style_slug, budget_tier)
        colors = StyleDB.colors_for(style_slug)

        # Build furniture description from spec
        furniture_items = design_spec.get("furniture", [])
        furniture_desc = "; ".join(
            f"{item['name']} in {item.get('material', 'mixed material')}"
            for item in furniture_items[:6]  # Keep prompt concise
        ) or "carefully curated furniture pieces"

        prompt = IMAGE_PROMPT_TEMPLATE.format(
            style_name=style.name,
            room_type=room_type.replace("_", " "),
            furniture_description=furniture_desc,
            materials_description=", ".join(materials[:4]),
            colors_description=(
                f"primary tones {', '.join(colors['primary'][:3])}, "
                f"accent {', '.join(colors['accent'][:2])}"
            ),
            lighting_description="; ".join(style.lighting_keywords[:2]),
            lighting_keywords=", ".join(style.lighting_keywords),
        )

        return prompt.strip()
