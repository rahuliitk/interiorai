"""
Request models for the Design Engine API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from openlintel_shared.schemas.design import BudgetTier, DesignStyle


class GenerateDesignRequest(BaseModel):
    """Request body for POST /api/v1/designs/generate.

    Parameters
    ----------
    room_id:
        UUID of the room to generate a design for.
    style:
        Desired interior design style.
    budget_tier:
        Budget bracket constraining material and furniture selection.
    constraints:
        Free-text constraints such as ``"keep the hardwood floors"`` or
        ``"don't change the window treatments"``.
    source_upload_id:
        Optional UUID of an existing upload (room photo) to use as the
        source image for VLM generation.  If omitted, the latest photo
        associated with the room is used.
    model:
        LiteLLM model identifier (e.g. ``"openai/gpt-4o"``,
        ``"google/gemini-2.0-flash"``).  Defaults to ``"openai/gpt-4o"``.
    num_variants:
        Number of design variants to generate (1-4).  Default 1.
    """

    room_id: str = Field(
        ...,
        alias="roomId",
        description="UUID of the room to generate a design for",
    )
    style: DesignStyle = Field(
        ...,
        description="Desired interior design style",
    )
    budget_tier: BudgetTier = Field(
        ...,
        alias="budgetTier",
        description="Budget bracket for material/furniture selection",
    )
    constraints: list[str] = Field(
        default_factory=list,
        description="Free-text constraints (e.g. 'keep the hardwood floors')",
    )
    source_upload_id: str | None = Field(
        default=None,
        alias="sourceUploadId",
        description="UUID of the source room photo upload",
    )
    model: str = Field(
        default="openai/gpt-4o",
        description="LiteLLM model identifier for the VLM",
    )
    num_variants: int = Field(
        default=1,
        ge=1,
        le=4,
        alias="numVariants",
        description="Number of design variants to generate (1-4)",
    )

    model_config = {"populate_by_name": True}
