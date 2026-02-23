"""
Material substitution reasoning engine.

Provides intelligent material substitution suggestions by analysing trade-offs
between cost, durability, aesthetics, and sustainability.  The LLM enriches
rule-based logic with contextual recommendations.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from openlintel_shared.llm import LiteLLMClient
from openlintel_shared.schemas.design import BudgetTier

from src.agents.material_db import (
    MATERIAL_DATABASE,
    MaterialSpec,
    find_substitutes,
    get_price_for_tier,
)
from src.models.bom import SubstitutionOption, SubstitutionReason

logger = structlog.get_logger(__name__)


# -- Rule-based substitution knowledge base ---------------------------------

SUBSTITUTION_RULES: dict[str, dict[str, Any]] = {
    # MDF vs Plywood trade-offs
    "mdf_18mm": {
        "vs": {
            "bwr_plywood_18mm": {
                "cost_impact_percent": -40.0,
                "quality_impact": (
                    "MDF has smoother surface for painting but is weaker structurally, "
                    "not moisture-resistant, and prone to swelling. Not recommended for "
                    "kitchen carcasses or areas near water."
                ),
                "reason": SubstitutionReason.BUDGET,
            },
            "mr_plywood_18mm": {
                "cost_impact_percent": -30.0,
                "quality_impact": (
                    "MDF is cheaper and offers smoother surface finish, but MR plywood "
                    "provides better screw-holding strength and moisture resistance."
                ),
                "reason": SubstitutionReason.BUDGET,
            },
        },
    },
    "particle_board_18mm": {
        "vs": {
            "mdf_18mm": {
                "cost_impact_percent": -25.0,
                "quality_impact": (
                    "Particle board is the most economical option. Pre-laminated particle "
                    "board eliminates need for separate laminate but has poor screw-holding "
                    "and is not suitable for heavy loads or moist areas."
                ),
                "reason": SubstitutionReason.BUDGET,
            },
            "bwr_plywood_18mm": {
                "cost_impact_percent": -55.0,
                "quality_impact": (
                    "Significant cost saving but major trade-off in durability, moisture "
                    "resistance, and load-bearing capacity. Suitable only for dry, "
                    "low-stress applications like study tables and wardrobes in bedrooms."
                ),
                "reason": SubstitutionReason.BUDGET,
            },
        },
    },
    "hdhmr_18mm": {
        "vs": {
            "bwr_plywood_18mm": {
                "cost_impact_percent": -15.0,
                "quality_impact": (
                    "HDHMR offers consistent density and no core voids unlike plywood. "
                    "Good moisture resistance and termite proof. Slightly lower screw-holding "
                    "than BWR plywood but better than MDF."
                ),
                "reason": SubstitutionReason.DURABILITY,
            },
        },
    },
    # Flooring trade-offs
    "ceramic_tiles_600x600": {
        "vs": {
            "vitrified_tiles_600x600": {
                "cost_impact_percent": -30.0,
                "quality_impact": (
                    "Ceramic tiles are more affordable but less dense and durable than "
                    "vitrified. They have higher water absorption (3-6% vs <0.5%) and "
                    "are better suited for walls and low-traffic areas."
                ),
                "reason": SubstitutionReason.BUDGET,
            },
        },
    },
    "laminate_flooring": {
        "vs": {
            "vitrified_tiles_600x600": {
                "cost_impact_percent": +10.0,
                "quality_impact": (
                    "Laminate flooring provides a warm wood-look aesthetic without wet "
                    "work. Easy DIY installation via click-lock system. However, it cannot "
                    "be refinished and is susceptible to moisture damage at joints."
                ),
                "reason": SubstitutionReason.AESTHETICS,
            },
            "vinyl_flooring": {
                "cost_impact_percent": +5.0,
                "quality_impact": (
                    "Laminate offers a more rigid and natural wood feel compared to vinyl. "
                    "However, vinyl is 100% waterproof and more suitable for kitchens "
                    "and bathrooms."
                ),
                "reason": SubstitutionReason.AESTHETICS,
            },
        },
    },
    "vinyl_flooring": {
        "vs": {
            "vitrified_tiles_600x600": {
                "cost_impact_percent": +5.0,
                "quality_impact": (
                    "Vinyl (SPC/LVT) provides cushioned comfort, waterproof performance, "
                    "and simple click-lock installation. It lacks the perceived permanence "
                    "and resale value of tiles but is ideal for rentals and quick renovations."
                ),
                "reason": SubstitutionReason.AESTHETICS,
            },
        },
    },
    # Paint trade-offs
    "texture_paint": {
        "vs": {
            "interior_emulsion": {
                "cost_impact_percent": +80.0,
                "quality_impact": (
                    "Texture paint adds visual depth and hides minor surface imperfections. "
                    "It is more durable and washable than standard emulsion but costs "
                    "significantly more and requires skilled applicators."
                ),
                "reason": SubstitutionReason.AESTHETICS,
            },
        },
    },
}


def get_rule_based_substitutions(
    material_key: str,
    budget_tier: BudgetTier,
) -> list[SubstitutionOption]:
    """Generate substitution options using the rule-based knowledge base.

    Parameters
    ----------
    material_key:
        Canonical key of the original material.
    budget_tier:
        The target budget tier for the project.

    Returns
    -------
    list[SubstitutionOption]
        Substitution options with cost impact and quality analysis.
    """
    results: list[SubstitutionOption] = []
    original_spec = MATERIAL_DATABASE.get(material_key)
    if original_spec is None:
        return results

    # Check rule-based knowledge
    rules = SUBSTITUTION_RULES.get(material_key, {}).get("vs", {})

    # Also check reverse rules (where this material is the substitute)
    for other_key, other_rules in SUBSTITUTION_RULES.items():
        vs_dict = other_rules.get("vs", {})
        if material_key in vs_dict:
            rule = vs_dict[material_key]
            other_spec = MATERIAL_DATABASE.get(other_key)
            if other_spec is not None:
                results.append(
                    SubstitutionOption(
                        original_material=original_spec.name,
                        substitute_material=other_spec.name,
                        reason=rule["reason"],
                        cost_impact_percent=-rule["cost_impact_percent"],
                        quality_impact=rule["quality_impact"],
                        recommendation=(
                            f"Consider {other_spec.name} as an upgrade from "
                            f"{original_spec.name}."
                        ),
                    )
                )

    # Check direct rules
    for sub_key, rule in rules.items():
        sub_spec = MATERIAL_DATABASE.get(sub_key)
        if sub_spec is not None:
            results.append(
                SubstitutionOption(
                    original_material=original_spec.name,
                    substitute_material=sub_spec.name,
                    reason=rule["reason"],
                    cost_impact_percent=rule["cost_impact_percent"],
                    quality_impact=rule["quality_impact"],
                    recommendation=(
                        f"Switching from {original_spec.name} to {sub_spec.name} "
                        f"{'saves' if rule['cost_impact_percent'] < 0 else 'costs'} "
                        f"approximately {abs(rule['cost_impact_percent']):.0f}%."
                    ),
                )
            )

    # Also generate from the material database substitutes list
    for sub_spec in find_substitutes(material_key):
        already_listed = any(
            s.substitute_material == sub_spec.name for s in results
        )
        if not already_listed:
            original_price = get_price_for_tier(material_key, budget_tier) or 0.0
            sub_price = get_price_for_tier(
                next(
                    (k for k, v in MATERIAL_DATABASE.items() if v.name == sub_spec.name),
                    "",
                ),
                budget_tier,
            ) or 0.0

            if original_price > 0:
                cost_diff = ((sub_price - original_price) / original_price) * 100
            else:
                cost_diff = 0.0

            results.append(
                SubstitutionOption(
                    original_material=original_spec.name,
                    substitute_material=sub_spec.name,
                    reason=(
                        SubstitutionReason.BUDGET
                        if cost_diff < 0
                        else SubstitutionReason.AESTHETICS
                    ),
                    cost_impact_percent=round(cost_diff, 1),
                    quality_impact=f"Alternative in the same category: {sub_spec.description}",
                    recommendation=(
                        f"{sub_spec.name} is a viable alternative to {original_spec.name}."
                    ),
                )
            )

    return results


async def get_llm_substitution_reasoning(
    llm_client: LiteLLMClient,
    original_material: str,
    substitute_material: str,
    room_type: str,
    budget_tier: str,
    *,
    encrypted_key: str | None = None,
    iv: str | None = None,
    auth_tag: str | None = None,
    plain_api_key: str | None = None,
) -> str:
    """Use the LLM to generate a detailed substitution recommendation.

    Parameters
    ----------
    llm_client:
        The LiteLLM client instance.
    original_material:
        Name of the original material.
    substitute_material:
        Name of the proposed substitute.
    room_type:
        Type of room (e.g. kitchen, bedroom).
    budget_tier:
        Budget tier for the project.

    Returns
    -------
    str
        A concise recommendation paragraph.
    """
    prompt = f"""You are an interior design materials expert for the Indian market.

Analyse this material substitution and provide a concise recommendation (2-3 sentences):

Original Material: {original_material}
Proposed Substitute: {substitute_material}
Room Type: {room_type}
Budget Tier: {budget_tier}

Consider:
1. Durability and moisture resistance for this room type
2. Cost-effectiveness for the budget tier
3. Aesthetic compatibility
4. Availability in the Indian market
5. Installation complexity

Provide your recommendation in plain text, no markdown."""

    try:
        response = await llm_client.completion(
            model="openai/gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            encrypted_key=encrypted_key,
            iv=iv,
            auth_tag=auth_tag,
            plain_api_key=plain_api_key,
            temperature=0.3,
            max_tokens=200,
        )
        content = response.choices[0].message.content
        return content.strip() if content else "No recommendation available."
    except Exception:
        logger.warning("llm_substitution_reasoning_failed", exc_info=True)
        return "Automated recommendation unavailable. Please consult a materials specialist."
