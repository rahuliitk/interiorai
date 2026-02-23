"""
Product models for the Catalogue Service.

Defines product schemas for CRUD operations, search results, and
vendor pricing.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field


class ProductStatus(str, Enum):
    """Product availability status."""

    ACTIVE = "active"
    DISCONTINUED = "discontinued"
    OUT_OF_STOCK = "out_of_stock"
    COMING_SOON = "coming_soon"


class ProductUnit(str, Enum):
    """Standard units of measure for products."""

    PIECE = "piece"
    SQFT = "sqft"
    SQM = "sqm"
    RUNNING_FOOT = "running_foot"
    RUNNING_METER = "running_meter"
    SET = "set"
    ROLL = "roll"
    BOX = "box"
    KG = "kg"
    LITER = "liter"
    SHEET = "sheet"


class PriceInfo(BaseModel):
    """Pricing information from a vendor."""

    vendor_id: str
    vendor_name: str
    price: Annotated[float, Field(ge=0)]
    currency: str = "INR"
    unit: ProductUnit = ProductUnit.PIECE
    min_order_quantity: int = 1
    lead_time_days: int | None = None
    last_updated: datetime = Field(default_factory=lambda: datetime.utcnow())
    url: str | None = Field(default=None, description="Link to vendor's product page")


class ProductImage(BaseModel):
    """Product image with optional embedding for visual search."""

    url: str
    alt_text: str = ""
    is_primary: bool = False
    width: int | None = None
    height: int | None = None


class ProductSpec(BaseModel):
    """Technical specification of a product."""

    key: str = Field(description="Specification name (e.g. 'Thickness', 'Color', 'Finish')")
    value: str = Field(description="Specification value")
    unit: str | None = None


class Product(BaseModel):
    """Full product model returned from the database."""

    id: str
    name: str
    description: str = ""
    sku: str | None = None
    brand: str | None = None
    category_id: str
    category_name: str | None = None
    subcategory: str | None = None
    status: ProductStatus = ProductStatus.ACTIVE
    unit: ProductUnit = ProductUnit.PIECE
    images: list[ProductImage] = Field(default_factory=list)
    specifications: list[ProductSpec] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    prices: list[PriceInfo] = Field(default_factory=list)
    min_price: float | None = Field(default=None, description="Lowest available price")
    max_price: float | None = Field(default=None, description="Highest available price")
    dimensions: dict[str, float] | None = Field(
        default=None,
        description="Physical dimensions (length_mm, width_mm, height_mm, etc.)",
    )
    weight_kg: float | None = None
    material: str | None = None
    finish: str | None = None
    color: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class ProductCreate(BaseModel):
    """Schema for creating a new product."""

    name: str = Field(min_length=1, max_length=500)
    description: str = ""
    sku: str | None = None
    brand: str | None = None
    category_id: str
    subcategory: str | None = None
    status: ProductStatus = ProductStatus.ACTIVE
    unit: ProductUnit = ProductUnit.PIECE
    images: list[ProductImage] = Field(default_factory=list)
    specifications: list[ProductSpec] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    prices: list[PriceInfo] = Field(default_factory=list)
    dimensions: dict[str, float] | None = None
    weight_kg: float | None = None
    material: str | None = None
    finish: str | None = None
    color: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProductUpdate(BaseModel):
    """Schema for updating an existing product (partial update)."""

    name: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    sku: str | None = None
    brand: str | None = None
    category_id: str | None = None
    subcategory: str | None = None
    status: ProductStatus | None = None
    unit: ProductUnit | None = None
    images: list[ProductImage] | None = None
    specifications: list[ProductSpec] | None = None
    tags: list[str] | None = None
    prices: list[PriceInfo] | None = None
    dimensions: dict[str, float] | None = None
    weight_kg: float | None = None
    material: str | None = None
    finish: str | None = None
    color: str | None = None
    metadata: dict[str, Any] | None = None


class ProductListResponse(BaseModel):
    """Paginated list of products."""

    items: list[Product]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProductSearchResult(BaseModel):
    """Search result with relevance information."""

    product: Product
    score: float | None = Field(default=None, description="Search relevance score")
    highlights: dict[str, str] = Field(
        default_factory=dict,
        description="Highlighted matching text fragments",
    )


class VisualSearchRequest(BaseModel):
    """Request for visual similarity search."""

    image_url: str | None = Field(default=None, description="URL of image to search with")
    embedding: list[float] | None = Field(
        default=None,
        description="Pre-computed image embedding vector",
    )
    limit: int = Field(default=10, ge=1, le=100)


class VisualSearchResult(BaseModel):
    """Visual similarity search result."""

    product: Product
    similarity_score: float = Field(ge=0, le=1, description="Cosine similarity score")
