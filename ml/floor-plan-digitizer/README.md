# Floor Plan Digitizer

Convert raster floor plans (scans, photos, PDFs) to vector CAD representations.

## Capabilities

- Room boundary detection from scanned floor plans
- Door and window recognition with opening direction
- Dimension text extraction (OCR)
- Wall thickness detection
- Output: structured JSON + DXF

## Architecture: Multimodal LLM-Driven

The floor plan digitizer is **primarily driven by a multimodal LLM** — it reads floor plan images directly and extracts structured data.

### How it works:

1. **Multimodal LLM** analyzes the floor plan image
2. **LLM** extracts room boundaries, dimensions, doors, windows, and labels
3. **LLM** outputs structured JSON conforming to the room schema (via Outlines)
4. **ezdxf** generates DXF from the structured data
5. **OpenCV** handles image preprocessing (enhancement, deskewing) if needed

### Specialized Tools (image processing + binary output)

| Tool | License | Role |
|------|---------|------|
| [LibreDWG](https://github.com/LibreDWG/libredwg) | GPL-3.0 | DWG reading — convert uploaded DWG floor plans to DXF |
| [OpenCV](https://github.com/opencv/opencv) | Apache-2.0 | Image preprocessing — deskew, enhance, threshold |
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF output from extracted room geometry |

### DWG Input Support

Floor plans often arrive as DWG files. LibreDWG converts DWG → DXF on ingest, then ezdxf processes the geometry. For raster floor plans (scans, photos, PDFs), the multimodal VLM reads them directly.

### LLM Agent handles (replaces CubiCasa5k, RoomFormer)

- Floor plan image understanding
- Room boundary extraction
- Dimension and label reading (better than traditional OCR)
- Door/window detection with opening direction
- Structured JSON output with room polygons

## Status

Phase 1 — In Development
