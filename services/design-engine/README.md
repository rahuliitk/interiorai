# Design Engine

AI-powered design generation service for InteriorAI.

## Responsibilities

- Accept room dimensions, style preferences, and budget constraints
- Generate multiple design variants per room
- Produce 2D concepts, 3D viewport renders, and photorealistic renders
- Spatial planning and furniture layout optimization

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
