"""
Cut List Agent — LangGraph agent that analyses furniture specifications
and determines the optimal panel breakdown.

Uses LiteLLM to interpret furniture specs and produce a list of
CutListPanel objects with grain direction, edge banding requirements,
and material assignments.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, TypedDict

import structlog
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

from src.models.panels import (
    CutListPanel,
    EdgeBandingSpec,
    FurnitureSpec,
    PanelMaterial,
)

logger = structlog.get_logger(__name__)


class CutListState(TypedDict):
    """State managed by the cut list agent graph."""

    messages: list[BaseMessage]
    furniture_specs: list[dict[str, Any]]
    panels: list[dict[str, Any]]
    errors: list[str]
    iteration: int
    complete: bool


SYSTEM_PROMPT = """You are an expert interior design and woodworking engineer.
Given a furniture specification, break it down into individual panels needed
for manufacturing.

For each panel, determine:
1. Part name (e.g. "Top Panel", "Left Side", "Bottom Panel", "Back Panel",
   "Shelf", "Door", "Drawer Front", "Drawer Side", "Drawer Bottom", "Drawer Back")
2. Exact dimensions (length_mm, width_mm) based on the furniture unit dimensions
3. Grain direction: "length" if grain should run along the longest dimension,
   "width" if perpendicular, "none" for MDF/particle board
4. Edge banding: which edges are visible and need banding (top, bottom, left, right)
5. Quantity of each panel type

Standard rules:
- Side panels: height x depth of the unit
- Top/bottom panels: width x depth (subtract 2x material thickness for inset)
- Back panels: use 4mm or 6mm hardboard/MDF, full width x full height
- Shelves: internal width (width - 2x thickness) x depth
- Doors: calculated from opening size with 2mm gap per side
- Drawer fronts: opening width with overlay or inset calculation
- Drawer sides: depth x drawer height (use 12mm for sides)
- Drawer bottom: 4mm MDF/hardboard

Return a JSON array of panel objects with these exact fields:
{
  "part_name": string,
  "length_mm": number,
  "width_mm": number,
  "thickness_mm": number,
  "grain_direction": "length" | "width" | "none",
  "edge_banding": {"top": bool, "bottom": bool, "left": bool, "right": bool},
  "quantity": number,
  "notes": string
}

Return ONLY the JSON array, no other text."""


class CutListAgent(AgentBase):
    """LangGraph agent that converts furniture specs into panel cut lists.

    Uses LiteLLM to analyze each furniture specification and produce
    a detailed panel breakdown with dimensions, grain direction, and
    edge banding requirements.
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
        """Construct the LangGraph state graph for panel breakdown.

        Graph nodes:
        1. analyze_specs — Send furniture spec to LLM for panel analysis
        2. parse_panels — Parse LLM response into CutListPanel objects
        3. validate_panels — Validate dimensions and constraints

        Edges:
        analyze_specs -> parse_panels -> validate_panels -> END
        """
        graph = StateGraph(CutListState)

        graph.add_node("analyze_specs", self._analyze_specs)
        graph.add_node("parse_panels", self._parse_panels)
        graph.add_node("validate_panels", self._validate_panels)

        graph.set_entry_point("analyze_specs")
        graph.add_edge("analyze_specs", "parse_panels")
        graph.add_edge("parse_panels", "validate_panels")
        graph.add_edge("validate_panels", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Create the initial state for a cut list generation run.

        Parameters
        ----------
        furniture_specs:
            List of FurnitureSpec dicts to analyze.
        """
        specs = kwargs.get("furniture_specs", [])
        return CutListState(
            messages=[],
            furniture_specs=[
                s.model_dump() if isinstance(s, FurnitureSpec) else s for s in specs
            ],
            panels=[],
            errors=[],
            iteration=0,
            complete=False,
        )

    async def _analyze_specs(self, state: CutListState) -> dict[str, Any]:
        """Send furniture specifications to the LLM for panel analysis."""
        specs = state["furniture_specs"]
        all_panels: list[dict[str, Any]] = []
        messages: list[BaseMessage] = list(state["messages"])
        errors: list[str] = list(state["errors"])

        for spec in specs:
            spec_description = (
                f"Furniture: {spec['name']}\n"
                f"Category: {spec['category']}\n"
                f"Dimensions: {spec['width_mm']}mm W x {spec['height_mm']}mm H x {spec['depth_mm']}mm D\n"
                f"Material: {spec['material']} at {spec['thickness_mm']}mm thickness\n"
            )
            if spec.get("face_laminate"):
                spec_description += f"Face laminate: {spec['face_laminate']}\n"
            if spec.get("notes"):
                spec_description += f"Notes: {spec['notes']}\n"

            human_msg = HumanMessage(content=spec_description)
            messages.append(human_msg)

            try:
                response = await self._llm.completion(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": spec_description},
                    ],
                    temperature=0.2,
                    max_tokens=4000,
                )

                content = response.choices[0].message.content or "[]"
                ai_msg = AIMessage(content=content)
                messages.append(ai_msg)

                # Parse the JSON response
                # Strip markdown code fences if present
                clean = content.strip()
                if clean.startswith("```"):
                    lines = clean.split("\n")
                    clean = "\n".join(lines[1:])
                    if clean.endswith("```"):
                        clean = clean[:-3]

                panel_dicts = json.loads(clean)

                for p in panel_dicts:
                    p["furniture_unit_id"] = spec["furniture_unit_id"]
                    p["material"] = spec["material"]
                    if spec.get("face_laminate"):
                        p["face_laminate"] = spec["face_laminate"]
                    # Ensure thickness from spec unless overridden
                    if "thickness_mm" not in p:
                        p["thickness_mm"] = spec["thickness_mm"]

                all_panels.extend(panel_dicts)

            except json.JSONDecodeError as exc:
                error_msg = f"Failed to parse LLM response for {spec['name']}: {exc}"
                logger.warning("cutlist_agent_parse_error", error=error_msg)
                errors.append(error_msg)
            except Exception as exc:
                error_msg = f"LLM call failed for {spec['name']}: {exc}"
                logger.warning("cutlist_agent_llm_error", error=error_msg)
                errors.append(error_msg)

        return {
            "messages": messages,
            "panels": all_panels,
            "errors": errors,
            "iteration": state["iteration"] + 1,
        }

    async def _parse_panels(self, state: CutListState) -> dict[str, Any]:
        """Parse raw panel dicts into CutListPanel model objects."""
        raw_panels = state["panels"]
        parsed: list[dict[str, Any]] = []
        errors: list[str] = list(state["errors"])

        for raw in raw_panels:
            try:
                eb_data = raw.get("edge_banding", {})
                edge_banding = EdgeBandingSpec(
                    top=eb_data.get("top", False),
                    bottom=eb_data.get("bottom", False),
                    left=eb_data.get("left", False),
                    right=eb_data.get("right", False),
                    material=eb_data.get("material"),
                    thickness_mm=eb_data.get("thickness_mm"),
                )

                panel = CutListPanel(
                    id=str(uuid.uuid4()),
                    furniture_unit_id=raw["furniture_unit_id"],
                    part_name=raw["part_name"],
                    length_mm=float(raw["length_mm"]),
                    width_mm=float(raw["width_mm"]),
                    thickness_mm=float(raw.get("thickness_mm", 18)),
                    material=PanelMaterial(raw.get("material", "bwr_plywood")),
                    grain_direction=raw.get("grain_direction", "length"),
                    face_laminate=raw.get("face_laminate"),
                    edge_banding=edge_banding,
                    quantity=int(raw.get("quantity", 1)),
                )
                parsed.append(panel.model_dump())

            except Exception as exc:
                error_msg = f"Failed to parse panel '{raw.get('part_name', 'unknown')}': {exc}"
                logger.warning("cutlist_agent_panel_parse_error", error=error_msg)
                errors.append(error_msg)

        return {"panels": parsed, "errors": errors}

    async def _validate_panels(self, state: CutListState) -> dict[str, Any]:
        """Validate parsed panels for dimensional correctness."""
        panels = state["panels"]
        errors: list[str] = list(state["errors"])
        validated: list[dict[str, Any]] = []

        for panel_dict in panels:
            length = panel_dict.get("length_mm", 0)
            width = panel_dict.get("width_mm", 0)
            thickness = panel_dict.get("thickness_mm", 0)

            # Sanity checks
            if length <= 0 or width <= 0:
                errors.append(
                    f"Panel '{panel_dict.get('part_name')}' has invalid dimensions: "
                    f"{length}x{width}mm"
                )
                continue

            if length > 2440 or width > 2440:
                errors.append(
                    f"Panel '{panel_dict.get('part_name')}' exceeds maximum sheet size: "
                    f"{length}x{width}mm (max 2440mm)"
                )
                continue

            if thickness <= 0 or thickness > 50:
                errors.append(
                    f"Panel '{panel_dict.get('part_name')}' has unusual thickness: {thickness}mm"
                )
                continue

            validated.append(panel_dict)

        return {"panels": validated, "errors": errors, "complete": True}
