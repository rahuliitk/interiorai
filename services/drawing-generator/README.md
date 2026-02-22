# Drawing Generator

Auto-generated technical drawing service for OpenLintel.

## Responsibilities

- Floor plans (furnished and construction)
- Elevation drawings (wall-by-wall)
- Section drawings (ceiling, floor, wall build-up)
- Reflected Ceiling Plans (RCP)
- Flooring layout plans
- Joinery/millwork detail drawings

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | Core DXF file generation — floor plans, elevations, sections |
| [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | LGPL-3.0 | IFC/BIM export for interoperability with Revit, ArchiCAD |
| [CadQuery](https://github.com/CadQuery/cadquery) / [Build123d](https://github.com/gumyr/build123d) | Apache-2.0 | Parametric CAD scripting for joinery detail generation |
| [svgwrite](https://github.com/mozman/svgwrite) | MIT | SVG output for web-embeddable drawings |

## Output Formats

- AutoCAD DWG/DXF (via ezdxf)
- PDF drawing sets (scaled, title-blocked)
- SVG for web embedding
- IFC/BIM export (via IfcOpenShell)

## Tech Stack

- Python 3.11+
- FastAPI
- ezdxf (DXF generation)
- ReportLab or WeasyPrint (PDF generation)

## Status

Phase 1 — In Development
