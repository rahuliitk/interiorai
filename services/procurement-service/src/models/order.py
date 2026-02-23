"""
Pydantic models for procurement — purchase orders, order items, delivery
tracking, and vendor data.

All monetary values default to INR. Quantities reference the same units as
the BOM items they originate from.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field


# -- Enumerations -----------------------------------------------------------


class OrderStatus(str, Enum):
    """Processing status for a purchase order."""

    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    ORDERED = "ordered"
    PARTIALLY_DELIVERED = "partially_delivered"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class DeliveryStatusEnum(str, Enum):
    """Delivery status for an order."""

    PENDING = "pending"
    DISPATCHED = "dispatched"
    IN_TRANSIT = "in_transit"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    DELAYED = "delayed"
    RETURNED = "returned"


class OrderPriority(str, Enum):
    """Priority level for a purchase order."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class VendorTier(str, Enum):
    """Vendor quality/reliability tier."""

    PREFERRED = "preferred"
    APPROVED = "approved"
    STANDARD = "standard"
    NEW = "new"


# -- Sub-models -------------------------------------------------------------


class Vendor(BaseModel):
    """Vendor information for procurement."""

    id: str
    name: str
    category: str = Field(description="Primary material category the vendor supplies")
    contact_email: str | None = None
    contact_phone: str | None = None
    city: str | None = None
    tier: VendorTier = Field(default=VendorTier.STANDARD)
    lead_time_days: int = Field(default=7, ge=0, description="Typical lead time in calendar days")
    minimum_order_value: float = Field(
        default=0.0,
        ge=0,
        description="Minimum order value (MOV) in currency",
    )
    minimum_order_quantity: float = Field(
        default=0.0,
        ge=0,
        description="Minimum order quantity (MOQ) per item",
    )
    shipping_cost_flat: float = Field(
        default=0.0,
        ge=0,
        description="Flat shipping cost per order",
    )
    rating: float = Field(default=3.0, ge=0.0, le=5.0, description="Vendor rating out of 5")
    metadata: dict[str, Any] = Field(default_factory=dict)


class OrderItem(BaseModel):
    """A single line item within a purchase order."""

    id: str
    bom_item_id: str | None = Field(default=None, description="Reference to the BOM item this originates from")
    category: str = Field(description="Material category")
    name: str
    specification: str = ""
    quantity: Annotated[float, Field(gt=0, description="Order quantity")]
    unit: str
    unit_price: float = Field(ge=0, description="Unit price in order currency")
    total_price: float = Field(ge=0, description="quantity * unit_price")
    currency: str = Field(default="INR")
    vendor_id: str | None = None
    vendor_name: str | None = None
    needed_by_date: date | None = Field(default=None, description="Date by which this item is needed on site")
    notes: str = ""


class PurchaseOrder(BaseModel):
    """A purchase order grouping items for a vendor."""

    id: str
    project_id: str
    vendor: Vendor | None = None
    vendor_id: str | None = None
    vendor_name: str | None = None
    status: OrderStatus = Field(default=OrderStatus.DRAFT)
    priority: OrderPriority = Field(default=OrderPriority.NORMAL)
    items: list[OrderItem] = Field(default_factory=list)
    subtotal: float = Field(default=0.0, ge=0, description="Sum of all item totals")
    shipping_cost: float = Field(default=0.0, ge=0)
    tax_amount: float = Field(default=0.0, ge=0, description="GST/tax amount")
    total_amount: float = Field(default=0.0, ge=0, description="subtotal + shipping + tax")
    currency: str = Field(default="INR")
    order_date: date | None = None
    expected_delivery_date: date | None = None
    actual_delivery_date: date | None = None
    phase: str | None = Field(default=None, description="Construction phase this order supports")
    notes: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DeliveryStatus(BaseModel):
    """Delivery tracking information for a purchase order."""

    id: str
    order_id: str
    status: DeliveryStatusEnum = Field(default=DeliveryStatusEnum.PENDING)
    expected_date: date | None = None
    actual_date: date | None = None
    tracking_number: str | None = None
    carrier: str | None = None
    delay_days: int = Field(default=0, description="Number of days delayed (0 if on time)")
    delay_reason: str | None = None
    location: str | None = Field(default=None, description="Current location or last known location")
    updates: list[DeliveryUpdate] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DeliveryUpdate(BaseModel):
    """A single status update in the delivery timeline."""

    timestamp: datetime
    status: DeliveryStatusEnum
    location: str | None = None
    notes: str = ""


# Fix forward reference for DeliveryStatus.updates
DeliveryStatus.model_rebuild()


# -- Request/Response models ------------------------------------------------


class BOMItemForOrder(BaseModel):
    """BOM item data passed to the order generation endpoint."""

    id: str
    room_id: str
    category: str
    name: str
    specification: str = ""
    quantity: float = Field(gt=0)
    unit: str
    unit_price: float | None = None
    currency: str = Field(default="INR")
    waste_factor: float = Field(default=0.05, ge=0, le=1)


class ScheduleMilestoneInput(BaseModel):
    """Schedule milestone data for delivery phasing."""

    trade: str
    name: str
    target_date: date
    task_ids: list[str] = Field(default_factory=list)


class OrderGenerateRequest(BaseModel):
    """Request body for POST /api/v1/orders/generate."""

    project_id: str
    bom_items: list[BOMItemForOrder] = Field(
        alias="bomItems",
        description="BOM items to generate purchase orders from",
    )
    vendors: list[Vendor] = Field(
        default_factory=list,
        description="Available vendor list. If empty, default vendors are used.",
    )
    schedule_milestones: list[ScheduleMilestoneInput] = Field(
        default_factory=list,
        alias="scheduleMilestones",
        description="Schedule milestones for delivery phasing",
    )
    target_budget: float | None = Field(default=None, ge=0, alias="targetBudget")
    currency: str = Field(default="INR")

    model_config = {"populate_by_name": True}


class OrderGenerateResponse(BaseModel):
    """Response for POST /api/v1/orders/generate."""

    project_id: str
    orders: list[PurchaseOrder]
    total_order_value: float
    total_shipping: float
    vendor_count: int
    phase_count: int
    message: str


class OrderStatusUpdateRequest(BaseModel):
    """Request body for PUT /api/v1/orders/{id}/status."""

    status: OrderStatus
    notes: str = ""


class DeliveryTrackRequest(BaseModel):
    """Request body for POST /api/v1/delivery/track."""

    order_id: str
    status: DeliveryStatusEnum
    tracking_number: str | None = None
    carrier: str | None = None
    location: str | None = None
    expected_date: date | None = None
    actual_date: date | None = None
    delay_reason: str | None = None
    notes: str = ""


class DeliveryStatusResponse(BaseModel):
    """Response for delivery status endpoints."""

    delivery: DeliveryStatus
    is_delayed: bool = False
    delay_alert: str | None = None
