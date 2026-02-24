"""
Product matching pipeline: Image → Embed → Search → Rerank.

Orchestrates the full visual product search workflow with graceful
degradation.  Follows the ``SegmentationPipeline`` pattern from
``ml/room-segmentation/``.

- If the database is unavailable, embedding-only mode returns raw vectors.
- If the VLM reranker fails, results are returned sorted by visual similarity.
- CLIP model loading is deferred to first use.
"""

from __future__ import annotations

import logging
from typing import Any

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_product_matching.embedder import ProductEmbedder
from openlintel_product_matching.schemas import (
    EmbeddingModel,
    RerankerResult,
    SearchResult,
    VisualSearchResult,
)

logger = logging.getLogger(__name__)


class ProductMatchingPipeline:
    """End-to-end visual product search pipeline.

    Combines CLIP embedding, pgvector search, and optional VLM reranking
    into a single workflow.

    Parameters
    ----------
    db:
        Async SQLAlchemy session for pgvector operations.
    embedder:
        Optional pre-configured ``ProductEmbedder``.
    device:
        PyTorch device for CLIP (``"auto"`` / ``"cuda"`` / ``"cpu"``).
    enable_reranking:
        Whether to run VLM reranking on results.
    reranker_model:
        LiteLLM model identifier for the reranker.
    reranker_api_key:
        API key for the reranker VLM.
    """

    def __init__(
        self,
        db: AsyncSession | None = None,
        *,
        embedder: ProductEmbedder | None = None,
        device: str = "auto",
        enable_reranking: bool = True,
        reranker_model: str = "openai/gpt-4o-mini",
        reranker_api_key: str | None = None,
    ) -> None:
        self._db = db
        self._embedder = embedder or ProductEmbedder(device=device)
        self._enable_reranking = enable_reranking
        self._reranker_model = reranker_model
        self._reranker_api_key = reranker_api_key

    async def search_by_image(
        self,
        image: Image.Image,
        *,
        top_k: int = 20,
        min_score: float = 0.0,
        filters: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
        product_metadata: dict[str, dict[str, Any]] | None = None,
    ) -> VisualSearchResult:
        """Run the full pipeline on a query image.

        Parameters
        ----------
        image:
            The query image.
        top_k:
            Maximum number of results.
        min_score:
            Minimum similarity threshold.
        filters:
            Optional search filters (category, brand, max_price).
        context:
            Design context for reranking (room_type, style, budget).
        product_metadata:
            Product details keyed by product_id for reranking.

        Returns
        -------
        VisualSearchResult
            The search results with optional reranking.
        """
        # Step 1: Embed the query image
        logger.info("pipeline_embed_start")
        embedding = self._embedder.embed_image(image)
        logger.info("pipeline_embed_done", dim=len(embedding))

        # Step 2: Search pgvector
        if self._db is None:
            logger.warning("pipeline_no_db", hint="Returning embedding only")
            return VisualSearchResult(
                query_embedding_dim=len(embedding),
                total_candidates=0,
                results=[],
                reranked=False,
            )

        from openlintel_product_matching.searcher import ProductSearcher

        searcher = ProductSearcher(self._db)
        candidates = await searcher.search(
            embedding, top_k=top_k * 2, min_score=min_score, filters=filters,
        )
        logger.info("pipeline_search_done", candidates=len(candidates))

        if not candidates:
            return VisualSearchResult(
                query_embedding_dim=len(embedding),
                total_candidates=0,
                results=[],
                reranked=False,
            )

        # Step 3: Rerank with VLM (optional)
        reranked = False
        final_results: list[RerankerResult]

        if self._enable_reranking and context:
            try:
                from openlintel_product_matching.reranker import VLMReranker

                reranker = VLMReranker(
                    model=self._reranker_model,
                    api_key=self._reranker_api_key,
                    max_candidates=min(top_k, len(candidates)),
                )
                final_results = await reranker.rerank(
                    query_image=image,
                    candidates=candidates[:top_k],
                    product_metadata=product_metadata,
                    context=context,
                )
                reranked = True
                logger.info("pipeline_rerank_done", results=len(final_results))

            except Exception as exc:
                logger.warning("pipeline_rerank_failed", error=str(exc))
                # Graceful degradation: use search results as-is
                final_results = [
                    RerankerResult(
                        product_id=c.product_id,
                        similarity_score=c.similarity_score,
                        relevance_score=c.similarity_score,
                    )
                    for c in candidates[:top_k]
                ]
        else:
            final_results = [
                RerankerResult(
                    product_id=c.product_id,
                    similarity_score=c.similarity_score,
                    relevance_score=c.similarity_score,
                )
                for c in candidates[:top_k]
            ]

        return VisualSearchResult(
            query_embedding_dim=len(embedding),
            total_candidates=len(candidates),
            results=final_results,
            model_used=EmbeddingModel.CLIP_VIT_B32,
            reranked=reranked,
        )

    async def search_by_text(
        self,
        text: str,
        *,
        top_k: int = 20,
        min_score: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> VisualSearchResult:
        """Search using a text description.

        Parameters
        ----------
        text:
            A text description of the desired product.
        top_k:
            Maximum number of results.
        min_score:
            Minimum similarity threshold.
        filters:
            Optional search filters.

        Returns
        -------
        VisualSearchResult
            The search results (no reranking for text-only queries).
        """
        embedding = self._embedder.embed_text(text)

        if self._db is None:
            return VisualSearchResult(
                query_embedding_dim=len(embedding),
                total_candidates=0,
                results=[],
                reranked=False,
            )

        from openlintel_product_matching.searcher import ProductSearcher

        searcher = ProductSearcher(self._db)
        candidates = await searcher.search(
            embedding, top_k=top_k, min_score=min_score, filters=filters,
        )

        return VisualSearchResult(
            query_embedding_dim=len(embedding),
            total_candidates=len(candidates),
            results=[
                RerankerResult(
                    product_id=c.product_id,
                    similarity_score=c.similarity_score,
                    relevance_score=c.similarity_score,
                )
                for c in candidates
            ],
            model_used=EmbeddingModel.CLIP_VIT_B32,
            reranked=False,
        )
