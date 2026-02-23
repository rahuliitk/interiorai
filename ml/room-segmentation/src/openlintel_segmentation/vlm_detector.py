"""
VLM-based object detection for room elements.

Uses a vision-language model (via LiteLLM) to identify and localise objects
in a room photograph.  The VLM returns structured JSON with labels, bounding
boxes, materials, and colours — which are then refined by SAM 2 for precise
pixel-level masks.

This approach is preferred over traditional detection models because:
1. It understands interior-design vocabulary natively.
2. It can identify materials and colours without a separate classifier.
3. It generalises to unusual furniture and decor without fine-tuning.
"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any

import litellm
import numpy as np
from PIL import Image

from openlintel_segmentation.schemas import (
    BoundingBox,
    DetectedObject,
    ObjectCategory,
)

logger = logging.getLogger(__name__)

# Mapping from VLM-generated category strings to our enum
_CATEGORY_MAP: dict[str, ObjectCategory] = {
    "wall": ObjectCategory.WALL,
    "floor": ObjectCategory.FLOOR,
    "ceiling": ObjectCategory.CEILING,
    "window": ObjectCategory.WINDOW,
    "door": ObjectCategory.DOOR,
    "column": ObjectCategory.COLUMN,
    "beam": ObjectCategory.BEAM,
    "furniture": ObjectCategory.FURNITURE,
    "sofa": ObjectCategory.FURNITURE,
    "chair": ObjectCategory.FURNITURE,
    "table": ObjectCategory.FURNITURE,
    "bed": ObjectCategory.FURNITURE,
    "desk": ObjectCategory.FURNITURE,
    "cabinet": ObjectCategory.FURNITURE,
    "shelf": ObjectCategory.FURNITURE,
    "wardrobe": ObjectCategory.FURNITURE,
    "dresser": ObjectCategory.FURNITURE,
    "appliance": ObjectCategory.APPLIANCE,
    "refrigerator": ObjectCategory.APPLIANCE,
    "oven": ObjectCategory.APPLIANCE,
    "washer": ObjectCategory.APPLIANCE,
    "fixture": ObjectCategory.FIXTURE,
    "sink": ObjectCategory.FIXTURE,
    "toilet": ObjectCategory.FIXTURE,
    "bathtub": ObjectCategory.FIXTURE,
    "shower": ObjectCategory.FIXTURE,
    "textile": ObjectCategory.TEXTILE,
    "rug": ObjectCategory.TEXTILE,
    "curtain": ObjectCategory.TEXTILE,
    "carpet": ObjectCategory.TEXTILE,
    "decor": ObjectCategory.DECOR,
    "plant": ObjectCategory.DECOR,
    "artwork": ObjectCategory.DECOR,
    "vase": ObjectCategory.DECOR,
    "mirror": ObjectCategory.DECOR,
    "lighting": ObjectCategory.LIGHTING,
    "lamp": ObjectCategory.LIGHTING,
    "chandelier": ObjectCategory.LIGHTING,
    "sconce": ObjectCategory.LIGHTING,
    "outlet": ObjectCategory.OUTLET,
    "switch": ObjectCategory.SWITCH,
}

DETECTION_PROMPT = """\
Analyse this room photograph and identify ALL visible objects and structural
elements.  For each object, provide:

1. A descriptive label (e.g. "leather three-seater sofa", "oak parquet floor")
2. Its category (one of: wall, floor, ceiling, window, door, column, beam,
   furniture, appliance, fixture, textile, decor, lighting, outlet, switch, other)
3. Bounding box as [x_min, y_min, x_max, y_max] in pixel coordinates
   (image dimensions: {width} x {height} pixels)
4. Confidence score (0.0 to 1.0)
5. Detected material (e.g. "leather", "oak wood", "marble", "glass")
6. Dominant colour

Return ONLY a JSON array:
[
  {{
    "label": "<descriptive label>",
    "category": "<category>",
    "bbox": [<x_min>, <y_min>, <x_max>, <y_max>],
    "confidence": <float>,
    "material": "<material or null>",
    "color": "<color or null>"
  }}
]

Be thorough — include walls, floor, ceiling, all furniture, all fixtures,
all visible outlets/switches, and any decorative items.
"""


def _resolve_category(raw_category: str) -> ObjectCategory:
    """Map a VLM-generated category string to our ``ObjectCategory`` enum."""
    normalised = raw_category.strip().lower().replace(" ", "_")
    return _CATEGORY_MAP.get(normalised, ObjectCategory.OTHER)


def _image_to_data_uri(image: Image.Image, fmt: str = "JPEG") -> str:
    """Convert a PIL Image to a base64 data URI."""
    import io

    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    mime = "image/jpeg" if fmt == "JPEG" else "image/png"
    return f"data:{mime};base64,{b64}"


def _parse_detection_response(text: str) -> list[dict[str, Any]]:
    """Parse the VLM JSON response, handling common formatting quirks."""
    cleaned = text.strip()

    # Strip markdown fences
    if cleaned.startswith("```"):
        first_nl = cleaned.index("\n")
        cleaned = cleaned[first_nl + 1 :]
        if "```" in cleaned:
            cleaned = cleaned[: cleaned.rindex("```")]
        cleaned = cleaned.strip()

    # Try direct parse
    try:
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "objects" in result:
            return result["objects"]
        return [result]
    except json.JSONDecodeError:
        pass

    # Find array boundaries
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse detection response:\n{text[:500]}")


class VLMDetector:
    """VLM-based object detector for room interiors.

    Uses a vision-language model to identify objects, their categories,
    bounding boxes, materials, and colours in a room photograph.

    Parameters
    ----------
    model:
        LiteLLM model identifier (e.g. ``"openai/gpt-4o"``).
    api_key:
        Optional API key for the VLM provider.
    confidence_threshold:
        Minimum confidence score to include a detection.
    """

    def __init__(
        self,
        model: str = "openai/gpt-4o",
        api_key: str | None = None,
        confidence_threshold: float = 0.3,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._confidence_threshold = confidence_threshold

    async def detect(
        self,
        image: Image.Image,
    ) -> list[DetectedObject]:
        """Detect objects in a room photograph.

        Parameters
        ----------
        image:
            PIL Image of the room.

        Returns
        -------
        list[DetectedObject]
            Detected objects with bounding boxes but without SAM masks
            (masks are added by the segmentation pipeline).
        """
        width, height = image.size
        data_uri = _image_to_data_uri(image)

        prompt = DETECTION_PROMPT.format(width=width, height=height)

        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        call_kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 4096,
        }
        if self._api_key:
            call_kwargs["api_key"] = self._api_key

        logger.info("VLM detection request: model=%s, image=%dx%d", self._model, width, height)

        response = await litellm.acompletion(**call_kwargs)
        raw_text = response.choices[0].message.content

        raw_detections = _parse_detection_response(raw_text)

        objects: list[DetectedObject] = []
        for idx, det in enumerate(raw_detections):
            confidence = float(det.get("confidence", 0.5))
            if confidence < self._confidence_threshold:
                continue

            bbox_raw = det.get("bbox", [0, 0, width, height])
            bbox = BoundingBox(
                x_min=max(0, int(bbox_raw[0])),
                y_min=max(0, int(bbox_raw[1])),
                x_max=min(width, int(bbox_raw[2])),
                y_max=min(height, int(bbox_raw[3])),
            )

            obj = DetectedObject(
                id=idx,
                label=det.get("label", "unknown"),
                category=_resolve_category(det.get("category", "other")),
                confidence=confidence,
                bbox=bbox,
                detected_material=det.get("material"),
                detected_color=det.get("color"),
            )
            objects.append(obj)

        logger.info("VLM detected %d objects (threshold=%.2f)", len(objects), self._confidence_threshold)
        return objects

    async def detect_from_bytes(self, image_bytes: bytes) -> list[DetectedObject]:
        """Convenience: detect objects from raw image bytes."""
        import io

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return await self.detect(image)

    async def detect_from_path(self, path: str | Path) -> list[DetectedObject]:
        """Convenience: detect objects from a file path."""
        image = Image.open(path).convert("RGB")
        return await self.detect(image)
