# ---------------------------------------------------------------------------
# Design Engine — OpenLintel
# Multi-stage build: install shared lib, then design-engine, copy ml/design-gen
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ---------------------------------------------------------------------------
# Stage 1: Install python-shared
# ---------------------------------------------------------------------------
COPY packages/python-shared /tmp/python-shared
RUN pip install --no-cache-dir /tmp/python-shared && \
    rm -rf /tmp/python-shared

# ---------------------------------------------------------------------------
# Stage 2: Install design-engine
# ---------------------------------------------------------------------------
COPY services/design-engine /tmp/design-engine
RUN pip install --no-cache-dir /tmp/design-engine && \
    rm -rf /tmp/design-engine

# Copy the service source for uvicorn to find the app module
COPY services/design-engine/main.py /app/main.py
COPY services/design-engine/src /app/src

# Copy ml/design-gen for any ML-specific configs or prompt templates
COPY ml/design-gen /app/ml/design-gen

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
