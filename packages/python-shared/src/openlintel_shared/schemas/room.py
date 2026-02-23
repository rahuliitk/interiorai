"""
Room-related Pydantic models — mirrors ``@openlintel/core`` TypeScript types.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class RoomType(str, Enum):
    """All room types supported by the platform."""

    LIVING_ROOM = "living_room"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    DINING = "dining"
    STUDY = "study"
    BALCONY = "balcony"
    UTILITY = "utility"
    FOYER = "foyer"
    CORRIDOR = "corridor"
    POOJA_ROOM = "pooja_room"
    STORE = "store"
    GARAGE = "garage"
    TERRACE = "terrace"
    OTHER = "other"


class Dimensions(BaseModel):
    """Dimensions in millimetres (the canonical internal unit)."""

    length_mm: Annotated[float, Field(gt=0, description="Length in millimetres")]
    width_mm: Annotated[float, Field(gt=0, description="Width in millimetres")]
    height_mm: Annotated[float, Field(gt=0, description="Height in millimetres")]


class Room(BaseModel):
    """A physical room within a project."""

    id: str
    name: str
    type: RoomType
    dimensions: Dimensions
    floor: int = 0
