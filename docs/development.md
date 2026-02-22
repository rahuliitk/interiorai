# Development Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20 LTS | Web app, API services |
| pnpm | >= 9.0 | Package manager |
| Python | >= 3.11 | ML services, engineering calculators |
| Docker | >= 24.0 | Infrastructure services |
| Git | >= 2.40 | Version control |

## Quick Start (Docker)

The fastest way to get started:

```bash
git clone https://github.com/interiorai/interiorai.git
cd interiorai
cp .env.example .env
docker compose up -d
pnpm install
pnpm run db:migrate
pnpm run dev
```

This starts PostgreSQL, Redis, MinIO (S3-compatible storage), and Elasticsearch in Docker,
then runs the web app natively for fast iteration.

## Service-by-Service Setup

### Web Application

```bash
cd apps/web
pnpm install
pnpm dev
# Open http://localhost:3000
```

### Design Engine (Python)

```bash
cd services/design-engine
python -m venv .venv
source .venv/bin/activate      # Linux/macOS
# .venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### GPU Setup for ML Services

For AI model training and inference:

```bash
# Verify CUDA is available
python -c "import torch; print(torch.cuda.is_available())"

# Install PyTorch with CUDA support
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

CPU fallback is supported for development — models will run slower but functionally.

## Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm test --filter=@interiorai/core

# Python tests
cd services/design-engine
python -m pytest

# With coverage
pnpm test -- --coverage
```

## Linting and Formatting

```bash
# TypeScript/JavaScript
pnpm lint          # Check for issues
pnpm lint:fix      # Auto-fix
pnpm format        # Format with Prettier
pnpm format:check  # Check formatting

# Python
ruff check .       # Lint
ruff format .      # Format
```

## Database

```bash
# Run migrations
pnpm run db:migrate

# Seed with sample data
pnpm run db:seed

# Reset database (destructive!)
pnpm run db:reset
```

## Environment Variables

See `.env.example` for all available configuration. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Authentication secret key |
| `STORAGE_PROVIDER` | No | File storage backend (default: `local`) |

## Common Issues

### Port conflicts

If port 5432 or 6379 is in use, stop existing PostgreSQL/Redis or change ports in `.env`.

### pnpm install fails

Ensure you're using pnpm 9+: `corepack enable && corepack prepare pnpm@latest --activate`

### Python venv issues on Windows

Use `py -3.11 -m venv .venv` to specify the exact Python version.
