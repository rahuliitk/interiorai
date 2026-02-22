# Design Generation Model

AI model pipeline for generating interior design concepts from constraints.

## Capabilities

- Generate multiple design variants from room dimensions + style + budget
- Furniture layout optimization (traffic flow, ergonomics, lighting)
- Material palette generation (cohesive color/texture combinations)
- Style transfer and adaptation

## Architecture: LLM Agent + Diffusion Models

1. **LLM agent** interprets design brief — style, budget, room function, user preferences
2. **Agent** crafts optimal diffusion prompts and selects conditioning inputs
3. **Diffusers + SDXL/FLUX** generates design images
4. **ControlNet** constrains output to room geometry (floor plan outline, depth map)
5. **Agent** evaluates results, iterates if quality/style criteria aren't met

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [HF Diffusers](https://github.com/huggingface/diffusers) | Apache-2.0 | Core diffusion framework |
| [SDXL](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | Apache-2.0 | Base model for design image generation |
| [ControlNet](https://github.com/lllyasviel/ControlNet) | Apache-2.0 | Spatial conditioning from floor plan + depth |

### LLM Agent handles (replaces ComfyUI)

- Pipeline orchestration and prompt engineering
- Style consistency enforcement across rooms
- Quality control and iterative re-generation
- Design brief interpretation

## Status

Phase 1 — In Development
