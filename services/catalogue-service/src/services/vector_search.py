"""
Visual similarity search using pgvector.

Stores image embeddings alongside products in PostgreSQL with the
pgvector extension and provides cosine similarity search for finding
visually similar products.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.llm import LiteLLMClient

from src.models.product import Product, VisualSearchResult

logger = structlog.get_logger(__name__)

# Default embedding model for image descriptions
EMBEDDING_MODEL = "openai/text-embedding-3-small"
EMBEDDING_DIMENSION = 1536


async def generate_product_embedding(
    product: Product,
    llm_client: LiteLLMClient | None = None,
) -> list[float] | None:
    """Generate an embedding vector for a product.

    Creates a text representation of the product and generates an
    embedding using the configured embedding model.  The embedding
    captures product characteristics for visual similarity matching.

    Parameters
    ----------
    product:
        The product to generate an embedding for.
    llm_client:
        Optional LiteLLM client override.

    Returns
    -------
    list[float] | None
        The embedding vector, or None if generation fails.
    """
    client = llm_client or LiteLLMClient()

    # Build a rich text representation for embedding
    parts: list[str] = [product.name]
    if product.description:
        parts.append(product.description)
    if product.brand:
        parts.append(f"Brand: {product.brand}")
    if product.material:
        parts.append(f"Material: {product.material}")
    if product.finish:
        parts.append(f"Finish: {product.finish}")
    if product.color:
        parts.append(f"Color: {product.color}")
    if product.category_name:
        parts.append(f"Category: {product.category_name}")
    if product.tags:
        parts.append(f"Tags: {', '.join(product.tags)}")
    for spec in product.specifications:
        parts.append(f"{spec.key}: {spec.value}")

    text_repr = " | ".join(parts)

    try:
        response = await client.embedding(
            model=EMBEDDING_MODEL,
            input_texts=[text_repr],
        )
        embedding = response.data[0]["embedding"]
        logger.debug(
            "product_embedding_generated",
            product_id=product.id,
            dimension=len(embedding),
        )
        return embedding

    except Exception as exc:
        logger.warning(
            "product_embedding_failed",
            product_id=product.id,
            error=str(exc),
        )
        return None


async def store_product_embedding(
    db: AsyncSession,
    product_id: str,
    embedding: list[float],
) -> None:
    """Store a product embedding in the pgvector-enabled database.

    Parameters
    ----------
    db:
        Async database session.
    product_id:
        The product ID.
    embedding:
        The embedding vector.
    """
    embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"

    await db.execute(
        text("""
            INSERT INTO product_embeddings (product_id, embedding)
            VALUES (:product_id, :embedding::vector)
            ON CONFLICT (product_id)
            DO UPDATE SET embedding = :embedding::vector, updated_at = NOW()
        """),
        {"product_id": product_id, "embedding": embedding_str},
    )
    await db.commit()

    logger.debug("product_embedding_stored", product_id=product_id)


async def search_similar_products(
    db: AsyncSession,
    query_embedding: list[float],
    limit: int = 10,
    exclude_product_id: str | None = None,
) -> list[dict[str, Any]]:
    """Search for visually similar products using cosine similarity.

    Parameters
    ----------
    db:
        Async database session.
    query_embedding:
        The query embedding vector.
    limit:
        Maximum number of results.
    exclude_product_id:
        Optional product ID to exclude (e.g. the query product itself).

    Returns
    -------
    list[dict[str, Any]]
        List of dicts with 'product_id' and 'similarity_score'.
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    query = """
        SELECT
            product_id,
            1 - (embedding <=> :embedding::vector) AS similarity_score
        FROM product_embeddings
    """

    params: dict[str, Any] = {"embedding": embedding_str, "limit": limit}

    if exclude_product_id:
        query += " WHERE product_id != :exclude_id"
        params["exclude_id"] = exclude_product_id

    query += " ORDER BY embedding <=> :embedding::vector LIMIT :limit"

    result = await db.execute(text(query), params)
    rows = result.fetchall()

    return [
        {"product_id": row[0], "similarity_score": float(row[1])}
        for row in rows
    ]


async def delete_product_embedding(
    db: AsyncSession,
    product_id: str,
) -> None:
    """Delete a product's embedding from the database.

    Parameters
    ----------
    db:
        Async database session.
    product_id:
        The product ID whose embedding should be removed.
    """
    await db.execute(
        text("DELETE FROM product_embeddings WHERE product_id = :product_id"),
        {"product_id": product_id},
    )
    await db.commit()
    logger.debug("product_embedding_deleted", product_id=product_id)
