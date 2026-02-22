.PHONY: setup dev build test lint format clean infra-up infra-down

# First-time project setup
setup:
	cp -n .env.example .env || true
	pnpm install
	docker compose up -d postgres redis
	pnpm run db:migrate
	@echo "Setup complete. Run 'make dev' to start."

# Start development server
dev:
	pnpm run dev

# Build all packages
build:
	pnpm run build

# Run all tests
test:
	pnpm test

# Lint all code
lint:
	pnpm lint
	ruff check .

# Format all code
format:
	pnpm format
	ruff format .

# Type checking
typecheck:
	pnpm typecheck

# Start infrastructure services
infra-up:
	docker compose up -d

# Stop infrastructure services
infra-down:
	docker compose down

# Clean build artifacts
clean:
	pnpm clean
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# Run design engine (Python)
design-engine:
	cd services/design-engine && uvicorn main:app --reload --port 8000

# Database operations
db-migrate:
	pnpm run db:migrate

db-seed:
	pnpm run db:seed

db-reset:
	pnpm run db:reset
