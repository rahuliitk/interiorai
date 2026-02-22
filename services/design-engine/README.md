# Design Engine

AI-powered design generation service for OpenLintel.

## Responsibilities

- Accept room photos, style preferences, and budget constraints
- Generate multiple design variants per room
- Preserve specified elements (e.g., "don't change the floors")
- Produce concept images, mood boards, and design recommendations

## Architecture: VLM API + LangGraph Agent

Design generation uses **VLM APIs directly** — no local diffusion models, no GPU inference.

### How it works:

1. User uploads room photo + preferences (style, budget, constraints like "keep the floors")
2. **LangGraph agent** crafts the optimal VLM prompt with spatial context
3. **VLM API** (via LiteLLM — OpenAI, Gemini, Anthropic, etc.) generates redesigned room image
4. **Agent** evaluates quality, checks constraint compliance, iterates if needed
5. Multiple variants generated with different style/budget parameters

### Why VLM APIs instead of local diffusion models:

VLMs (GPT-4o, Gemini, etc.) can now take a room photo and redesign it accurately while respecting constraints ("don't change the floors," "make it modern," "keep the window treatments"). This replaces the entire Diffusers + SDXL + ControlNet + IP-Adapter + IC-Light pipeline with a single API call.

### No specialized tools needed

The design engine is pure orchestration:
- **LiteLLM** — unified API for any VLM provider
- **LangGraph** — agent workflow orchestration
- **Pydantic** — structured output validation

Users configure their API key for their preferred provider.

## Tech Stack

- Python 3.11+ / FastAPI
- LangGraph (agent orchestration)
- LiteLLM (multi-provider VLM API)

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
