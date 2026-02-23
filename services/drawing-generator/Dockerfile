# ---------------------------------------------------------------------------
# Drawing Generator — OpenLintel
# Multi-stage build: install shared lib first, then drawing-generator
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for reportlab and ezdxf
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
# Stage 2: Install drawing-generator
# ---------------------------------------------------------------------------
COPY services/drawing-generator /tmp/drawing-generator
RUN pip install --no-cache-dir /tmp/drawing-generator && \
    rm -rf /tmp/drawing-generator

# Copy the service source for uvicorn to find the app module
COPY services/drawing-generator/main.py /app/main.py
COPY services/drawing-generator/src /app/src

EXPOSE 8003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
