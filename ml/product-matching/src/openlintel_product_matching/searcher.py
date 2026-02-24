"""
Product similarity searcher using pgvector.

Performs cosine-distance searches against stored product embeddings,
with optional filtering and hybrid search combining visual similarity
with text metadata.  Uses the ``<=>`` cosine distance operator following
the ``vector_search.py`` pattern.
"""

from __future__ import annotations

import logging
from typing import Any

from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_product_matching.schemas import SearchQuery, SearchResult

logger = logging.getLogger(__name__)


class ProductSearcher:
    """Cosine-similarity search over product embeddings.

    Parameters
    ----------
    db:
        An async SQLAlchemy session.
    table:
        The embeddings table name.
    """

    def __init__(self, db: AsyncSession, *, table: str = "product_embeddings") -> None:
        self._db = db
        self._table = table

    async def search(
        self,
        embedding: list[float],
        *,
        top_k: int = 20,
        min_score: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        """Search for similar products by embedding.

        Parameters
        ----------
        embedding:
            The query embedding vector.
        top_k:
            Maximum number of results.
        min_score:
            Minimum similarity score threshold (0-1).
        filters:
            Optional filters (e.g. category, brand).

        Returns
        -------
        list[SearchResult]
            Ranked list of similar products.
        """
        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"

        query = f"""
            SELECT
                pe.product_id,
                1 - (pe.embedding <=> :embedding::vector) AS similarity_score
            FROM {self._table} pe
        """

        params: dict[str, Any] = {
            "embedding": embedding_str,
            "limit": top_k,
            "min_score": min_score,
        }

        conditions: list[str] = []

        # Apply filters via JOIN to products table
        if filters:
            query = f"""
                SELECT
                    pe.product_id,
                    1 - (pe.embedding <=> :embedding::vector) AS similarity_score
                FROM {self._table} pe
                JOIN products p ON p.id = pe.product_id
            """
            if "category" in filters:
                conditions.append("p.category_name = :category")
                params["category"] = filters["category"]
            if "brand" in filters:
                conditions.append("p.brand = :brand")
                params["brand"] = filters["brand"]
            if "max_price" in filters:
                conditions.append("(p.price_amount IS NULL OR p.price_amount <= :max_price)")
                params["max_price"] = filters["max_price"]

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += """
            HAVING 1 - (pe.embedding <=> :embedding::vector) >= :min_score
            ORDER BY pe.embedding <=> :embedding::vector
            LIMIT :limit
        """

        result = await self._db.execute(text(query), params)
        rows = result.fetchall()

        return [
            SearchResult(
                product_id=row[0],
                similarity_score=float(row[1]),
            )
            for row in rows
        ]

    async def search_by_image(
        self,
        image: Image.Image,
        *,
        embedder: Any,
        top_k: int = 20,
        min_score: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        """Search using a PIL image (embeds it first).

        Parameters
        ----------
        image:
            The query image.
        embedder:
            A ``ProductEmbedder`` instance.
        top_k:
            Maximum results.
        min_score:
            Minimum similarity threshold.
        filters:
            Optional filters.

        Returns
        -------
        list[SearchResult]
            Ranked results.
        """
        embedding = embedder.embed_image(image)
        return await self.search(
            embedding, top_k=top_k, min_score=min_score, filters=filters,
        )

    async def search_hybrid(
        self,
        embedding: list[float],
        text_query: str | None = None,
        *,
        top_k: int = 20,
        min_score: float = 0.0,
        visual_weight: float = 0.7,
    ) -> list[SearchResult]:
        """Hybrid search combining visual similarity with text matching.

        Performs visual search first, then boosts results whose product name
        or description matches the text query.

        Parameters
        ----------
        embedding:
            The visual query embedding.
        text_query:
            Optional text search term.
        top_k:
            Maximum results.
        min_score:
            Minimum similarity threshold.
        visual_weight:
            Weight for visual score (0-1). Text weight = 1 - visual_weight.

        Returns
        -------
        list[SearchResult]
            Hybrid-ranked results.
        """
        # Get visual results with extra candidates for reranking
        visual_results = await self.search(
            embedding, top_k=top_k * 2, min_score=min_score,
        )

        if not text_query or not visual_results:
            return visual_results[:top_k]

        # Boost products matching text query
        text_weight = 1.0 - visual_weight
        product_ids = [r.product_id for r in visual_results]
        pid_list = ",".join(f"'{pid}'" for pid in product_ids)

        text_query_lower = text_query.lower()
        result = await self._db.execute(
            text(f"""
                SELECT id,
                    CASE
                        WHEN LOWER(name) LIKE :pattern THEN 1.0
                        WHEN LOWER(description) LIKE :pattern THEN 0.7
                        ELSE 0.0
                    END AS text_score
                FROM products
                WHERE id IN ({pid_list})
            """),
            {"pattern": f"%{text_query_lower}%"},
        )
        text_scores = {row[0]: float(row[1]) for row in result.fetchall()}

        # Combine scores
        combined = []
        for r in visual_results:
            ts = text_scores.get(r.product_id, 0.0)
            combined_score = (visual_weight * r.similarity_score) + (text_weight * ts)
            combined.append(SearchResult(
                product_id=r.product_id,
                similarity_score=combined_score,
                metadata={"visual_score": r.similarity_score, "text_score": ts},
            ))

        combined.sort(key=lambda x: x.similarity_score, reverse=True)
        return combined[:top_k]
