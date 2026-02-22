# Design Engine

AI-powered design generation service for OpenLintel.

## Responsibilities

- Accept room dimensions, style preferences, and budget constraints
- Generate multiple design variants per room
- Produce 2D concepts, 3D viewport renders, and photorealistic renders
- Spatial planning and furniture layout optimization

## Architecture: LLM Agent + Diffusion Models

The design engine uses an **LLM agent** (via LangGraph) to orchestrate the generation pipeline:

1. **Agent** interprets user preferences, selects style parameters, crafts optimal prompts
2. **Diffusers + SDXL/FLUX** generates design images from text + spatial conditioning
3. **ControlNet** constrains output to match room geometry (floor plan, depth map)
4. **IP-Adapter** transfers style from mood board / reference images
5. **IC-Light** adjusts lighting to match time-of-day and lighting design
6. **Agent** evaluates output quality and re-prompts if needed

### Specialized Tools (things LLMs can't do)

| Tool | License | Role |
|------|---------|------|
| [HF Diffusers](https://github.com/huggingface/diffusers) | Apache-2.0 | Core diffusion framework — generates pixels |
| [SDXL](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) / [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | Apache-2.0 | Base text-to-image models |
| [ControlNet](https://github.com/lllyasviel/ControlNet) | Apache-2.0 | Spatial conditioning from room geometry |
| [IP-Adapter](https://github.com/tencent-ailab/IP-Adapter) | Apache-2.0 | Style transfer from reference images |
| [IC-Light](https://github.com/lllyasviel/IC-Light) | Apache-2.0 | Controllable relighting |

### LLM Agent handles (replaces ComfyUI)

- Pipeline orchestration — chains segment → depth → generate → style → relight
- Prompt engineering from user preferences and spatial context
- Quality evaluation and iterative re-generation
- Style consistency across rooms

## Tech Stack

- Python 3.11+ / FastAPI
- LangGraph (agent orchestration)
- PyTorch / Diffusers (model inference)
- Outlines (structured output)

## Getting Started

```bash
cd services/design-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Status

Phase 1 — In Development
