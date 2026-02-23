"""
Pydantic models for construction scheduling.

Defines task structures, dependency graphs, trade sequences, and schedule
output shapes consumed by the scheduling agent and Gantt export.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field


# -- Enumerations -----------------------------------------------------------


class TradeType(str, Enum):
    """Trade sequence for interior construction.

    The ordering reflects the canonical execution sequence -- each trade
    can only begin after its predecessors are complete (or after an
    explicit dependency overlap is declared).
    """

    DEMOLITION = "demolition"
    CIVIL = "civil"
    PLUMBING_ROUGH_IN = "plumbing_rough_in"
    ELECTRICAL_ROUGH_IN = "electrical_rough_in"
    FALSE_CEILING = "false_ceiling"
    FLOORING = "flooring"
    CARPENTRY = "carpentry"
    PAINTING = "painting"
    MEP_FIXTURES = "mep_fixtures"
    SOFT_FURNISHING = "soft_furnishing"
    CLEANUP = "cleanup"


class ScheduleStatus(str, Enum):
    """Processing status for a schedule."""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETE = "complete"
    FAILED = "failed"


class TaskStatus(str, Enum):
    """Status of an individual schedule task."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DELAYED = "delayed"
    BLOCKED = "blocked"


class MilestoneStatus(str, Enum):
    """Status of a project milestone."""

    PENDING = "pending"
    REACHED = "reached"
    MISSED = "missed"


# -- Trade sequence ordering ------------------------------------------------

TRADE_SEQUENCE: list[TradeType] = [
    TradeType.DEMOLITION,
    TradeType.CIVIL,
    TradeType.PLUMBING_ROUGH_IN,
    TradeType.ELECTRICAL_ROUGH_IN,
    TradeType.FALSE_CEILING,
    TradeType.FLOORING,
    TradeType.CARPENTRY,
    TradeType.PAINTING,
    TradeType.MEP_FIXTURES,
    TradeType.SOFT_FURNISHING,
    TradeType.CLEANUP,
]

TRADE_ORDER: dict[TradeType, int] = {trade: idx for idx, trade in enumerate(TRADE_SEQUENCE)}


# -- Sub-models -------------------------------------------------------------


class TaskDependency(BaseModel):
    """Directed edge in the task dependency graph."""

    from_task_id: str = Field(description="ID of the predecessor task")
    to_task_id: str = Field(description="ID of the successor task")
    lag_days: int = Field(default=0, ge=0, description="Minimum lag in days between finish and start")


class ScheduleTask(BaseModel):
    """A single task within a construction schedule."""

    id: str
    schedule_id: str = Field(description="Parent schedule ID")
    room_id: str = Field(description="Room this task applies to")
    trade: TradeType
    name: str = Field(description="Human-readable task name")
    description: str = Field(default="", description="Detailed task description")
    duration_days: Annotated[int, Field(gt=0, description="Estimated duration in calendar days")]
    start_date: date | None = Field(default=None, description="Calculated or assigned start date")
    end_date: date | None = Field(default=None, description="Calculated or assigned end date")
    status: TaskStatus = Field(default=TaskStatus.NOT_STARTED)
    depends_on: list[str] = Field(
        default_factory=list,
        description="List of task IDs this task depends on",
    )
    resource_requirements: dict[str, Any] = Field(
        default_factory=dict,
        description="Labour and equipment requirements",
    )
    estimated_cost: float | None = Field(default=None, ge=0, description="Estimated cost in project currency")
    is_critical: bool = Field(default=False, description="Whether this task is on the critical path")


class Milestone(BaseModel):
    """A project milestone derived from the schedule."""

    id: str
    schedule_id: str
    name: str
    description: str = ""
    target_date: date
    actual_date: date | None = None
    status: MilestoneStatus = Field(default=MilestoneStatus.PENDING)
    trade: TradeType | None = Field(default=None, description="Trade this milestone is associated with")
    task_ids: list[str] = Field(
        default_factory=list,
        description="Task IDs that must complete for this milestone",
    )


class Schedule(BaseModel):
    """Complete construction schedule for a project."""

    id: str
    project_id: str
    name: str = Field(default="Construction Schedule")
    status: ScheduleStatus = Field(default=ScheduleStatus.PENDING)
    tasks: list[ScheduleTask] = Field(default_factory=list)
    dependencies: list[TaskDependency] = Field(default_factory=list)
    milestones: list[Milestone] = Field(default_factory=list)
    critical_path_task_ids: list[str] = Field(
        default_factory=list,
        description="Ordered list of task IDs forming the critical path",
    )
    total_duration_days: int = Field(default=0, ge=0, description="Total project duration in calendar days")
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# -- Request/Response models ------------------------------------------------


class RoomInput(BaseModel):
    """Room data for schedule generation."""

    id: str
    name: str
    type: str
    dimensions: dict[str, float] = Field(description="Room dimensions in mm (length_mm, width_mm, height_mm)")


class BOMItemInput(BaseModel):
    """Simplified BOM item for schedule estimation."""

    id: str
    room_id: str
    category: str
    name: str
    quantity: float
    unit: str


class DesignVariantInput(BaseModel):
    """Design variant reference for schedule generation."""

    id: str
    room_id: str
    style: str
    budget_tier: str
    spec_json: dict[str, Any] = Field(default_factory=dict)


class ScheduleGenerateRequest(BaseModel):
    """Request body for POST /api/v1/schedules/generate."""

    project_id: str = Field(description="Project ID")
    project_name: str = Field(default="Interior Project", description="Project name for schedule title")
    rooms: list[RoomInput] = Field(description="All rooms in the project")
    bom_items: list[BOMItemInput] = Field(
        default_factory=list,
        alias="bomItems",
        description="BOM items for duration estimation",
    )
    design_variants: list[DesignVariantInput] = Field(
        default_factory=list,
        alias="designVariants",
        description="Design variants for scope understanding",
    )
    start_date: date = Field(description="Project start date")
    working_days_per_week: int = Field(default=6, ge=1, le=7, description="Working days per week")

    model_config = {"populate_by_name": True}


class ScheduleGenerateResponse(BaseModel):
    """Response for POST /api/v1/schedules/generate."""

    schedule_id: str
    status: ScheduleStatus
    message: str


class CriticalPathResponse(BaseModel):
    """Critical path analysis result."""

    schedule_id: str
    critical_path_task_ids: list[str]
    total_duration_days: int
    tasks_on_path: list[ScheduleTask]
