"""
LangGraph-based change order impact analysis agent.

Analyses how a proposed change order affects:
  1. The project schedule (task delays, critical path changes)
  2. The project budget (cost additions, removals, modifications)
  3. Overall risk and cascading effects

Uses LLM reasoning to assess indirect impacts that rule-based analysis alone
would miss.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

from src.models.change_order import (
    ChangeOrderStatus,
    CostImpact,
    ImpactAnalysis,
    ScheduleImpact,
)
from src.services.critical_path import compute_critical_path

logger = structlog.get_logger(__name__)


# -- State definition -------------------------------------------------------


class ImpactState(TypedDict, total=False):
    """Shared state flowing through the impact analysis graph."""

    # Inputs
    change_order_id: str
    change_order_type: str
    change_title: str
    change_description: str
    change_details: dict[str, Any]
    schedule_data: dict[str, Any]
    bom_data: dict[str, Any]

    # LLM credentials
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    schedule_impact: dict[str, Any] | None
    cost_impact: dict[str, Any] | None
    risk_assessment: dict[str, Any] | None

    # Output
    impact_analysis: dict[str, Any] | None
    error: str | None


# -- Agent implementation ---------------------------------------------------


class ImpactAgent(AgentBase):
    """LangGraph agent that analyses the impact of a change order.

    Runs three analysis nodes in sequence:
      1. analyze_schedule_impact -- identify affected tasks and duration changes
      2. analyze_cost_impact -- compute cost deltas
      3. assess_risk -- overall risk and recommendations via LLM
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the impact analysis state graph."""
        graph = StateGraph(ImpactState)

        graph.add_node("analyze_schedule_impact", self._analyze_schedule_impact)
        graph.add_node("analyze_cost_impact", self._analyze_cost_impact)
        graph.add_node("assess_risk", self._assess_risk)

        graph.set_entry_point("analyze_schedule_impact")
        graph.add_edge("analyze_schedule_impact", "analyze_cost_impact")
        graph.add_edge("analyze_cost_impact", "assess_risk")
        graph.add_edge("assess_risk", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict from caller-supplied parameters."""
        return {
            "change_order_id": kwargs["change_order_id"],
            "change_order_type": kwargs.get("change_order_type", "design_change"),
            "change_title": kwargs.get("change_title", ""),
            "change_description": kwargs.get("change_description", ""),
            "change_details": kwargs.get("change_details", {}),
            "schedule_data": kwargs.get("schedule_data", {}),
            "bom_data": kwargs.get("bom_data", {}),
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "schedule_impact": None,
            "cost_impact": None,
            "risk_assessment": None,
            "impact_analysis": None,
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _analyze_schedule_impact(self, state: ImpactState) -> dict[str, Any]:
        """Node 1: Analyse schedule impact of the change order."""
        logger.info(
            "impact_analyze_schedule",
            change_order_id=state["change_order_id"],
        )

        schedule_data = state["schedule_data"]
        change_details = state["change_details"]
        tasks = schedule_data.get("tasks", [])
        dependencies = schedule_data.get("dependencies", [])

        # Use LLM to identify which tasks are affected
        prompt = f"""You are a construction project scheduling expert.

A change order has been submitted for an interior construction project.

Change Order:
- Type: {state['change_order_type']}
- Title: {state['change_title']}
- Description: {state['change_description']}
- Details: {json.dumps(change_details, indent=2, default=str)}

Current Schedule Tasks:
{json.dumps([{{"id": t.get("id"), "name": t.get("name"), "trade": t.get("trade"), "duration_days": t.get("duration_days"), "room_id": t.get("room_id")}} for t in tasks], indent=2)}

Analyse the impact on the schedule and return a JSON object:
{{
    "directly_affected_task_ids": ["task IDs that are directly impacted"],
    "duration_changes": {{"task_id": new_duration_days}},
    "new_tasks_needed": [
        {{"name": "task name", "trade": "trade_type", "duration_days": N, "room_id": "room_id", "insert_after_task_id": "task_id"}}
    ],
    "removed_task_ids": ["task IDs no longer needed"],
    "explanation": "Brief explanation of schedule impact"
}}

Return ONLY the JSON object."""

        affected_task_ids: list[str] = []
        duration_changes: dict[str, int] = {}
        explanation = "Unable to determine schedule impact."

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.2,
                max_tokens=2000,
            )

            content = response.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            analysis = json.loads(content)
            affected_task_ids = analysis.get("directly_affected_task_ids", [])
            duration_changes = analysis.get("duration_changes", {})
            explanation = analysis.get("explanation", "")

        except Exception as exc:
            logger.warning("impact_schedule_llm_failed", error=str(exc))
            explanation = f"LLM analysis unavailable: {exc}"

        # Compute revised schedule with changes applied
        revised_tasks = []
        for task in tasks:
            revised = {**task}
            if task["id"] in duration_changes:
                revised["duration_days"] = duration_changes[task["id"]]
            revised_tasks.append(revised)

        # Recompute critical path with revised durations
        original_cp = compute_critical_path(tasks, dependencies)
        revised_cp = compute_critical_path(revised_tasks, dependencies)

        # Find cascading tasks (those affected via dependencies)
        cascading_ids: list[str] = []
        dep_map: dict[str, list[str]] = {}
        for dep in dependencies:
            dep_map.setdefault(dep["from_task_id"], []).append(dep["to_task_id"])

        visited: set[str] = set()
        queue = list(affected_task_ids)
        while queue:
            tid = queue.pop(0)
            if tid in visited:
                continue
            visited.add(tid)
            for successor in dep_map.get(tid, []):
                if successor not in affected_task_ids:
                    cascading_ids.append(successor)
                queue.append(successor)

        schedule_impact = {
            "affected_task_ids": affected_task_ids,
            "cascading_task_ids": list(set(cascading_ids)),
            "original_duration_days": original_cp.total_duration,
            "revised_duration_days": revised_cp.total_duration,
            "delay_days": revised_cp.total_duration - original_cp.total_duration,
            "critical_path_changed": set(original_cp.critical_path_ids) != set(revised_cp.critical_path_ids),
            "revised_end_date": None,
            "explanation": explanation,
        }

        return {"schedule_impact": schedule_impact}

    async def _analyze_cost_impact(self, state: ImpactState) -> dict[str, Any]:
        """Node 2: Analyse cost impact of the change order."""
        logger.info(
            "impact_analyze_cost",
            change_order_id=state["change_order_id"],
        )

        bom_data = state["bom_data"]
        change_details = state["change_details"]

        items = bom_data.get("items", [])
        original_cost = sum(
            (item.get("unit_price") or 0) * item.get("quantity", 0) * (1 + item.get("waste_factor", 0.05))
            for item in items
        )

        prompt = f"""You are a construction cost estimator for residential interior projects in India.

A change order has been submitted:
- Type: {state['change_order_type']}
- Title: {state['change_title']}
- Description: {state['change_description']}
- Details: {json.dumps(change_details, indent=2, default=str)}

Current BOM summary:
- Total items: {len(items)}
- Original total cost: INR {original_cost:,.2f}
- Categories: {json.dumps(list(set(item.get("category", "unknown") for item in items)))}

Analyse the cost impact and return a JSON object:
{{
    "cost_delta": <number - positive means more expensive>,
    "cost_delta_percent": <percentage change>,
    "affected_categories": ["list of affected material categories"],
    "line_item_changes": [
        {{"item": "item name", "original_cost": N, "revised_cost": N, "reason": "why"}}
    ],
    "explanation": "Brief explanation of cost impact"
}}

If you cannot determine exact costs, provide reasonable estimates based on
typical Indian interior project costs.

Return ONLY the JSON object."""

        cost_delta = 0.0
        cost_delta_percent = 0.0
        affected_categories: list[str] = []
        line_item_changes: list[dict[str, Any]] = []
        cost_explanation = "Unable to determine cost impact."

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.2,
                max_tokens=2000,
            )

            content = response.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            analysis = json.loads(content)
            cost_delta = float(analysis.get("cost_delta", 0))
            cost_delta_percent = float(analysis.get("cost_delta_percent", 0))
            affected_categories = analysis.get("affected_categories", [])
            line_item_changes = analysis.get("line_item_changes", [])
            cost_explanation = analysis.get("explanation", "")

        except Exception as exc:
            logger.warning("impact_cost_llm_failed", error=str(exc))
            cost_explanation = f"LLM analysis unavailable: {exc}"

        revised_cost = original_cost + cost_delta

        cost_impact = {
            "original_cost": round(original_cost, 2),
            "revised_cost": round(revised_cost, 2),
            "cost_delta": round(cost_delta, 2),
            "cost_delta_percent": round(cost_delta_percent, 2),
            "affected_categories": affected_categories,
            "line_item_changes": line_item_changes,
            "explanation": cost_explanation,
        }

        return {"cost_impact": cost_impact}

    async def _assess_risk(self, state: ImpactState) -> dict[str, Any]:
        """Node 3: Assess overall risk and generate recommendations."""
        logger.info(
            "impact_assess_risk",
            change_order_id=state["change_order_id"],
        )

        schedule_impact = state.get("schedule_impact", {})
        cost_impact = state.get("cost_impact", {})

        prompt = f"""You are a senior construction project risk assessor.

Assess the overall risk of this change order based on the analysed impacts:

Change Order:
- Type: {state['change_order_type']}
- Title: {state['change_title']}
- Description: {state['change_description']}

Schedule Impact:
- Delay: {schedule_impact.get('delay_days', 0)} days
- Critical path changed: {schedule_impact.get('critical_path_changed', False)}
- Tasks affected: {len(schedule_impact.get('affected_task_ids', []))} direct, {len(schedule_impact.get('cascading_task_ids', []))} cascading

Cost Impact:
- Cost change: INR {cost_impact.get('cost_delta', 0):,.2f} ({cost_impact.get('cost_delta_percent', 0):.1f}%)
- Categories affected: {cost_impact.get('affected_categories', [])}

Return a JSON object:
{{
    "risk_level": "low" | "medium" | "high" | "critical",
    "recommendations": [
        "Specific, actionable recommendation 1",
        "Specific, actionable recommendation 2",
        ...
    ]
}}

Return ONLY the JSON object."""

        risk_level = "medium"
        recommendations: list[str] = []

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.3,
                max_tokens=1000,
            )

            content = response.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            assessment = json.loads(content)
            risk_level = assessment.get("risk_level", "medium")
            recommendations = assessment.get("recommendations", [])

        except Exception as exc:
            logger.warning("impact_risk_llm_failed", error=str(exc))
            # Heuristic risk assessment fallback
            delay = abs(schedule_impact.get("delay_days", 0))
            cost_pct = abs(cost_impact.get("cost_delta_percent", 0))

            if delay > 14 or cost_pct > 20:
                risk_level = "critical"
            elif delay > 7 or cost_pct > 10:
                risk_level = "high"
            elif delay > 3 or cost_pct > 5:
                risk_level = "medium"
            else:
                risk_level = "low"

            recommendations = [
                "Review the change order details with the site supervisor.",
                "Update the project timeline and communicate new dates to stakeholders.",
                "Re-evaluate material procurement to align with the revised schedule.",
            ]

        # Assemble the final impact analysis
        now = datetime.now(tz=timezone.utc)

        impact_analysis = ImpactAnalysis(
            change_order_id=state["change_order_id"],
            schedule_impact=ScheduleImpact(**schedule_impact),
            cost_impact=CostImpact(**cost_impact),
            risk_level=risk_level,
            recommendations=recommendations,
            analyzed_at=now,
        )

        return {
            "risk_assessment": {"risk_level": risk_level, "recommendations": recommendations},
            "impact_analysis": impact_analysis.model_dump(mode="json"),
        }
