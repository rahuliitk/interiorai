"""
Hardware Agent — determines hardware schedules for furniture units.

Calculates hinges, drawer slides, handles, shelf supports, cam locks,
and other fittings required per furniture unit based on standard
furniture engineering rules and the LLM for complex configurations.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, TypedDict

import structlog
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

from src.models.hardware import HardwareItem, HardwareSchedule, HardwareType
from src.models.panels import FurnitureSpec

logger = structlog.get_logger(__name__)

# Standard hardware rules per furniture category
STANDARD_HARDWARE: dict[str, list[dict[str, Any]]] = {
    "wardrobe": [
        {"type": "hinge", "name": "110-degree soft-close hinge", "per_door": 3,
         "spec": "Hettich Sensys 110deg, 16mm overlay"},
        {"type": "handle", "name": "D-handle 128mm", "per_door": 1,
         "spec": "SS D-handle, 128mm center-to-center"},
        {"type": "shelf_support", "name": "Shelf support pin 5mm", "per_shelf": 4,
         "spec": "Nickel-plated 5mm shelf pin"},
        {"type": "cam_lock", "name": "Cam lock + dowel", "per_joint": 2,
         "spec": "15mm cam lock with 35mm dowel"},
        {"type": "channel", "name": "Dress rod oval channel", "per_unit": 1,
         "spec": "Oval aluminium channel, SS end supports"},
    ],
    "kitchen_base": [
        {"type": "hinge", "name": "110-degree soft-close hinge", "per_door": 2,
         "spec": "Hettich Sensys 110deg, 16mm overlay"},
        {"type": "handle", "name": "Profile handle 160mm", "per_door": 1,
         "spec": "Aluminium profile handle, 160mm"},
        {"type": "drawer_slide", "name": "Tandem box soft-close 500mm", "per_drawer": 1,
         "spec": "Hettich ArciTech 500mm, 40kg capacity, soft-close"},
        {"type": "leg", "name": "Adjustable leg 150mm", "per_unit": 4,
         "spec": "Plastic adjustable leg, 100-170mm range"},
        {"type": "soft_close", "name": "Soft-close damper", "per_door": 1,
         "spec": "Integrated soft-close, Hettich Silent System"},
    ],
    "kitchen_wall": [
        {"type": "hinge", "name": "110-degree soft-close hinge", "per_door": 2,
         "spec": "Hettich Sensys 110deg, 16mm overlay"},
        {"type": "handle", "name": "Profile handle 160mm", "per_door": 1,
         "spec": "Aluminium profile handle, 160mm"},
        {"type": "shelf_support", "name": "Shelf support pin 5mm", "per_shelf": 4,
         "spec": "Nickel-plated 5mm shelf pin"},
        {"type": "cam_lock", "name": "Cam lock + dowel", "per_joint": 2,
         "spec": "15mm cam lock with 35mm dowel"},
    ],
    "vanity": [
        {"type": "hinge", "name": "110-degree soft-close hinge", "per_door": 2,
         "spec": "Hettich Sensys 110deg, 16mm overlay"},
        {"type": "handle", "name": "D-handle 96mm", "per_door": 1,
         "spec": "SS D-handle, 96mm center-to-center"},
        {"type": "drawer_slide", "name": "Ball bearing slide 400mm", "per_drawer": 1,
         "spec": "Ball bearing slide 400mm, 25kg, soft-close"},
        {"type": "leg", "name": "Adjustable leg 150mm", "per_unit": 4,
         "spec": "Plastic adjustable leg, 100-170mm range"},
    ],
}


def _estimate_doors(spec: FurnitureSpec) -> int:
    """Estimate the number of doors based on unit width."""
    if spec.width_mm <= 500:
        return 1
    elif spec.width_mm <= 900:
        return 2
    elif spec.width_mm <= 1500:
        return 3
    else:
        return 4


def _estimate_drawers(spec: FurnitureSpec) -> int:
    """Estimate number of drawers based on category and height."""
    if "kitchen_base" in spec.category:
        return 1 if spec.width_mm <= 450 else 0
    if spec.category == "vanity":
        return 1
    return 0


def _estimate_shelves(spec: FurnitureSpec) -> int:
    """Estimate number of adjustable shelves based on height."""
    if spec.height_mm <= 800:
        return 1
    elif spec.height_mm <= 1200:
        return 2
    elif spec.height_mm <= 1800:
        return 3
    else:
        return 4


def generate_hardware_schedule_standard(
    specs: list[FurnitureSpec],
    project_id: str,
    room_id: str,
) -> HardwareSchedule:
    """Generate a hardware schedule using standard rules.

    This is the deterministic fallback that does not require an LLM call.
    It applies standard hardware rules based on furniture category and
    estimated door/drawer/shelf counts.

    Parameters
    ----------
    specs:
        Furniture specifications to generate hardware for.
    project_id:
        Project identifier.
    room_id:
        Room identifier.

    Returns
    -------
    HardwareSchedule
        Complete hardware schedule for all furniture units.
    """
    all_items: list[HardwareItem] = []

    for spec in specs:
        category = spec.category.lower()
        rules = STANDARD_HARDWARE.get(category, STANDARD_HARDWARE.get("wardrobe", []))

        doors = _estimate_doors(spec)
        drawers = _estimate_drawers(spec)
        shelves = _estimate_shelves(spec)
        joints = 4  # Minimum cam lock joints per unit

        for rule in rules:
            quantity = 0
            if "per_door" in rule:
                quantity = rule["per_door"] * doors
            elif "per_drawer" in rule:
                quantity = rule["per_drawer"] * drawers
            elif "per_shelf" in rule:
                quantity = rule["per_shelf"] * shelves
            elif "per_joint" in rule:
                quantity = rule["per_joint"] * joints
            elif "per_unit" in rule:
                quantity = rule["per_unit"]

            if quantity > 0:
                all_items.append(
                    HardwareItem(
                        id=str(uuid.uuid4()),
                        furniture_unit_id=spec.furniture_unit_id,
                        type=HardwareType(rule["type"]),
                        name=rule["name"],
                        specification=rule["spec"],
                        quantity=quantity,
                    )
                )

    logger.info(
        "hardware_schedule_generated",
        project_id=project_id,
        room_id=room_id,
        furniture_units=len(specs),
        total_items=len(all_items),
    )

    return HardwareSchedule(
        project_id=project_id,
        room_id=room_id,
        items=all_items,
        total_items=sum(item.quantity for item in all_items),
        furniture_unit_count=len(specs),
    )


class HardwareState(TypedDict):
    """State managed by the hardware agent graph."""

    messages: list[BaseMessage]
    furniture_specs: list[dict[str, Any]]
    hardware_items: list[dict[str, Any]]
    errors: list[str]
    complete: bool


HARDWARE_SYSTEM_PROMPT = """You are an expert furniture hardware engineer.
Given a furniture specification, determine all hardware fittings required.

For each hardware item, specify:
1. type: one of "hinge", "drawer_slide", "handle", "shelf_support", "cam_lock",
   "dowel", "screw", "leg", "soft_close", "gas_strut", "channel", "basket"
2. name: descriptive name
3. specification: technical specification with brand/model if applicable
4. quantity: exact count needed
5. notes: any special instructions

Consider:
- Number of doors (based on unit width and category)
- Drawer configurations (full extension, soft-close)
- Shelf support systems
- Connection hardware (cam locks, dowels, screws)
- Specialty hardware (gas struts for lift-up doors, baskets for kitchen)

Return a JSON array of hardware objects:
{
  "type": string,
  "name": string,
  "specification": string,
  "quantity": number,
  "notes": string
}

Return ONLY the JSON array, no other text."""


class HardwareAgent(AgentBase):
    """LangGraph agent that generates hardware schedules using LLM analysis.

    Falls back to standard rules if the LLM call fails.
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        model: str = "openai/gpt-4o",
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()
        self._model = model

    def build_graph(self) -> StateGraph:
        """Build the hardware analysis graph.

        Nodes:
        1. analyze_hardware — LLM analysis of hardware requirements
        2. parse_hardware — Parse and validate the results

        Edges:
        analyze_hardware -> parse_hardware -> END
        """
        graph = StateGraph(HardwareState)

        graph.add_node("analyze_hardware", self._analyze_hardware)
        graph.add_node("parse_hardware", self._parse_hardware)

        graph.set_entry_point("analyze_hardware")
        graph.add_edge("analyze_hardware", "parse_hardware")
        graph.add_edge("parse_hardware", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Create initial state for hardware analysis."""
        specs = kwargs.get("furniture_specs", [])
        return HardwareState(
            messages=[],
            furniture_specs=[
                s.model_dump() if isinstance(s, FurnitureSpec) else s for s in specs
            ],
            hardware_items=[],
            errors=[],
            complete=False,
        )

    async def _analyze_hardware(self, state: HardwareState) -> dict[str, Any]:
        """Send furniture specs to LLM for hardware analysis."""
        specs = state["furniture_specs"]
        all_items: list[dict[str, Any]] = []
        messages: list[BaseMessage] = list(state["messages"])
        errors: list[str] = list(state["errors"])

        for spec in specs:
            description = (
                f"Furniture: {spec['name']}\n"
                f"Category: {spec['category']}\n"
                f"Dimensions: {spec['width_mm']}mm W x {spec['height_mm']}mm H x {spec['depth_mm']}mm D\n"
                f"Material: {spec['material']} at {spec['thickness_mm']}mm thickness\n"
            )
            if spec.get("notes"):
                description += f"Notes: {spec['notes']}\n"

            messages.append(HumanMessage(content=description))

            try:
                response = await self._llm.completion(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": HARDWARE_SYSTEM_PROMPT},
                        {"role": "user", "content": description},
                    ],
                    temperature=0.2,
                    max_tokens=3000,
                )

                content = response.choices[0].message.content or "[]"
                messages.append(AIMessage(content=content))

                clean = content.strip()
                if clean.startswith("```"):
                    lines = clean.split("\n")
                    clean = "\n".join(lines[1:])
                    if clean.endswith("```"):
                        clean = clean[:-3]

                items = json.loads(clean)
                for item in items:
                    item["furniture_unit_id"] = spec["furniture_unit_id"]
                all_items.extend(items)

            except Exception as exc:
                error_msg = f"Hardware analysis failed for {spec['name']}: {exc}"
                logger.warning("hardware_agent_error", error=error_msg)
                errors.append(error_msg)

        return {
            "messages": messages,
            "hardware_items": all_items,
            "errors": errors,
        }

    async def _parse_hardware(self, state: HardwareState) -> dict[str, Any]:
        """Parse raw hardware dicts into validated HardwareItem objects."""
        raw_items = state["hardware_items"]
        parsed: list[dict[str, Any]] = []
        errors: list[str] = list(state["errors"])

        for raw in raw_items:
            try:
                item = HardwareItem(
                    id=str(uuid.uuid4()),
                    furniture_unit_id=raw["furniture_unit_id"],
                    type=HardwareType(raw["type"]),
                    name=raw["name"],
                    specification=raw.get("specification", raw.get("spec", "")),
                    quantity=max(1, int(raw.get("quantity", 1))),
                    notes=raw.get("notes"),
                )
                parsed.append(item.model_dump())
            except Exception as exc:
                error_msg = f"Failed to parse hardware item '{raw.get('name', 'unknown')}': {exc}"
                logger.warning("hardware_parse_error", error=error_msg)
                errors.append(error_msg)

        return {"hardware_items": parsed, "errors": errors, "complete": True}
