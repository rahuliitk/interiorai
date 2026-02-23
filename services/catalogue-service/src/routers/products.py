"""
Products router — CRUD, full-text search, and visual similarity search.

Provides endpoints for managing the product catalogue with Meilisearch
full-text search and pgvector visual similarity search.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.auth import get_current_user
from openlintel_shared.db import get_db_session
from openlintel_shared.redis_client import cache_delete, cache_get, cache_set

from src.models.product import (
    Product,
    ProductCreate,
    ProductListResponse,
    ProductSearchResult,
    ProductUpdate,
    VisualSearchRequest,
    VisualSearchResult,
)
from src.services.price_comparison import compare_product_prices
from src.services.search import index_product, remove_product, search_products
from src.services.vector_search import (
    delete_product_embedding,
    generate_product_embedding,
    search_similar_products,
    store_product_embedding,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/products", tags=["products"])

CACHE_TTL = 600  # 10 minutes


def _product_cache_key(product_id: str) -> str:
    return f"catalogue:product:{product_id}"


@router.get(
    "",
    response_model=ProductListResponse,
    summary="List products with pagination and filters",
)
async def list_products(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = Query(None),
    brand: str | None = Query(None),
    material: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
) -> ProductListResponse:
    """List products with pagination and optional filtering."""
    offset = (page - 1) * page_size

    # Build query
    conditions: list[str] = ["1=1"]
    params: dict[str, Any] = {"limit": page_size, "offset": offset}

    if category_id:
        conditions.append("category_id = :category_id")
        params["category_id"] = category_id
    if brand:
        conditions.append("brand = :brand")
        params["brand"] = brand
    if material:
        conditions.append("material = :material")
        params["material"] = material
    if status_filter:
        conditions.append("status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)

    # Validate sort field to prevent SQL injection
    allowed_sorts = {"name", "created_at", "updated_at", "min_price", "brand"}
    if sort_by not in allowed_sorts:
        sort_by = "created_at"
    sort_dir = "DESC" if sort_order.lower() == "desc" else "ASC"

    # Count total
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM products WHERE {where_clause}"),
        params,
    )
    total = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        text(
            f"SELECT * FROM products WHERE {where_clause} "
            f"ORDER BY {sort_by} {sort_dir} "
            f"LIMIT :limit OFFSET :offset"
        ),
        params,
    )
    rows = result.mappings().all()

    products = [Product(**dict(row)) for row in rows]
    total_pages = max(1, (total + page_size - 1) // page_size)

    return ProductListResponse(
        items=products,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/search",
    response_model=list[ProductSearchResult],
    summary="Full-text search products via Meilisearch",
)
async def search_products_endpoint(
    q: str = Query(..., min_length=1, description="Search query"),
    user_id: Annotated[str, Depends(get_current_user)] = None,
    category_id: str | None = Query(None),
    brand: str | None = Query(None),
    material: str | None = Query(None),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    sort_by: str | None = Query(None, description="Sort (e.g. 'min_price:asc')"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[ProductSearchResult]:
    """Search products using Meilisearch full-text search.

    Supports filtering by category, brand, material, and price range.
    Returns highlighted matching text fragments.
    """
    results, total = await search_products(
        query=q,
        category_id=category_id,
        brand=brand,
        material=material,
        min_price=min_price,
        max_price=max_price,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )

    logger.info(
        "product_search",
        query=q,
        results=len(results),
        total=total,
        user_id=user_id,
    )

    return results


@router.get(
    "/{product_id}",
    response_model=Product,
    summary="Get a product by ID",
)
async def get_product(
    product_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Product:
    """Retrieve a single product by its ID."""
    # Check cache first
    cached = await cache_get(_product_cache_key(product_id))
    if cached:
        return Product(**cached)

    result = await db.execute(
        text("SELECT * FROM products WHERE id = :id"),
        {"id": product_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found",
        )

    product = Product(**dict(row))

    # Cache it
    await cache_set(
        _product_cache_key(product_id),
        product.model_dump(mode="json"),
        ttl=CACHE_TTL,
    )

    return product


@router.post(
    "",
    response_model=Product,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new product",
)
async def create_product(
    body: ProductCreate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Product:
    """Create a new product in the catalogue."""
    product_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)

    product = Product(
        id=product_id,
        **body.model_dump(),
        created_at=now,
        updated_at=now,
    )

    # Calculate min/max prices
    if product.prices:
        product.min_price = min(p.price for p in product.prices)
        product.max_price = max(p.price for p in product.prices)

    # Insert into database
    await db.execute(
        text("""
            INSERT INTO products (id, name, description, sku, brand, category_id,
                subcategory, status, unit, images, specifications, tags, prices,
                min_price, max_price, dimensions, weight_kg, material, finish,
                color, metadata, created_at, updated_at)
            VALUES (:id, :name, :description, :sku, :brand, :category_id,
                :subcategory, :status, :unit, :images, :specifications, :tags, :prices,
                :min_price, :max_price, :dimensions, :weight_kg, :material, :finish,
                :color, :metadata, :created_at, :updated_at)
        """),
        {
            "id": product_id,
            "name": product.name,
            "description": product.description,
            "sku": product.sku,
            "brand": product.brand,
            "category_id": product.category_id,
            "subcategory": product.subcategory,
            "status": product.status.value,
            "unit": product.unit.value,
            "images": product.model_dump(mode="json")["images"],
            "specifications": product.model_dump(mode="json")["specifications"],
            "tags": product.tags,
            "prices": product.model_dump(mode="json")["prices"],
            "min_price": product.min_price,
            "max_price": product.max_price,
            "dimensions": product.model_dump(mode="json")["dimensions"],
            "weight_kg": product.weight_kg,
            "material": product.material,
            "finish": product.finish,
            "color": product.color,
            "metadata": product.model_dump(mode="json")["metadata"],
            "created_at": now,
            "updated_at": now,
        },
    )

    # Index in Meilisearch
    await index_product(product)

    # Generate and store embedding for visual search
    embedding = await generate_product_embedding(product)
    if embedding:
        await store_product_embedding(db, product_id, embedding)

    logger.info(
        "product_created",
        product_id=product_id,
        name=product.name,
        user_id=user_id,
    )

    return product


@router.put(
    "/{product_id}",
    response_model=Product,
    summary="Update a product",
)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Product:
    """Update an existing product (partial update)."""
    # Fetch existing product
    result = await db.execute(
        text("SELECT * FROM products WHERE id = :id"),
        {"id": product_id},
    )
    row = result.mappings().first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found",
        )

    existing = Product(**dict(row))

    # Apply updates
    update_data = body.model_dump(exclude_unset=True)
    updated_dict = existing.model_dump()
    updated_dict.update(update_data)
    updated_dict["updated_at"] = datetime.now(tz=timezone.utc)

    product = Product(**updated_dict)

    # Recalculate min/max prices
    if product.prices:
        product.min_price = min(p.price for p in product.prices)
        product.max_price = max(p.price for p in product.prices)

    # Build SET clause from updated fields
    set_clauses: list[str] = []
    params: dict[str, Any] = {"id": product_id}

    for field, value in update_data.items():
        set_clauses.append(f"{field} = :{field}")
        if hasattr(value, "value"):  # Handle enums
            params[field] = value.value
        else:
            params[field] = value

    set_clauses.append("updated_at = :updated_at")
    params["updated_at"] = product.updated_at

    if product.min_price is not None:
        set_clauses.append("min_price = :min_price")
        params["min_price"] = product.min_price
    if product.max_price is not None:
        set_clauses.append("max_price = :max_price")
        params["max_price"] = product.max_price

    await db.execute(
        text(f"UPDATE products SET {', '.join(set_clauses)} WHERE id = :id"),
        params,
    )

    # Update search index
    await index_product(product)

    # Invalidate cache
    await cache_delete(_product_cache_key(product_id))

    logger.info(
        "product_updated",
        product_id=product_id,
        fields=list(update_data.keys()),
        user_id=user_id,
    )

    return product


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a product",
)
async def delete_product(
    product_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Delete a product from the catalogue."""
    result = await db.execute(
        text("SELECT id FROM products WHERE id = :id"),
        {"id": product_id},
    )
    if result.first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found",
        )

    await db.execute(
        text("DELETE FROM products WHERE id = :id"),
        {"id": product_id},
    )

    # Remove from search index
    await remove_product(product_id)

    # Remove embedding
    await delete_product_embedding(db, product_id)

    # Invalidate cache
    await cache_delete(_product_cache_key(product_id))

    logger.info("product_deleted", product_id=product_id, user_id=user_id)


@router.post(
    "/visual-search",
    response_model=list[VisualSearchResult],
    summary="Visual similarity search via pgvector",
)
async def visual_search(
    body: VisualSearchRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[VisualSearchResult]:
    """Find visually similar products using embedding similarity.

    Accepts either an image URL (which will be embedded) or a
    pre-computed embedding vector, and returns the most similar
    products from the catalogue.
    """
    query_embedding: list[float] | None = body.embedding

    # If image URL provided, generate embedding
    if body.image_url and not query_embedding:
        from openlintel_shared.llm import LiteLLMClient

        client = LiteLLMClient()
        try:
            response = await client.embedding(
                model="openai/text-embedding-3-small",
                input_texts=[f"Image: {body.image_url}"],
            )
            query_embedding = response.data[0]["embedding"]
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to generate image embedding: {exc}",
            ) from exc

    if not query_embedding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either image_url or embedding must be provided",
        )

    # Search for similar products
    similar = await search_similar_products(
        db=db,
        query_embedding=query_embedding,
        limit=body.limit,
    )

    results: list[VisualSearchResult] = []
    for match in similar:
        product_result = await db.execute(
            text("SELECT * FROM products WHERE id = :id"),
            {"id": match["product_id"]},
        )
        row = product_result.mappings().first()
        if row:
            product = Product(**dict(row))
            results.append(
                VisualSearchResult(
                    product=product,
                    similarity_score=match["similarity_score"],
                )
            )

    logger.info(
        "visual_search_complete",
        results=len(results),
        user_id=user_id,
    )

    return results
