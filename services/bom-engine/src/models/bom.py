"""
Pydantic models for the BOM Engine service.

Defines request/response shapes for BOM generation, retrieval, and export.
All internal measurements use millimetres; costs use INR by default.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from openlintel_shared.schemas.bom import BOMItem, MaterialCategory
from openlintel_shared.schemas.design import BudgetTier, DesignStyle
from openlintel_shared.schemas.room import Dimensions, RoomType


# -- Enumerations -----------------------------------------------------------

class BOMStatus(str, Enum):
    """Processing status for a BOM generation job."""

    PENDING = "pending"
    EXTRACTING = "extracting"
    CALCULATING = "calculating"
    PRICING = "pricing"
    OPTIMIZING = "optimizing"
    COMPLETE = "complete"
    FAILED = "failed"


class ExportFormat(str, Enum):
    """Supported export formats."""

    EXCEL = "excel"
    CSV = "csv"
    PDF = "pdf"


class SubstitutionReason(str, Enum):
    """Reason for a material substitution suggestion."""

    BUDGET = "budget"
    AVAILABILITY = "availability"
    DURABILITY = "durability"
    SUSTAINABILITY = "sustainability"
    AESTHETICS = "aesthetics"


# -- Sub-models -------------------------------------------------------------

class RoomInput(BaseModel):
    """Room data supplied for BOM generation."""

    id: str
    name: str
    type: RoomType
    dimensions: Dimensions
    floor: int = 0


class DesignVariantInput(BaseModel):
    """Design variant data supplied for BOM generation."""

    id: str
    room_id: str = Field(alias="roomId")
    name: str
    style: DesignStyle
    budget_tier: BudgetTier = Field(alias="budgetTier")
    spec_json: dict[str, Any] = Field(
        default_factory=dict,
        description="Full design specification JSON blob from the design engine",
    )

    model_config = {"populate_by_name": True}


class MaterialPrice(BaseModel):
    """Price information for a material."""

    material_name: str = Field(description="Canonical material name")
    unit_price: Annotated[float, Field(ge=0, description="Price per unit in currency")]
    unit: str = Field(description="Unit of measurement (sqft, sqm, nos, rft, etc.)")
    currency: str = Field(default="INR", description="ISO 4217 currency code")
    source: str = Field(default="estimated", description="Price source: catalog, market, estimated")
    last_updated: datetime | None = Field(default=None, description="When the price was last verified")


class SubstitutionOption(BaseModel):
    """A material substitution suggestion."""

    original_material: str = Field(description="Name of the original material")
    substitute_material: str = Field(description="Name of the suggested substitute")
    reason: SubstitutionReason
    cost_impact_percent: float = Field(
        description="Percentage cost change (-ve = cheaper, +ve = more expensive)"
    )
    quality_impact: str = Field(description="Brief description of quality trade-off")
    recommendation: str = Field(description="LLM-generated recommendation text")


class BOMCategorySummary(BaseModel):
    """Cost summary for a single material category."""

    category: MaterialCategory
    item_count: int = Field(ge=0)
    subtotal: float = Field(ge=0, description="Total cost for this category")
    percentage_of_total: float = Field(ge=0, le=100)


class BOMSummary(BaseModel):
    """Aggregate summary for the entire BOM."""

    total_items: int = Field(ge=0)
    total_cost: float = Field(ge=0)
    currency: str = Field(default="INR")
    category_breakdown: list[BOMCategorySummary] = Field(default_factory=list)
    budget_utilization_percent: float | None = Field(
        default=None,
        ge=0,
        description="Percentage of the target budget used (if budget was specified)",
    )


class OptimizationResult(BaseModel):
    """Result of the OR-Tools budget optimization pass."""

    original_total: float = Field(ge=0)
    optimized_total: float = Field(ge=0)
    savings: float = Field(ge=0)
    savings_percent: float = Field(ge=0)
    substitutions_applied: list[SubstitutionOption] = Field(default_factory=list)
    solver_status: str = Field(description="OR-Tools solver status string")


# -- Request/Response models ------------------------------------------------

class BOMGenerateRequest(BaseModel):
    """Request body for POST /api/v1/bom/generate."""

    project_id: str = Field(description="Project ID this BOM belongs to")
    room: RoomInput = Field(description="Room geometry and metadata")
    design_variant: DesignVariantInput = Field(
        alias="designVariant",
        description="The design variant to generate a BOM for",
    )
    target_budget: float | None = Field(
        default=None,
        ge=0,
        alias="targetBudget",
        description="Optional target budget in INR for optimization",
    )
    currency: str = Field(default="INR", description="ISO 4217 currency code")
    include_substitutions: bool = Field(
        default=True,
        alias="includeSubstitutions",
        description="Whether to include material substitution suggestions",
    )

    model_config = {"populate_by_name": True}


class BOMResult(BaseModel):
    """Complete BOM generation result."""

    id: str = Field(description="Unique BOM result ID")
    project_id: str = Field(description="Associated project ID")
    room_id: str = Field(description="Associated room ID")
    design_variant_id: str = Field(description="Associated design variant ID")
    status: BOMStatus
    items: list[BOMItem] = Field(default_factory=list)
    summary: BOMSummary | None = None
    optimization: OptimizationResult | None = None
    substitutions: list[SubstitutionOption] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class BOMGenerateResponse(BaseModel):
    """Response for POST /api/v1/bom/generate."""

    bom_id: str = Field(description="BOM job ID for polling status")
    status: BOMStatus
    message: str


class BOMExportRequest(BaseModel):
    """Query parameters for GET /api/v1/bom/{id}/export."""

    format: ExportFormat = Field(default=ExportFormat.EXCEL)
