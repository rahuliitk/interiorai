"""
Meilisearch integration for full-text product search.

Manages index creation, document syncing, and search queries against
the Meilisearch instance configured in the environment.
"""

from __future__ import annotations

import os
from typing import Any

import meilisearch
import structlog

from src.models.product import Product, ProductSearchResult

logger = structlog.get_logger(__name__)

PRODUCTS_INDEX = "products"

# Searchable attributes in priority order
SEARCHABLE_ATTRIBUTES = [
    "name",
    "description",
    "brand",
    "material",
    "finish",
    "color",
    "tags",
    "category_name",
    "subcategory",
    "sku",
]

# Attributes returned in search results
DISPLAYED_ATTRIBUTES = ["*"]

# Filterable attributes
FILTERABLE_ATTRIBUTES = [
    "category_id",
    "category_name",
    "subcategory",
    "brand",
    "material",
    "finish",
    "color",
    "status",
    "min_price",
    "max_price",
    "tags",
]

# Sortable attributes
SORTABLE_ATTRIBUTES = [
    "name",
    "min_price",
    "max_price",
    "created_at",
    "updated_at",
]


def _get_client() -> meilisearch.Client:
    """Create a Meilisearch client from environment configuration."""
    url = os.getenv("MEILI_URL", "http://localhost:7700")
    master_key = os.getenv("MEILI_MASTER_KEY", "openlintel_dev_key")
    return meilisearch.Client(url, master_key)


async def ensure_meilisearch_index() -> None:
    """Create and configure the products index in Meilisearch.

    Called during application startup.  Idempotent — safe to call
    multiple times.
    """
    try:
        client = _get_client()

        # Create index if it doesn't exist
        try:
            client.get_index(PRODUCTS_INDEX)
            logger.info("meilisearch_index_exists", index=PRODUCTS_INDEX)
        except meilisearch.errors.MeilisearchApiError:
            client.create_index(PRODUCTS_INDEX, {"primaryKey": "id"})
            logger.info("meilisearch_index_created", index=PRODUCTS_INDEX)

        index = client.index(PRODUCTS_INDEX)

        # Configure searchable attributes
        index.update_searchable_attributes(SEARCHABLE_ATTRIBUTES)

        # Configure filterable attributes
        index.update_filterable_attributes(FILTERABLE_ATTRIBUTES)

        # Configure sortable attributes
        index.update_sortable_attributes(SORTABLE_ATTRIBUTES)

        # Configure displayed attributes
        index.update_displayed_attributes(DISPLAYED_ATTRIBUTES)

        logger.info(
            "meilisearch_index_configured",
            index=PRODUCTS_INDEX,
            searchable=len(SEARCHABLE_ATTRIBUTES),
            filterable=len(FILTERABLE_ATTRIBUTES),
        )

    except Exception as exc:
        logger.warning(
            "meilisearch_init_failed",
            error=str(exc),
            message="Full-text search will be unavailable",
        )


async def index_product(product: Product) -> None:
    """Add or update a product in the Meilisearch index.

    Parameters
    ----------
    product:
        The product to index.
    """
    try:
        client = _get_client()
        index = client.index(PRODUCTS_INDEX)

        doc = product.model_dump(mode="json")
        # Flatten for search — Meilisearch needs flat or simple nested
        doc["_tags_text"] = " ".join(product.tags) if product.tags else ""

        index.add_documents([doc])
        logger.debug("product_indexed", product_id=product.id, name=product.name)

    except Exception as exc:
        logger.warning("product_index_failed", product_id=product.id, error=str(exc))


async def index_products_batch(products: list[Product]) -> None:
    """Index multiple products in a single batch.

    Parameters
    ----------
    products:
        The products to index.
    """
    if not products:
        return

    try:
        client = _get_client()
        index = client.index(PRODUCTS_INDEX)

        docs = []
        for product in products:
            doc = product.model_dump(mode="json")
            doc["_tags_text"] = " ".join(product.tags) if product.tags else ""
            docs.append(doc)

        index.add_documents(docs)
        logger.info("products_batch_indexed", count=len(docs))

    except Exception as exc:
        logger.warning("products_batch_index_failed", count=len(products), error=str(exc))


async def remove_product(product_id: str) -> None:
    """Remove a product from the Meilisearch index.

    Parameters
    ----------
    product_id:
        The product ID to remove.
    """
    try:
        client = _get_client()
        index = client.index(PRODUCTS_INDEX)
        index.delete_document(product_id)
        logger.debug("product_removed_from_index", product_id=product_id)

    except Exception as exc:
        logger.warning("product_remove_failed", product_id=product_id, error=str(exc))


async def search_products(
    query: str,
    *,
    category_id: str | None = None,
    brand: str | None = None,
    material: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    status: str | None = None,
    sort_by: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[ProductSearchResult], int]:
    """Search products using Meilisearch full-text search.

    Parameters
    ----------
    query:
        Search query string.
    category_id:
        Filter by category.
    brand:
        Filter by brand.
    material:
        Filter by material.
    min_price:
        Minimum price filter.
    max_price:
        Maximum price filter.
    status:
        Filter by product status.
    sort_by:
        Sort field (e.g. 'min_price:asc', 'name:desc').
    page:
        Page number (1-indexed).
    page_size:
        Number of results per page.

    Returns
    -------
    tuple[list[ProductSearchResult], int]
        List of search results and total hit count.
    """
    try:
        client = _get_client()
        index = client.index(PRODUCTS_INDEX)

        # Build filter
        filters: list[str] = []
        if category_id:
            filters.append(f'category_id = "{category_id}"')
        if brand:
            filters.append(f'brand = "{brand}"')
        if material:
            filters.append(f'material = "{material}"')
        if status:
            filters.append(f'status = "{status}"')
        if min_price is not None:
            filters.append(f"min_price >= {min_price}")
        if max_price is not None:
            filters.append(f"max_price <= {max_price}")

        search_params: dict[str, Any] = {
            "offset": (page - 1) * page_size,
            "limit": page_size,
            "attributesToHighlight": ["name", "description", "brand"],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
        }

        if filters:
            search_params["filter"] = " AND ".join(filters)

        if sort_by:
            search_params["sort"] = [sort_by]

        result = index.search(query, search_params)

        search_results: list[ProductSearchResult] = []
        for hit in result.get("hits", []):
            # Extract highlights
            formatted = hit.get("_formatted", {})
            highlights: dict[str, str] = {}
            for field in ["name", "description", "brand"]:
                if field in formatted and formatted[field] != hit.get(field):
                    highlights[field] = formatted[field]

            # Clean hit for Product model
            clean_hit = {k: v for k, v in hit.items() if not k.startswith("_")}

            try:
                product = Product(**clean_hit)
                search_results.append(
                    ProductSearchResult(
                        product=product,
                        score=None,  # Meilisearch doesn't expose raw scores
                        highlights=highlights,
                    )
                )
            except Exception as exc:
                logger.warning("search_hit_parse_error", hit_id=hit.get("id"), error=str(exc))

        total_hits = result.get("estimatedTotalHits", len(search_results))

        logger.info(
            "product_search_complete",
            query=query,
            total_hits=total_hits,
            returned=len(search_results),
        )

        return search_results, total_hits

    except Exception as exc:
        logger.error("meilisearch_search_failed", query=query, error=str(exc))
        return [], 0
