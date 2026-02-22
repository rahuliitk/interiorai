# Design Engine

AI-powered design generation service for OpenLintel.

## Responsibilities

- Accept room dimensions, style preferences, and budget constraints
- Generate multiple design variants per room
- Produce 2D concepts, 3D viewport renders, and photorealistic renders
- Spatial planning and furniture layout optimization

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [HF Diffusers](https://github.com/huggingface/diffusers) | Apache-2.0 | Core diffusion model framework for inference and fine-tuning |
| [SDXL](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) / [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | Apache-2.0 | Base text-to-image models for design concept generation |
| [ControlNet](https://github.com/lllyasviel/ControlNet) | Apache-2.0 | Spatial conditioning — constrain generation to room geometry |
| [IP-Adapter](https://github.com/tencent-ailab/IP-Adapter) | Apache-2.0 | Style transfer from mood board / reference images |
| [IC-Light](https://github.com/lllyasviel/IC-Light) | Apache-2.0 | Controllable relighting of generated designs |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | GPL-3.0 | Node-based workflow builder for multi-step generation pipelines |
| [Open3D](https://github.com/isl-org/Open3D) | MIT | 3D scene composition and point cloud processing |

## Tech Stack

- Python 3.11+
- FastAPI
- PyTorch / Diffusers (for AI model inference)
- Open3D (for 3D scene composition)

## Getting Started

```bash
cd services/design-engine
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API

See `docs/api/design-engine.md` for endpoint documentation.

## Status

Phase 1 — In Development
