# Drawing Generator

Auto-generated technical drawing service for OpenLintel.

## Responsibilities

- Floor plans (furnished and construction)
- Elevation drawings (wall-by-wall)
- Section drawings (ceiling, floor, wall build-up)
- Reflected Ceiling Plans (RCP)
- Flooring layout plans
- Joinery/millwork detail drawings

## Architecture: LLM Agent + ezdxf

The drawing generator uses an **LLM agent** to produce all drawing logic:

1. **Agent** receives room model, design variant, and drawing requirements
2. **Agent** calculates coordinates, dimensions, layers, and annotations
3. **Agent** generates ezdxf Python code for each drawing
4. **ezdxf** writes the actual DXF file
5. **Agent** generates SVG markup directly for web-embeddable views

### Specialized Tools (binary format I/O)

| Tool | License | Role |
|------|---------|------|
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF file generation — precise binary format |
| [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | LGPL-3.0 | IFC/BIM export for Revit/ArchiCAD interop |

### LLM Agent handles (replaces CadQuery, Build123d, pythonOCC)

- Drawing specifications — which views, scales, title blocks
- Coordinate calculations — wall positions, furniture placement, dimensions
- Parametric joinery details — generates ezdxf code for custom millwork
- SVG generation — writes SVG markup directly for web embedding
- Annotation and dimensioning — proper architectural drawing conventions

## Output Formats

- DXF (via ezdxf)
- PDF drawing sets (scaled, title-blocked)
- SVG for web embedding
- IFC/BIM (via IfcOpenShell)

## Status

Phase 1 — In Development
