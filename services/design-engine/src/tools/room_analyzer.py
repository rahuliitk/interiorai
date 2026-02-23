"""
Room photo analysis tool for the LangGraph design agent.

Uses a VLM to analyze uploaded room photos and extract spatial context:
room type, existing furniture, lighting conditions, approximate dimensions,
wall/floor/ceiling materials, and any notable architectural features.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import structlog

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.llm import LiteLLMClient
from openlintel_shared.storage import download_file

logger = structlog.get_logger(__name__)


# Structured prompt that asks the VLM to return JSON analysis
_ANALYSIS_PROMPT = """\
Analyze this interior room photo in detail. Return your analysis as a JSON object with the following structure:

```json
{
  "room_type": "living_room | bedroom | kitchen | bathroom | dining | study | other",
  "estimated_dimensions": {
    "length_m": <float or null>,
    "width_m": <float or null>,
    "height_m": <float or null>,
    "area_sqm": <float or null>
  },
  "existing_furniture": [
    {
      "item": "<name>",
      "material": "<material>",
      "condition": "good | fair | poor",
      "approximate_position": "<description of where in the room>"
    }
  ],
  "architectural_features": {
    "windows": {"count": <int>, "type": "<description>", "natural_light": "abundant | moderate | limited"},
    "doors": {"count": <int>, "type": "<description>"},
    "ceiling": {"type": "flat | vaulted | coffered | tray | exposed_beams", "height_category": "standard | high | double_height"},
    "notable_features": ["<list of features like columns, arches, niches, fireplaces>"]
  },
  "current_materials": {
    "flooring": "<type e.g. hardwood, tile, carpet, marble, concrete>",
    "walls": "<type e.g. painted, wallpaper, exposed brick, paneled>",
    "ceiling": "<type e.g. painted, textured, wood>"
  },
  "lighting": {
    "natural_light_direction": "<N/S/E/W or unknown>",
    "natural_light_quality": "bright | moderate | dim",
    "existing_fixtures": ["<list of visible light fixtures>"]
  },
  "color_palette": {
    "dominant_colors": ["<color1>", "<color2>"],
    "accent_colors": ["<color1>"],
    "overall_tone": "warm | cool | neutral"
  },
  "current_style": "<detected current style e.g. modern, traditional, eclectic>",
  "condition": "excellent | good | needs_renovation | empty",
  "design_opportunities": ["<list of potential improvements>"],
  "constraints_detected": ["<list of structural/permanent elements that cannot be changed>"]
}
```

Be precise with your estimates. If you cannot determine something, use null.
Focus on details that would be important for an interior redesign.
"""


class RoomAnalyzer:
    """Analyzes room photos using VLM to extract spatial and design context.

    The analysis is used by the design agent to inform prompt building
    and ensure generated designs respect the room's physical constraints.

    Parameters
    ----------
    settings:
        Optional settings override.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._llm = LiteLLMClient(settings=self._settings)

    async def analyze(
        self,
        *,
        model: str,
        source_image_key: str,
        encrypted_key: str,
        iv: str,
        auth_tag: str,
        room_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Analyze a room photo and return structured spatial context.

        Parameters
        ----------
        model:
            LiteLLM model identifier (e.g. ``"openai/gpt-4o"``).
        source_image_key:
            MinIO storage key for the room photo.
        encrypted_key:
            User's encrypted API key (hex).
        iv:
            Initialisation vector (hex).
        auth_tag:
            GCM auth tag (hex).
        room_metadata:
            Optional existing room metadata (dimensions, type) from the DB
            to supplement the VLM analysis.

        Returns
        -------
        dict
            Structured room analysis JSON.
        """
        logger.info(
            "room_analysis_start",
            storage_key=source_image_key,
            model=model,
        )

        # Load the room photo from MinIO
        try:
            image_bytes = download_file(
                bucket=self._settings.MINIO_BUCKET,
                key=source_image_key,
                settings=self._settings,
            )
        except Exception:
            logger.exception("room_analysis_image_load_failed", storage_key=source_image_key)
            return self._fallback_analysis(room_metadata)

        b64_image = base64.b64encode(image_bytes).decode("utf-8")

        # Detect mime type
        mime_type = "image/jpeg"
        lower_key = source_image_key.lower()
        if lower_key.endswith(".png"):
            mime_type = "image/png"
        elif lower_key.endswith(".webp"):
            mime_type = "image/webp"

        # Build the prompt, incorporating any known metadata
        prompt = _ANALYSIS_PROMPT
        if room_metadata:
            supplement = "\n\nAdditional known information about this room:\n"
            if room_metadata.get("type"):
                supplement += f"- Room type: {room_metadata['type']}\n"
            if room_metadata.get("length_mm") and room_metadata.get("width_mm"):
                length_m = room_metadata["length_mm"] / 1000
                width_m = room_metadata["width_mm"] / 1000
                supplement += f"- Known dimensions: {length_m:.1f}m x {width_m:.1f}m\n"
            if room_metadata.get("height_mm"):
                height_m = room_metadata["height_mm"] / 1000
                supplement += f"- Ceiling height: {height_m:.1f}m\n"
            prompt += supplement + "\nUse this information to refine your analysis."

        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    "You are an expert interior designer and spatial analyst. "
                    "You analyze room photographs to extract detailed information about "
                    "the space, including furniture, materials, dimensions, and design opportunities. "
                    "Always respond with valid JSON."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}",
                            "detail": "high",
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            },
        ]

        try:
            response = await self._llm.completion(
                model=model,
                messages=messages,
                encrypted_key=encrypted_key,
                iv=iv,
                auth_tag=auth_tag,
                temperature=0.3,  # Low temperature for factual analysis
                max_tokens=3000,
            )

            raw_text = ""
            if response.choices and len(response.choices) > 0:
                choice = response.choices[0]
                if hasattr(choice, "message") and choice.message:
                    raw_text = choice.message.content or ""

            analysis = self._parse_analysis(raw_text)

            logger.info(
                "room_analysis_complete",
                storage_key=source_image_key,
                room_type=analysis.get("room_type"),
                furniture_count=len(analysis.get("existing_furniture", [])),
            )

            return analysis

        except Exception:
            logger.exception("room_analysis_vlm_failed", storage_key=source_image_key)
            return self._fallback_analysis(room_metadata)

    @staticmethod
    def _parse_analysis(raw_text: str) -> dict[str, Any]:
        """Parse the VLM analysis response into structured JSON.

        Parameters
        ----------
        raw_text:
            Raw text from the VLM.

        Returns
        -------
        dict
            Parsed analysis, or a minimal fallback if parsing fails.
        """
        # Try to extract JSON from ```json blocks
        if "```json" in raw_text:
            try:
                json_start = raw_text.index("```json") + len("```json")
                json_end = raw_text.index("```", json_start)
                json_str = raw_text[json_start:json_end].strip()
                return json.loads(json_str)
            except (ValueError, json.JSONDecodeError):
                pass

        # Try parsing the whole response as JSON
        try:
            return json.loads(raw_text.strip())
        except json.JSONDecodeError:
            pass

        # If all parsing fails, return a minimal structure
        return {
            "room_type": "other",
            "raw_analysis": raw_text,
            "parse_error": True,
        }

    @staticmethod
    def _fallback_analysis(room_metadata: dict[str, Any] | None) -> dict[str, Any]:
        """Build a minimal analysis from database metadata when VLM analysis fails.

        Parameters
        ----------
        room_metadata:
            Known room data from the DB.

        Returns
        -------
        dict
            Minimal room analysis.
        """
        analysis: dict[str, Any] = {
            "room_type": "other",
            "estimated_dimensions": None,
            "existing_furniture": [],
            "architectural_features": {},
            "current_materials": {},
            "lighting": {},
            "color_palette": {},
            "current_style": "unknown",
            "condition": "unknown",
            "design_opportunities": [],
            "constraints_detected": [],
            "analysis_source": "fallback",
        }

        if room_metadata:
            analysis["room_type"] = room_metadata.get("type", "other")
            if room_metadata.get("length_mm") and room_metadata.get("width_mm"):
                analysis["estimated_dimensions"] = {
                    "length_m": room_metadata["length_mm"] / 1000,
                    "width_m": room_metadata["width_mm"] / 1000,
                    "height_m": (room_metadata.get("height_mm") or 2700) / 1000,
                    "area_sqm": (room_metadata["length_mm"] * room_metadata["width_mm"]) / 1_000_000,
                }

        return analysis
