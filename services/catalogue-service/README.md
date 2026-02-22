# Catalogue Service

Product catalogue management for OpenLintel.

## Responsibilities

- Unified product schema across all material categories
- Retailer/brand onboarding and catalogue management
- Product search (full-text and specification-based filtering)
- Multi-vendor price comparison
- Product recommendation engine
- Compatibility checking between products

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [Meilisearch](https://github.com/meilisearch/meilisearch) | MIT | Lightning-fast full-text product search with typo tolerance |
| [pgvector](https://github.com/pgvector/pgvector) | PostgreSQL License | Vector similarity search for visual product matching |

## Tech Stack

- Node.js / TypeScript
- Fastify or Express
- PostgreSQL + Meilisearch
- Redis (caching)

## Status

Phase 1 — In Development
