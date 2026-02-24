"""
VLM-based reranker for product search results.

Uses a vision-language model (GPT-4o-mini via LiteLLM) to rerank search
results based on design context, budget constraints, and style preferences.
Follows the ``vlm_detector.py`` pattern from ``ml/room-segmentation/``.
"""

from __future__ import annotations

import base64
import json
import logging
from io import BytesIO
from typing import Any

import litellm
from PIL import Image

from openlintel_product_matching.schemas import RerankerResult, SearchResult

logger = logging.getLogger(__name__)

DEFAULT_VLM_MODEL = "openai/gpt-4o-mini"


class VLMReranker:
    """Reranks product search results using a vision-language model.

    The VLM evaluates each candidate product against the query context
    (room type, design style, budget) and assigns relevance scores.

    Parameters
    ----------
    model:
        LiteLLM model identifier.
    api_key:
        API key for the model provider.
    max_candidates:
        Maximum number of candidates to send to the VLM for reranking.
    """

    def __init__(
        self,
        model: str = DEFAULT_VLM_MODEL,
        api_key: str | None = None,
        max_candidates: int = 10,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._max_candidates = max_candidates

    async def rerank(
        self,
        query_image: Image.Image | None,
        candidates: list[SearchResult],
        *,
        product_metadata: dict[str, dict[str, Any]] | None = None,
        context: dict[str, Any] | None = None,
    ) -> list[RerankerResult]:
        """Rerank candidates using the VLM.

        Parameters
        ----------
        query_image:
            The query image (optional, used for visual context).
        candidates:
            List of search results to rerank.
        product_metadata:
            Product metadata keyed by product_id.
        context:
            Design context dict with keys like ``room_type``, ``style``,
            ``budget_min``, ``budget_max``.

        Returns
        -------
        list[RerankerResult]
            Reranked results with relevance scores and reasoning.
        """
        if not candidates:
            return []

        top_candidates = candidates[: self._max_candidates]
        product_meta = product_metadata or {}
        ctx = context or {}

        # Build the prompt
        products_desc = []
        for i, candidate in enumerate(top_candidates):
            meta = product_meta.get(candidate.product_id, {})
            desc = (
                f"Product {i + 1} (ID: {candidate.product_id}): "
                f"Name: {meta.get('name', 'Unknown')}, "
                f"Category: {meta.get('category', 'Unknown')}, "
                f"Price: {meta.get('price', 'Unknown')}, "
                f"Material: {meta.get('material', 'Unknown')}, "
                f"Style: {meta.get('style', 'Unknown')}, "
                f"Visual similarity: {candidate.similarity_score:.3f}"
            )
            products_desc.append(desc)

        context_parts = []
        if ctx.get("room_type"):
            context_parts.append(f"Room type: {ctx['room_type']}")
        if ctx.get("style"):
            context_parts.append(f"Design style: {ctx['style']}")
        if ctx.get("budget_min") or ctx.get("budget_max"):
            budget = f"Budget: {ctx.get('budget_min', 0)} - {ctx.get('budget_max', 'unlimited')}"
            context_parts.append(budget)

        context_str = "; ".join(context_parts) if context_parts else "No specific context"

        system_prompt = (
            "You are an interior design product recommendation engine. "
            "Evaluate each product candidate for relevance to the design context. "
            "Return a JSON array with objects containing: "
            '"product_id", "relevance_score" (0.0-1.0), "reasoning" (brief).'
        )

        user_prompt = (
            f"Design context: {context_str}\n\n"
            f"Product candidates:\n" + "\n".join(products_desc) + "\n\n"
            "Rank these products by relevance. Return JSON array only."
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]

        # Add query image if available
        if query_image is not None:
            buf = BytesIO()
            query_image.save(buf, format="JPEG", quality=85)
            img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            data_uri = f"data:image/jpeg;base64,{img_b64}"
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": user_prompt},
                ],
            })
        else:
            messages.append({"role": "user", "content": user_prompt})

        try:
            response = await litellm.acompletion(
                model=self._model,
                messages=messages,
                api_key=self._api_key,
                temperature=0.1,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content or "[]"
            # Parse VLM response
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict) and "products" in parsed:
                    rankings = parsed["products"]
                elif isinstance(parsed, list):
                    rankings = parsed
                else:
                    rankings = []
            except json.JSONDecodeError:
                logger.warning("vlm_rerank_parse_failed", content=content[:200])
                rankings = []

            # Map rankings back to results
            ranking_map: dict[str, dict[str, Any]] = {}
            for r in rankings:
                pid = str(r.get("product_id", ""))
                ranking_map[pid] = r

            reranked: list[RerankerResult] = []
            for candidate in top_candidates:
                rank_data = ranking_map.get(candidate.product_id, {})
                reranked.append(RerankerResult(
                    product_id=candidate.product_id,
                    similarity_score=candidate.similarity_score,
                    relevance_score=float(rank_data.get("relevance_score", 0.5)),
                    reasoning=str(rank_data.get("reasoning", "")),
                    metadata=candidate.metadata,
                ))

            # Sort by combined score (relevance weighted higher)
            reranked.sort(
                key=lambda x: (0.6 * x.relevance_score + 0.4 * x.similarity_score),
                reverse=True,
            )

            logger.info("vlm_rerank_complete", candidates=len(reranked))
            return reranked

        except Exception as exc:
            logger.warning("vlm_rerank_failed", error=str(exc))
            # Graceful degradation: return original order
            return [
                RerankerResult(
                    product_id=c.product_id,
                    similarity_score=c.similarity_score,
                    relevance_score=c.similarity_score,
                    reasoning="VLM reranking unavailable",
                    metadata=c.metadata,
                )
                for c in top_candidates
            ]
