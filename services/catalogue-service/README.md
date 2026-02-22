# Catalogue Service

Product catalogue management for OpenLintel.

## Responsibilities

- Unified product schema across all material categories
- Retailer/brand onboarding and catalogue management
- Product search (full-text and specification-based filtering)
- Multi-vendor price comparison
- Product recommendation engine
- Compatibility checking between products

## Architecture: Search Infrastructure + LLM Agent

1. **Meilisearch** handles full-text product search with typo tolerance
2. **pgvector** stores CLIP/DINOv2 embeddings for visual similarity search
3. **LLM agent** handles recommendations, compatibility checking, and natural language queries

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Meilisearch](https://github.com/meilisearch/meilisearch) | MIT | Full-text product search with instant results |
| [pgvector](https://github.com/pgvector/pgvector) | PostgreSQL License | Vector similarity search for visual product matching |

### LLM Agent handles

- Product recommendations based on design context
- Compatibility checking between products
- Natural language search queries
- Price comparison and value analysis

## Tech Stack

- Node.js / TypeScript
- Fastify or Express
- PostgreSQL + Meilisearch + pgvector
- Redis (caching)

## Status

Phase 1 — In Development
