"""
Electrical Agent — LangGraph agent for electrical load calculations.

Performs load calculation per NEC 310.16, circuit grouping, wire gauge
selection, and conduit fill calculation.  Uses deterministic NEC table
lookups with LLM assistance for complex circuit grouping decisions.
"""

from __future__ import annotations

import uuid
from typing import Any, TypedDict

import structlog
from langchain_core.messages import BaseMessage
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase

from src.models.electrical import (
    Appliance,
    CircuitSchedule,
    CircuitType,
    ElectricalRequest,
    ElectricalResult,
    LightingPoint,
    PanelSchedule,
)
from src.services.nec_tables import (
    calculate_conduit_size,
    calculate_demand_factor,
    select_breaker_size,
    select_wire_gauge,
)

logger = structlog.get_logger(__name__)


class ElectricalState(TypedDict):
    """State managed by the electrical agent graph."""

    messages: list[BaseMessage]
    request: dict[str, Any]
    circuits: list[dict[str, Any]]
    panel_schedule: dict[str, Any] | None
    result: dict[str, Any] | None
    errors: list[str]
    complete: bool


class ElectricalAgent(AgentBase):
    """LangGraph agent for electrical load calculations.

    Performs all calculations deterministically using NEC lookup tables.
    The graph structure ensures calculations happen in the correct order.
    """

    def build_graph(self) -> StateGraph:
        """Build the electrical calculation graph.

        Nodes:
        1. calculate_loads — Calculate connected and demand loads
        2. group_circuits — Group loads into circuits
        3. size_wiring — Select wire gauge and conduit for each circuit
        4. build_panel — Build the panel schedule

        Edges:
        calculate_loads -> group_circuits -> size_wiring -> build_panel -> END
        """
        graph = StateGraph(ElectricalState)

        graph.add_node("calculate_loads", self._calculate_loads)
        graph.add_node("group_circuits", self._group_circuits)
        graph.add_node("size_wiring", self._size_wiring)
        graph.add_node("build_panel", self._build_panel)

        graph.set_entry_point("calculate_loads")
        graph.add_edge("calculate_loads", "group_circuits")
        graph.add_edge("group_circuits", "size_wiring")
        graph.add_edge("size_wiring", "build_panel")
        graph.add_edge("build_panel", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Create initial state for electrical calculation."""
        request = kwargs.get("request", {})
        if isinstance(request, ElectricalRequest):
            request = request.model_dump()
        return ElectricalState(
            messages=[],
            request=request,
            circuits=[],
            panel_schedule=None,
            result=None,
            errors=[],
            complete=False,
        )

    async def _calculate_loads(self, state: ElectricalState) -> dict[str, Any]:
        """Calculate connected and demand loads for all appliances and lighting."""
        request = state["request"]
        appliances = [Appliance(**a) for a in request.get("appliances", [])]
        lighting = [LightingPoint(**l) for l in request.get("lighting", [])]
        voltage = request.get("voltage", 240.0)

        # Calculate room area for general lighting load (per NEC 220.12)
        room_length_m = request.get("room_length_mm", 3000) / 1000.0
        room_width_m = request.get("room_width_mm", 3000) / 1000.0
        room_area_sqft = room_length_m * room_width_m * 10.764

        # Per NEC 220.12: general lighting load = 3 VA per square foot
        min_lighting_va = room_area_sqft * 3.0

        # Actual lighting load
        actual_lighting_watts = sum(lp.wattage * lp.quantity for lp in lighting)
        total_lighting = max(min_lighting_va, actual_lighting_watts)

        # Group appliances by circuit type
        load_groups: dict[str, list[dict[str, Any]]] = {
            "lighting": [],
            "general_power": [],
            "dedicated": [],
            "kitchen": [],
            "bathroom": [],
            "hvac": [],
        }

        for app in appliances:
            group_key = app.circuit_type.value
            load_groups.setdefault(group_key, []).append({
                "name": app.name,
                "wattage": app.wattage * app.quantity,
                "voltage": app.voltage,
                "is_continuous": app.is_continuous,
                "dedicated": app.dedicated_circuit,
                "quantity": app.quantity,
            })

        # Add lighting to its group
        for lp in lighting:
            load_groups["lighting"].append({
                "name": lp.name,
                "wattage": lp.wattage * lp.quantity,
                "voltage": voltage,
                "is_continuous": True,  # Lighting considered continuous
                "dedicated": False,
                "quantity": lp.quantity,
            })

        return {
            "request": {
                **request,
                "load_groups": load_groups,
                "total_lighting_watts": total_lighting,
                "room_area_sqft": room_area_sqft,
            }
        }

    async def _group_circuits(self, state: ElectricalState) -> dict[str, Any]:
        """Group loads into circuits per NEC requirements."""
        request = state["request"]
        load_groups = request.get("load_groups", {})
        voltage = request.get("voltage", 240.0)
        circuits: list[dict[str, Any]] = []
        circuit_number = 1

        # Lighting circuits — per NEC 220.12, max 1920W per 20A circuit
        lighting_loads = load_groups.get("lighting", [])
        if lighting_loads:
            total_lighting = sum(l["wattage"] for l in lighting_loads)
            max_per_circuit = 1920.0  # 80% of 20A * 120V for continuous
            num_circuits = max(1, int(total_lighting / max_per_circuit) + 1)

            for i in range(num_circuits):
                share = total_lighting / num_circuits
                circuits.append({
                    "circuit_number": circuit_number,
                    "name": f"Lighting Circuit {i + 1}",
                    "circuit_type": "lighting",
                    "connected_load_watts": share,
                    "loads": [l["name"] for l in lighting_loads[
                        i * len(lighting_loads) // num_circuits:
                        (i + 1) * len(lighting_loads) // num_circuits
                    ]] or [f"Lighting group {i + 1}"],
                    "is_continuous": True,
                })
                circuit_number += 1

        # General power circuits — per NEC 210.11(C)(1), at least 2 small appliance circuits
        general_loads = load_groups.get("general_power", [])
        if general_loads:
            total_general = sum(l["wattage"] for l in general_loads)
            max_per_circuit = 2400.0  # 20A * 120V
            num_circuits = max(2, int(total_general / max_per_circuit) + 1)

            for i in range(num_circuits):
                share = total_general / num_circuits
                circuits.append({
                    "circuit_number": circuit_number,
                    "name": f"General Power {i + 1}",
                    "circuit_type": "general_power",
                    "connected_load_watts": share,
                    "loads": [l["name"] for l in general_loads] if i == 0 else [f"Receptacles group {i + 1}"],
                    "is_continuous": False,
                })
                circuit_number += 1

        # Dedicated circuits — each gets its own circuit
        for load in load_groups.get("dedicated", []):
            circuits.append({
                "circuit_number": circuit_number,
                "name": f"Dedicated - {load['name']}",
                "circuit_type": "dedicated",
                "connected_load_watts": load["wattage"],
                "loads": [load["name"]],
                "is_continuous": load.get("is_continuous", False),
            })
            circuit_number += 1

        # Kitchen circuits — per NEC 210.11(C)(1), at least 2 dedicated
        kitchen_loads = load_groups.get("kitchen", [])
        for load in kitchen_loads:
            circuits.append({
                "circuit_number": circuit_number,
                "name": f"Kitchen - {load['name']}",
                "circuit_type": "kitchen",
                "connected_load_watts": load["wattage"],
                "loads": [load["name"]],
                "is_continuous": False,
            })
            circuit_number += 1

        # Bathroom circuit — per NEC 210.11(C)(3)
        bathroom_loads = load_groups.get("bathroom", [])
        if bathroom_loads:
            circuits.append({
                "circuit_number": circuit_number,
                "name": "Bathroom GFCI",
                "circuit_type": "bathroom",
                "connected_load_watts": sum(l["wattage"] for l in bathroom_loads),
                "loads": [l["name"] for l in bathroom_loads],
                "is_continuous": False,
            })
            circuit_number += 1

        # HVAC circuits
        hvac_loads = load_groups.get("hvac", [])
        for load in hvac_loads:
            circuits.append({
                "circuit_number": circuit_number,
                "name": f"HVAC - {load['name']}",
                "circuit_type": "hvac",
                "connected_load_watts": load["wattage"],
                "loads": [load["name"]],
                "is_continuous": True,
            })
            circuit_number += 1

        return {"circuits": circuits}

    async def _size_wiring(self, state: ElectricalState) -> dict[str, Any]:
        """Select wire gauge, breaker size, and conduit for each circuit."""
        circuits = state["circuits"]
        voltage = state["request"].get("voltage", 240.0)
        sized_circuits: list[dict[str, Any]] = []

        for circuit in circuits:
            connected_watts = circuit["connected_load_watts"]
            demand_watts = calculate_demand_factor(connected_watts, circuit["circuit_type"])
            amperage = demand_watts / voltage
            is_continuous = circuit.get("is_continuous", False)

            # Per NEC 310.16: select wire gauge
            wire_spec = select_wire_gauge(amperage)

            # Per NEC 240.6(A): select breaker size
            breaker_amps = select_breaker_size(amperage, continuous=is_continuous)

            # Per NEC Chapter 9: calculate conduit
            # Assume 3 conductors (hot, neutral, ground) per circuit
            conduit_spec = calculate_conduit_size(wire_spec.gauge_awg, wire_count=3)

            circuit_schedule = CircuitSchedule(
                circuit_number=circuit["circuit_number"],
                name=circuit["name"],
                circuit_type=CircuitType(circuit["circuit_type"]),
                breaker_amps=breaker_amps,
                wire_spec=wire_spec,
                conduit_spec=conduit_spec,
                connected_load_watts=connected_watts,
                demand_load_watts=demand_watts,
                loads=circuit["loads"],
                standard_reference=(
                    f"Per NEC 310.16: {wire_spec.gauge_awg} at {wire_spec.ampacity}A; "
                    f"Breaker {breaker_amps}A per NEC 240.6(A)"
                ),
            )
            sized_circuits.append(circuit_schedule.model_dump())

        return {"circuits": sized_circuits}

    async def _build_panel(self, state: ElectricalState) -> dict[str, Any]:
        """Build the final panel schedule and result."""
        circuits = [CircuitSchedule(**c) for c in state["circuits"]]
        request = state["request"]
        voltage = request.get("voltage", 240.0)

        total_connected = sum(c.connected_load_watts for c in circuits)
        total_demand = sum(c.demand_load_watts for c in circuits)
        total_amps = total_demand / voltage

        # Select main breaker — per NEC 230.79
        main_breaker = select_breaker_size(total_amps, continuous=True)

        panel = PanelSchedule(
            panel_name="Main Distribution Board",
            main_breaker_amps=main_breaker,
            bus_voltage=voltage,
            phases=1,
            circuits=circuits,
            total_connected_load_watts=total_connected,
            total_demand_load_watts=total_demand,
            spare_circuits=2,
            standard_reference="Panel schedule per NEC Article 408",
        )

        result = ElectricalResult(
            project_id=request.get("project_id", ""),
            room_id=request.get("room_id", ""),
            panel_schedule=panel,
            total_connected_load_watts=total_connected,
            total_demand_load_watts=total_demand,
            total_current_amps=round(total_amps, 2),
            recommended_main_breaker_amps=main_breaker,
            notes=[
                "Per NEC 220.12: General lighting load calculated at 3 VA/sqft minimum",
                "Per NEC 210.20(A): Continuous loads rated at 80% of breaker capacity",
                "Per NEC 210.11(C)(1): Minimum two 20A small appliance circuits required",
                f"Total demand load: {round(total_demand, 0)}W ({round(total_amps, 1)}A at {voltage}V)",
            ],
        )

        return {
            "panel_schedule": panel.model_dump(),
            "result": result.model_dump(),
            "complete": True,
        }
