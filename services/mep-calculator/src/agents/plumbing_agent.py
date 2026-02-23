"""
Plumbing Agent — LangGraph agent for plumbing calculations.

Performs fixture unit calculations per IPC 604.4, pipe sizing from
fixture unit totals, and drainage slope calculation per IPC 704.1.
"""

from __future__ import annotations

from typing import Any, TypedDict

import structlog
from langchain_core.messages import BaseMessage
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase

from src.models.plumbing import (
    FixtureUnit,
    PlumbingRequest,
    PlumbingResult,
)
from src.services.ipc_tables import (
    calculate_drainage,
    get_fixture_unit,
    size_supply_pipe,
)

logger = structlog.get_logger(__name__)


class PlumbingState(TypedDict):
    """State managed by the plumbing agent graph."""

    messages: list[BaseMessage]
    request: dict[str, Any]
    fixture_units: list[dict[str, Any]]
    total_supply_fu: float
    total_drainage_fu: float
    result: dict[str, Any] | None
    errors: list[str]
    complete: bool


class PlumbingAgent(AgentBase):
    """LangGraph agent for plumbing calculations.

    Uses IPC lookup tables for all calculations.
    """

    def build_graph(self) -> StateGraph:
        """Build the plumbing calculation graph.

        Nodes:
        1. calculate_fixture_units — Look up fixture unit values
        2. size_pipes — Size supply and drainage pipes
        3. build_result — Compile the final result

        Edges:
        calculate_fixture_units -> size_pipes -> build_result -> END
        """
        graph = StateGraph(PlumbingState)

        graph.add_node("calculate_fixture_units", self._calculate_fixture_units)
        graph.add_node("size_pipes", self._size_pipes)
        graph.add_node("build_result", self._build_result)

        graph.set_entry_point("calculate_fixture_units")
        graph.add_edge("calculate_fixture_units", "size_pipes")
        graph.add_edge("size_pipes", "build_result")
        graph.add_edge("build_result", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Create initial state for plumbing calculation."""
        request = kwargs.get("request", {})
        if isinstance(request, PlumbingRequest):
            request = request.model_dump()
        return PlumbingState(
            messages=[],
            request=request,
            fixture_units=[],
            total_supply_fu=0.0,
            total_drainage_fu=0.0,
            result=None,
            errors=[],
            complete=False,
        )

    async def _calculate_fixture_units(self, state: PlumbingState) -> dict[str, Any]:
        """Look up fixture unit values for all fixtures per IPC Table 604.4."""
        request = state["request"]
        fixtures = request.get("fixtures", [])
        errors: list[str] = list(state["errors"])
        fixture_units: list[dict[str, Any]] = []
        total_supply = 0.0
        total_drainage = 0.0

        for fixture_dict in fixtures:
            for fixture_type, quantity in fixture_dict.items():
                if quantity <= 0:
                    continue
                try:
                    fu = get_fixture_unit(fixture_type, quantity)
                    fixture_units.append(fu.model_dump())
                    total_supply += fu.fixture_units
                    total_drainage += fu.drainage_fixture_units
                except Exception as exc:
                    error_msg = (
                        f"Unknown fixture type '{fixture_type}': {exc}. "
                        f"Using default 1.0 FU."
                    )
                    logger.warning("plumbing_fixture_error", error=error_msg)
                    errors.append(error_msg)
                    total_supply += quantity
                    total_drainage += quantity

        return {
            "fixture_units": fixture_units,
            "total_supply_fu": total_supply,
            "total_drainage_fu": total_drainage,
            "errors": errors,
        }

    async def _size_pipes(self, state: PlumbingState) -> dict[str, Any]:
        """Size supply and drainage pipes based on fixture unit totals."""
        total_supply = state["total_supply_fu"]
        total_drainage = state["total_drainage_fu"]
        request = state["request"]
        hot_water = request.get("hot_water_required", True)

        # Size main supply pipe
        supply_pipe = size_supply_pipe(total_supply, pipe_material="CPVC")

        # Size drainage
        drainage = calculate_drainage(total_drainage, pipe_material="PVC")

        # Hot and cold water pipes
        hot_water_pipe = None
        cold_water_pipe = None
        if hot_water:
            # Hot water typically serves ~60% of fixtures
            hot_fu = total_supply * 0.6
            cold_fu = total_supply * 0.8  # Cold serves most fixtures
            hot_water_pipe = size_supply_pipe(hot_fu, pipe_material="CPVC")
            cold_water_pipe = size_supply_pipe(cold_fu, pipe_material="CPVC")

        return {
            "request": {
                **request,
                "supply_pipe": supply_pipe.model_dump(),
                "drainage": drainage.model_dump(),
                "hot_water_pipe": hot_water_pipe.model_dump() if hot_water_pipe else None,
                "cold_water_pipe": cold_water_pipe.model_dump() if cold_water_pipe else None,
            }
        }

    async def _build_result(self, state: PlumbingState) -> dict[str, Any]:
        """Compile the final plumbing calculation result."""
        request = state["request"]
        fixture_units = [FixtureUnit(**fu) for fu in state["fixture_units"]]

        from src.models.plumbing import DrainageCalc, PipeSpec

        supply_pipe = PipeSpec(**request["supply_pipe"])
        drainage = DrainageCalc(**request["drainage"])
        hot_water_pipe = PipeSpec(**request["hot_water_pipe"]) if request.get("hot_water_pipe") else None
        cold_water_pipe = PipeSpec(**request["cold_water_pipe"]) if request.get("cold_water_pipe") else None

        notes = [
            f"Per IPC Table 604.4: Total supply fixture units = {state['total_supply_fu']}",
            f"Per IPC Table 709.1: Total drainage fixture units = {state['total_drainage_fu']}",
            f"Per IPC Table 710.1(2): {drainage.pipe_size_inches}\" drain pipe required",
            f"Per IPC 704.1: Minimum drainage slope = {drainage.slope_inches_per_foot}\" per foot",
            f"Per IPC Table 916.1: {drainage.vent_size_inches}\" vent pipe required",
        ]

        result = PlumbingResult(
            project_id=request.get("project_id", ""),
            room_id=request.get("room_id", ""),
            fixture_units=fixture_units,
            total_supply_fixture_units=state["total_supply_fu"],
            total_drainage_fixture_units=state["total_drainage_fu"],
            supply_pipe=supply_pipe,
            drainage=drainage,
            hot_water_pipe=hot_water_pipe,
            cold_water_pipe=cold_water_pipe,
            notes=notes,
        )

        return {
            "result": result.model_dump(),
            "complete": True,
        }
