# MORPHIA

**Platform-independent cybersecurity research orchestration platform for authorized bug-bounty and vulnerability-disclosure workflows.**

*Unrealistically real.*

## Overview

MORPHIA organizes legitimate security research by:

- Creating projects with authorized engagements and explicit, validated scope
- Coordinating AI agents, models, tools, and human reviewers through a run state machine with approval gates
- Separating assumptions from verified facts via an evidence-and-findings pipeline
- Preserving evidence with SHA-256 integrity hashing, provenance, and a verification-status lifecycle
- Requiring human approval before sensitive actions (plan approval and action approval are distinct states in the run lifecycle)
- Validating every target against an 8-point scope check before any tool executes — checked independently by both the API and the worker
- Tracking findings through a lifecycle from `candidate` to `verified` to `report_ready`
- Converting verified findings into responsible-disclosure reports, exportable as Markdown, HTML, or JSON

MORPHIA is **not** an autonomous attack platform. It enforces authorization boundaries, scope validation, and human oversight at every step.

**Current implementation state:** the API (auth, RBAC, projects, engagements, scope, runs, evidence, findings, reports, worker-callback endpoints) is built with test coverage in `apps/api/tests/`. The React frontend has all primary pages implemented. The worker claims run steps from the queue, re-validates scope per step, and executes them via a pluggable AI provider (mock/OpenAI/OpenRouter/local — see `docs/architecture.md` §11); this has been verified end-to-end against a live `docker compose` stack, including the scope-denial path. Playwright end-to-end tests are scaffolded in `tests/e2e/` but have not yet been executed against a live stack, and there is no production deployment configuration yet (see `docs/completion-report.md`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend API | Python 3.11+, FastAPI, Pydantic v2 |
| Database | PostgreSQL 16, SQLAlchemy 2, Alembic migrations |
| Job Queue | Redis 7, async worker process |
| Storage | S3-compatible (local filesystem for dev) |
| Auth | Argon2id password hashing, server-side sessions |
| Testing | pytest, vitest, Playwright |

## Quick Start

### With Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your settings (SECRET_KEY at minimum)
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:8000
- API docs: http://localhost:8000/api/docs

### Without Docker

**Prerequisites:** Python 3.11+, Node.js 22+, PostgreSQL 16, Redis 7

```bash
# Backend
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd apps/web
npm install
npm run dev

# Worker (separate terminal)
cd apps/worker
python -m app.main
```

## Commands

```bash
make dev          # Start all with Docker
make dev-api      # API only (local)
make dev-web      # Frontend only (local)
make dev-worker   # Worker only (local)
make test         # Run all tests
make test-e2e     # Browser tests (Playwright)
make lint         # Lint all code
make typecheck    # Type-check all code
make verify       # Full verification (lint + typecheck + test)
make migrate      # Run database migrations
make seed         # Seed development data
make backup       # Create database backup
make restore      # Restore from backup
```

## Environment Variables

See `.env.example` for the complete list. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (async) |
| `REDIS_URL` | Redis connection |
| `SECRET_KEY` | Session encryption key |
| `STORAGE_BACKEND` | `local` or `s3` |
| `WORKER_AUTH_SECRET` | Worker-to-API auth |

**Never commit `.env` to source control.**

## What's Implemented

| Area | Status |
|---|---|
| Auth (register/login/logout/me), Argon2id, server-side sessions | Implemented, tested |
| RBAC (6 roles), CSRF (double-submit), rate limiting | Implemented, tested |
| Projects, Engagements, Scope rules + 8-point scope validator | Implemented, tested |
| Runs (full state machine, transitions, approvals, cancel) | Implemented, tested |
| Evidence (SHA-256 hashing, local/S3 storage, verification lifecycle) | Implemented, tested |
| Findings (candidate → verified → report_ready lifecycle) | Implemented, tested |
| Reports (draft → final, Markdown/HTML/JSON export) | Implemented, tested |
| React SPA (14 pages: dashboard, projects, runs, evidence, findings, reports, workflows, approvals, audit, agents, settings) | Implemented |
| Worker (claims run steps via worker-callback API, executes via provider, reports results) | Implemented, verified end-to-end against a live stack |
| AI provider adapters (mock/OpenAI/OpenRouter/local) | Implemented, tested (mock; OpenAI-compatible ones share one HTTP path) |
| Worker-callback API (`/api/worker/runs/{id}/claim`\|`steps`\|`transition`) | Implemented — per-step scope re-validation, worker-attributed audit trail |
| Playwright e2e suite | Scaffolded in `tests/e2e/`, not yet executed |

See `docs/completion-report.md` for the full, itemized status and remaining risks.

## Architecture

See `docs/architecture.md` for detailed system design.

```
morphia/
├── apps/
│   ├── api/          # FastAPI backend (auth, projects, engagements, scope, runs, evidence, findings, reports)
│   ├── web/          # React frontend (14 pages)
│   └── worker/       # Redis job-queue consumer with provider adapters and callback API
├── packages/
│   ├── contracts/    # Shared run-state contract (run_states.ts)
│   └── shared-types/ # Reserved for cross-package types (currently empty)
├── infra/docker/     # Dockerfiles
├── tests/            # Cross-service integration and Playwright E2E tests
├── docs/             # Documentation
└── scripts/          # Operational scripts (backup/restore)
```

## Security

MORPHIA enforces:

- **Authorization before execution** — every action validated against engagement scope
- **Scope before tools** — targets checked against allowlist before any tool runs
- **Evidence before conclusions** — findings require linked, verified evidence
- **Human approval before intrusive actions** — approval gates at critical workflow points
- **Portability before platform convenience** — no vendor lock-in

See `docs/security.md` for the threat model and controls.

## License

Private. All rights reserved.
