# MORPHIA Completion Report

**Date:** 2026-08-18
**Final status: PARTIALLY COMPLETED — professionalization pass verified locally**

This report is intentionally honest about what has and has not been verified.
The backend (FastAPI), data model, security controls, and frontend (React
SPA) are implemented and have unit/integration test coverage for the API
layer. What is **not** yet done: the Playwright end-to-end suite has been
written but not executed against a live stack in this environment, and no
PostgreSQL/Redis service stack was available in this sandbox. Provider
execution is implemented behind mock and OpenAI-compatible adapters, but production deployment configuration and a real backup/restore drill remain outstanding. Treat this document as a
handoff checklist, not a certification of production readiness.

## Addendum — 2026-08-10: worker execution path implemented, and this report's own claims verified for the first time

Everything below this line was added in a follow-up session that closed gap
#1 (AI provider integrations) and, in the process of actually running the
system end-to-end for the first time, found and fixed several things this
report and the code had claimed or assumed but never verified:

**What changed:**
- `apps/worker/app/providers/` — a real provider adapter layer (`mock`,
  `openai`, `openrouter`, `local`, selected via `get_provider()`) implementing
  the interface `docs/architecture.md` §11 described but that did not exist
  in code before this. 8 unit tests in `apps/worker/tests/test_providers.py`.
- `apps/api/app/routers/worker.py` — the worker-callback API that §11's
  design implied but that was never built: `POST /api/worker/runs/{id}/claim`
  (re-validates scope per step, per docs/architecture.md §7), `.../steps`
  (idempotent step results), `.../transition`, all authenticated via
  `X-Worker-Auth` (the header the CSRF middleware already special-cased,
  unused until now). `runs.engagement_id` was added (migration
  `9c7c1bf0c5c7`) — scope validation needs to know which engagement's rules
  apply to a run, and nothing previously recorded that.
- `apps/api/app/services/queue.py` — the API now actually pushes to
  `morphia:jobs` when a run is approved into `QUEUED`. Previously nothing
  enqueued anything; the worker's queue consumer had no producer.
- `apps/worker/pyproject.toml` — the worker was not a packaged, installable
  project before this (no `pyproject.toml` existed). It relied on
  `infra/docker/worker.Dockerfile` installing the *entire API package* just
  to get `redis`/`structlog` transitively, which also meant it silently had
  SQLAlchemy/asyncpg/FastAPI available — in tension with `docs/security.md`
  §5's "no direct database access." The worker now declares its own minimal
  dependencies and the Dockerfile installs `apps/worker`, not `apps/api`.
- End-to-end verified against a real `docker compose` stack (not a claim —
  see below): register → project → engagement → scope rule → run → approve
  → worker claims, calls the mock provider, reports the step, completes the
  run. A second run against an out-of-scope target was correctly denied and
  the run left in `FAILED` with the scope validator's reason recorded.

**Pre-existing gaps found while making the above actually run**, none of
which were specific to the provider work but all of which blocked it:
- `apps/api/migrations/versions/` had no migration files at all —
  `alembic upgrade head` had never been runnable. Generated the initial
  baseline (`9c7c1bf0c5c7`) via autogenerate against a real Postgres.
- `pip install -e ".[dev]"` for `apps/api` failed outright (setuptools
  flat-layout package-discovery conflict between `app` and `migrations`) —
  meaning `make build-api` had never succeeded either. Fixed via
  `[tool.setuptools.packages.find]`.
- `pydantic.EmailStr` (used in auth) needs `email-validator`, which was not
  a declared dependency — every test importing `app.main` failed to collect.
- `asyncio_default_fixture_loop_scope`/`asyncio_default_test_loop_scope` were
  unset, so the module-level async SQLAlchemy engine and pytest-asyncio's
  per-test event loops fought each other (`RuntimeError: ... attached to a
  different loop`) — every DB-touching test failed.
- The test suites' shared `_register_and_login` helpers never captured the
  session's CSRF token, so every state-mutating request they made was
  correctly rejected by the (working-as-designed) CSRF middleware — meaning
  the 787→~57-and-growing API test count had never actually passed as a
  whole against a live stack. It clearly wasn't being run in CI or anywhere
  else before being reported as passing.
- `ProjectResponse`/`RunResponse`/`RunEventResponse`/`ScopeRuleResponse`/
  `EngagementResponse` typed `created_at`/`updated_at` as `str`; Pydantic v2
  does not coerce a `datetime` into a `str` field, so every route returning
  one of these 500'd. Retyped to `datetime`.
- A subtler one: any handler that mutated an already-persisted row (not a
  fresh insert) and then returned it directly — `update_finding`,
  `update_engagement`, `update_report`, `upload_evidence`,
  `verify_evidence`, and all of `transition_run`/`cancel_run`/`approve_run`/
  `reject_run`/`create_run` in `runs.py` — hit
  `MissingGreenlet: greenlet_spawn has not been called` when serializing
  `updated_at`, because SQLAlchemy's async engine does not eagerly refresh
  `onupdate=func.now()` columns after an `UPDATE` the way it does after an
  `INSERT`. Fixed by adding `await db.refresh(obj)` before returning in each
  of those handlers.
- A correctness bug in the new worker-callback code itself, caught only by
  actually testing the scope-denial path rather than just the happy path:
  `claim_run` wrote the `FAILED` transition and its `RunEvent`, then raised
  an `HTTPException` — which `get_db()`'s dependency-generator rolls back on
  any exception, silently discarding the failure record and leaving the run
  stuck at `QUEUED` forever. Fixed with an explicit `await db.commit()`
  before raising in both of `claim_run`'s failure paths.
- `docker-compose.yml` shipped `.env.example`'s `localhost` values for
  `DATABASE_URL`/`REDIS_URL` into the `api`/`worker` containers, which
  cannot resolve `localhost` to the `postgres`/`redis` services on the
  compose network — `docker compose up --build` (the README's own quick
  start) had never actually produced a working stack. Added compose-level
  environment overrides for the in-network hostnames, plus `API_BASE_URL`
  for the worker to reach the api service.

None of this changes the honesty framing above: it is additive verification
of claims this document and the code were already making, not a retroactive
"actually it always worked." See git history for the exact diffs.

**Still not done** (unchanged from the original report except where noted):
Playwright e2e still not executed; production deployment config still
absent; backup/restore still unverified; the frontend/backend enum drift
(§4 item 6, original) is unchanged — the worker/provider work did not touch
`apps/web`. Worker test coverage now exists for the provider layer (8 tests)
but not for `main.py`'s execution loop or `api_client.py` — no HTTP-level
tests were added there.

## 1. Commit Summary

| # | Commit | Type | Summary |
|---|--------|------|---------|
| 1 | `c50c5f4` | chore | Establish portable MORPHIA workspace — 72 files: FastAPI skeleton, React skeleton, Docker Compose, Makefile, base configuration. |
| 2 | `a55bf0b` | docs | Record recovery audit and architecture decisions — 4 doc files explaining the migration away from the prior platform-coupled stack. |
| 3 | `ba8511e` | feat | Implement identity, projects, and engagement scope — RBAC roles, CSRF double-submit protection, scope validator (8-point check), auth/project/run routes, associated tests. |
| 4 | `d4a8ca2` | feat | Implement orchestration UI, workflows, agents — 14 frontend pages, shared components, TypeScript types for the run/approval/audit domain. |
| 5 | `9dc381e` | feat | Implement evidence, findings, and reporting — evidence/finding/report SQLAlchemy models, routes, storage abstraction (local/S3), associated tests. |
| 6 | *(pending)* | test | Add Playwright e2e scaffolding (`tests/e2e/`) — config, package manifest, and `critical-workflow.spec.ts` covering auth, navigation, projects, runs, routing edge cases, and mobile layout. |
| 7 | *(pending)* | docs | Finalize documentation — this completion report, test-evidence template, and full rewrite of `docs/api.md`, `README.md`, `docs/architecture.md` to match the shipped implementation rather than the earlier "planned phases" language. |

## 2. Architecture

```
Browser (React 19 SPA, apps/web)
        │ HTTPS/JSON, session cookie
        ▼
FastAPI (apps/api) ── SQLAlchemy 2 async ──▶ PostgreSQL 16 (system of record)
        │
        └── Redis client (queue push, rate limiting) ──▶ Redis 7
                                                              │
                                                       BRPOP  ▼
                                              apps/worker (queue consumer + provider adapters)
```

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 (async, `asyncpg`), Alembic migrations.
- **Frontend:** React 19, TypeScript, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4.
- **Database:** PostgreSQL 16 — sole system of record for users, sessions, projects, engagements, scope, runs, evidence, findings, reports, audit events.
- **Queue/cache:** Redis 7 — job queue between API and worker, rate-limit counters. Not a system of record; anything in Redis is reconstructable from PostgreSQL.
- **Storage:** Pluggable evidence blob storage — local filesystem (`STORAGE_BACKEND=local`) for development, S3-compatible object storage (`STORAGE_BACKEND=s3`) for production, behind a shared adapter in `apps/api/app/services/storage.py`.
- **Orchestration:** Docker Compose (`docker-compose.yml`) — `postgres`, `redis`, `api`, `worker`, `web` services with health-check gating so dependents wait for `pg_isready`/`redis-cli ping`.

Full detail in `docs/architecture.md`.

## 3. What Was Built

**API (`apps/api/app`):**
- Health/readiness endpoints (`health.py`).
- Auth: registration, login, logout, session introspection, Argon2id password hashing, server-side sessions (`auth.py`, `core/security.py`, `models/auth.py`).
- RBAC middleware with six roles: `owner`, `administrator`, `researcher`, `reviewer`, `auditor`, `worker_service` (`middleware/rbac.py`).
- CSRF double-submit protection with configured exempt paths (`middleware/csrf.py`).
- Rate limiting via `slowapi` on auth and worker-callback endpoints.
- Projects CRUD with ownership enforcement (`projects.py`, `models/project.py`).
- Engagements CRUD nested under projects (`engagements.py`, `models/engagement.py`).
- Scope rules (include/exclude, domain/IP/API/repo/mobile-app target types) and the scope validator service with glob and CIDR matching (`scope.py`, `services/scope_validator.py`).
- Runs: full state machine (`DRAFT → PLANNING → AWAITING_PLAN_APPROVAL → QUEUED → RUNNING → AWAITING_ACTION_APPROVAL/PAUSED → COMPLETED/FAILED/CANCELLED`), legal-transition enforcement, run steps, run events, approval requests (`runs.py`, `models/runs.py`).
- Evidence: SHA-256 integrity hashing at capture time, provenance metadata, verification-status lifecycle, pluggable local/S3 storage backend (`evidence.py`, `models/evidence.py`, `services/storage.py`).
- Findings: candidate-to-report-ready lifecycle with severity levels and a linked verification record (`findings.py`, `models/findings.py`).
- Reports: draft-to-acknowledged status lifecycle, Markdown/HTML/JSON export, finding-linking junction table (`reports.py`, `models/reports.py`).
- Append-only audit log (`models/audit.py`) with typed event constants covering auth, scope, run transitions, evidence, findings, reports, role changes, suspensions.

**Frontend (`apps/web/src`):**
- 14 routed pages: `SignIn`, `Dashboard`, `Projects`, `ProjectDetail`, `Runs`, `Agents`, `Evidence`, `Findings`, `Reports`, `Workflows`, `Approvals`, `AuditLog`, `Settings`, `NotFound`.
- Shared components: `Layout`, `ErrorBoundary`, `LoadingScreen`, `StateBadge`, `ListStates`, `ConfirmDialog`.
- Local TypeScript domain types (`lib/types.ts`) mirroring the backend's User/Project/Engagement/ScopeRule/Asset/Run/RunStep/RunEvent/ApprovalRequest/AuditEvent/Finding/Report/EvidenceArtifact/AgentProfile/Workflow shapes.
- `packages/contracts/src/run_states.ts` — the canonical, hand-synchronized run-state contract shared conceptually between the Python `RunState` enum and the TypeScript frontend.

**Worker (`apps/worker/app/main.py`):**
- Redis connection, heartbeat coroutine, and a `BRPOP morphia:jobs` consumer loop.
- Provider execution through the `ProviderAdapter` interface, with mock/OpenAI/OpenRouter/local adapters.
- API-mediated claim, scope re-validation, step result submission, and run transition callbacks; the worker has no direct database access.

**Operations:**
- `Makefile` with `dev`, `build`, `test`, `lint`, `typecheck`, `format`, `migrate`, `migrate-new`, `seed`, `backup`, `restore`, `verify`, `clean` targets.
- `scripts/backup.sh` / `scripts/restore.sh` — `pg_dump`/`pg_restore`-based backup and interactive-confirmation restore against `DATABASE_URL_SYNC`.
- Alembic migrations (`apps/api/migrations`) as the sole schema-change mechanism.

**Tests (existing, in `apps/api/tests/`):**
`test_auth.py`, `test_evidence.py`, `test_findings.py`, `test_health.py`, `test_projects.py`, `test_run_state_machine.py`, `test_scope_validator.py`.

## 4. What Was NOT Built Yet

Being explicit about gaps rather than glossing over them:

1. **Production provider operations.** Provider adapters for mock, OpenAI, OpenRouter, and local OpenAI-compatible endpoints exist and the mock path is unit-tested. Live external-provider calls, cost accounting, per-run provider selection, and provider-specific operational controls remain outside the verified release scope.
2. **Playwright execution.** The e2e suite in `tests/e2e/` (this deliverable) is written and scaffolded — config, dependencies, and 15 test cases across 9 `describe` blocks — but it has not been run in this sandbox (no Node/browser stack was launched against a live API+DB here). It must be executed locally or in CI before it can be treated as passing evidence. See `docs/test-evidence.md`.
3. **Production deployment configuration.** `docker-compose.yml` is a development/reference compose file (bind-mounted code, dev-grade Postgres credentials, no TLS termination, no resource limits, no orchestrator manifests). GitHub Actions CI now validates Python, frontend, dependency, secret, and Docker quality gates. There is still no Kubernetes/ECS/Nomad manifest, secrets-manager integration, or reverse-proxy/TLS configuration (`infra/deployment/` remains an empty placeholder directory).
4. **Real backup/restore test.** `scripts/backup.sh` and `scripts/restore.sh` are implemented and reasonable (`pg_dump | gzip`, `gunzip | psql` with a confirmation prompt), but neither has been executed against a running PostgreSQL instance in this environment to confirm an actual dump-and-restore round-trip succeeds.
5. **Worker execution-loop coverage.** Provider adapters have 8 unit tests, but the Redis consumer loop and HTTP callback client do not yet have live integration tests against Redis and the API.
6. **Frontend/backend enum drift.** `apps/web/src/lib/types.ts` defines `FindingState` with 5 values (`candidate | verified | rejected | remediated | accepted_risk`) while the backend's `Finding.state` enum (`apps/api/app/models/findings.py`) has 10 values (`candidate, needs_evidence, needs_reproduction, verified, rejected, duplicate, report_ready, submitted, triaged, resolved`). Similarly, the frontend's `ReportFormat` type includes `pdf`, which the backend does not implement (`markdown | html | json` only). These should be reconciled before the frontend is considered a faithful client of the API.

## 5. Security Controls Implemented

| Control | Detail |
|---|---|
| Password hashing | Argon2id (`argon2-cffi`), tunable via `ARGON2_TIME_COST` / `ARGON2_MEMORY_COST`. |
| Session management | Server-side sessions in PostgreSQL (`sessions` table); opaque `secrets.token_urlsafe(48)` tokens, not JWTs; `sid` cookie, `HttpOnly`, `Secure` in production, `SameSite=Lax`; `Authorization: Bearer` fallback resolves to the same session row. |
| Session lifetime | `SESSION_LIFETIME_HOURS` (default 24h), enforced by both cookie `max_age` and server-side `expires_at` check on every request. |
| CSRF protection | Double-submit pattern, `X-CSRF-Token` header validated against `Session.csrf_token`; exempt paths limited to `/api/auth/register`, `/api/auth/login`, `/api/health`, `/api/ready`. |
| RBAC | Six roles (`owner`, `administrator`, `researcher`, `reviewer`, `auditor`, `worker_service`); `require_role()` dependency factory; default role for new registrations is the least-privileged `researcher`. |
| Scope validation | 8-point default-deny check (`services/scope_validator.py`) covering target match, engagement window, exclusions, action permissions, engagement linkage, RBAC membership, rate/concurrency limits, and administrative holds; re-checked independently by the worker at execution time (defense in depth), never trusting the API-side check alone. |
| Rate limiting | `slowapi`-based; `AUTH_RATE_LIMIT` (default `10/minute`) and `WORKER_AUTH_RATE_LIMIT` (default `60/minute`); `429` responses carry `{"code": "RATE_LIMITED", ...}`. |
| Evidence integrity | SHA-256 digest computed and stored at capture time; re-verifiable on read. |
| Account enumeration resistance | Login failures return one generic message regardless of whether the email exists. |
| Secrets handling | `SECRET_KEY` and `WORKER_AUTH_SECRET` are required env vars with no defaults — the app refuses to start without them; provider API keys (when configured) are read from env only, never persisted or logged. |
| Audit trail | Append-only `AuditEvent` model with typed constants for auth, scope changes, run transitions, evidence uploads, finding creation, report generation, role changes, and account suspension. |
| CORS | Explicit `ALLOWED_ORIGINS` allowlist, `allow_credentials=True`, restricted methods. |

Full threat-model detail (IDOR, XSS, malicious uploads, command injection, prompt injection, SSRF, webhook forgery, worker impersonation, replay, privilege escalation) is in `docs/security.md`.

## 6. Test Evidence

Local verification has been executed and recorded in `docs/test-evidence.md`: API 57 tests passed with the disposable SQLite harness, worker 8 tests passed, frontend lint/typecheck/tests/build passed, and Ruff/mypy passed. Docker Compose, PostgreSQL/Redis-backed integration, Playwright, and backup/restore remain unexecuted because those services were unavailable in the sandbox.

## 7. Environment Variables

| Variable | Purpose | Default / Example |
|---|---|---|
| `DATABASE_URL` | Async PostgreSQL connection string (SQLAlchemy/asyncpg) used by the API. | `postgresql+asyncpg://morphia:morphia_dev@localhost:5432/morphia` |
| `DATABASE_URL_SYNC` | Sync PostgreSQL connection string used by Alembic and `scripts/backup.sh`/`restore.sh`. | `postgresql://morphia:morphia_dev@localhost:5432/morphia` |
| `REDIS_URL` | Redis connection string (job queue, rate limiting). | `redis://localhost:6379/0` |
| `SECRET_KEY` | Required. Session/crypto secret; app refuses to start without it. | *(no default — must be set)* |
| `ENVIRONMENT` | Deployment environment flag. | `development` |
| `DEBUG` | Enables verbose error output; must be `false` in production. | `true` |
| `API_HOST` | Bind host for the API process. | `0.0.0.0` |
| `API_PORT` | Bind port for the API process. | `8000` |
| `FRONTEND_URL` | Canonical frontend origin, used in emails/links. | `http://localhost:5173` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. | `http://localhost:5173,http://localhost:3000` |
| `ARGON2_TIME_COST` | Argon2id time-cost parameter. | `2` |
| `ARGON2_MEMORY_COST` | Argon2id memory-cost parameter (KiB). | `65536` |
| `SESSION_LIFETIME_HOURS` | Session/cookie max age. | `24` |
| `AUTH_RATE_LIMIT` | Rate limit for login/register per IP. | `10/minute` |
| `WORKER_AUTH_RATE_LIMIT` | Rate limit for worker-callback endpoints. | `60/minute` |
| `STORAGE_BACKEND` | Evidence blob storage backend selector. | `local` (or `s3`) |
| `STORAGE_LOCAL_PATH` | Filesystem path for local evidence storage. | `./storage` |
| `S3_ENDPOINT_URL` | S3-compatible endpoint (MinIO or cloud). | *(commented out; required if `STORAGE_BACKEND=s3`)* |
| `S3_BUCKET_NAME` | Evidence bucket name. | *(commented out; required if `STORAGE_BACKEND=s3`)* |
| `S3_ACCESS_KEY_ID` | S3 access key. | *(commented out; required if `STORAGE_BACKEND=s3`)* |
| `S3_SECRET_ACCESS_KEY` | S3 secret key. | *(commented out; required if `STORAGE_BACKEND=s3`)* |
| `S3_REGION` | S3 region. | `us-east-1` |
| `OPENAI_API_KEY` | OpenAI provider key for the OpenAI-compatible worker adapter. | *(commented out; optional)* |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL. | `https://api.openai.com/v1` |
| `OPENROUTER_API_KEY` | OpenRouter provider key for the OpenAI-compatible worker adapter. | *(commented out; optional)* |
| `OPENROUTER_BASE_URL` | OpenRouter base URL. | `https://openrouter.ai/api/v1` |
| `LOCAL_MODEL_URL` | Self-hosted/Ollama-compatible endpoint for the local provider adapter. | `http://localhost:11434/v1` |
| `WORKER_AUTH_SECRET` | Required. Shared secret the worker uses to authenticate callbacks to the API. | *(no default — must be set)* |
| `SEED_ADMIN_PASSWORD` | Explicit local-development password required by `make seed`; never set in production. | *(no default — must be set when seeding)* |
| `WORKER_HEARTBEAT_INTERVAL` | Worker heartbeat interval, seconds. | `30` |
| `WORKER_MAX_RETRIES` | Max retry attempts for a job. | `3` |
| `ENABLE_E2E_AUTH_OVERRIDE` | Testing-only auth bypass flag. | *(commented out; test environments only)* |
| `TEST_OWNER_EMAIL` | Seed/test fixture email. | *(commented out; test environments only)* |

## 8. Exact Run Commands

```bash
# 1. Clone/prepare environment
cp .env.example .env
# Edit .env: set SECRET_KEY and WORKER_AUTH_SECRET at minimum

# 2. Start the full stack with Docker Compose
docker compose up --build
#   Frontend: http://localhost:5173
#   API:      http://localhost:8000
#   API docs: http://localhost:8000/api/docs

# 3. Apply database migrations (if not already run by the api container's entrypoint)
make migrate

# 4. Seed development data (optional)
make seed

# 5. Run backend tests
make test-api
#   equivalent to: cd apps/api && pytest tests/ -v

# 6. Run frontend tests
make test-web

# 7. Run the full local verification gate (lint + typecheck + test)
make verify

# 8. Run the Playwright end-to-end suite (requires the stack running per step 2,
#    or let Playwright's webServer config start the frontend dev server itself)
cd tests/e2e
npm install
npx playwright install --with-deps chromium
npm test
#   or: npm run test:ui   (interactive)
#   or: npm run test:headed

# 9. Database backup / restore
make backup
make restore FILE=backups/morphia_<timestamp>.sql.gz
```

## 9. Remaining Risks

1. **Unvalidated end-to-end behavior.** Because the Playwright suite has not been executed, there is no confirmed evidence that registration, login, project creation, run creation, and logout actually work together correctly through the live UI against a live API/DB. Unit and route-level tests pass in isolation, but integration through the browser is unverified.
2. **Live service-backed execution is not re-verified here.** The worker/provider path is implemented and the mock flow was verified in the repository’s prior Docker-backed implementation work, but this sandbox could not repeat the live API/Redis/PostgreSQL run because Docker and those services were unavailable.
3. **Frontend/backend type drift** (see §4.6) could cause the UI to render or filter on finding states/report formats that don't match what the API actually returns, leading to silent UI bugs (e.g., a `needs_reproduction` finding not matching any frontend filter).
4. **Development-grade secrets and credentials** in `docker-compose.yml` and `.env.example` (e.g., `morphia_dev` password) must never be reused in any shared or production environment.
5. **No production deployment path has been exercised.** Moving from `docker compose up` to any real hosting target (Kubernetes, ECS, bare VM fleet) will surface unknowns around TLS termination, secret injection, migration ordering, and horizontal worker scaling that are currently undocumented and untested.
6. **Backup/restore is unverified in practice.** The scripts are reasonable but a real disaster-recovery drill (dump on one instance, restore on a clean instance, verify row-for-row equivalence) has not been performed.
7. **Worker integration coverage is incomplete.** Provider behavior is unit-tested, while the Redis consumer loop and callback client still need service-backed integration tests.
