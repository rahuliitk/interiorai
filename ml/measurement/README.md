# AI Measurement Estimation

Estimate room dimensions from photos using computer vision.

## Capabilities

- Monocular depth estimation
- Reference object calibration (standard door height, A4 paper)
- AR-based measurement overlay
- Cross-validation with floor plan dimensions

## Architecture: LLM Agent + Depth Model

1. **Depth Anything V2** generates dense depth maps from photos
2. **Multimodal LLM** identifies reference objects (doors, standard furniture) for scale calibration
3. **LLM agent** calculates real-world dimensions from calibrated depth
4. **COLMAP** provides multi-view stereo for higher precision when multiple photos are available

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Apache-2.0 | Monocular depth estimation |
| [COLMAP](https://github.com/colmap/colmap) | BSD-3 | Multi-view stereo for precise 3D measurements |

### LLM Agent handles

- Reference object identification and calibration
- Dimension calculation from calibrated depth
- Cross-validation between depth estimates and floor plan data
- Measurement uncertainty estimation

## Status

Phase 1 — In Development
