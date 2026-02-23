"""
Pydantic domain schemas mirroring the TypeScript types in ``@openlintel/core``.

These are used for request/response validation in all Python services and ensure
type parity with the Next.js frontend.
"""

from openlintel_shared.schemas.bom import BOMItem, MaterialCategory
from openlintel_shared.schemas.cutlist import CutListPanel, EdgeBanding, PanelMaterial
from openlintel_shared.schemas.design import BudgetTier, DesignStyle, DesignVariant
from openlintel_shared.schemas.job_request import JobRequest, RoomInfo
from openlintel_shared.schemas.room import Dimensions, Room, RoomType

__all__ = [
    "BOMItem",
    "BudgetTier",
    "CutListPanel",
    "DesignStyle",
    "DesignVariant",
    "Dimensions",
    "EdgeBanding",
    "JobRequest",
    "MaterialCategory",
    "PanelMaterial",
    "Room",
    "RoomInfo",
    "RoomType",
]
