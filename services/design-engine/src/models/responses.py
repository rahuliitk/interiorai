"""
Response models for the Design Engine API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from openlintel_shared.schemas.design import BudgetTier, DesignStyle


class JobStatus(str, Enum):
    """Possible states for a design generation job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GenerateDesignResponse(BaseModel):
    """Returned by POST /api/v1/designs/generate."""

    job_id: str = Field(..., alias="jobId")
    status: JobStatus
    message: str

    model_config = {"populate_by_name": True}


class JobProgressResponse(BaseModel):
    """Returned by GET /api/v1/designs/jobs/{job_id}."""

    job_id: str = Field(..., alias="jobId")
    status: JobStatus
    progress: int = Field(ge=0, le=100, description="0-100 percentage")
    current_step: str | None = Field(
        default=None,
        alias="currentStep",
        description="Human-readable name of the current pipeline step",
    )
    design_ids: list[str] = Field(
        default_factory=list,
        alias="designIds",
        description="IDs of completed design variants (populated as they finish)",
    )
    error: str | None = None
    created_at: datetime = Field(..., alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")

    model_config = {"populate_by_name": True}


class JobStatusResponse(BaseModel):
    """Lightweight job status (subset of progress)."""

    job_id: str = Field(..., alias="jobId")
    status: JobStatus
    progress: int = Field(ge=0, le=100)

    model_config = {"populate_by_name": True}


class DesignResult(BaseModel):
    """Full design variant result — returned by GET /api/v1/designs/{design_id}."""

    id: str
    room_id: str = Field(..., alias="roomId")
    name: str
    style: DesignStyle
    budget_tier: BudgetTier = Field(..., alias="budgetTier")
    render_url: str | None = Field(default=None, alias="renderUrl")
    render_urls: list[str] = Field(
        default_factory=list,
        alias="renderUrls",
        description="All generated image URLs for this variant",
    )
    prompt_used: str | None = Field(
        default=None,
        alias="promptUsed",
        description="The VLM prompt that produced this design",
    )
    constraints: list[str] = Field(default_factory=list)
    spec_json: dict[str, Any] | None = Field(
        default=None,
        alias="specJson",
        description="Full design specification (furniture list, colors, materials)",
    )
    metadata: dict[str, Any] | None = None
    job_id: str | None = Field(default=None, alias="jobId")
    created_at: datetime = Field(..., alias="createdAt")

    model_config = {"populate_by_name": True}
