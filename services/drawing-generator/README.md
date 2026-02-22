# Drawing Generator

Auto-generated technical drawing service for InteriorAI.

## Responsibilities

- Floor plans (furnished and construction)
- Elevation drawings (wall-by-wall)
- Section drawings (ceiling, floor, wall build-up)
- Reflected Ceiling Plans (RCP)
- Flooring layout plans
- Joinery/millwork detail drawings

## Output Formats

- AutoCAD DWG/DXF (via ezdxf or LibreCAD)
- PDF drawing sets (scaled, title-blocked)
- SVG for web embedding
- IFC/BIM export (future)

## Tech Stack

- Python 3.11+
- FastAPI
- ezdxf (DXF generation)
- ReportLab or WeasyPrint (PDF generation)

## Status

Phase 1 — In Development
