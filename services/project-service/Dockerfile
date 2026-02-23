# ---------------------------------------------------------------------------
# Project Service — OpenLintel
# Multi-stage build: install shared lib first, then project-service
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for ortools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Stage 1: Install python-shared
# ---------------------------------------------------------------------------
COPY packages/python-shared /tmp/python-shared
RUN pip install --no-cache-dir /tmp/python-shared && \
    rm -rf /tmp/python-shared

# ---------------------------------------------------------------------------
# Stage 2: Install project-service
# ---------------------------------------------------------------------------
COPY services/project-service /tmp/project-service
RUN pip install --no-cache-dir /tmp/project-service && \
    rm -rf /tmp/project-service

# Copy the service source for uvicorn to find the app module
COPY services/project-service/main.py /app/main.py
COPY services/project-service/src /app/src

EXPOSE 8007

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8007"]
