"""VLM-based floor plan room detection agent."""

from __future__ import annotations

import json
from typing import Any

import structlog
from litellm import acompletion

from openlintel_shared.crypto import decrypt_api_key
from src.models.floor_plan import FloorPlanResult, RoomPolygon, Point

logger = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are an expert architectural floor plan analyzer. Given a floor plan image, detect all rooms and return structured data.

For each room, identify:
1. Room name (e.g., "Master Bedroom", "Kitchen", "Living Room")
2. Room type (one of: living_room, bedroom, kitchen, bathroom, dining, study, balcony, utility, foyer, corridor, other)
3. Approximate polygon vertices (x, y in pixel coordinates, clockwise from top-left of room)
4. Estimated dimensions in millimeters (if scale indicators are visible)
5. Estimated area in square millimeters

Return ONLY valid JSON in this exact format:
{
  "rooms": [
    {
      "name": "Master Bedroom",
      "type": "bedroom",
      "polygon": [{"x": 100, "y": 100}, {"x": 400, "y": 100}, {"x": 400, "y": 350}, {"x": 100, "y": 350}],
      "length_mm": 4000,
      "width_mm": 3500,
      "area_sq_mm": 14000000
    }
  ],
  "width": 800,
  "height": 600,
  "scale": 0.1
}

Be thorough — detect ALL rooms visible in the floor plan. If dimensions cannot be determined, use null for length_mm, width_mm, and area_sq_mm."""


async def detect_rooms_from_image(
    image_url: str,
    api_key_material: dict[str, str],
) -> FloorPlanResult:
    """Send a floor plan image to GPT-4o and parse the detected rooms."""
    # Decrypt the user's API key
    decrypted_key = decrypt_api_key(
        encrypted_key=api_key_material["encrypted_key"],
        iv=api_key_material["iv"],
        auth_tag=api_key_material["auth_tag"],
    )

    logger.info("vision_agent_starting", image_url=image_url[:80])

    response = await acompletion(
        model="openai/gpt-4o",
        api_key=decrypted_key,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Analyze this floor plan image. Detect all rooms with their boundaries, types, and dimensions. Return the result as JSON."},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=4096,
    )

    raw_content = response.choices[0].message.content
    logger.info("vision_agent_response_received", length=len(raw_content or ""))

    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error("vision_agent_json_parse_failed", content=raw_content[:200])
        return FloorPlanResult(rooms=[], width=800, height=600, scale=1.0)

    # Parse rooms
    rooms: list[RoomPolygon] = []
    for room_data in data.get("rooms", []):
        try:
            polygon = [Point(x=p["x"], y=p["y"]) for p in room_data.get("polygon", [])]
            rooms.append(RoomPolygon(
                name=room_data.get("name", "Unknown Room"),
                type=room_data.get("type", "other"),
                polygon=polygon,
                length_mm=room_data.get("length_mm"),
                width_mm=room_data.get("width_mm"),
                area_sq_mm=room_data.get("area_sq_mm"),
            ))
        except Exception as exc:
            logger.warning("vision_agent_room_parse_error", error=str(exc), room=room_data)

    return FloorPlanResult(
        rooms=rooms,
        width=data.get("width", 800),
        height=data.get("height", 600),
        scale=data.get("scale", 1.0),
    )
