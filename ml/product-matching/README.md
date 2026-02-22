# Visual Product Search

Match photos of materials and products to catalogue items.

## Capabilities

- Upload photo of a tile, countertop, fixture, etc.
- Find matching or visually similar products from catalogue
- Feature extraction for material type, color, pattern recognition
- Similarity ranking with price and availability context

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [CLIP](https://github.com/openai/CLIP) / [DINOv2](https://github.com/facebookresearch/dinov2) | MIT / Apache-2.0 | Visual feature extraction for material similarity matching |
| [pgvector](https://github.com/pgvector/pgvector) | PostgreSQL License | Vector similarity search within PostgreSQL |
| [Meilisearch](https://github.com/meilisearch/meilisearch) | MIT | Full-text product search with typo tolerance |

## Architecture

- CLIP/DINOv2-based embeddings for visual similarity
- Fine-tuned on interior materials dataset
- Vector search via pgvector (PostgreSQL extension)

## Status

Phase 2 — Planned
