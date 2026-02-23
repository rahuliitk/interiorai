# ---------------------------------------------------------------------------
# BOM Engine — OpenLintel
# Multi-stage build: install shared lib first, then bom-engine
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for reportlab and ortools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Stage 1: Install python-shared
# ---------------------------------------------------------------------------
COPY packages/python-shared /tmp/python-shared
RUN pip install --no-cache-dir /tmp/python-shared && \
    rm -rf /tmp/python-shared

# ---------------------------------------------------------------------------
# Stage 2: Install bom-engine
# ---------------------------------------------------------------------------
COPY services/bom-engine /tmp/bom-engine
RUN pip install --no-cache-dir /tmp/bom-engine && \
    rm -rf /tmp/bom-engine

# Copy the service source for uvicorn to find the app module
COPY services/bom-engine/main.py /app/main.py
COPY services/bom-engine/src /app/src

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
