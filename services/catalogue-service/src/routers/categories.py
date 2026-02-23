"""
Categories router — CRUD and tree structure for product categories.
"""

from __future__ import annotations

import re
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
    Category,
    CategoryCreate,
    CategoryListResponse,
    CategoryTree,
    CategoryUpdate,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])

CACHE_TTL = 1800  # 30 minutes


def _slugify(name: str) -> str:
    """Convert a name to a URL-friendly slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


@router.get(
    "",
    response_model=CategoryListResponse,
    summary="List all categories",
)
async def list_categories(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    parent_id: str | None = Query(None, description="Filter by parent category"),
    include_inactive: bool = Query(False),
) -> CategoryListResponse:
    """List all categories, optionally filtered by parent."""
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if parent_id:
        conditions.append("parent_id = :parent_id")
        params["parent_id"] = parent_id
    elif parent_id is None and not include_inactive:
        # If no parent filter, only show root categories by default
        pass

    if not include_inactive:
        conditions.append("is_active = true")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    result = await db.execute(
        text(f"SELECT * FROM categories WHERE {where_clause} ORDER BY sort_order, name"),
        params,
    )
    rows = result.mappings().all()

    categories = [Category(**dict(row)) for row in rows]

    return CategoryListResponse(
        items=categories,
        total=len(categories),
    )


@router.get(
    "/tree",
    response_model=list[CategoryTree],
    summary="Get category tree structure",
)
async def get_category_tree(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CategoryTree]:
    """Get the full category hierarchy as a tree.

    Returns root categories with nested children.
    """
    # Check cache
    cached = await cache_get("catalogue:category_tree")
    if cached:
        return [CategoryTree(**c) for c in cached]

    result = await db.execute(
        text("SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name"),
    )
    rows = result.mappings().all()

    categories = [Category(**dict(row)) for row in rows]

    # Build tree
    tree = _build_category_tree(categories)

    # Cache tree
    await cache_set(
        "catalogue:category_tree",
        [t.model_dump(mode="json") for t in tree],
        ttl=CACHE_TTL,
    )

    return tree


def _build_category_tree(categories: list[Category]) -> list[CategoryTree]:
    """Build a hierarchical tree from a flat list of categories."""
    nodes: dict[str, CategoryTree] = {}
    roots: list[CategoryTree] = []

    # Create all nodes
    for cat in categories:
        nodes[cat.id] = CategoryTree(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            description=cat.description,
            icon=cat.icon,
            image_url=cat.image_url,
            sort_order=cat.sort_order,
            product_count=cat.product_count,
            children=[],
        )

    # Assign children
    for cat in categories:
        node = nodes[cat.id]
        if cat.parent_id and cat.parent_id in nodes:
            nodes[cat.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots


@router.get(
    "/{category_id}",
    response_model=Category,
    summary="Get a category by ID",
)
async def get_category(
    category_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Category:
    """Retrieve a single category."""
    result = await db.execute(
        text("SELECT * FROM categories WHERE id = :id"),
        {"id": category_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category '{category_id}' not found",
        )

    return Category(**dict(row))


@router.post(
    "",
    response_model=Category,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new category",
)
async def create_category(
    body: CategoryCreate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Category:
    """Create a new product category."""
    category_id = str(uuid.uuid4())
    slug = body.slug or _slugify(body.name)
    now = datetime.now(tz=timezone.utc)

    category = Category(
        id=category_id,
        name=body.name,
        slug=slug,
        description=body.description,
        parent_id=body.parent_id,
        icon=body.icon,
        image_url=body.image_url,
        sort_order=body.sort_order,
        metadata=body.metadata,
        created_at=now,
        updated_at=now,
    )

    await db.execute(
        text("""
            INSERT INTO categories (id, name, slug, description, parent_id,
                icon, image_url, sort_order, is_active, product_count,
                metadata, created_at, updated_at)
            VALUES (:id, :name, :slug, :description, :parent_id,
                :icon, :image_url, :sort_order, true, 0,
                :metadata, :created_at, :updated_at)
        """),
        {
            "id": category_id,
            "name": category.name,
            "slug": slug,
            "description": category.description,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "image_url": category.image_url,
            "sort_order": category.sort_order,
            "metadata": category.model_dump(mode="json")["metadata"],
            "created_at": now,
            "updated_at": now,
        },
    )

    # Invalidate tree cache
    await cache_delete("catalogue:category_tree")

    logger.info("category_created", category_id=category_id, name=body.name, user_id=user_id)

    return category


@router.put(
    "/{category_id}",
    response_model=Category,
    summary="Update a category",
)
async def update_category(
    category_id: str,
    body: CategoryUpdate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Category:
    """Update an existing category (partial update)."""
    result = await db.execute(
        text("SELECT * FROM categories WHERE id = :id"),
        {"id": category_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category '{category_id}' not found",
        )

    existing = Category(**dict(row))
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and "slug" not in update_data:
        update_data["slug"] = _slugify(update_data["name"])

    updated_dict = existing.model_dump()
    updated_dict.update(update_data)
    updated_dict["updated_at"] = datetime.now(tz=timezone.utc)

    category = Category(**updated_dict)

    set_clauses: list[str] = []
    params: dict[str, Any] = {"id": category_id}

    for field, value in update_data.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_clauses.append("updated_at = :updated_at")
    params["updated_at"] = category.updated_at

    await db.execute(
        text(f"UPDATE categories SET {', '.join(set_clauses)} WHERE id = :id"),
        params,
    )

    # Invalidate tree cache
    await cache_delete("catalogue:category_tree")

    logger.info("category_updated", category_id=category_id, user_id=user_id)

    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a category",
)
async def delete_category(
    category_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Delete a category.

    Fails if the category has products or child categories.
    """
    # Check for child categories
    children = await db.execute(
        text("SELECT COUNT(*) FROM categories WHERE parent_id = :id"),
        {"id": category_id},
    )
    child_count = children.scalar() or 0
    if child_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category has {child_count} child categories. Remove children first.",
        )

    # Check for products
    products = await db.execute(
        text("SELECT COUNT(*) FROM products WHERE category_id = :id"),
        {"id": category_id},
    )
    product_count = products.scalar() or 0
    if product_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category has {product_count} products. Reassign products first.",
        )

    result = await db.execute(
        text("DELETE FROM categories WHERE id = :id RETURNING id"),
        {"id": category_id},
    )
    if result.first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category '{category_id}' not found",
        )

    # Invalidate tree cache
    await cache_delete("catalogue:category_tree")

    logger.info("category_deleted", category_id=category_id, user_id=user_id)
