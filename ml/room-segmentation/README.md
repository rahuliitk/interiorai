# Room Segmentation Model

Computer vision model for identifying room elements from photos.

## Capabilities

- Wall, floor, ceiling segmentation
- Door and window detection
- Existing furniture and fixture identification
- Damage detection (cracks, dampness, mold)
- Monocular depth estimation for dimension inference

## Architecture

- Backbone: SegFormer or Mask2Former
- Training data: ADE20K + custom interior dataset
- Output: Per-pixel semantic segmentation masks

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
