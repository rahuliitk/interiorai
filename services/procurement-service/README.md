# Procurement Service

Order management and supply chain coordination for OpenLintel.

## Responsibilities

- Consolidated purchase order generation
- Phased ordering based on construction timeline
- Multi-vendor order splitting optimization
- Delivery tracking and site coordination
- Returns and defect management

## Architecture: LLM Agent + OR-Tools

1. **Agent** evaluates vendors, negotiates terms, and generates purchase orders
2. **OR-Tools** optimizes delivery routing and scheduling
3. **Agent** handles phased ordering logic based on construction timeline

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Google OR-Tools](https://github.com/google/or-tools) | Apache-2.0 | Route optimization and delivery scheduling |

### LLM Agent handles

- Vendor evaluation and selection
- Order consolidation and splitting logic
- Phased ordering based on construction schedule
- Returns and defect resolution workflow

## Status

Phase 3 — Planned
