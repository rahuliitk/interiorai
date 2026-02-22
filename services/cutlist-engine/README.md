# Cut List Engine

CNC-ready cut list generation and nesting optimization for OpenLintel.

## Responsibilities

- Generate panel cut lists from furniture design specifications
- Include grain direction, edge banding, and boring positions
- Nesting optimization to maximize yield from standard sheets
- DXF output for CNC router integration
- Track reusable offcuts
- Hardware schedule generation per furniture unit

## Architecture: LLM Agent + Optimization Solvers

1. **Agent** breaks down furniture design into individual panels (dimensions, material, grain, edge banding)
2. **Agent** generates the cut list with quantities and specifications
3. **rectpack** optimizes rectangular panel layout on standard sheets
4. **DeepNest** handles irregular shapes (tiles, stone)
5. **ezdxf** writes CNC-compatible DXF output
6. **Agent** tracks offcuts and suggests reuse opportunities

### Specialized Tools (NP-hard optimization + binary output)

| Tool | License | Role |
|------|---------|------|
| [rectpack](https://github.com/secnot/rectpack) | Apache-2.0 | Rectangular bin-packing for panel nesting |
| [DeepNest](https://github.com/Jack000/DeepNest) | MIT | Irregular shape nesting for tiles/stone |
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF output for CNC routers |

### LLM Agent handles

- Furniture → panel breakdown (replaces hard-coded rules)
- Edge banding and grain direction logic
- Offcut tracking and reuse suggestions
- Hardware schedule generation

## Status

Phase 2 — Planned
