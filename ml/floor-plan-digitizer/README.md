# Floor Plan Digitizer

Convert raster floor plans (scans, photos, PDFs) to vector CAD representations.

## Capabilities

- Room boundary detection from scanned floor plans
- Door and window recognition with opening direction
- Dimension text extraction (OCR)
- Wall thickness detection
- Output: structured JSON + DXF

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k) | Custom | Baseline model for floor plan image parsing |
| [RoomFormer](https://github.com/ywyue/RoomFormer) | MIT | Transformer-based room polygon reconstruction |
| [OpenCV](https://github.com/opencv/opencv) | Apache-2.0 | Image preprocessing, contour detection, line detection |
| [ezdxf](https://github.com/mozman/ezdxf) | MIT | DXF output generation from detected room geometry |

## Status

Phase 1 — In Development
