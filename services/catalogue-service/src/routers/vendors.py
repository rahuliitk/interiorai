"""
Vendors router — CRUD for product vendors/suppliers.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.auth import get_current_user
from openlintel_shared.db import get_db_session
from openlintel_shared.redis_client import cache_delete, cache_get, cache_set

from src.models.category import (
    Vendor,
    VendorCreate,
    VendorListResponse,
    VendorUpdate,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])

CACHE_TTL = 1800  # 30 minutes


@router.get(
    "",
    response_model=VendorListResponse,
    summary="List all vendors",
)
async def list_vendors(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    city: str | None = Query(None),
    state: str | None = Query(None),
    active_only: bool = Query(True),
    search: str | None = Query(None, description="Search vendor name"),
) -> VendorListResponse:
    """List all vendors with optional filtering."""
    conditions: list[str] = []
    params: dict[str, Any] = {
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    if active_only:
        conditions.append("is_active = true")
    if city:
        conditions.append("city = :city")
        params["city"] = city
    if state:
        conditions.append("state = :state")
        params["state"] = state
    if search:
        conditions.append("name ILIKE :search")
        params["search"] = f"%{search}%"

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Count total
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM vendors WHERE {where_clause}"),
        params,
    )
    total = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        text(
            f"SELECT * FROM vendors WHERE {where_clause} "
            f"ORDER BY name ASC LIMIT :limit OFFSET :offset"
        ),
        params,
    )
    rows = result.mappings().all()

    vendors = [Vendor(**dict(row)) for row in rows]

    return VendorListResponse(items=vendors, total=total)


@router.get(
    "/{vendor_id}",
    response_model=Vendor,
    summary="Get a vendor by ID",
)
async def get_vendor(
    vendor_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Vendor:
    """Retrieve a single vendor by its ID."""
    cached = await cache_get(f"catalogue:vendor:{vendor_id}")
    if cached:
        return Vendor(**cached)

    result = await db.execute(
        text("SELECT * FROM vendors WHERE id = :id"),
        {"id": vendor_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )

    vendor = Vendor(**dict(row))

    await cache_set(
        f"catalogue:vendor:{vendor_id}",
        vendor.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    return vendor


@router.post(
    "",
    response_model=Vendor,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vendor",
)
async def create_vendor(
    body: VendorCreate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Vendor:
    """Create a new vendor/supplier."""
    vendor_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)

    vendor = Vendor(
        id=vendor_id,
        **body.model_dump(),
        is_active=True,
        product_count=0,
        created_at=now,
        updated_at=now,
    )

    await db.execute(
        text("""
            INSERT INTO vendors (id, name, code, description, website,
                contact_email, contact_phone, address, city, state, country,
                gst_number, payment_terms, is_active, product_count,
                metadata, created_at, updated_at)
            VALUES (:id, :name, :code, :description, :website,
                :contact_email, :contact_phone, :address, :city, :state, :country,
                :gst_number, :payment_terms, true, 0,
                :metadata, :created_at, :updated_at)
        """),
        {
            "id": vendor_id,
            "name": vendor.name,
            "code": vendor.code,
            "description": vendor.description,
            "website": vendor.website,
            "contact_email": vendor.contact_email,
            "contact_phone": vendor.contact_phone,
            "address": vendor.address,
            "city": vendor.city,
            "state": vendor.state,
            "country": vendor.country,
            "gst_number": vendor.gst_number,
            "payment_terms": vendor.payment_terms,
            "metadata": vendor.model_dump(mode="json")["metadata"],
            "created_at": now,
            "updated_at": now,
        },
    )

    logger.info("vendor_created", vendor_id=vendor_id, name=body.name, user_id=user_id)

    return vendor


@router.put(
    "/{vendor_id}",
    response_model=Vendor,
    summary="Update a vendor",
)
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Vendor:
    """Update an existing vendor (partial update)."""
    result = await db.execute(
        text("SELECT * FROM vendors WHERE id = :id"),
        {"id": vendor_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )

    existing = Vendor(**dict(row))
    update_data = body.model_dump(exclude_unset=True)

    updated_dict = existing.model_dump()
    updated_dict.update(update_data)
    updated_dict["updated_at"] = datetime.now(tz=timezone.utc)

    vendor = Vendor(**updated_dict)

    set_clauses: list[str] = []
    params: dict[str, Any] = {"id": vendor_id}

    for field, value in update_data.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_clauses.append("updated_at = :updated_at")
    params["updated_at"] = vendor.updated_at

    await db.execute(
        text(f"UPDATE vendors SET {', '.join(set_clauses)} WHERE id = :id"),
        params,
    )

    # Invalidate cache
    await cache_delete(f"catalogue:vendor:{vendor_id}")

    logger.info("vendor_updated", vendor_id=vendor_id, user_id=user_id)

    return vendor


@router.delete(
    "/{vendor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a vendor",
)
async def delete_vendor(
    vendor_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Delete a vendor from the system."""
    result = await db.execute(
        text("DELETE FROM vendors WHERE id = :id RETURNING id"),
        {"id": vendor_id},
    )
    if result.first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )

    # Invalidate cache
    await cache_delete(f"catalogue:vendor:{vendor_id}")

    logger.info("vendor_deleted", vendor_id=vendor_id, user_id=user_id)
