"""
Hardware models for the Cut List Engine.

Tracks hinges, drawer slides, handles, and other hardware fittings
required per furniture unit.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class HardwareType(str, Enum):
    """Types of hardware fittings."""

    HINGE = "hinge"
    DRAWER_SLIDE = "drawer_slide"
    HANDLE = "handle"
    SHELF_SUPPORT = "shelf_support"
    CAM_LOCK = "cam_lock"
    DOWEL = "dowel"
    SCREW = "screw"
    LEG = "leg"
    SOFT_CLOSE = "soft_close"
    GAS_STRUT = "gas_strut"
    CHANNEL = "channel"
    BASKET = "basket"


class HardwareItem(BaseModel):
    """A single hardware item required for a furniture unit."""

    id: str
    furniture_unit_id: str = Field(description="Furniture unit this hardware belongs to")
    type: HardwareType
    name: str = Field(description="Descriptive name (e.g. '110-degree soft-close hinge')")
    specification: str = Field(
        description="Technical specification (e.g. 'Hettich Sensys 110deg, overlay 16mm')"
    )
    quantity: Annotated[int, Field(gt=0)]
    unit: str = Field(default="pcs", description="Unit of measure")
    notes: str | None = None


class HardwareSchedule(BaseModel):
    """Complete hardware schedule for a project or room."""

    project_id: str
    room_id: str
    items: list[HardwareItem]
    total_items: int
    furniture_unit_count: int

    @property
    def items_by_type(self) -> dict[str, list[HardwareItem]]:
        """Group hardware items by their type."""
        groups: dict[str, list[HardwareItem]] = {}
        for item in self.items:
            groups.setdefault(item.type.value, []).append(item)
        return groups

    @property
    def items_by_unit(self) -> dict[str, list[HardwareItem]]:
        """Group hardware items by furniture unit."""
        groups: dict[str, list[HardwareItem]] = {}
        for item in self.items:
            groups.setdefault(item.furniture_unit_id, []).append(item)
        return groups
