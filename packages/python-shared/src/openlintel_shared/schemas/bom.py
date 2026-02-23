"""
Bill-of-Materials Pydantic models — mirrors ``@openlintel/core`` TypeScript types.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class MaterialCategory(str, Enum):
    """Material categories for BOM line items."""

    CIVIL = "civil"
    FLOORING = "flooring"
    PAINTING = "painting"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    CARPENTRY = "carpentry"
    FALSE_CEILING = "false_ceiling"
    GLASS_ALUMINUM = "glass_aluminum"
    SANITARYWARE = "sanitaryware"
    APPLIANCES = "appliances"
    SOFT_FURNISHING = "soft_furnishing"
    DECOR = "decor"
    HARDWARE = "hardware"


class BOMItem(BaseModel):
    """A single line item in the Bill of Materials."""

    id: str
    room_id: str = Field(alias="roomId")
    category: MaterialCategory
    name: str
    specification: str
    quantity: Annotated[float, Field(gt=0)]
    unit: str
    unit_price: float | None = Field(default=None, alias="unitPrice", ge=0)
    currency: str | None = None
    waste_factor: Annotated[float, Field(ge=0, le=1, alias="wasteFactor")]

    model_config = {"populate_by_name": True}

    @property
    def total_with_waste(self) -> float:
        """Quantity including the waste factor allowance."""
        return self.quantity * (1 + self.waste_factor)

    @property
    def estimated_cost(self) -> float | None:
        """Estimated cost including waste, or ``None`` if no unit price is set."""
        if self.unit_price is None:
            return None
        return round(self.total_with_waste * self.unit_price, 2)
