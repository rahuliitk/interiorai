# Design Generation Model

AI model for generating interior design concepts from constraints.

## Capabilities

- Generate multiple design variants from room dimensions + style + budget
- Furniture layout optimization (traffic flow, ergonomics, lighting)
- Material palette generation (cohesive color/texture combinations)
- Style transfer and adaptation

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [HF Diffusers](https://github.com/huggingface/diffusers) | Apache-2.0 | Core diffusion model framework |
| [SDXL](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | Apache-2.0 | Base model for interior design image generation |
| [ControlNet](https://github.com/lllyasviel/ControlNet) | Apache-2.0 | Spatial conditioning from floor plan + depth map |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | GPL-3.0 | Workflow builder for chaining generation steps |

## Architecture

- Based on Stable Diffusion XL fine-tuned on interior design dataset
- ControlNet for spatial constraints (floor plan outline, depth map)
- Custom conditioning on style embeddings and budget parameters

## Status

Phase 1 — In Development
