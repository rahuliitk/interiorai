"""
Product embedding indexer for pgvector.

Provides async operations to store, retrieve, and delete product embeddings
in PostgreSQL using the pgvector extension.  Uses ``sqlalchemy.text()``
following the same pattern as ``job_worker.py``.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ProductIndexer:
    """Async pgvector operations for product embeddings.

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

    async def index_product(
        self,
        product_id: str,
        embedding: list[float],
        *,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Store a single product embedding (upsert).

        Parameters
        ----------
        product_id:
            The product identifier.
        embedding:
            The embedding vector.
        metadata:
            Optional metadata dict.

        Returns
        -------
        str
            The product_id.
        """
        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"

        await self._db.execute(
            text(f"""
                INSERT INTO {self._table} (product_id, embedding)
                VALUES (:product_id, :embedding::vector)
                ON CONFLICT (product_id)
                DO UPDATE SET embedding = :embedding::vector, updated_at = NOW()
            """),
            {"product_id": product_id, "embedding": embedding_str},
        )
        await self._db.commit()

        logger.debug("product_indexed", product_id=product_id, dim=len(embedding))
        return product_id

    async def index_batch(
        self,
        items: list[tuple[str, list[float]]],
    ) -> list[str]:
        """Index multiple product embeddings.

        Parameters
        ----------
        items:
            List of (product_id, embedding) tuples.

        Returns
        -------
        list[str]
            List of product_ids that were indexed.
        """
        indexed: list[str] = []
        for product_id, embedding in items:
            await self.index_product(product_id, embedding)
            indexed.append(product_id)

        logger.info("batch_indexed", count=len(indexed))
        return indexed

    async def delete_product(self, product_id: str) -> None:
        """Delete a product's embedding.

        Parameters
        ----------
        product_id:
            The product identifier to delete.
        """
        await self._db.execute(
            text(f"DELETE FROM {self._table} WHERE product_id = :product_id"),
            {"product_id": product_id},
        )
        await self._db.commit()
        logger.debug("product_embedding_deleted", product_id=product_id)

    async def get_embedding(self, product_id: str) -> list[float] | None:
        """Retrieve a stored embedding for a product.

        Parameters
        ----------
        product_id:
            The product identifier.

        Returns
        -------
        list[float] | None
            The embedding vector, or None if not found.
        """
        result = await self._db.execute(
            text(f"SELECT embedding::text FROM {self._table} WHERE product_id = :product_id"),
            {"product_id": product_id},
        )
        row = result.fetchone()
        if row is None:
            return None

        # Parse pgvector text representation "[0.1,0.2,...]"
        vec_str = row[0].strip("[]")
        return [float(v) for v in vec_str.split(",")]
