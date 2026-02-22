# BOM Engine

Bill of Materials calculation service for OpenLintel.

## Responsibilities

- Calculate material quantities from design specifications
- Apply waste factors per material category and layout pattern
- Generate room-by-room and category-wise BOMs
- Produce tile/stone cut lists with layout optimization
- Generate electrical and plumbing material schedules

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [Google OR-Tools](https://github.com/google/or-tools) | Apache-2.0 | Material quantity optimization and waste minimization |
| [PuLP](https://github.com/coin-or/pulp) | MIT | Linear programming for budget-constrained material selection |

## Tech Stack

- Python 3.11+
- FastAPI
- NumPy (for quantity calculations)

## Status

Phase 1 — In Development
