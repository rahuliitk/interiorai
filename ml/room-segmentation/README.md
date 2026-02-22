# Room Segmentation

Computer vision pipeline for identifying room elements from photos.

## Capabilities

- Wall, floor, ceiling segmentation
- Door and window detection
- Existing furniture and fixture identification
- Damage detection (cracks, dampness, mold)
- Monocular depth estimation for dimension inference

## Architecture: LLM Agent + Specialized Vision Models

1. **Multimodal VLM** identifies objects in the scene via natural language (replaces Grounding DINO, YOLO)
2. **SAM 2** produces pixel-level segmentation masks from LLM-identified regions
3. **Depth Anything V2** generates dense depth maps for dimension estimation
4. **VLM/LLM agent** interprets results — room type, condition, spatial layout

### Specialized Tools (pixel-level output)

| Tool | License | Role |
|------|---------|------|
| [SAM 2](https://github.com/facebookresearch/sam2) | Apache-2.0 | Pixel-level segmentation — LLMs output text, not masks |
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Apache-2.0 | Dense depth maps from single photos |

### VLM handles (replaces Grounding DINO, YOLO)

- Object identification via natural language prompts (VLM API)
- Scene understanding and room type classification
- Damage assessment and condition reporting
- Prompting SAM 2 with identified regions

## Getting Started

```bash
cd ml/room-segmentation
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Status

Phase 1 — In Development
