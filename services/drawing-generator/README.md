# Drawing Generator

Auto-generated technical drawing service for OpenLintel.

## Responsibilities

- Floor plans (furnished and construction)
- Elevation drawings (wall-by-wall)
- Section drawings (ceiling, floor, wall build-up)
- Reflected Ceiling Plans (RCP)
- Flooring layout plans
- Joinery/millwork detail drawings

## Architecture: LLM Agent + File Format Tools

### DWG Support

Most real-world CAD files arrive as DWG (Autodesk's proprietary format). OpenLintel handles this:

```
User uploads DWG → LibreDWG (dwg2dxf) → ezdxf reads DXF → process geometry
                                                                    ↓
LLM agent generates new drawings → ezdxf writes DXF → user opens in any CAD
                                                                    ↓
                                            IfcOpenShell writes IFC → BIM tools
```

### Specialized Tools (binary format I/O)

| Tool | License | Role |
|------|---------|------|
| [LibreDWG](https://github.com/LibreDWG/libredwg) | GPL-3.0 | DWG reading — converts industry-standard DWG to DXF |
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF read/write — all drawing generation and processing |
| [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | LGPL-3.0 | IFC/BIM export for Revit/ArchiCAD interop |

### LLM Agent handles

- Drawing specifications — which views, scales, title blocks
- Coordinate calculations — wall positions, furniture placement, dimensions
- Parametric joinery details — generates ezdxf code for custom millwork
- SVG generation — writes SVG markup directly for web embedding
- Annotation and dimensioning — architectural drawing conventions

## Output Formats

- DXF (via ezdxf) — readable by all CAD software including AutoCAD
- PDF drawing sets (scaled, title-blocked)
- SVG for web embedding
- IFC/BIM (via IfcOpenShell)

## Status

Phase 1 — In Development
