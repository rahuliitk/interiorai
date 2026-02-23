"""
Category models for the Catalogue Service.

Defines category schemas including hierarchical tree structures
for the product catalogue.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Category(BaseModel):
    """A product category in the catalogue."""

    id: str
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(description="URL-friendly identifier")
    description: str = ""
    parent_id: str | None = Field(
        default=None,
        description="Parent category ID for hierarchical structure",
    )
    icon: str | None = Field(default=None, description="Icon name or URL")
    image_url: str | None = None
    sort_order: int = 0
    is_active: bool = True
    product_count: int = Field(default=0, description="Number of products in this category")
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class CategoryCreate(BaseModel):
    """Schema for creating a new category."""

    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    description: str = ""
    parent_id: str | None = None
    icon: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class CategoryUpdate(BaseModel):
    """Schema for updating a category (partial update)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = None
    description: str | None = None
    parent_id: str | None = None
    icon: str | None = None
    image_url: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    metadata: dict[str, Any] | None = None


class CategoryTree(BaseModel):
    """Recursive category tree node for hierarchical display."""

    id: str
    name: str
    slug: str
    description: str = ""
    icon: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    product_count: int = 0
    children: list[CategoryTree] = Field(default_factory=list)

    @property
    def total_product_count(self) -> int:
        """Total products in this category and all descendants."""
        return self.product_count + sum(
            child.total_product_count for child in self.children
        )


class CategoryListResponse(BaseModel):
    """Response for category listing."""

    items: list[Category]
    total: int


class Vendor(BaseModel):
    """A product vendor / supplier."""

    id: str
    name: str = Field(min_length=1, max_length=300)
    code: str | None = Field(default=None, description="Short vendor code (e.g. 'ASIAN', 'HAV')")
    description: str = ""
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str = "India"
    gst_number: str | None = None
    payment_terms: str | None = Field(
        default=None,
        description="Payment terms (e.g. 'Net 30', 'COD')",
    )
    rating: float | None = Field(default=None, ge=0, le=5)
    is_active: bool = True
    product_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class VendorCreate(BaseModel):
    """Schema for creating a new vendor."""

    name: str = Field(min_length=1, max_length=300)
    code: str | None = None
    description: str = ""
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str = "India"
    gst_number: str | None = None
    payment_terms: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VendorUpdate(BaseModel):
    """Schema for updating a vendor (partial update)."""

    name: str | None = Field(default=None, min_length=1, max_length=300)
    code: str | None = None
    description: str | None = None
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    gst_number: str | None = None
    payment_terms: str | None = None
    is_active: bool | None = None
    metadata: dict[str, Any] | None = None


class VendorListResponse(BaseModel):
    """Response for vendor listing."""

    items: list[Vendor]
    total: int
