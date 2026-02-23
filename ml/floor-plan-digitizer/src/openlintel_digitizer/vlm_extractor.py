"""
VLM-based floor plan extraction.

Uses a vision-language model to "read" a floor plan image and extract
structured room geometry: wall segments, room polygons, door/window
openings, and dimension annotations — all returned as JSON that maps
directly to ``FloorPlanData``.

This is the core intelligence of the digitizer: a well-prompted VLM can
understand floor plan conventions (wall thickness, door arcs, dimension
lines, room labels) better than traditional CV approaches.
"""

from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any

import litellm
import numpy as np
from PIL import Image

from openlintel_digitizer.schemas import (
    DimensionAnnotation,
    DoorWindow,
    DoorWindowType,
    FloorPlanData,
    Point2D,
    RoomPolygon,
    WallSegment,
    WallType,
)

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """\
You are an expert architectural draughtsman AI.  You read floor plan images
and extract precise structural information.  You understand architectural
drawing conventions: wall line weights, door swing arcs, window symbols,
dimension lines, room labels, and scale annotations.

Rules:
- All coordinates and dimensions MUST be in millimetres (mm).
- Use a coordinate system with origin at the bottom-left corner of the plan, Y-axis pointing up.
- Wall segments are defined by centre-line start/end points.
- Room polygons are closed, counter-clockwise vertex lists.
- Door/window openings reference their parent wall by ID.
- Respond ONLY with valid JSON — no prose, no markdown fences.
"""

EXTRACTION_USER_PROMPT = """\
Analyse this floor plan image and extract ALL structural information.

The image dimensions are {width} x {height} pixels.
{scale_hint}

Return a JSON object with this exact structure:
{{
  "project_name": "<name from the title block, or 'Untitled'>",
  "scale_description": "<e.g. '1:100' if visible>",
  "walls": [
    {{
      "id": "W1",
      "start": {{ "x": <mm>, "y": <mm> }},
      "end": {{ "x": <mm>, "y": <mm> }},
      "thickness_mm": <float>,
      "wall_type": "<exterior|interior_load_bearing|interior_partition>",
      "height_mm": <float>
    }}
  ],
  "rooms": [
    {{
      "id": "R1",
      "name": "<room label from plan>",
      "room_type": "<living_room|bedroom|kitchen|bathroom|dining|study|balcony|utility|foyer|corridor|pooja_room|store|garage|terrace|other>",
      "vertices": [
        {{ "x": <mm>, "y": <mm> }}
      ],
      "wall_ids": ["W1", "W2", ...]
    }}
  ],
  "openings": [
    {{
      "id": "D1",
      "type": "<single_door|double_door|sliding_door|pocket_door|french_door|entrance_door|single_window|double_window|bay_window|sliding_window|casement_window|fixed_window>",
      "wall_id": "W1",
      "position_along_wall_mm": <float>,
      "width_mm": <float>,
      "height_mm": <float>,
      "sill_height_mm": <float>,
      "swing_direction": "<left|right|inward|outward|null>"
    }}
  ],
  "dimensions": [
    {{
      "start": {{ "x": <mm>, "y": <mm> }},
      "end": {{ "x": <mm>, "y": <mm> }},
      "value_mm": <float>,
      "label": "<text>"
    }}
  ]
}}

Be thorough:
- Include ALL walls, including short partition walls.
- Include ALL rooms with their correct labels.
- Include ALL doors and windows with correct types.
- Extract ALL dimension annotations visible on the plan.
- If no scale is visible, estimate dimensions from typical room sizes
  (bedrooms ~3500x4000mm, bathrooms ~2000x2500mm, etc.).
"""


def _image_to_data_uri(image: Image.Image | np.ndarray) -> str:
    """Convert image to a base64 data URI."""
    if isinstance(image, np.ndarray):
        image = Image.fromarray(image)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def _parse_json_response(text: str) -> dict[str, Any]:
    """Parse JSON from a VLM response, handling common quirks."""
    cleaned = text.strip()

    if cleaned.startswith("```"):
        first_nl = cleaned.index("\n")
        cleaned = cleaned[first_nl + 1 :]
        if "```" in cleaned:
            cleaned = cleaned[: cleaned.rindex("```")]
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from VLM response:\n{text[:500]}")


def _safe_door_window_type(raw_type: str) -> DoorWindowType:
    """Convert a raw type string to DoorWindowType, with fallback."""
    try:
        return DoorWindowType(raw_type)
    except ValueError:
        # Try normalising
        normalised = raw_type.strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return DoorWindowType(normalised)
        except ValueError:
            if "door" in normalised:
                return DoorWindowType.SINGLE_DOOR
            if "window" in normalised:
                return DoorWindowType.SINGLE_WINDOW
            return DoorWindowType.SINGLE_DOOR


def _safe_wall_type(raw_type: str) -> WallType:
    """Convert a raw type string to WallType, with fallback."""
    try:
        return WallType(raw_type)
    except ValueError:
        normalised = raw_type.strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return WallType(normalised)
        except ValueError:
            if "exterior" in normalised or "outer" in normalised:
                return WallType.EXTERIOR
            if "load" in normalised or "bearing" in normalised:
                return WallType.INTERIOR_LOAD_BEARING
            return WallType.INTERIOR_PARTITION


class VLMExtractor:
    """Extracts structured floor plan data from images using a VLM.

    Parameters
    ----------
    model:
        LiteLLM model identifier.
    api_key:
        API key for the VLM provider.
    scale_mm_per_pixel:
        If known, the mm-per-pixel scale of the image.  If ``None``,
        the VLM will estimate from typical room proportions.
    """

    def __init__(
        self,
        model: str = "openai/gpt-4o",
        api_key: str | None = None,
        scale_mm_per_pixel: float | None = None,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._scale_mm_per_pixel = scale_mm_per_pixel

    async def extract(
        self,
        image: Image.Image | np.ndarray,
    ) -> FloorPlanData:
        """Extract floor plan data from an image.

        Parameters
        ----------
        image:
            Floor plan image (PIL or numpy array).

        Returns
        -------
        FloorPlanData
            Structured floor plan data.
        """
        if isinstance(image, np.ndarray):
            pil_image = Image.fromarray(image)
        else:
            pil_image = image

        width, height = pil_image.size
        data_uri = _image_to_data_uri(pil_image)

        scale_hint = ""
        if self._scale_mm_per_pixel:
            scale_hint = (
                f"The image scale is approximately {self._scale_mm_per_pixel:.2f} mm/pixel. "
                f"Use this to compute real-world coordinates."
            )

        user_prompt = EXTRACTION_USER_PROMPT.format(
            width=width,
            height=height,
            scale_hint=scale_hint,
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": user_prompt},
                ],
            },
        ]

        call_kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.1,  # Low temperature for precise extraction
            "max_tokens": 8192,
        }
        if self._api_key:
            call_kwargs["api_key"] = self._api_key

        logger.info(
            "VLM floor plan extraction: model=%s, image=%dx%d",
            self._model,
            width,
            height,
        )

        response = await litellm.acompletion(**call_kwargs)
        raw_text = response.choices[0].message.content
        raw_data = _parse_json_response(raw_text)

        floor_plan = self._parse_extraction(raw_data)

        logger.info(
            "Extracted: %d walls, %d rooms, %d openings, %d dimensions",
            floor_plan.wall_count,
            floor_plan.room_count,
            floor_plan.opening_count,
            len(floor_plan.dimensions),
        )

        return floor_plan

    async def extract_from_bytes(self, image_bytes: bytes) -> FloorPlanData:
        """Convenience: extract from raw image bytes."""
        image = Image.open(io.BytesIO(image_bytes))
        return await self.extract(image)

    def _parse_extraction(self, data: dict[str, Any]) -> FloorPlanData:
        """Parse raw VLM JSON output into a validated ``FloorPlanData``."""
        walls: list[WallSegment] = []
        for w in data.get("walls", []):
            try:
                walls.append(WallSegment(
                    id=str(w["id"]),
                    start=Point2D(x=float(w["start"]["x"]), y=float(w["start"]["y"])),
                    end=Point2D(x=float(w["end"]["x"]), y=float(w["end"]["y"])),
                    thickness_mm=float(w.get("thickness_mm", 150)),
                    wall_type=_safe_wall_type(w.get("wall_type", "interior_partition")),
                    height_mm=float(w.get("height_mm", 2700)),
                ))
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Skipping malformed wall: %s (%s)", w.get("id", "?"), exc)

        rooms: list[RoomPolygon] = []
        for r in data.get("rooms", []):
            try:
                vertices = [
                    Point2D(x=float(v["x"]), y=float(v["y"]))
                    for v in r.get("vertices", [])
                ]
                if len(vertices) >= 3:
                    rooms.append(RoomPolygon(
                        id=str(r["id"]),
                        name=str(r.get("name", "Room")),
                        room_type=str(r.get("room_type", "other")),
                        vertices=vertices,
                        wall_ids=[str(wid) for wid in r.get("wall_ids", [])],
                    ))
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Skipping malformed room: %s (%s)", r.get("id", "?"), exc)

        openings: list[DoorWindow] = []
        for o in data.get("openings", []):
            try:
                openings.append(DoorWindow(
                    id=str(o["id"]),
                    type=_safe_door_window_type(o.get("type", "single_door")),
                    wall_id=str(o.get("wall_id", "")),
                    position_along_wall_mm=float(o.get("position_along_wall_mm", 0)),
                    width_mm=float(o.get("width_mm", 900)),
                    height_mm=float(o.get("height_mm", 2100)),
                    sill_height_mm=float(o.get("sill_height_mm", 0)),
                    swing_direction=o.get("swing_direction"),
                ))
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Skipping malformed opening: %s (%s)", o.get("id", "?"), exc)

        dimensions: list[DimensionAnnotation] = []
        for d in data.get("dimensions", []):
            try:
                dimensions.append(DimensionAnnotation(
                    start=Point2D(x=float(d["start"]["x"]), y=float(d["start"]["y"])),
                    end=Point2D(x=float(d["end"]["x"]), y=float(d["end"]["y"])),
                    value_mm=float(d["value_mm"]),
                    label=str(d.get("label", "")),
                ))
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Skipping malformed dimension: %s", exc)

        return FloorPlanData(
            project_name=data.get("project_name", "Untitled"),
            walls=walls,
            rooms=rooms,
            openings=openings,
            dimensions=dimensions,
            source_type="raster",
        )
