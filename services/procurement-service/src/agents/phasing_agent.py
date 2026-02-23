"""
LangGraph-based order phasing agent.

Determines the optimal order timing for purchase orders based on the
construction schedule milestones, implementing just-in-time (JIT) ordering
logic to minimise on-site storage while ensuring materials arrive before
they are needed.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

logger = structlog.get_logger(__name__)


# -- Trade-to-category mapping for phasing ----------------------------------

TRADE_CATEGORY_MAP: dict[str, list[str]] = {
    "demolition": ["civil"],
    "civil": ["civil"],
    "plumbing_rough_in": ["plumbing"],
    "electrical_rough_in": ["electrical"],
    "false_ceiling": ["false_ceiling"],
    "flooring": ["flooring"],
    "carpentry": ["carpentry", "hardware", "glass_aluminum"],
    "painting": ["painting"],
    "mep_fixtures": ["sanitaryware", "appliances", "electrical"],
    "soft_furnishing": ["soft_furnishing", "decor"],
    "cleanup": [],
}

# Buffer days: how many days before the trade starts should materials arrive
DEFAULT_BUFFER_DAYS = 3
FRAGILE_BUFFER_DAYS = 2  # Less buffer for fragile items (deliver closer to use)
HEAVY_BUFFER_DAYS = 5    # More buffer for heavy/civil items


# -- State definition -------------------------------------------------------


class PhasingState(TypedDict, total=False):
    """Shared state flowing through the phasing agent graph."""

    # Inputs
    project_id: str
    purchase_orders: list[dict[str, Any]]
    schedule_milestones: list[dict[str, Any]]
    vendor_lead_times: dict[str, int]

    # LLM credentials
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    category_to_milestone: dict[str, dict[str, Any]]
    order_phases: list[dict[str, Any]]

    # Output
    phased_orders: list[dict[str, Any]]
    phase_summary: dict[str, Any]
    error: str | None


# -- Agent implementation ---------------------------------------------------


class PhasingAgent(AgentBase):
    """LangGraph agent that phases purchase orders to align with the
    construction schedule.

    Three-node pipeline:
      1. map_categories_to_milestones -- determine when each material category is needed
      2. compute_order_dates -- calculate JIT order dates accounting for lead times
      3. assign_phases -- group orders into construction phases
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the phasing state graph."""
        graph = StateGraph(PhasingState)

        graph.add_node("map_categories_to_milestones", self._map_categories)
        graph.add_node("compute_order_dates", self._compute_order_dates)
        graph.add_node("assign_phases", self._assign_phases)

        graph.set_entry_point("map_categories_to_milestones")
        graph.add_edge("map_categories_to_milestones", "compute_order_dates")
        graph.add_edge("compute_order_dates", "assign_phases")
        graph.add_edge("assign_phases", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict."""
        # Build vendor lead time lookup
        vendor_lead_times: dict[str, int] = {}
        for po in kwargs.get("purchase_orders", []):
            vendor = po.get("vendor") or {}
            vendor_id = po.get("vendor_id") or vendor.get("id", "")
            lead_time = vendor.get("lead_time_days", 7)
            if vendor_id:
                vendor_lead_times[vendor_id] = lead_time

        return {
            "project_id": kwargs["project_id"],
            "purchase_orders": kwargs.get("purchase_orders", []),
            "schedule_milestones": kwargs.get("schedule_milestones", []),
            "vendor_lead_times": vendor_lead_times,
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "category_to_milestone": {},
            "order_phases": [],
            "phased_orders": [],
            "phase_summary": {},
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _map_categories(self, state: PhasingState) -> dict[str, Any]:
        """Node 1: Map material categories to schedule milestones."""
        logger.info("phasing_map_categories", project_id=state["project_id"])

        milestones = state["schedule_milestones"]
        category_map: dict[str, dict[str, Any]] = {}

        for milestone in milestones:
            trade = milestone.get("trade", "")
            target_date = milestone.get("target_date", "")
            categories = TRADE_CATEGORY_MAP.get(trade, [])

            for category in categories:
                # Use the earliest milestone date for each category
                if category not in category_map or target_date < category_map[category].get("needed_by", "9999-12-31"):
                    category_map[category] = {
                        "category": category,
                        "trade": trade,
                        "milestone_name": milestone.get("name", ""),
                        "needed_by": target_date,
                    }

        # For categories without milestones, use project midpoint as default
        all_dates = [m.get("target_date", "") for m in milestones if m.get("target_date")]
        if all_dates:
            sorted_dates = sorted(all_dates)
            midpoint_idx = len(sorted_dates) // 2
            default_date = sorted_dates[midpoint_idx]
        else:
            default_date = (date.today() + timedelta(days=30)).isoformat()

        # Ensure all PO categories have a mapping
        for po in state["purchase_orders"]:
            for item in po.get("items", []):
                cat = item.get("category", "general")
                if cat not in category_map:
                    category_map[cat] = {
                        "category": cat,
                        "trade": "general",
                        "milestone_name": "General Phase",
                        "needed_by": default_date,
                    }

        return {"category_to_milestone": category_map}

    async def _compute_order_dates(self, state: PhasingState) -> dict[str, Any]:
        """Node 2: Compute JIT order dates for each purchase order."""
        logger.info("phasing_compute_dates", project_id=state["project_id"])

        purchase_orders = state["purchase_orders"]
        category_map = state["category_to_milestone"]
        vendor_lead_times = state["vendor_lead_times"]

        order_phases: list[dict[str, Any]] = []

        for po in purchase_orders:
            vendor_id = po.get("vendor_id", "")
            lead_time = vendor_lead_times.get(vendor_id, 7)

            # Find the earliest needed_by date across all items in this PO
            earliest_needed = None
            primary_category = None

            for item in po.get("items", []):
                cat = item.get("category", "general")
                milestone_info = category_map.get(cat, {})
                needed_by = milestone_info.get("needed_by")

                if needed_by:
                    if earliest_needed is None or needed_by < earliest_needed:
                        earliest_needed = needed_by
                        primary_category = cat

            if earliest_needed is None:
                earliest_needed = (date.today() + timedelta(days=30)).isoformat()

            needed_date = date.fromisoformat(earliest_needed)

            # Determine buffer based on category
            buffer_days = DEFAULT_BUFFER_DAYS
            if primary_category in ("civil",):
                buffer_days = HEAVY_BUFFER_DAYS
            elif primary_category in ("soft_furnishing", "decor"):
                buffer_days = FRAGILE_BUFFER_DAYS

            # JIT: order_date = needed_date - lead_time - buffer
            total_lead = lead_time + buffer_days
            order_date = needed_date - timedelta(days=total_lead)

            # Ensure order date is not in the past
            today = date.today()
            if order_date < today:
                order_date = today

            expected_delivery = order_date + timedelta(days=lead_time)

            # Determine phase name from the trade
            milestone_info = category_map.get(primary_category or "", {})
            phase_name = milestone_info.get("trade", "general")

            order_phases.append({
                "order_id": po.get("id"),
                "vendor_id": vendor_id,
                "vendor_name": po.get("vendor_name", ""),
                "primary_category": primary_category,
                "phase": phase_name,
                "needed_by_date": needed_date.isoformat(),
                "lead_time_days": lead_time,
                "buffer_days": buffer_days,
                "recommended_order_date": order_date.isoformat(),
                "expected_delivery_date": expected_delivery.isoformat(),
                "item_count": len(po.get("items", [])),
                "total_amount": po.get("total_amount", 0),
            })

        # Sort by recommended order date
        order_phases.sort(key=lambda x: x["recommended_order_date"])

        return {"order_phases": order_phases}

    async def _assign_phases(self, state: PhasingState) -> dict[str, Any]:
        """Node 3: Assign construction phases and build the final output."""
        logger.info("phasing_assign_phases", project_id=state["project_id"])

        purchase_orders = state["purchase_orders"]
        order_phases = state["order_phases"]

        # Build a lookup from order_id to phase info
        phase_lookup: dict[str, dict[str, Any]] = {
            op["order_id"]: op for op in order_phases
        }

        # Update purchase orders with phasing information
        phased_orders: list[dict[str, Any]] = []
        for po in purchase_orders:
            updated = {**po}
            phase_info = phase_lookup.get(po.get("id", ""))

            if phase_info:
                updated["phase"] = phase_info["phase"]
                updated["order_date"] = phase_info["recommended_order_date"]
                updated["expected_delivery_date"] = phase_info["expected_delivery_date"]

                # Update needed_by on each item
                needed_by = phase_info["needed_by_date"]
                for item in updated.get("items", []):
                    item["needed_by_date"] = needed_by

            phased_orders.append(updated)

        # Sort by phase sequence then order date
        phase_sequence = list(TRADE_CATEGORY_MAP.keys())
        phase_order_map = {p: i for i, p in enumerate(phase_sequence)}

        phased_orders.sort(key=lambda po: (
            phase_order_map.get(po.get("phase", ""), 99),
            po.get("order_date", "9999-12-31"),
        ))

        # Build phase summary
        phase_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for po in phased_orders:
            phase = po.get("phase", "general")
            phase_groups[phase].append(po)

        phase_summary = {
            "total_phases": len(phase_groups),
            "total_orders": len(phased_orders),
            "phases": {
                phase: {
                    "order_count": len(orders),
                    "total_value": round(sum(o.get("total_amount", 0) for o in orders), 2),
                    "earliest_order_date": min(
                        (o.get("order_date", "9999-12-31") for o in orders),
                        default=None,
                    ),
                    "latest_delivery_date": max(
                        (o.get("expected_delivery_date", "0000-00-00") for o in orders),
                        default=None,
                    ),
                }
                for phase, orders in phase_groups.items()
            },
        }

        return {
            "phased_orders": phased_orders,
            "phase_summary": phase_summary,
        }
