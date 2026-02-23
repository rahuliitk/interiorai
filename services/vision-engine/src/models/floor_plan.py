"""Pydantic models for floor plan digitization results."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float


class RoomPolygon(BaseModel):
    """A detected room from a floor plan image."""
    name: str = Field(..., description="Room name, e.g. 'Master Bedroom'")
    type: str = Field(..., description="Room type, e.g. 'bedroom', 'kitchen', 'living_room'")
    polygon: list[Point] = Field(..., description="Polygon vertices in pixel coordinates")
    length_mm: float | None = Field(None, description="Room length in millimeters")
    width_mm: float | None = Field(None, description="Room width in millimeters")
    area_sq_mm: float | None = Field(None, description="Room area in square millimeters")


class FloorPlanResult(BaseModel):
    """Complete floor plan digitization result."""
    rooms: list[RoomPolygon]
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    scale: float = Field(1.0, description="Pixels per millimeter")
    svg_url: str | None = None
