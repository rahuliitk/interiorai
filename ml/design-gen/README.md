# Design Generation

VLM-powered interior design concept generation.

## Capabilities

- Generate multiple design variants from room photos + style + budget
- Preserve specified elements ("keep the floors," "don't move the windows")
- Material palette generation (cohesive color/texture combinations)
- Style transfer from mood board / reference images

## Architecture: VLM API Direct

Design generation uses **VLM APIs directly** — no local diffusion models.

### How it works:

1. **LangGraph agent** interprets design brief — style, budget, room function, constraints
2. **Agent** crafts optimal VLM prompt with photo + context
3. **VLM API** (via LiteLLM) generates redesigned room image
4. **Agent** evaluates results against constraints and quality criteria
5. **Agent** iterates with refined prompts if needed

### Why VLM APIs replace the diffusion pipeline:

Modern VLMs can take a room photo and accurately redesign it while respecting natural language constraints. This replaces the entire Diffusers + SDXL + ControlNet + IP-Adapter + IC-Light pipeline with a single API call — simpler, more flexible, and no GPU infrastructure required.

### No specialized tools

Pure API orchestration via LangGraph + LiteLLM. Users configure their preferred VLM provider.

## Status

Phase 1 — In Development
