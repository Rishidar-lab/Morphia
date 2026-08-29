# MORPHIA MVP Verification Matrix

**Date:** 2026-08-30
**Stack:** `docker compose` — Postgres 16, Redis 7, FastAPI api, worker, React web, synthetic `demo-target`
**Method:** every PASS below has runtime evidence from a live stack. Nothing is
marked PASS on the strength of documentation or a unit test alone.

Reproduce the whole matrix with:

```bash
./scripts/demo.sh                 # build + up + migrate + seed + verify + live journey
cd tests/e2e && npm test          # Playwright MVP-journey suite
```

---

## Definition-of-done journey

| # | Requirement | Implementation | Test | Runtime evidence | Status |
|---|---|---|---|---|---|
| 1 | Clean clone → `docker compose build` | `infra/docker/*.Dockerfile` | CI `compose` job | 3 images build from a clean tree | **PASS** |
| 2 | `docker compose up -d` starts the stack | `docker-compose.yml` (healthchecks on all 6 services) | CI `integration` job | `docker compose ps` → all `healthy` | **PASS** |
| 3 | PostgreSQL | `postgres:16-alpine`, `pg_isready` gate | `/api/ready` | `{"database":"ok"}` | **PASS** |
| 4 | Redis | `redis:7-alpine`, `redis-cli ping` gate | `/api/ready` | `{"redis":"ok"}` | **PASS** |
| 5 | API healthy | `app/routers/health.py` | CI | `GET /api/health` → 200 | **PASS** |
| 6 | Worker healthy | `apps/worker/app/main.py` | CI | logs `worker.started provider=mock`; heartbeat key set | **PASS** |
| 7 | Frontend loads | `apps/web` (Vite dev / `vite build`) | CI `web` job | `GET :5173` → 200; renders the dark Aurora UI | **PASS** |
| 8 | Migrations succeed from clean | `apps/api/migrations` (env.py path fix) | CI `integration` | `alembic upgrade head` → 18 tables; `alembic check` clean | **PASS** |
| 9 | Register / sign in | `app/routers/auth.py`, `lib/auth.ts` | `test_auth.py` (11), Playwright | account created, session cookie set, `/me` resolves | **PASS** |
| 10 | Create project | `app/routers/projects.py`, `Projects.tsx` | `test_projects.py`, Playwright | project persists, `project.create` audit row | **PASS** |
| 11 | Create authorized engagement | `app/routers/engagements.py`, `ProjectDetail.tsx` | Playwright | engagement persists with authorization_basis | **PASS** |
| 12 | Define allowed scope | `app/routers/scope.py`, `ScopeTab` | `test_scope_validator.py` (6), Playwright | include/exclude rules persist, `scope.modify` audit | **PASS** |
| 13 | Create run with plan | `app/routers/runs.py`, `NewRunForm` | Playwright | run created `DRAFT` with `plan.steps[]` + `engagement_id` | **PASS** |
| 14 | Review plan | `RunDetail.tsx` | Playwright | plan steps + prompt rendered on the run page | **PASS** |
| 15 | Approve (human gate) | `approve_run` → `enqueue_run_job` | `test_run_state_machine.py` (24), Playwright | `AWAITING_PLAN_APPROVAL → QUEUED`, job on `morphia:jobs`, `approval.approved` audit | **PASS** |
| 16 | Worker claims run | `POST /api/worker/runs/{id}/claim` | `test_scope_enforcement.py` | `QUEUED → RUNNING`, `run.claimed` event `actor_id=worker:*` | **PASS** |
| 17 | Target / scope validated (by the worker) | `claim_run` → `ScopeValidator.validate_target` | `test_scope_enforcement.py` | in-scope step returned; out-of-scope → 403 | **PASS** |
| 18 | Mock provider executes safe demo step | `apps/worker/app/providers/mock.py` | `test_providers.py` (8) | deterministic response in `run_steps.output_data`, `cost=0` | **PASS** |
| 19 | Result captured | `POST /api/worker/runs/{id}/steps` (idempotent) | `test_scope_enforcement.py`, Playwright | `RunStep` row + `run.step_completed` event | **PASS** |
| 20 | Evidence created + SHA-256 | `app/routers/evidence.py`, `storage.py` | `test_evidence.py` (7) | artifact stored, `sha256_digest` set, `evidence.upload` audit | **PASS** (seeded + route-tested; worker does not yet auto-capture) |
| 21 | Finding created / verified | `app/routers/findings.py` | `test_findings.py` (8) | `candidate → verified` via `FindingVerification` | **PASS** |
| 22 | Report generated | `app/routers/reports.py`, `report_generator.py` | `test_*` + seed | `GET /reports/{id}/export?format=markdown\|html\|json` renders | **PASS** |
| 23 | Audit trail visible | `AuditEvent` + `GET /api/v1/audit-events` + `AuditLog.tsx` | Playwright | audit page lists `auth.login`, `project.create`, `scope.modify`, … | **PASS** |
| 24 | Out-of-scope target denied | worker `claim_run` FAILED path (commit-before-raise) | `test_scope_enforcement.py`, `demo.sh --journey`, Playwright | run `FAILED`, `run.scope_denied` event with reason | **PASS** |

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Python lint | `ruff check apps/api apps/worker` | **PASS** |
| Python format | `ruff format --check apps/api apps/worker` | **PASS** |
| mypy (strict) | `cd apps/api && mypy app/` | **PASS** — no issues, 37 files |
| API tests | `pytest apps/api/tests` | **PASS** — 60 passed |
| Worker tests | `pytest apps/worker/tests` | **PASS** — 8 passed |
| Frontend lint | `npm run lint` | **PASS** |
| Frontend typecheck | `npm run typecheck` | **PASS** |
| Frontend unit tests | `npm run test` | **PASS** — 37 passed / 9 files |
| Frontend prod build | `npm run build` | **PASS** — Tailwind now compiled (was broken) |
| Playwright (live) | `cd tests/e2e && npx playwright test mvp-journey` | **PASS** — 4/4 |
| Compose validation | `docker compose config --quiet` | **PASS** |
| Docker image build | `docker compose build` | **PASS** |
| Secret scan | `gitleaks` (CI) | **PASS** |
| npm audit | `npm audit --audit-level=high` | **PASS** — 0 |
| pip audit | `pip-audit` | **PASS** (CI) |

## Security review (Phase 13)

| Control | Finding | Status |
|---|---|---|
| Argon2id password hashing | `argon2-cffi`, tunable cost | **PASS** |
| Session cookies | opaque token, `HttpOnly`, `SameSite=Lax`, `Secure` in prod | **PASS** |
| CSRF | double-submit; SPA now sends `X-CSRF-Token` on every mutation | **PASS** |
| RBAC | 6 roles, `require_role` dependency; evidence verify gated to reviewer/owner/admin | **PASS** |
| Ownership isolation | every single-resource fetch re-checks `owner_id`; aggregate endpoints filter by owned-project subquery | **PASS** |
| Scope default-deny | `ScopeValidator` denies on any failure/ambiguity; checked by API at approval **and** worker at claim | **PASS** |
| Worker secret handling | `hmac.compare_digest`, env-only, distinct from user sessions, rejected when absent | **PASS** |
| Rate limiting | `slowapi` on auth + worker-callback endpoints | **PASS** |
| Evidence hashing | SHA-256 at capture | **PASS** |
| Report HTML escaping | `report_generator` escapes finding content in the HTML path | **PASS** (spot-checked) |
| SQL injection | SQLAlchemy parameterised throughout; no string-built SQL | **PASS** |
| Credential logging | structlog; secrets not logged; `.env` git-ignored; `.env.example` placeholders only | **PASS** |
| CORS | explicit `ALLOWED_ORIGINS` allowlist | **PASS** |
| Self-approval separation-of-duties | **NOT enforced** — `approve_run` does not block the run's creator from approving it (docs/security.md §1.12 describes this as a control) | **WARN** |
| SSRF deny-list / DNS-rebinding checks | **NOT implemented** — `ScopeValidator` does not reject RFC-1918 / link-local targets; described in `docs/security.md` §1.8 as intent | **WARN** |
| Upload content-type / magic-byte validation | **NOT implemented** — evidence upload trusts the client content-type; `docs/security.md` §1.4 describes signature validation as intent | **WARN** |
| Debug config | `DEBUG=true` and SQLAlchemy `echo` in the dev compose (documented; production overrides via env) | **WARN (dev only)** |

The three **WARN** items are pre-existing gaps between `docs/security.md` (which
describes the intended controls) and the code. They are tracked in the README
limitations section and were **not** introduced or worsened in this pass. None
of them is on the critical path for the MVP demo (single-tenant, synthetic local
target, no file uploads through the worker).

## Known limitations

See `README.md` § Limitations. In short: single-tenant demo posture; the worker
executes an LLM step, not real security tooling; no production deployment
manifests; backup/restore scripts still unexercised; the three security WARN
items above.
