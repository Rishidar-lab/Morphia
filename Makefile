.PHONY: dev dev-api dev-web dev-worker build test test-api test-web test-worker test-e2e lint typecheck migrate seed backup restore clean help

# ── Development ───────────────────────────────────────────
dev: ## Start all services with Docker Compose
	docker compose up --build

dev-api: ## Start API server locally (requires postgres + redis)
	cd apps/api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web: ## Start frontend dev server
	cd apps/web && npm run dev

dev-worker: ## Start worker process locally
	cd apps/worker && python -m app.main

# ── Build ─────────────────────────────────────────────────
build: build-api build-worker build-web ## Build all

build-api: ## Build API
	cd apps/api && pip install -e ".[dev]"

build-worker: ## Build worker
	cd apps/worker && pip install -e ".[dev]"

build-web: ## Build frontend for production
	cd apps/web && npm run build

# ── Test ──────────────────────────────────────────────────
test: test-api test-worker test-web ## Run all tests

test-api: ## Run API tests
	cd apps/api && python -m pytest tests/ -v

test-worker: ## Run worker tests
	cd apps/worker && python -m pytest tests/ -v

test-web: ## Run frontend tests
	cd apps/web && npm run test

test-e2e: ## Run end-to-end browser tests
	cd tests/e2e && npx playwright test

# ── Code Quality ──────────────────────────────────────────
lint: ## Lint all code
	cd apps/api && python -m ruff check .
	cd apps/worker && python -m ruff check .
	cd apps/web && npm run lint

typecheck: ## Type-check all code
	cd apps/api && python -m mypy app/
	cd apps/web && npm run typecheck

format: ## Format all code
	cd apps/api && python -m ruff format .
	cd apps/worker && python -m ruff format .
	cd apps/web && npm run format

# ── Database ──────────────────────────────────────────────
migrate: ## Run database migrations
	cd apps/api && alembic upgrade head

migrate-new: ## Create a new migration (usage: make migrate-new MSG="add users table")
	cd apps/api && alembic revision --autogenerate -m "$(MSG)"

seed: ## Seed development data
	cd apps/api && python -m app.seed

# ── Operations ────────────────────────────────────────────
backup: ## Create timestamped database backup
	./scripts/backup.sh

restore: ## Restore from backup (usage: make restore FILE=backups/morphia_2026-08-05.sql.gz)
	./scripts/restore.sh $(FILE)

# ── Verification ──────────────────────────────────────────
verify: lint typecheck test ## Full verification suite

# ── Cleanup ───────────────────────────────────────────────
clean: ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf apps/web/dist apps/web/node_modules/.vite
	rm -rf .coverage htmlcov

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
