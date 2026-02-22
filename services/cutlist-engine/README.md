# Cut List Engine

CNC-ready cut list generation and nesting optimization for OpenLintel.

## Responsibilities

- Generate panel cut lists from furniture design specifications
- Include grain direction, edge banding, and boring positions
- Nesting optimization to maximize yield from standard sheets
- DXF output for CNC router integration
- Track reusable offcuts
- Hardware schedule generation per furniture unit

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [DeepNest](https://github.com/Jack000/DeepNest) | MIT | 2D nesting optimizer for irregular tile/stone shapes |
| [rectpack](https://github.com/secnot/rectpack) | Apache-2.0 | Fast rectangular bin-packing for panel cut lists |
| [libnest2d](https://github.com/tamasmeszaros/libnest2d) | LGPL-3.0 | High-performance 2D irregular nesting backend |
| [Google OR-Tools](https://github.com/google/or-tools) | Apache-2.0 | Optimization for offcut tracking and material purchasing |
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF output for CNC router integration |

## Tech Stack

- Python 3.11+
- FastAPI
- NumPy / SciPy (for optimization)
- ezdxf (for DXF file generation)

## Status

Phase 2 — Planned
