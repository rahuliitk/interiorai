"""
LangGraph-based schedule generation agent.

Orchestrates a multi-step pipeline:
  1. analyze_scope       -- Understand rooms, designs, and BOM to determine work scope
  2. create_task_list    -- Generate tasks following the trade sequence
  3. estimate_durations  -- Use LLM + heuristics to estimate task durations
  4. set_dependencies    -- Build the dependency graph between tasks
  5. compute_schedule    -- Run critical path and assign dates
  6. generate_milestones -- Create project milestones from the schedule

Each node mutates a shared ``ScheduleState`` TypedDict that flows through the graph.
"""

from __future__ import annotations

import json
import math
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient
from openlintel_shared.schemas.bom import MaterialCategory

from src.models.schedule import (
    TRADE_ORDER,
    TRADE_SEQUENCE,
    Milestone,
    MilestoneStatus,
    Schedule,
    ScheduleStatus,
    ScheduleTask,
    TaskDependency,
    TaskStatus,
    TradeType,
)
from src.services.critical_path import compute_critical_path

logger = structlog.get_logger(__name__)


# -- Material category to trade mapping -------------------------------------

CATEGORY_TO_TRADE: dict[str, TradeType] = {
    "civil": TradeType.CIVIL,
    "flooring": TradeType.FLOORING,
    "painting": TradeType.PAINTING,
    "electrical": TradeType.ELECTRICAL_ROUGH_IN,
    "plumbing": TradeType.PLUMBING_ROUGH_IN,
    "carpentry": TradeType.CARPENTRY,
    "false_ceiling": TradeType.FALSE_CEILING,
    "glass_aluminum": TradeType.CARPENTRY,
    "sanitaryware": TradeType.MEP_FIXTURES,
    "appliances": TradeType.MEP_FIXTURES,
    "soft_furnishing": TradeType.SOFT_FURNISHING,
    "decor": TradeType.SOFT_FURNISHING,
    "hardware": TradeType.CARPENTRY,
}

# Base duration estimates per trade (days per 100 sqft of room area)
BASE_DURATION_PER_100SQFT: dict[TradeType, float] = {
    TradeType.DEMOLITION: 1.5,
    TradeType.CIVIL: 3.0,
    TradeType.PLUMBING_ROUGH_IN: 2.0,
    TradeType.ELECTRICAL_ROUGH_IN: 2.0,
    TradeType.FALSE_CEILING: 2.5,
    TradeType.FLOORING: 2.0,
    TradeType.CARPENTRY: 5.0,
    TradeType.PAINTING: 3.0,
    TradeType.MEP_FIXTURES: 1.5,
    TradeType.SOFT_FURNISHING: 1.0,
    TradeType.CLEANUP: 1.0,
}


# -- State definition -------------------------------------------------------


class ScheduleState(TypedDict, total=False):
    """Shared state flowing through the schedule agent graph."""

    # Inputs
    schedule_id: str
    project_id: str
    project_name: str
    rooms: list[dict[str, Any]]
    bom_items: list[dict[str, Any]]
    design_variants: list[dict[str, Any]]
    start_date: str
    working_days_per_week: int

    # LLM credentials
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    scope_analysis: dict[str, Any]
    tasks: list[dict[str, Any]]
    dependencies: list[dict[str, Any]]
    critical_path_ids: list[str]
    total_duration_days: int
    milestones: list[dict[str, Any]]

    # Output
    status: str
    schedule_result: dict[str, Any] | None
    error: str | None


# -- Agent implementation ---------------------------------------------------


class ScheduleAgent(AgentBase):
    """LangGraph agent that generates a construction schedule.

    Takes room data, BOM items, and design variants as input. Produces a
    complete schedule with tasks following the canonical trade sequence,
    dependency links, critical path analysis, and milestones.
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the schedule generation state graph."""
        graph = StateGraph(ScheduleState)

        graph.add_node("analyze_scope", self._analyze_scope)
        graph.add_node("create_task_list", self._create_task_list)
        graph.add_node("estimate_durations", self._estimate_durations)
        graph.add_node("set_dependencies", self._set_dependencies)
        graph.add_node("compute_schedule", self._compute_schedule)
        graph.add_node("generate_milestones", self._generate_milestones)

        graph.set_entry_point("analyze_scope")
        graph.add_edge("analyze_scope", "create_task_list")
        graph.add_edge("create_task_list", "estimate_durations")
        graph.add_edge("estimate_durations", "set_dependencies")
        graph.add_edge("set_dependencies", "compute_schedule")
        graph.add_edge("compute_schedule", "generate_milestones")
        graph.add_edge("generate_milestones", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict from caller-supplied parameters."""
        return {
            "schedule_id": kwargs.get("schedule_id", str(uuid.uuid4())),
            "project_id": kwargs["project_id"],
            "project_name": kwargs.get("project_name", "Interior Project"),
            "rooms": kwargs.get("rooms", []),
            "bom_items": kwargs.get("bom_items", []),
            "design_variants": kwargs.get("design_variants", []),
            "start_date": kwargs.get("start_date", date.today().isoformat()),
            "working_days_per_week": kwargs.get("working_days_per_week", 6),
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "scope_analysis": {},
            "tasks": [],
            "dependencies": [],
            "critical_path_ids": [],
            "total_duration_days": 0,
            "milestones": [],
            "status": ScheduleStatus.PENDING,
            "schedule_result": None,
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _analyze_scope(self, state: ScheduleState) -> dict[str, Any]:
        """Node 1: Analyse the project scope from rooms, BOM, and designs."""
        logger.info(
            "schedule_analyze_scope",
            schedule_id=state["schedule_id"],
            room_count=len(state["rooms"]),
        )

        rooms = state["rooms"]
        bom_items = state["bom_items"]

        # Compute room areas and identify needed trades per room
        room_analysis: dict[str, dict[str, Any]] = {}
        for room in rooms:
            room_id = room["id"]
            dims = room.get("dimensions", {})
            length_mm = dims.get("length_mm", 3000)
            width_mm = dims.get("width_mm", 3000)
            area_sqft = (length_mm * width_mm) / (304.8 * 304.8)

            # Determine which trades are needed for this room based on BOM
            room_bom = [item for item in bom_items if item.get("room_id") == room_id]
            room_trades: set[str] = set()
            for item in room_bom:
                cat = item.get("category", "")
                trade = CATEGORY_TO_TRADE.get(cat)
                if trade:
                    room_trades.add(trade.value)

            # Always include demolition (even if minimal) and cleanup
            room_trades.add(TradeType.DEMOLITION.value)
            room_trades.add(TradeType.CLEANUP.value)

            # If no BOM, infer trades from room type
            if len(room_trades) <= 2:
                room_type = room.get("type", "bedroom")
                room_trades.update(_infer_trades_for_room_type(room_type))

            room_analysis[room_id] = {
                "room_id": room_id,
                "room_name": room.get("name", "Room"),
                "room_type": room.get("type", "bedroom"),
                "area_sqft": round(area_sqft, 1),
                "trades_needed": sorted(room_trades),
                "bom_item_count": len(room_bom),
            }

        scope = {
            "total_rooms": len(rooms),
            "total_area_sqft": round(sum(r["area_sqft"] for r in room_analysis.values()), 1),
            "rooms": room_analysis,
        }

        return {
            "scope_analysis": scope,
            "status": ScheduleStatus.GENERATING,
        }

    async def _create_task_list(self, state: ScheduleState) -> dict[str, Any]:
        """Node 2: Create tasks for each room following the trade sequence."""
        logger.info("schedule_create_tasks", schedule_id=state["schedule_id"])

        scope = state["scope_analysis"]
        schedule_id = state["schedule_id"]
        tasks: list[dict[str, Any]] = []

        for room_id, room_data in scope.get("rooms", {}).items():
            trades_needed = room_data.get("trades_needed", [])
            area_sqft = room_data.get("area_sqft", 100.0)
            room_name = room_data.get("room_name", "Room")

            for trade_value in TRADE_SEQUENCE:
                if trade_value.value not in trades_needed:
                    continue

                task_id = str(uuid.uuid4())
                task_name = f"{room_name} - {_trade_display_name(trade_value)}"

                # Estimate base duration from area
                base_rate = BASE_DURATION_PER_100SQFT.get(trade_value, 2.0)
                estimated_days = max(1, math.ceil((area_sqft / 100.0) * base_rate))

                task = {
                    "id": task_id,
                    "schedule_id": schedule_id,
                    "room_id": room_id,
                    "trade": trade_value.value,
                    "name": task_name,
                    "description": f"{_trade_display_name(trade_value)} work for {room_name}",
                    "duration_days": estimated_days,
                    "status": TaskStatus.NOT_STARTED.value,
                    "depends_on": [],
                    "resource_requirements": {},
                    "estimated_cost": None,
                    "is_critical": False,
                }
                tasks.append(task)

        return {"tasks": tasks}

    async def _estimate_durations(self, state: ScheduleState) -> dict[str, Any]:
        """Node 3: Refine duration estimates using LLM for intelligent sizing."""
        logger.info("schedule_estimate_durations", schedule_id=state["schedule_id"])

        tasks = state["tasks"]
        bom_items = state["bom_items"]
        scope = state["scope_analysis"]

        # Build a summary for the LLM
        task_summary = []
        for task in tasks:
            room_data = scope.get("rooms", {}).get(task["room_id"], {})
            room_bom = [
                item for item in bom_items
                if item.get("room_id") == task["room_id"]
                and CATEGORY_TO_TRADE.get(item.get("category", ""), None)
                and CATEGORY_TO_TRADE[item["category"]].value == task["trade"]
            ]
            task_summary.append({
                "task_id": task["id"],
                "name": task["name"],
                "trade": task["trade"],
                "area_sqft": room_data.get("area_sqft", 100),
                "current_estimate_days": task["duration_days"],
                "material_items": len(room_bom),
                "material_quantity_total": sum(item.get("quantity", 0) for item in room_bom),
            })

        prompt = f"""You are an expert construction project manager for residential interior projects in India.

Given the following task list with preliminary duration estimates, refine the durations
based on typical Indian residential interior project timelines.

Tasks:
{json.dumps(task_summary, indent=2)}

For each task, return a JSON array with objects containing:
- "task_id": the task ID
- "duration_days": refined duration in calendar days (integer, minimum 1)
- "reasoning": brief note on why you adjusted (or kept) the duration

Consider:
- Typical crew sizes for Indian residential interiors (2-4 workers per trade)
- Curing times for civil work (minimum 7 days for plaster/concrete)
- Paint drying between coats (1-2 days)
- Carpentry complexity for modular furniture
- Parallel work possibility within a single room is NOT applicable here (tasks are sequential per trade)

Return ONLY the JSON array, no other text."""

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.2,
                max_tokens=4000,
            )

            content = response.choices[0].message.content or "[]"
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            refinements = json.loads(content)
            if not isinstance(refinements, list):
                refinements = [refinements]

            # Build lookup of refined durations
            refined_map: dict[str, int] = {}
            for item in refinements:
                task_id = item.get("task_id", "")
                duration = item.get("duration_days")
                if task_id and duration and isinstance(duration, (int, float)):
                    refined_map[task_id] = max(1, int(duration))

            # Apply refinements
            for task in tasks:
                if task["id"] in refined_map:
                    task["duration_days"] = refined_map[task["id"]]

            logger.info(
                "schedule_durations_refined",
                schedule_id=state["schedule_id"],
                refined_count=len(refined_map),
            )

        except Exception as exc:
            logger.warning(
                "schedule_duration_llm_failed",
                error=str(exc),
                schedule_id=state["schedule_id"],
            )
            # Keep heuristic estimates as fallback

        return {"tasks": tasks}

    async def _set_dependencies(self, state: ScheduleState) -> dict[str, Any]:
        """Node 4: Build the dependency graph between tasks.

        Within each room, tasks follow the trade sequence. Across rooms,
        certain trades (like demolition) should complete in all rooms before
        the next phase begins.
        """
        logger.info("schedule_set_dependencies", schedule_id=state["schedule_id"])

        tasks = state["tasks"]
        dependencies: list[dict[str, Any]] = []

        # Group tasks by room
        room_tasks: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for task in tasks:
            room_tasks[task["room_id"]].append(task)

        # Sort each room's tasks by trade sequence order
        for room_id in room_tasks:
            room_tasks[room_id].sort(
                key=lambda t: TRADE_ORDER.get(TradeType(t["trade"]), 99)
            )

        # Within each room: sequential dependencies along trade sequence
        for room_id, rtasks in room_tasks.items():
            for i in range(1, len(rtasks)):
                dep = {
                    "from_task_id": rtasks[i - 1]["id"],
                    "to_task_id": rtasks[i]["id"],
                    "lag_days": 0,
                }
                dependencies.append(dep)
                rtasks[i]["depends_on"] = rtasks[i].get("depends_on", []) + [rtasks[i - 1]["id"]]

        # Cross-room: demolition in all rooms must finish before any civil starts
        # This models the common practice of completing demolition across all rooms first
        demolition_tasks = [t for t in tasks if t["trade"] == TradeType.DEMOLITION.value]
        civil_tasks = [t for t in tasks if t["trade"] == TradeType.CIVIL.value]

        for demo_task in demolition_tasks:
            for civil_task in civil_tasks:
                # Only add cross-room dependencies (within-room already handled)
                if demo_task["room_id"] != civil_task["room_id"]:
                    dep = {
                        "from_task_id": demo_task["id"],
                        "to_task_id": civil_task["id"],
                        "lag_days": 0,
                    }
                    dependencies.append(dep)
                    civil_task["depends_on"] = civil_task.get("depends_on", []) + [demo_task["id"]]

        return {
            "tasks": tasks,
            "dependencies": dependencies,
        }

    async def _compute_schedule(self, state: ScheduleState) -> dict[str, Any]:
        """Node 5: Run critical path analysis and assign dates to tasks."""
        logger.info("schedule_compute_critical_path", schedule_id=state["schedule_id"])

        tasks = state["tasks"]
        dependencies = state["dependencies"]

        # Run critical path computation
        cp_result = compute_critical_path(tasks, dependencies)

        # Assign dates based on earliest start times
        project_start = date.fromisoformat(state["start_date"])
        working_days = state.get("working_days_per_week", 6)

        for task in tasks:
            earliest_start_days = cp_result.task_earliest_start.get(task["id"], 0)
            task_start = _add_working_days(project_start, earliest_start_days, working_days)
            task_end = _add_working_days(task_start, task["duration_days"], working_days)

            task["start_date"] = task_start.isoformat()
            task["end_date"] = task_end.isoformat()
            task["is_critical"] = task["id"] in cp_result.critical_path_ids

        # Calculate project end date
        total_duration = cp_result.total_duration
        project_end = _add_working_days(project_start, total_duration, working_days)

        return {
            "tasks": tasks,
            "critical_path_ids": cp_result.critical_path_ids,
            "total_duration_days": total_duration,
        }

    async def _generate_milestones(self, state: ScheduleState) -> dict[str, Any]:
        """Node 6: Generate milestones from the schedule."""
        logger.info("schedule_generate_milestones", schedule_id=state["schedule_id"])

        tasks = state["tasks"]
        schedule_id = state["schedule_id"]
        project_start = date.fromisoformat(state["start_date"])
        working_days = state.get("working_days_per_week", 6)

        milestones: list[dict[str, Any]] = []

        # Create a milestone for each trade completion
        trade_tasks: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for task in tasks:
            trade_tasks[task["trade"]].append(task)

        for trade_value in TRADE_SEQUENCE:
            trade_str = trade_value.value
            if trade_str not in trade_tasks:
                continue

            t_tasks = trade_tasks[trade_str]
            # Milestone date is the latest end date among tasks of this trade
            end_dates = [
                date.fromisoformat(t["end_date"])
                for t in t_tasks
                if t.get("end_date")
            ]
            if not end_dates:
                continue

            milestone_date = max(end_dates)
            milestone = {
                "id": str(uuid.uuid4()),
                "schedule_id": schedule_id,
                "name": f"{_trade_display_name(trade_value)} Complete",
                "description": f"All {_trade_display_name(trade_value).lower()} work completed across all rooms",
                "target_date": milestone_date.isoformat(),
                "actual_date": None,
                "status": MilestoneStatus.PENDING.value,
                "trade": trade_str,
                "task_ids": [t["id"] for t in t_tasks],
            }
            milestones.append(milestone)

        # Project completion milestone
        all_end_dates = [
            date.fromisoformat(t["end_date"])
            for t in tasks
            if t.get("end_date")
        ]
        if all_end_dates:
            project_end = max(all_end_dates)
            milestones.append({
                "id": str(uuid.uuid4()),
                "schedule_id": schedule_id,
                "name": "Project Handover",
                "description": "All work completed and site handed over to client",
                "target_date": project_end.isoformat(),
                "actual_date": None,
                "status": MilestoneStatus.PENDING.value,
                "trade": None,
                "task_ids": [t["id"] for t in tasks],
            })

        # Build the final schedule result
        now = datetime.now(tz=timezone.utc)
        project_start_date = date.fromisoformat(state["start_date"])

        task_models = []
        for t in tasks:
            task_models.append(ScheduleTask(
                id=t["id"],
                schedule_id=schedule_id,
                room_id=t["room_id"],
                trade=TradeType(t["trade"]),
                name=t["name"],
                description=t.get("description", ""),
                duration_days=t["duration_days"],
                start_date=date.fromisoformat(t["start_date"]) if t.get("start_date") else None,
                end_date=date.fromisoformat(t["end_date"]) if t.get("end_date") else None,
                status=TaskStatus(t.get("status", "not_started")),
                depends_on=t.get("depends_on", []),
                resource_requirements=t.get("resource_requirements", {}),
                estimated_cost=t.get("estimated_cost"),
                is_critical=t.get("is_critical", False),
            ))

        dep_models = [
            TaskDependency(
                from_task_id=d["from_task_id"],
                to_task_id=d["to_task_id"],
                lag_days=d.get("lag_days", 0),
            )
            for d in state["dependencies"]
        ]

        milestone_models = [
            Milestone(
                id=m["id"],
                schedule_id=schedule_id,
                name=m["name"],
                description=m.get("description", ""),
                target_date=date.fromisoformat(m["target_date"]),
                actual_date=date.fromisoformat(m["actual_date"]) if m.get("actual_date") else None,
                status=MilestoneStatus(m.get("status", "pending")),
                trade=TradeType(m["trade"]) if m.get("trade") else None,
                task_ids=m.get("task_ids", []),
            )
            for m in milestones
        ]

        project_end_date = None
        if all_end_dates:
            project_end_date = max(all_end_dates)

        schedule = Schedule(
            id=schedule_id,
            project_id=state["project_id"],
            name=f"{state['project_name']} - Construction Schedule",
            status=ScheduleStatus.COMPLETE,
            tasks=task_models,
            dependencies=dep_models,
            milestones=milestone_models,
            critical_path_task_ids=state["critical_path_ids"],
            total_duration_days=state["total_duration_days"],
            start_date=project_start_date,
            end_date=project_end_date,
            created_at=now,
            updated_at=now,
        )

        return {
            "milestones": milestones,
            "schedule_result": schedule.model_dump(mode="json"),
            "status": ScheduleStatus.COMPLETE,
        }


# -- Helper functions -------------------------------------------------------


def _trade_display_name(trade: TradeType) -> str:
    """Return a human-readable display name for a trade."""
    names: dict[TradeType, str] = {
        TradeType.DEMOLITION: "Demolition",
        TradeType.CIVIL: "Civil Work",
        TradeType.PLUMBING_ROUGH_IN: "Plumbing Rough-In",
        TradeType.ELECTRICAL_ROUGH_IN: "Electrical Rough-In",
        TradeType.FALSE_CEILING: "False Ceiling",
        TradeType.FLOORING: "Flooring",
        TradeType.CARPENTRY: "Carpentry",
        TradeType.PAINTING: "Painting",
        TradeType.MEP_FIXTURES: "MEP Fixtures",
        TradeType.SOFT_FURNISHING: "Soft Furnishing",
        TradeType.CLEANUP: "Cleanup & Handover",
    }
    return names.get(trade, trade.value.replace("_", " ").title())


def _infer_trades_for_room_type(room_type: str) -> set[str]:
    """Infer which trades are needed based on room type when BOM is not available."""
    base_trades = {
        TradeType.DEMOLITION.value,
        TradeType.CIVIL.value,
        TradeType.ELECTRICAL_ROUGH_IN.value,
        TradeType.FLOORING.value,
        TradeType.PAINTING.value,
        TradeType.CLEANUP.value,
    }

    if room_type in ("bathroom", "kitchen", "utility"):
        base_trades.add(TradeType.PLUMBING_ROUGH_IN.value)
        base_trades.add(TradeType.MEP_FIXTURES.value)

    if room_type in ("living_room", "bedroom", "dining"):
        base_trades.add(TradeType.FALSE_CEILING.value)
        base_trades.add(TradeType.SOFT_FURNISHING.value)

    if room_type in ("bedroom", "living_room", "kitchen", "study"):
        base_trades.add(TradeType.CARPENTRY.value)

    if room_type in ("bathroom", "kitchen"):
        base_trades.add(TradeType.MEP_FIXTURES.value)

    return base_trades


def _add_working_days(start: date, working_days_count: int, working_days_per_week: int) -> date:
    """Add a number of working days to a start date, skipping rest days.

    Assumes the working week starts on Monday.  For a 6-day week, Sunday is
    the rest day.  For 5-day weeks, Saturday and Sunday are rest days.
    """
    if working_days_per_week >= 7:
        return start + timedelta(days=working_days_count)

    rest_days_per_week = 7 - working_days_per_week
    current = start
    remaining = working_days_count

    while remaining > 0:
        current += timedelta(days=1)
        weekday = current.weekday()  # 0=Monday, 6=Sunday

        # For 6-day week: skip Sunday (6)
        # For 5-day week: skip Saturday (5) and Sunday (6)
        if working_days_per_week == 6 and weekday == 6:
            continue
        elif working_days_per_week == 5 and weekday >= 5:
            continue
        elif working_days_per_week < 5 and weekday >= working_days_per_week:
            continue

        remaining -= 1

    return current
