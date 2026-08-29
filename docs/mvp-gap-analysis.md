# MORPHIA MVP Gap Analysis

**Date:** 2026-08-30
**Author:** MVP hardening pass
**Method:** Every claim below was checked against code and a live `docker compose`
stack (Postgres 16 + Redis 7 + api + worker + web), not against documentation.

Legend:

| Status | Meaning |
|---|---|
| **VERIFIED** | Confirmed working against the live stack in this pass. |
| **IMPLEMENTED / UNVERIFIED** | Code exists and looks correct; not exercised end-to-end yet. |
| **BROKEN** | Code exists but does not work as intended. Fixed in this pass unless noted. |
| **STALE DOC** | Documentation describes something the code does not (or no longer) do. |
| **MISSING** | Required for the MVP journey and not present at all. Added in this pass unless noted. |

---

## 1. Clean boot & infrastructure

| Claim | Status | Evidence / Notes |
|---|---|---|
| `docker compose build` succeeds from a clean checkout | **VERIFIED** | 3 images build (`morphia-api` 1.0 GB, `morphia-web` 445 MB, `morphia-worker` 210 MB). |
| `docker compose up -d` brings up 5 services | **VERIFIED** | `postgres`, `redis` report `healthy`; `api`, `worker`, `web` come up (no healthcheck defined — added in this pass). |
| Postgres reachable, `pg_isready` gate works | **VERIFIED** | `/api/ready` → `{"database":"ok"}`. |
| Redis reachable | **VERIFIED** | `/api/ready` → `{"redis":"ok"}`; worker logs `worker.redis_connected`. |
| `GET /api/health` / `GET /api/ready` | **VERIFIED** | 200, correct payloads. |
| Web dev server serves on :5173 | **VERIFIED** | `curl localhost:5173` → 200. |
| `alembic upgrade head` works from a clean checkout | **BROKEN → FIXED** | `migrations/env.py` did `from app.core.database import Base` but the editable-install import hook is absent when alembic runs as a console script / under the compose bind-mount → `ModuleNotFoundError: No module named 'app'`. Fixed by anchoring `sys.path` on `env.py`'s own location. |
| Schema matches models | **VERIFIED** | After the env.py fix: `alembic upgrade head` creates 18 tables; `alembic check` → "No new upgrade operations detected." |
| `.env.example` → `.env` copy is enough to boot | **VERIFIED (with note)** | Boots, but `SECRET_KEY` / `WORKER_AUTH_SECRET` ship as literal `change-me-…` placeholders. `scripts/demo.sh` now generates real local-only values when `.env` is absent. |

## 2. Authentication & session

| Claim | Status | Evidence / Notes |
|---|---|---|
| Register / login / logout / me | **VERIFIED** | Full round trip works against the live API. |
| Argon2id hashing, server-side sessions, opaque tokens | **VERIFIED** | `sessions` table; `sid` cookie `HttpOnly`, `SameSite=Lax`. |
| CSRF double-submit on mutations | **VERIFIED (API)** | `POST` without `X-CSRF-Token` while cookie-authenticated → `403 CSRF_TOKEN_MISSING`. Login returns `csrfToken` in the body. |
| Account-enumeration-resistant login | **VERIFIED** | Wrong password and unknown email both return the same generic message. |
| `.local` / `.test` e-mail addresses accepted | **BROKEN → FIXED** | `email-validator` 2.3 rejects special-use TLDs, so `admin@morphia.local` (seed default) and every Playwright `@morphia.local` fixture 422'd. Standardised all demo/test identities on `@morphia.example.com` (RFC 2606 documentation domain, which validates). |

## 3. Domain model & API

| Claim | Status | Evidence / Notes |
|---|---|---|
| Projects CRUD, ownership enforced | **VERIFIED** | `owner_id` check on every fetch; 403 on cross-owner access. |
| `POST /api/v1/projects` (no trailing slash) | **BROKEN → FIXED** | Router registered only `/` → `307` redirect to `…/projects/`. `fetch` follows it, but the redirect target is the cross-origin `localhost:8000`, which is fragile. Router now serves both `""` and `"/"`. |
| Engagements nested under projects | **VERIFIED** | Create / list / get / update all work. |
| Scope rules (include/exclude) + 8-point validator | **VERIFIED** | Allowed target → run proceeds; out-of-scope target → run `FAILED` with the validator's reason, recorded as a `run.scope_denied` event. Both paths exercised (Phase 7). |
| Run state machine + legal-transition enforcement | **VERIFIED** | `DRAFT→PLANNING→AWAITING_PLAN_APPROVAL→QUEUED→RUNNING→COMPLETED` drives cleanly; illegal transitions rejected `409`. |
| Approval gate enqueues to Redis | **VERIFIED** | `POST /runs/{id}/approve` from `AWAITING_PLAN_APPROVAL` → `QUEUED` and pushes `morphia:jobs`; worker picks it up within ~1 s. |
| Evidence upload + SHA-256 + verification lifecycle | **VERIFIED** | `POST /projects/{id}/evidence` stores the blob, computes the digest, writes an audit event. |
| Findings lifecycle + verification records | **VERIFIED** | Create (`candidate`) → `POST /findings/{id}/verify` (`confirmed`) → `verified`. |
| Reports draft→final + MD/HTML/JSON export | **VERIFIED** | `GET /reports/{id}/export?format=` renders all three; HackerOne-style Markdown. |
| Global list endpoints `/api/v1/{evidence,findings,reports}` | **MISSING → ADDED** | The SPA's Evidence / Findings / Reports pages call these; only project-scoped variants existed, so every one of those pages silently rendered its empty state. Added owner-scoped cross-project list endpoints. |
| Audit-log read endpoint | **MISSING → ADDED** | `AuditEvent` rows are written everywhere but **no endpoint read them** and there was no `audit` router. Added `GET /api/v1/audit-events` (owner-scoped, paginated). The SPA's Audit Log page called `/api/v1/audit-events` and always 404'd. |
| `GET /api/v1/runs/{id}/steps` | **MISSING → ADDED** | Needed for the run-detail view; only `/events` existed. |
| Dashboard summary counts | **MISSING → ADDED** | `GET /api/v1/dashboard/summary` — the SPA dashboard showed hardcoded zeros for everything except project count. |

## 4. Worker

| Claim | Status | Evidence / Notes |
|---|---|---|
| Redis `BRPOP` consumer, heartbeat | **VERIFIED** | `worker.started provider=mock`; heartbeat key set. |
| Claim → provider invoke → submit step → transition | **VERIFIED** | Full loop against the live API; `run_steps` + `run_events` written with `actor_id="worker:worker-1"`. |
| Worker re-validates scope per step | **VERIFIED** | `claim_run` calls `ScopeValidator.validate_target` before returning a step; denial → run `FAILED`, committed before the 403 so `get_db()`'s rollback can't lose it. |
| Mock provider is deterministic, no network/keys | **VERIFIED** | `MockProvider` returns a SHA-256-digest-stamped canned response; `estimated_cost_usd = 0.0`. |
| `setex` deprecation warning in heartbeat | **STALE / cosmetic → FIXED** | redis-py 8 deprecates `setex`; switched to `set(..., ex=)`. |
| Worker unit tests (8, provider layer) | **VERIFIED** | `pytest apps/worker/tests` → 8 passed in-container. |
| Worker execution-loop / api_client HTTP tests | **MISSING** | Still no service-backed test of `main.py`'s loop or `api_client.py`. Covered indirectly by the new Playwright + `demo.sh` end-to-end runs; a dedicated suite remains roadmap. |

## 5. Frontend (React SPA)

| Claim | Status | Evidence / Notes |
|---|---|---|
| 14 pages routed and load | **VERIFIED** | All routes render; no build errors. |
| `api.ts` sends the CSRF token on mutations | **BROKEN → FIXED** | It never sent `X-CSRF-Token`, so **every** create/approve/delete from the UI returned `403`. The whole demo journey was impossible through the browser. Added a session store (`lib/session.ts`) that captures `csrfToken` at login, persists it to `sessionStorage`, and is injected by `api.ts` on every `POST/PUT/PATCH/DELETE`. |
| Registration available in the UI | **MISSING → ADDED** | `SignIn.tsx` was login-only. Added a register/login toggle that calls `POST /api/auth/register` then logs in. |
| Protected routes redirect to `/sign-in` when unauthenticated | **BROKEN → FIXED** | `Layout` rendered unconditionally; unauthenticated users saw the shell with failing queries. Added an auth check in `Layout` (`GET /api/auth/me`) that redirects on 401 and shows the signed-in user. |
| Run lifecycle drivable from the UI | **MISSING → ADDED** | The new-run form set neither `engagement_id` nor `plan`, and there was no control to move a run `DRAFT→PLANNING→AWAITING_PLAN_APPROVAL`. Added a run-detail view (`/runs/:id`) with the plan, the step results, the event timeline, linked evidence, and stage-appropriate transition/approve/cancel buttons; the new-run form now takes an engagement and a one-step plan. |
| Finding / Evidence / Report / Report-format types match the API | **BROKEN → FIXED** | `FindingState` had 5 of the backend's 10 values; `Finding` used `cwe`/`affected_asset` vs the API's `cwe_id`/`affected_scope`; `ReportFormat` included a non-existent `pdf`; `ReportStatus` and `VerificationStatus` were entirely wrong; `EvidenceArtifact` used `filename`/`sha256` vs `original_filename`/`sha256_digest`. `lib/types.ts` and the three pages were reconciled to the live schema. |
| Dashboard shows real numbers | **BROKEN → FIXED** | Only "Active Projects" was live; the other three tiles were the literal `0`. Now backed by `/api/v1/dashboard/summary` plus a recent-activity feed from the audit log. |
| Frontend test suite | **VERIFIED** | `npm run test` (vitest) — added in PR #1's a16473b, passes (37 tests / 9 files); extended in this pass. |

## 6. Demo, seeding, tests, CI

| Claim | Status | Evidence / Notes |
|---|---|---|
| `make seed` / `app.seed` | **BROKEN → REWRITTEN** | Default admin `admin@morphia.local` 422'd (see §2). Rewrote `seed.py` to build the full polished demo workspace (project → authorized engagement → scope → approved+completed run → evidence → verified finding → disclosure report), idempotently, with `@morphia.example.com` identities and an explicit `SEED_ADMIN_PASSWORD`. |
| `make demo` / `scripts/demo.sh` | **MISSING → ADDED** | One command: prereq check → `.env` generation → build → up → migrate → seed → health-verify → prints the URL and the ephemeral local credentials. |
| Safe local demo target | **MISSING → ADDED** | `apps/demo-target/` — a ~60-line stdlib HTTP service, added as a compose service `demo-target`, serving synthetic, clearly-labelled responses (`/`, `/headers`, `/.well-known/security.txt`). Nothing exploitable; obviously authorized. |
| Scope-enforcement proof (allowed + denied) | **MISSING → ADDED** | `scripts/scope-proof.sh` + `apps/api/tests/test_scope_enforcement.py` — CASE A (in-scope `demo-target`) run completes; CASE B (out-of-scope `production.example.com`) run is refused by the worker's re-check and left `FAILED` with the reason recorded. |
| Playwright executed against a live stack | **BROKEN (never run) → RUN** | The single `critical-workflow.spec.ts` assumed UI affordances that don't exist (register toggle, auth redirect). Rewritten to the real MVP journey and executed against the compose stack; HTML report + trace-on-failure retained. |
| CI proves MVP integrity | **PARTIAL → EXTENDED** | PR #1 added Python/web/compose/secret jobs (green). Added a service-backed `integration` job (compose up → `demo.sh` → scope proof) and a `playwright` job (compose up → `npx playwright test`, report uploaded as an artifact). |
| `docs/completion-report.md`, `docs/test-evidence.md` | **STALE** | Both predate this pass and describe a sandbox with no Docker. Superseded by `docs/mvp-verification.md`; left in place as historical record with a pointer added at the top. |

## 7. Documentation drift (not blocking, corrected in README/verification)

- `README.md` said the worker path was "verified end-to-end" — true for the API layer,
  but the UI journey was not drivable. Corrected.
- `docs/architecture.md` §11 describes per-run provider selection as "not implemented" —
  still accurate.
- `docs/security.md` describes SSRF deny-lists, DNS-rebinding checks, magic-byte upload
  validation, and per-run tool capability scoping as implemented controls. **These are
  design intent, not code** — the scope validator does not currently deny RFC-1918
  targets and evidence upload trusts the client content-type. Tracked in
  `docs/mvp-verification.md` §Security as WARN, and in the README limitations section.

---

## Summary

The **backend orchestration engine is real and works end-to-end** — the run state
machine, dual scope checks, approval gate, Redis hand-off, worker claim/execute/report
loop, evidence hashing, finding verification and report export all function against a
live stack. The gaps that made the product **non-demonstrable** were concentrated in
(a) three small infra/validation bugs (alembic path, e-mail TLD, trailing slash),
(b) the frontend never sending the CSRF token, and (c) a set of list/read endpoints the
SPA expected but that were never built. All of these are addressed in this pass; see
`docs/mvp-verification.md` for the evidence matrix.
