"""
Gantt chart data export.

Converts a Schedule model into a JSON structure suitable for frontend
Gantt chart rendering (e.g. with react-gantt-timeline or dhtmlx-gantt).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import structlog

from src.models.schedule import Milestone, Schedule, ScheduleTask, TaskDependency

logger = structlog.get_logger(__name__)


class GanttBar(dict):
    """Dictionary representing a single bar in the Gantt chart."""


class GanttLink(dict):
    """Dictionary representing a dependency link between Gantt bars."""


class GanttMilestone(dict):
    """Dictionary representing a milestone marker in the Gantt chart."""


def export_gantt_json(schedule: Schedule) -> dict[str, Any]:
    """Export a schedule as a JSON structure for frontend Gantt rendering.

    The output format follows a common Gantt chart data contract:

    .. code-block:: json

        {
            "schedule_id": "...",
            "project_id": "...",
            "start_date": "2025-03-01",
            "end_date": "2025-06-15",
            "total_duration_days": 107,
            "bars": [ ... ],
            "links": [ ... ],
            "milestones": [ ... ],
            "critical_path": [ ... ],
            "trade_groups": [ ... ]
        }

    Parameters
    ----------
    schedule:
        The schedule model to export.

    Returns
    -------
    dict
        JSON-serialisable Gantt chart data.
    """
    project_start = schedule.start_date or date.today()

    bars = _build_bars(schedule.tasks, project_start)
    links = _build_links(schedule.dependencies)
    milestones = _build_milestones(schedule.milestones)
    trade_groups = _build_trade_groups(schedule.tasks)

    return {
        "schedule_id": schedule.id,
        "project_id": schedule.project_id,
        "name": schedule.name,
        "start_date": schedule.start_date.isoformat() if schedule.start_date else None,
        "end_date": schedule.end_date.isoformat() if schedule.end_date else None,
        "total_duration_days": schedule.total_duration_days,
        "bars": bars,
        "links": links,
        "milestones": milestones,
        "critical_path": schedule.critical_path_task_ids,
        "trade_groups": trade_groups,
        "status": schedule.status.value,
    }


def _build_bars(
    tasks: list[ScheduleTask],
    project_start: date,
) -> list[dict[str, Any]]:
    """Convert schedule tasks into Gantt bar dicts."""
    bars: list[dict[str, Any]] = []

    for task in tasks:
        start = task.start_date or project_start
        end = task.end_date or (start + timedelta(days=task.duration_days))

        bar: dict[str, Any] = {
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "trade": task.trade.value,
            "room_id": task.room_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "duration_days": task.duration_days,
            "status": task.status.value,
            "is_critical": task.is_critical,
            "depends_on": task.depends_on,
            "progress": _status_to_progress(task.status.value),
            "color": _trade_color(task.trade.value),
            "estimated_cost": task.estimated_cost,
        }
        bars.append(bar)

    return bars


def _build_links(dependencies: list[TaskDependency]) -> list[dict[str, Any]]:
    """Convert task dependencies into Gantt link dicts."""
    links: list[dict[str, Any]] = []

    for idx, dep in enumerate(dependencies):
        link: dict[str, Any] = {
            "id": f"link_{idx}",
            "source": dep.from_task_id,
            "target": dep.to_task_id,
            "type": "finish_to_start",
            "lag_days": dep.lag_days,
        }
        links.append(link)

    return links


def _build_milestones(milestones: list[Milestone]) -> list[dict[str, Any]]:
    """Convert milestones into Gantt milestone marker dicts."""
    result: list[dict[str, Any]] = []

    for ms in milestones:
        marker: dict[str, Any] = {
            "id": ms.id,
            "name": ms.name,
            "description": ms.description,
            "target_date": ms.target_date.isoformat(),
            "actual_date": ms.actual_date.isoformat() if ms.actual_date else None,
            "status": ms.status.value,
            "trade": ms.trade.value if ms.trade else None,
            "task_ids": ms.task_ids,
        }
        result.append(marker)

    return result


def _build_trade_groups(tasks: list[ScheduleTask]) -> list[dict[str, Any]]:
    """Group tasks by trade for collapsible Gantt sections."""
    groups: dict[str, list[str]] = {}
    trade_dates: dict[str, tuple[date | None, date | None]] = {}

    for task in tasks:
        trade = task.trade.value
        if trade not in groups:
            groups[trade] = []
            trade_dates[trade] = (task.start_date, task.end_date)
        groups[trade].append(task.id)

        # Track earliest start and latest end per trade
        current_start, current_end = trade_dates[trade]
        if task.start_date:
            if current_start is None or task.start_date < current_start:
                current_start = task.start_date
        if task.end_date:
            if current_end is None or task.end_date > current_end:
                current_end = task.end_date
        trade_dates[trade] = (current_start, current_end)

    result: list[dict[str, Any]] = []
    for trade, task_ids in groups.items():
        start_dt, end_dt = trade_dates[trade]
        result.append({
            "trade": trade,
            "task_ids": task_ids,
            "task_count": len(task_ids),
            "start_date": start_dt.isoformat() if start_dt else None,
            "end_date": end_dt.isoformat() if end_dt else None,
            "color": _trade_color(trade),
        })

    return result


def _status_to_progress(status: str) -> float:
    """Map a task status to a progress percentage for Gantt bar fill."""
    mapping = {
        "not_started": 0.0,
        "in_progress": 0.5,
        "completed": 1.0,
        "delayed": 0.3,
        "blocked": 0.0,
    }
    return mapping.get(status, 0.0)


def _trade_color(trade: str) -> str:
    """Return a hex colour for a given trade, for consistent Gantt colouring."""
    colors: dict[str, str] = {
        "demolition": "#EF4444",
        "civil": "#F97316",
        "plumbing_rough_in": "#3B82F6",
        "electrical_rough_in": "#EAB308",
        "false_ceiling": "#8B5CF6",
        "flooring": "#10B981",
        "carpentry": "#D97706",
        "painting": "#EC4899",
        "mep_fixtures": "#06B6D4",
        "soft_furnishing": "#A855F7",
        "cleanup": "#6B7280",
    }
    return colors.get(trade, "#9CA3AF")
