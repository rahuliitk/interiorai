# Visual Product Search

Match photos of materials and products to catalogue items.

## Capabilities

- Upload photo of a tile, countertop, fixture, etc.
- Find matching or visually similar products from catalogue
- Feature extraction for material type, color, pattern recognition
- Similarity ranking with price and availability context

## Architecture: LLM Agent + Vector Search

1. **CLIP/DINOv2** generates visual embeddings for uploaded photo
2. **pgvector** performs nearest-neighbor search across product catalogue embeddings
3. **Multimodal LLM** interprets the photo — material type, color, texture, style
4. **LLM agent** re-ranks results considering budget, availability, and design context

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [CLIP](https://github.com/openai/CLIP) / [DINOv2](https://github.com/facebookresearch/dinov2) | MIT / Apache-2.0 | Visual embeddings — efficient similarity at scale |
| [pgvector](https://github.com/pgvector/pgvector) | PostgreSQL License | Vector similarity search in PostgreSQL |
| [Meilisearch](https://github.com/meilisearch/meilisearch) | MIT | Full-text product search fallback |

### LLM Agent handles

- Photo interpretation — material type, color, pattern, style
- Intent understanding — "something like this but cheaper"
- Result re-ranking with design context and budget
- Natural language product queries

## Status

Phase 2 — Planned
