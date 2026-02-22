"""Design Engine — AI design generation service for OpenLintel."""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="OpenLintel Design Engine",
    description="VLM-powered room design generation — users bring their own API keys",
    version="0.1.0",
)


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="design-engine")


# TODO: Design generation endpoints
# POST /api/v1/designs/generate — Generate design variants for a room
# GET  /api/v1/designs/{id}     — Get a specific design variant
# POST /api/v1/designs/{id}/render — Request higher-quality render
