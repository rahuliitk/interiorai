"""
Design-related Pydantic models — mirrors ``@openlintel/core`` TypeScript types.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DesignStyle(str, Enum):
    """Interior design style families."""

    MODERN = "modern"
    CONTEMPORARY = "contemporary"
    MINIMALIST = "minimalist"
    SCANDINAVIAN = "scandinavian"
    INDUSTRIAL = "industrial"
    TRADITIONAL = "traditional"
    TRANSITIONAL = "transitional"
    BOHEMIAN = "bohemian"
    MID_CENTURY = "mid_century"
    ART_DECO = "art_deco"
    JAPANDI = "japandi"
    RUSTIC = "rustic"
    COASTAL = "coastal"


class BudgetTier(str, Enum):
    """Budget bracket for a design variant."""

    ECONOMY = "economy"
    MID_RANGE = "mid_range"
    PREMIUM = "premium"
    LUXURY = "luxury"


class DesignVariant(BaseModel):
    """A single design variant generated for a room."""

    id: str
    room_id: str = Field(alias="roomId")
    name: str
    style: DesignStyle
    budget_tier: BudgetTier = Field(alias="budgetTier")
    render_url: str | None = Field(default=None, alias="renderUrl")
    spec_json: dict[str, Any] | None = Field(
        default=None,
        description="Full design specification JSON blob",
    )
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}
