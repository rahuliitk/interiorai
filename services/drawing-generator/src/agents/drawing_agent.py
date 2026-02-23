"""
LangGraph-based drawing generation agent.

Orchestrates a multi-step pipeline for technical drawing creation:
  1. analyze         -- LLM analyses the design spec to plan drawing content
  2. coordinates     -- compute wall, furniture, and fixture coordinates
  3. layers          -- resolve which CAD layers are needed
  4. entities        -- generate drawing entities (lines, arcs, text)
  5. dimensions      -- add dimension lines and measurement annotations
  6. annotations     -- add labels, notes, leaders, and title block data

Each node mutates a shared ``DrawingState`` TypedDict that flows through the graph.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

from src.agents.annotation import (
    AnnotationSet,
    generate_complete_annotations,
    generate_drawing_notes,
    generate_electrical_annotations,
    generate_furniture_labels,
    generate_room_label,
    generate_wall_dimensions,
)
from src.agents.coordinate_calc import (
    generate_electrical_layout,
    generate_wall_coordinates,
    place_furniture_in_room,
)
from src.models.drawings import (
    DrawingStatus,
    DrawingType,
    ElectricalPoint,
    FurnitureItem,
    Point2D,
    WallSegment,
)
from src.templates.layers import ALL_LAYERS, LayerDef

logger = structlog.get_logger(__name__)


# -- State definition -------------------------------------------------------

class DrawingState(TypedDict, total=False):
    """Shared state flowing through the drawing agent graph."""

    # Inputs
    drawing_id: str
    project_id: str
    room_id: str
    room_name: str
    room_type: str
    room_dimensions: dict[str, float]
    design_variant_id: str
    design_style: str
    spec_json: dict[str, Any]
    drawing_types: list[str]
    scale: str
    elevation_walls: list[str]
    section_axis: str
    section_offset_mm: float
    paper_size: str

    # LLM credentials
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    analysis: dict[str, Any]
    walls: list[dict[str, Any]]
    furniture: list[dict[str, Any]]
    electrical_points: list[dict[str, Any]]
    active_layers: list[str]
    entities: dict[str, list[dict[str, Any]]]
    dimension_data: list[dict[str, Any]]
    annotation_data: dict[str, Any]

    # Output
    status: str
    drawing_data: dict[str, Any] | None
    error: str | None


# -- Agent implementation ---------------------------------------------------

class DrawingAgent(AgentBase):
    """LangGraph agent that generates technical drawing data from room geometry.

    The agent produces structured drawing data that is then rendered by the
    DXF, PDF, and SVG writer services.
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the drawing generation state graph."""
        graph = StateGraph(DrawingState)

        graph.add_node("analyze", self._analyze)
        graph.add_node("coordinates", self._coordinates)
        graph.add_node("layers", self._layers)
        graph.add_node("entities", self._entities)
        graph.add_node("dimensions", self._dimensions)
        graph.add_node("annotations", self._annotations)

        graph.set_entry_point("analyze")
        graph.add_edge("analyze", "coordinates")
        graph.add_edge("coordinates", "layers")
        graph.add_edge("layers", "entities")
        graph.add_edge("entities", "dimensions")
        graph.add_edge("dimensions", "annotations")
        graph.add_edge("annotations", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict from caller-supplied parameters."""
        return {
            "drawing_id": kwargs.get("drawing_id", str(uuid.uuid4())),
            "project_id": kwargs["project_id"],
            "room_id": kwargs["room_id"],
            "room_name": kwargs.get("room_name", ""),
            "room_type": kwargs["room_type"],
            "room_dimensions": kwargs["room_dimensions"],
            "design_variant_id": kwargs["design_variant_id"],
            "design_style": kwargs.get("design_style", "modern"),
            "spec_json": kwargs.get("spec_json", {}),
            "drawing_types": kwargs.get("drawing_types", ["floor_plan"]),
            "scale": kwargs.get("scale", "1:50"),
            "elevation_walls": kwargs.get("elevation_walls", []),
            "section_axis": kwargs.get("section_axis", "x"),
            "section_offset_mm": kwargs.get("section_offset_mm", 0),
            "paper_size": kwargs.get("paper_size", "A3"),
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "analysis": {},
            "walls": [],
            "furniture": [],
            "electrical_points": [],
            "active_layers": [],
            "entities": {},
            "dimension_data": [],
            "annotation_data": {},
            "status": DrawingStatus.PENDING,
            "drawing_data": None,
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _analyze(self, state: DrawingState) -> dict[str, Any]:
        """Node 1: Analyse the design spec to plan drawing content."""
        logger.info(
            "drawing_analyze_start",
            drawing_id=state["drawing_id"],
            drawing_types=state["drawing_types"],
        )

        spec_json = state.get("spec_json", {})
        room_dims = state["room_dimensions"]

        prompt = f"""You are an expert interior designer and CAD drafter.

Analyse this room design and list the elements to include in technical drawings.

Room: {state['room_name']} ({state['room_type']})
Dimensions: {room_dims.get('length_mm', 0)}mm L x {room_dims.get('width_mm', 0)}mm W x {room_dims.get('height_mm', 0)}mm H
Design Style: {state['design_style']}
Drawing Types Requested: {', '.join(state['drawing_types'])}

Design Specification:
{json.dumps(spec_json, indent=2, default=str) if spec_json else 'No detailed spec. Generate standard drawings for this room type.'}

Return a JSON object with:
{{
  "doors": [{{"wall": 0, "offset_mm": number, "width_mm": number}}],
  "windows": [{{"wall": 2, "offset_mm": number, "width_mm": number, "height_mm": number, "sill_mm": number}}],
  "furniture": [
    {{"name": "string", "type": "wardrobe|bed|sofa|desk|dining_table|tv_unit|dressing_table|bookshelf|shoe_rack", "width_mm": number, "depth_mm": number, "height_mm": number, "preferred_wall": "north|south|east|west"}}
  ],
  "ceiling_type": "none|peripheral|island|full|cove",
  "ceiling_drop_mm": number,
  "flooring_material": "string",
  "flooring_pattern": "straight|diagonal|herringbone",
  "tile_size_mm": [number, number],
  "wall_treatment": "paint|texture|wallpaper|panelling"
}}

Wall numbering: 0=South(bottom), 1=East(right), 2=North(top), 3=West(left).
Return ONLY the JSON object."""

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

            logger.info("drawing_analyze_complete", drawing_id=state["drawing_id"])
            return {"analysis": analysis, "status": DrawingStatus.ANALYZING}

        except Exception as exc:
            logger.warning("drawing_analyze_fallback", error=str(exc))
            # Fallback analysis
            analysis = _get_fallback_analysis(state["room_type"], state["room_dimensions"])
            return {"analysis": analysis, "status": DrawingStatus.ANALYZING}

    async def _coordinates(self, state: DrawingState) -> dict[str, Any]:
        """Node 2: Compute wall, furniture, and fixture coordinates."""
        logger.info("drawing_coordinates", drawing_id=state["drawing_id"])

        dims = state["room_dimensions"]
        length_mm = dims.get("length_mm", 3000)
        width_mm = dims.get("width_mm", 3000)
        analysis = state.get("analysis", {})

        # Generate wall coordinates
        walls = generate_wall_coordinates(
            length_mm=length_mm,
            width_mm=width_mm,
            doors=analysis.get("doors"),
            windows=analysis.get("windows"),
        )

        # Place furniture
        furniture_specs = analysis.get("furniture", [])
        furniture = place_furniture_in_room(
            length_mm=length_mm,
            width_mm=width_mm,
            furniture_specs=furniture_specs,
        )

        # Generate electrical layout
        electrical = generate_electrical_layout(
            length_mm=length_mm,
            width_mm=width_mm,
            room_type=state["room_type"],
            furniture=furniture,
        )

        return {
            "walls": [w.model_dump() for w in walls],
            "furniture": [f.model_dump() for f in furniture],
            "electrical_points": [e.model_dump() for e in electrical],
            "status": DrawingStatus.COMPUTING,
        }

    async def _layers(self, state: DrawingState) -> dict[str, Any]:
        """Node 3: Determine which CAD layers are needed."""
        logger.info("drawing_layers", drawing_id=state["drawing_id"])

        drawing_types = state.get("drawing_types", ["floor_plan"])
        active_layers: set[str] = set()

        # Base layers always included
        active_layers.update([
            "A-WALL", "A-WALL-INT", "A-DOOR", "A-GLAZ",
            "A-ANNO-DIMS", "A-ANNO-NOTE", "A-ANNO-TTLB",
        ])

        for dt in drawing_types:
            if dt in ("furnished_plan", "floor_plan"):
                active_layers.update(["I-FURN", "I-FURN-OUTL"])
            if dt == "electrical_layout":
                active_layers.update(["E-LITE", "E-POWR", "E-WIRE"])
            if dt == "rcp":
                active_layers.update(["A-CLNG", "A-CLNG-GRID", "E-LITE"])
            if dt == "flooring_layout":
                active_layers.update(["I-FLOR", "I-FLOR-PATT"])
            if dt in ("elevation", "section"):
                active_layers.update([
                    "A-WALL-HIDN", "A-SECT", "A-SECT-BYND",
                    "I-FURN", "A-AREA-IDEN",
                ])

        return {"active_layers": sorted(active_layers)}

    async def _entities(self, state: DrawingState) -> dict[str, Any]:
        """Node 4: Generate drawing entities (geometric primitives)."""
        logger.info("drawing_entities", drawing_id=state["drawing_id"])

        walls = [WallSegment(**w) for w in state.get("walls", [])]
        furniture = [FurnitureItem(**f) for f in state.get("furniture", [])]
        electrical = [ElectricalPoint(**e) for e in state.get("electrical_points", [])]
        analysis = state.get("analysis", {})

        entities: dict[str, list[dict[str, Any]]] = {
            "walls": [],
            "doors": [],
            "windows": [],
            "furniture": [],
            "electrical": [],
            "ceiling": [],
            "flooring": [],
        }

        # Wall entities
        for wall in walls:
            entities["walls"].append({
                "type": "wall",
                "start": (wall.start.x, wall.start.y),
                "end": (wall.end.x, wall.end.y),
                "thickness": wall.thickness_mm,
                "wall_type": wall.wall_type.value,
            })

            if wall.has_door:
                entities["doors"].append({
                    "type": "door",
                    "wall_start": (wall.start.x, wall.start.y),
                    "wall_end": (wall.end.x, wall.end.y),
                    "offset": wall.door_offset_mm,
                    "width": wall.door_width_mm,
                })

            if wall.has_window:
                entities["windows"].append({
                    "type": "window",
                    "wall_start": (wall.start.x, wall.start.y),
                    "wall_end": (wall.end.x, wall.end.y),
                    "offset": wall.window_offset_mm,
                    "width": wall.window_width_mm,
                    "height": wall.window_height_mm,
                    "sill": wall.window_sill_mm,
                })

        # Furniture entities
        for item in furniture:
            entities["furniture"].append({
                "type": "furniture",
                "name": item.name,
                "furniture_type": item.type,
                "position": (item.position.x, item.position.y),
                "width": item.width_mm,
                "depth": item.depth_mm,
                "height": item.height_mm,
                "rotation": item.rotation_deg,
            })

        # Electrical entities
        for point in electrical:
            entities["electrical"].append({
                "type": "electrical",
                "elec_type": point.type,
                "position": (point.position.x, point.position.y),
                "height": point.height_mm,
                "symbol": point.symbol,
                "circuit": point.circuit,
            })

        # Ceiling entities
        ceiling_type = analysis.get("ceiling_type", "none")
        if ceiling_type != "none":
            dims = state["room_dimensions"]
            drop = analysis.get("ceiling_drop_mm", 150)
            entities["ceiling"].append({
                "type": "ceiling",
                "ceiling_type": ceiling_type,
                "drop_mm": drop,
                "room_length": dims.get("length_mm", 3000),
                "room_width": dims.get("width_mm", 3000),
            })

        # Flooring entities
        flooring_pattern = analysis.get("flooring_pattern", "straight")
        tile_size = analysis.get("tile_size_mm", [600, 600])
        entities["flooring"].append({
            "type": "flooring",
            "material": analysis.get("flooring_material", "vitrified tiles"),
            "pattern": flooring_pattern,
            "tile_size": tile_size,
            "room_length": state["room_dimensions"].get("length_mm", 3000),
            "room_width": state["room_dimensions"].get("width_mm", 3000),
        })

        return {"entities": entities}

    async def _dimensions(self, state: DrawingState) -> dict[str, Any]:
        """Node 5: Generate dimension lines and measurements."""
        logger.info("drawing_dimensions", drawing_id=state["drawing_id"])

        walls = [WallSegment(**w) for w in state.get("walls", [])]
        dim_lines = generate_wall_dimensions(walls)

        dimension_data = [
            {
                "start": d.start,
                "end": d.end,
                "offset_mm": d.offset_mm,
                "text": d.text,
                "direction": d.direction,
                "layer": d.layer,
            }
            for d in dim_lines
        ]

        return {"dimension_data": dimension_data}

    async def _annotations(self, state: DrawingState) -> dict[str, Any]:
        """Node 6: Generate labels, notes, and title block data."""
        logger.info("drawing_annotations", drawing_id=state["drawing_id"])

        walls = [WallSegment(**w) for w in state.get("walls", [])]
        furniture = [FurnitureItem(**f) for f in state.get("furniture", [])]
        electrical = [ElectricalPoint(**e) for e in state.get("electrical_points", [])]

        dims = state["room_dimensions"]
        drawing_types = state.get("drawing_types", ["floor_plan"])

        annotation_set = generate_complete_annotations(
            walls=walls,
            furniture=furniture,
            electrical_points=electrical,
            room_name=state.get("room_name", "Room"),
            room_type=state["room_type"],
            length_mm=dims.get("length_mm", 3000),
            width_mm=dims.get("width_mm", 3000),
            drawing_type=drawing_types[0] if drawing_types else "floor_plan",
            scale=state.get("scale", "1:50"),
        )

        now = datetime.now(tz=timezone.utc)

        drawing_data = {
            "drawing_id": state["drawing_id"],
            "project_id": state["project_id"],
            "room_id": state["room_id"],
            "design_variant_id": state["design_variant_id"],
            "room_name": state.get("room_name", "Room"),
            "room_type": state["room_type"],
            "room_dimensions": state["room_dimensions"],
            "design_style": state.get("design_style", "modern"),
            "drawing_types": state["drawing_types"],
            "scale": state.get("scale", "1:50"),
            "paper_size": state.get("paper_size", "A3"),
            "walls": state.get("walls", []),
            "furniture": state.get("furniture", []),
            "electrical_points": state.get("electrical_points", []),
            "active_layers": state.get("active_layers", []),
            "entities": state.get("entities", {}),
            "dimensions": state.get("dimension_data", []),
            "annotations": {
                "dimensions": [
                    {"start": d.start, "end": d.end, "offset_mm": d.offset_mm,
                     "text": d.text, "direction": d.direction}
                    for d in annotation_set.dimensions
                ],
                "labels": [
                    {"position": l.position, "text": l.text, "height_mm": l.height_mm,
                     "rotation": l.rotation, "layer": l.layer}
                    for l in annotation_set.labels
                ],
                "leaders": [
                    {"anchor": ld.anchor, "text_position": ld.text_position, "text": ld.text}
                    for ld in annotation_set.leaders
                ],
                "notes": annotation_set.notes,
            },
            "analysis": state.get("analysis", {}),
            "created_at": now.isoformat(),
        }

        return {
            "drawing_data": drawing_data,
            "annotation_data": {
                "dimensions_count": len(annotation_set.dimensions),
                "labels_count": len(annotation_set.labels),
                "leaders_count": len(annotation_set.leaders),
            },
            "status": DrawingStatus.COMPLETE,
        }


# -- Fallback analysis -----------------------------------------------------

def _get_fallback_analysis(
    room_type: str,
    dimensions: dict[str, float],
) -> dict[str, Any]:
    """Return a sensible default analysis when the LLM is unavailable."""
    length_mm = dimensions.get("length_mm", 3600)
    width_mm = dimensions.get("width_mm", 3000)

    analysis: dict[str, Any] = {
        "doors": [{"wall": 0, "offset_mm": (length_mm - 900) / 2, "width_mm": 900}],
        "windows": [],
        "furniture": [],
        "ceiling_type": "none",
        "ceiling_drop_mm": 150,
        "flooring_material": "vitrified tiles",
        "flooring_pattern": "straight",
        "tile_size_mm": [600, 600],
        "wall_treatment": "paint",
    }

    # Add window on north wall for most rooms
    if room_type not in ("bathroom", "utility", "store", "corridor"):
        analysis["windows"] = [
            {"wall": 2, "offset_mm": (length_mm - 1200) / 2, "width_mm": 1200,
             "height_mm": 1200, "sill_mm": 900},
        ]

    # Room-specific furniture
    if room_type == "bedroom":
        analysis["furniture"] = [
            {"name": "King Bed", "type": "bed", "width_mm": 2000, "depth_mm": 1800,
             "height_mm": 450, "preferred_wall": "north"},
            {"name": "Wardrobe", "type": "wardrobe", "width_mm": 2400, "depth_mm": 600,
             "height_mm": 2100, "preferred_wall": "west"},
            {"name": "Side Table", "type": "desk", "width_mm": 500, "depth_mm": 400,
             "height_mm": 550, "preferred_wall": "east"},
        ]
        analysis["ceiling_type"] = "peripheral"

    elif room_type == "living_room":
        analysis["furniture"] = [
            {"name": "3-Seater Sofa", "type": "sofa", "width_mm": 2100, "depth_mm": 850,
             "height_mm": 750, "preferred_wall": "south"},
            {"name": "TV Unit", "type": "tv_unit", "width_mm": 1800, "depth_mm": 450,
             "height_mm": 500, "preferred_wall": "north"},
            {"name": "Coffee Table", "type": "desk", "width_mm": 1000, "depth_mm": 600,
             "height_mm": 400},
        ]
        analysis["ceiling_type"] = "peripheral"

    elif room_type == "kitchen":
        analysis["furniture"] = [
            {"name": "Base Cabinet", "type": "desk", "width_mm": length_mm * 0.8,
             "depth_mm": 600, "height_mm": 850, "preferred_wall": "north"},
            {"name": "Tall Unit", "type": "wardrobe", "width_mm": 600, "depth_mm": 600,
             "height_mm": 2100, "preferred_wall": "west"},
        ]
        analysis["flooring_material"] = "ceramic tiles"

    elif room_type == "study":
        analysis["furniture"] = [
            {"name": "Study Desk", "type": "desk", "width_mm": 1500, "depth_mm": 600,
             "height_mm": 750, "preferred_wall": "north"},
            {"name": "Bookshelf", "type": "bookshelf", "width_mm": 1200, "depth_mm": 350,
             "height_mm": 1800, "preferred_wall": "west"},
        ]

    elif room_type == "dining":
        analysis["furniture"] = [
            {"name": "Dining Table", "type": "dining_table", "width_mm": 1500,
             "depth_mm": 900, "height_mm": 750},
            {"name": "Crockery Unit", "type": "bookshelf", "width_mm": 1200,
             "depth_mm": 400, "height_mm": 1800, "preferred_wall": "north"},
        ]
        analysis["ceiling_type"] = "island"

    elif room_type == "bathroom":
        analysis["doors"] = [
            {"wall": 0, "offset_mm": 100, "width_mm": 750},
        ]
        analysis["furniture"] = [
            {"name": "Vanity", "type": "desk", "width_mm": 900, "depth_mm": 500,
             "height_mm": 850, "preferred_wall": "north"},
        ]
        analysis["flooring_material"] = "anti-skid ceramic tiles"
        analysis["tile_size_mm"] = [300, 300]

    return analysis
