"""
Pydantic models for change orders and impact analysis.

Change orders represent modifications to the original scope -- material swaps,
design changes, additions, or removals -- and their cascading effects on
the project schedule and budget.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ChangeOrderType(str, Enum):
    """Type of change order."""

    MATERIAL_SWAP = "material_swap"
    DESIGN_CHANGE = "design_change"
    SCOPE_ADDITION = "scope_addition"
    SCOPE_REMOVAL = "scope_removal"
    SPECIFICATION_CHANGE = "specification_change"


class ChangeOrderStatus(str, Enum):
    """Processing status for a change order."""

    DRAFT = "draft"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPLIED = "applied"


class ScheduleImpact(BaseModel):
    """Impact of a change order on the project schedule."""

    affected_task_ids: list[str] = Field(
        default_factory=list,
        description="Task IDs directly affected by this change",
    )
    cascading_task_ids: list[str] = Field(
        default_factory=list,
        description="Task IDs indirectly affected via dependencies",
    )
    original_duration_days: int = Field(ge=0, description="Original total schedule duration")
    revised_duration_days: int = Field(ge=0, description="Revised total schedule duration")
    delay_days: int = Field(default=0, description="Net delay introduced (+ve = longer)")
    critical_path_changed: bool = Field(
        default=False,
        description="Whether the critical path changed",
    )
    revised_end_date: str | None = Field(
        default=None,
        description="New projected end date (ISO format)",
    )
    explanation: str = Field(default="", description="LLM-generated explanation of schedule impact")


class CostImpact(BaseModel):
    """Impact of a change order on project costs."""

    original_cost: float = Field(ge=0, description="Original estimated cost")
    revised_cost: float = Field(ge=0, description="Revised estimated cost")
    cost_delta: float = Field(default=0.0, description="Net cost change (+ve = more expensive)")
    cost_delta_percent: float = Field(default=0.0, description="Percentage change in cost")
    affected_categories: list[str] = Field(
        default_factory=list,
        description="Material categories affected",
    )
    line_item_changes: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Detailed per-item cost changes",
    )
    explanation: str = Field(default="", description="LLM-generated explanation of cost impact")


class ImpactAnalysis(BaseModel):
    """Combined schedule and cost impact analysis for a change order."""

    change_order_id: str
    schedule_impact: ScheduleImpact
    cost_impact: CostImpact
    risk_level: str = Field(
        default="low",
        description="Overall risk: low, medium, high, critical",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="LLM-generated recommendations",
    )
    analyzed_at: datetime | None = None


class ChangeOrder(BaseModel):
    """A change order for the project."""

    id: str
    project_id: str
    schedule_id: str = Field(description="Schedule affected by this change")
    type: ChangeOrderType
    title: str
    description: str
    requested_by: str | None = Field(default=None, description="User ID of requester")
    status: ChangeOrderStatus = Field(default=ChangeOrderStatus.DRAFT)
    change_details: dict[str, Any] = Field(
        default_factory=dict,
        description="Structured description of the change (room_id, items, etc.)",
    )
    impact_analysis: ImpactAnalysis | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ChangeOrderCreate(BaseModel):
    """Request body for creating a change order."""

    project_id: str
    schedule_id: str
    type: ChangeOrderType
    title: str
    description: str
    change_details: dict[str, Any] = Field(default_factory=dict)


class ChangeOrderAnalyzeRequest(BaseModel):
    """Request body for analyzing a change order's impact."""

    schedule_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Current schedule snapshot for impact analysis",
    )
    bom_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Current BOM data for cost impact analysis",
    )


class ChangeOrderResponse(BaseModel):
    """Response for change order endpoints."""

    change_order: ChangeOrder
    message: str = ""
