# BOM Engine

Bill of Materials calculation service for OpenLintel.

## Responsibilities

- Calculate material quantities from design specifications
- Apply waste factors per material category and layout pattern
- Generate room-by-room and category-wise BOMs
- Produce tile/stone cut lists with layout optimization
- Generate electrical and plumbing material schedules

## Architecture: LLM Agent + OR-Tools

1. **Agent** analyzes design variant and calculates material quantities with waste factors
2. **Agent** handles material substitutions and alternates based on budget/availability
3. **OR-Tools** solves budget allocation and vendor selection optimization
4. **Outlines** ensures structured BOM output matching typed schemas

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Google OR-Tools](https://github.com/google/or-tools) | Apache-2.0 | Budget allocation and material purchasing optimization |

### LLM Agent handles

- Quantity calculation with waste factors (replaces hand-coded rules)
- Material substitution reasoning
- Cross-category dependency detection
- Electrical and plumbing material schedules

## Status

Phase 1 — In Development
