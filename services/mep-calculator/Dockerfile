# ---------------------------------------------------------------------------
# MEP Calculator — OpenLintel
# Multi-stage build: install shared lib first, then mep-calculator
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
# Stage 2: Install mep-calculator
# ---------------------------------------------------------------------------
COPY services/mep-calculator /tmp/mep-calculator
RUN pip install --no-cache-dir /tmp/mep-calculator && \
    rm -rf /tmp/mep-calculator

# Copy the service source for uvicorn to find the app module
COPY services/mep-calculator/main.py /app/main.py
COPY services/mep-calculator/src /app/src

EXPOSE 8005

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
