"""
HVAC Agent — LangGraph agent for HVAC load calculations.

Performs cooling and heating load calculations per ASHRAE Manual J
(simplified method), duct sizing, and equipment recommendations.
"""

from __future__ import annotations

from typing import Any, TypedDict

import structlog
from langchain_core.messages import BaseMessage
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase

from src.models.hvac import HVACRequest, HVACResult
from src.services.ashrae_methods import (
    calculate_cooling_load,
    calculate_duct_sizing,
    calculate_heating_load,
    recommend_equipment,
)

logger = structlog.get_logger(__name__)

# Conversion factor: 1 mm = 0.00328084 feet, 1 sqm = 10.7639 sqft
MM_TO_FEET = 0.00328084
SQM_TO_SQFT = 10.7639


class HVACState(TypedDict):
    """State managed by the HVAC agent graph."""

    messages: list[BaseMessage]
    request: dict[str, Any]
    cooling_load: dict[str, Any] | None
    heating_load: dict[str, Any] | None
    duct_sizing: dict[str, Any] | None
    equipment: list[dict[str, Any]]
    result: dict[str, Any] | None
    errors: list[str]
    complete: bool


class HVACAgent(AgentBase):
    """LangGraph agent for HVAC load calculations.

    Uses ASHRAE Manual J simplified methods for all calculations.
    """

    def build_graph(self) -> StateGraph:
        """Build the HVAC calculation graph.

        Nodes:
        1. calculate_cooling — Calculate cooling load
        2. calculate_heating — Calculate heating load
        3. size_equipment — Size ductwork and recommend equipment
        4. build_result — Compile the final result

        Edges:
        calculate_cooling -> calculate_heating -> size_equipment -> build_result -> END
        """
        graph = StateGraph(HVACState)

        graph.add_node("calculate_cooling", self._calculate_cooling)
        graph.add_node("calculate_heating", self._calculate_heating)
        graph.add_node("size_equipment", self._size_equipment)
        graph.add_node("build_result", self._build_result)

        graph.set_entry_point("calculate_cooling")
        graph.add_edge("calculate_cooling", "calculate_heating")
        graph.add_edge("calculate_heating", "size_equipment")
        graph.add_edge("size_equipment", "build_result")
        graph.add_edge("build_result", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Create initial state for HVAC calculation."""
        request = kwargs.get("request", {})
        if isinstance(request, HVACRequest):
            request = request.model_dump()
        return HVACState(
            messages=[],
            request=request,
            cooling_load=None,
            heating_load=None,
            duct_sizing=None,
            equipment=[],
            result=None,
            errors=[],
            complete=False,
        )

    async def _calculate_cooling(self, state: HVACState) -> dict[str, Any]:
        """Calculate cooling load per ASHRAE Manual J."""
        request = state["request"]

        # Convert mm to feet/sqft
        length_m = request.get("room_length_mm", 3000) / 1000.0
        width_m = request.get("room_width_mm", 3000) / 1000.0
        room_area_sqft = length_m * width_m * SQM_TO_SQFT

        cooling = calculate_cooling_load(
            room_area_sqft=room_area_sqft,
            orientation=request.get("orientation", "south"),
            insulation=request.get("insulation", "average"),
            climate_zone=request.get("climate_zone", "hot_humid"),
            occupancy=request.get("occupancy", 2),
            window_area_sqft=request.get("window_area_sqft", 20.0),
            num_external_walls=request.get("num_external_walls", 2),
            equipment_heat_watts=request.get("equipment_heat_watts", 500.0),
            lighting_watts=request.get("lighting_watts", 200.0),
        )

        return {"cooling_load": cooling.model_dump()}

    async def _calculate_heating(self, state: HVACState) -> dict[str, Any]:
        """Calculate heating load per ASHRAE Manual J."""
        request = state["request"]

        length_m = request.get("room_length_mm", 3000) / 1000.0
        width_m = request.get("room_width_mm", 3000) / 1000.0
        room_area_sqft = length_m * width_m * SQM_TO_SQFT

        heating = calculate_heating_load(
            room_area_sqft=room_area_sqft,
            insulation=request.get("insulation", "average"),
            climate_zone=request.get("climate_zone", "hot_humid"),
            num_external_walls=request.get("num_external_walls", 2),
            window_area_sqft=request.get("window_area_sqft", 20.0),
        )

        return {"heating_load": heating.model_dump()}

    async def _size_equipment(self, state: HVACState) -> dict[str, Any]:
        """Size ductwork and recommend equipment."""
        cooling_load = state["cooling_load"]
        heating_load = state["heating_load"]

        if not cooling_load or not heating_load:
            return {"errors": state["errors"] + ["Missing load calculations"]}

        cooling_btu = cooling_load["total_load_btu"]
        heating_btu = heating_load["total_load_btu"]

        duct = calculate_duct_sizing(cooling_btu)
        equipment = recommend_equipment(cooling_btu, heating_btu)

        return {
            "duct_sizing": duct.model_dump(),
            "equipment": [e.model_dump() for e in equipment],
        }

    async def _build_result(self, state: HVACState) -> dict[str, Any]:
        """Compile the final HVAC calculation result."""
        request = state["request"]

        from src.models.hvac import CoolingLoad, DuctSize, EquipmentSpec, HeatingLoad

        cooling = CoolingLoad(**state["cooling_load"]) if state["cooling_load"] else None
        heating = HeatingLoad(**state["heating_load"]) if state["heating_load"] else None
        duct = DuctSize(**state["duct_sizing"]) if state["duct_sizing"] else None
        equipment = [EquipmentSpec(**e) for e in state["equipment"]]

        if not cooling or not heating or not duct:
            return {
                "errors": state["errors"] + ["Incomplete calculations"],
                "complete": True,
            }

        length_m = request.get("room_length_mm", 3000) / 1000.0
        width_m = request.get("room_width_mm", 3000) / 1000.0
        room_area_sqft = length_m * width_m * SQM_TO_SQFT

        notes = [
            f"Per ASHRAE Manual J: Room area = {round(room_area_sqft, 1)} sqft",
            f"Per ASHRAE Manual J: Total cooling load = {round(cooling.total_load_btu, 0)} BTU/hr "
            f"({cooling.load_tons} tons)",
            f"Per ASHRAE Manual J: Total heating load = {round(heating.total_load_btu, 0)} BTU/hr",
            f"Per ASHRAE Fundamentals Ch.21: Supply airflow = {round(duct.supply_cfm, 0)} CFM",
            f"Climate zone: {request.get('climate_zone', 'hot_humid')}, "
            f"Insulation: {request.get('insulation', 'average')}, "
            f"Orientation: {request.get('orientation', 'south')}",
        ]

        result = HVACResult(
            project_id=request.get("project_id", ""),
            room_id=request.get("room_id", ""),
            cooling_load=cooling,
            heating_load=heating,
            duct_sizing=duct,
            recommended_equipment=equipment,
            notes=notes,
        )

        return {
            "result": result.model_dump(),
            "complete": True,
        }
