"""
OpenLintel Product Matching — visual similarity search for furniture and decor.

Uses CLIP/DINOv2 embeddings for visual feature extraction and pgvector
for similarity search, with optional VLM-based re-ranking for
design-context-aware results.

Typical usage::

    from openlintel_product_matching import ProductEmbedder, ProductSearcher

    embedder = ProductEmbedder(model="clip")
    embedding = embedder.embed_image(image)

    searcher = ProductSearcher(database_url="postgresql://...")
    results = await searcher.search(embedding, top_k=10)
"""

from openlintel_product_matching.embedder import ProductEmbedder
from openlintel_product_matching.indexer import ProductIndexer
from openlintel_product_matching.reranker import VLMReranker
from openlintel_product_matching.searcher import ProductSearcher

__all__ = [
    "ProductEmbedder",
    "ProductIndexer",
    "ProductSearcher",
    "VLMReranker",
]
