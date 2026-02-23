"""
Pydantic models for site log entries.

Site logs record daily progress, issues, weather conditions, and
labour counts at the construction site.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class WeatherCondition(str, Enum):
    """Weather conditions affecting site work."""

    CLEAR = "clear"
    CLOUDY = "cloudy"
    RAIN = "rain"
    HEAVY_RAIN = "heavy_rain"
    HOT = "hot"
    COLD = "cold"


class LogSeverity(str, Enum):
    """Severity level for site log entries."""

    INFO = "info"
    WARNING = "warning"
    ISSUE = "issue"
    CRITICAL = "critical"


class LabourEntry(BaseModel):
    """Labour count for a specific trade on a given day."""

    trade: str = Field(description="Trade category (e.g. 'carpentry', 'painting')")
    count: int = Field(ge=0, description="Number of workers present")
    hours: float = Field(default=8.0, ge=0, description="Hours worked")


class SiteLogEntry(BaseModel):
    """A single site log entry."""

    id: str
    project_id: str
    log_date: date = Field(description="Date of the site log entry")
    weather: WeatherCondition = Field(default=WeatherCondition.CLEAR)
    summary: str = Field(description="Brief summary of work done")
    details: str = Field(default="", description="Detailed description of activities")
    severity: LogSeverity = Field(default=LogSeverity.INFO)
    labour: list[LabourEntry] = Field(default_factory=list, description="Labour breakdown by trade")
    tasks_progressed: list[str] = Field(
        default_factory=list,
        description="Schedule task IDs that saw progress today",
    )
    issues: list[str] = Field(
        default_factory=list,
        description="Issues encountered on site",
    )
    photos: list[str] = Field(
        default_factory=list,
        description="Photo upload IDs or URLs",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = Field(default=None, description="User ID who created the entry")
    created_at: datetime | None = None


class SiteLogCreate(BaseModel):
    """Request body for creating a site log entry."""

    project_id: str
    log_date: date
    weather: WeatherCondition = Field(default=WeatherCondition.CLEAR)
    summary: str
    details: str = ""
    severity: LogSeverity = Field(default=LogSeverity.INFO)
    labour: list[LabourEntry] = Field(default_factory=list)
    tasks_progressed: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SiteLogListResponse(BaseModel):
    """Response for listing site logs."""

    project_id: str
    total: int
    logs: list[SiteLogEntry]
