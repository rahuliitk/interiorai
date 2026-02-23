"""
Standardized job request schema for service-to-service calls.

The Next.js tRPC layer creates a ``jobs`` row in PostgreSQL, then fires
a fire-and-forget HTTP POST to the relevant Python service.  Every
service receives the same ``JobRequest`` envelope so that the shared
``job_worker`` utilities can operate uniformly.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class RoomInfo(BaseModel):
    """Minimal room data forwarded by the tRPC layer."""

    id: str
    type: str
    length_mm: float
    width_mm: float
    height_mm: float = 2700.0


class JobRequest(BaseModel):
    """Payload sent by tRPC fire-and-forget calls to all job endpoints."""

    job_id: str
    design_variant_id: str
    user_id: str = Field(
        ...,
        description="Owner of the job — used to look up API keys in DB.",
    )
    room: RoomInfo

    # Common optional fields
    style: str | None = None
    budget_tier: str | None = None

    # Design-engine may include these
    constraints: list[str] = Field(default_factory=list)
    additional_prompt: str | None = None

    # Drawing-generator
    drawing_types: list[str] | None = None

    # MEP calculator
    calc_type: str | None = None  # electrical | plumbing | hvac
