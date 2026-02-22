# Room Segmentation Model

Computer vision model for identifying room elements from photos.

## Capabilities

- Wall, floor, ceiling segmentation
- Door and window detection
- Existing furniture and fixture identification
- Damage detection (cracks, dampness, mold)
- Monocular depth estimation for dimension inference

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [SAM 2](https://github.com/facebookresearch/sam2) | Apache-2.0 | Promptable segmentation for room elements (walls, floors, ceilings) |
| [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO) | Apache-2.0 | Open-set detection of furniture, fixtures, and architectural elements |
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Apache-2.0 | Monocular depth estimation for dimension inference |

## Architecture

- Backbone: SAM 2 + Grounding DINO for zero-shot segmentation and detection
- Depth: Depth Anything V2 for monocular depth estimation
- Training data: ADE20K + custom interior dataset
- Output: Per-pixel semantic segmentation masks + depth maps

## Getting Started

```bash
cd ml/room-segmentation
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python train.py --config configs/default.yaml
```

## Status

Phase 1 — In Development
