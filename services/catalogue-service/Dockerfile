# ---------------------------------------------------------------------------
# Catalogue Service — OpenLintel
# Multi-stage build: install shared lib first, then catalogue-service
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
# Stage 2: Install catalogue-service
# ---------------------------------------------------------------------------
COPY services/catalogue-service /tmp/catalogue-service
RUN pip install --no-cache-dir /tmp/catalogue-service && \
    rm -rf /tmp/catalogue-service

# Copy the service source for uvicorn to find the app module
COPY services/catalogue-service/main.py /app/main.py
COPY services/catalogue-service/src /app/src

EXPOSE 8006

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]
