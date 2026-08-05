# MORPHIA

**Platform-independent cybersecurity research orchestration platform for authorized bug-bounty and vulnerability-disclosure workflows.**

*Unrealistically real.*

## Overview

MORPHIA organizes legitimate security research by:

- Creating projects with authorized engagements and explicit scope
- Coordinating AI agents, models, tools, and human reviewers
- Separating assumptions from verified facts
- Preserving evidence with provenance and integrity verification
- Requiring human approval before sensitive actions
- Tracking costs across providers and tools
- Converting verified findings into responsible-disclosure reports

MORPHIA is **not** an autonomous attack platform. It enforces authorization boundaries, scope validation, and human oversight at every step.

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

## Architecture

See `docs/architecture.md` for detailed system design.

```
morphia/
├── apps/
│   ├── api/          # FastAPI backend
│   ├── web/          # React frontend
│   └── worker/       # Job processor
├── packages/
│   ├── contracts/    # Shared type definitions
│   └── shared-types/ # Cross-package types
├── infra/docker/     # Dockerfiles
├── tests/            # Integration & E2E tests
├── docs/             # Documentation
└── scripts/          # Operational scripts
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
