"""
Pydantic models for the product-matching pipeline.

Defines data structures for embeddings, search queries, search results,
VLM reranking, and the top-level visual search response.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EmbeddingModel(str, Enum):
    """Supported embedding model identifiers."""

    CLIP_VIT_B32 = "clip-vit-b-32"
    CLIP_VIT_L14 = "clip-vit-l-14"


class ProductEmbedding(BaseModel):
    """An embedding vector associated with a product."""

    product_id: str
    embedding: list[float]
    model: EmbeddingModel = EmbeddingModel.CLIP_VIT_B32
    dimension: int = 512


class SearchQuery(BaseModel):
    """A visual similarity search query."""

    embedding: list[float]
    top_k: int = Field(default=20, ge=1, le=100)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    filters: dict[str, Any] = Field(default_factory=dict)


class SearchResult(BaseModel):
    """A single result from a pgvector similarity search."""

    product_id: str
    similarity_score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RerankerResult(BaseModel):
    """A result after VLM-based reranking."""

    product_id: str
    similarity_score: float
    relevance_score: float = Field(
        default=0.0, description="VLM-assessed relevance (0-1)"
    )
    reasoning: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class VisualSearchResult(BaseModel):
    """Top-level response from the product matching pipeline."""

    query_embedding_dim: int = 512
    total_candidates: int = 0
    results: list[RerankerResult] = Field(default_factory=list)
    model_used: EmbeddingModel = EmbeddingModel.CLIP_VIT_B32
    reranked: bool = False
