# ---------------------------------------------------------------------------
# Cut List Engine — OpenLintel
# Multi-stage build: install shared lib first, then cutlist-engine
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
# Stage 2: Install cutlist-engine
# ---------------------------------------------------------------------------
COPY services/cutlist-engine /tmp/cutlist-engine
RUN pip install --no-cache-dir /tmp/cutlist-engine && \
    rm -rf /tmp/cutlist-engine

# Copy the service source for uvicorn to find the app module
COPY services/cutlist-engine/main.py /app/main.py
COPY services/cutlist-engine/src /app/src

EXPOSE 8004

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
