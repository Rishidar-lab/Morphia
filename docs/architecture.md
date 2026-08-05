# MORPHIA Architecture

## 1. System Overview

MORPHIA is a cybersecurity research orchestration platform for **authorized** bug-bounty and vulnerability-disclosure workflows. It coordinates human researchers, AI agents, external tools, and language-model providers around a strict authorization boundary: nothing executes against a target unless that target is inside an explicitly approved engagement scope.

The platform's job is to:

- Let an organization define **projects**, **engagements**, and **scope** (the authorized targets and constraints for a piece of research).
- Let researchers and AI agents plan and execute **runs** — bounded units of orchestrated work — against that scope, under human oversight.
- Separate **assumptions** ("the agent believes X") from **verified facts** (evidence-backed findings).
- Preserve **evidence** with cryptographic integrity and provenance so findings can survive an audit or a disclosure review.
- Require **human approval** before any step that could have real-world effect (sending traffic to a live target, running an exploit, submitting a report).
- Track **cost** across model providers and tools.
- Turn verified findings into **responsible-disclosure reports**.

MORPHIA is explicitly **not** an autonomous attack tool. Every execution path — human-initiated or agent-initiated — passes through the same scope validator and the same approval gates. There is no code path that reaches a tool invocation without first clearing scope.

Design principles (see also `README.md`):

1. **Authorization before execution.**
2. **Scope before tools.**
3. **Evidence before conclusions.**
4. **Human approval before intrusive actions.**
5. **Portability before platform convenience** — no vendor lock-in, cloud-neutral deployment.

## 2. Component Diagram

```
                         ┌─────────────────────────┐
                         │         Browser         │
                         │   apps/web (React SPA)  │
                         └───────────┬─────────────┘
                                     │ HTTPS (JSON, cookies)
                                     ▼
                         ┌─────────────────────────┐
                         │        apps/api          │
                         │   FastAPI + Pydantic v2  │
                         │  - Auth & sessions        │
                         │  - RBAC / authorization   │
                         │  - Scope validation        │
                         │  - Run state machine       │
                         │  - Evidence integrity       │
                         │  - Provider abstraction     │
                         └──────┬────────────┬────────┘
                                │            │
                     SQLAlchemy │            │ Redis client
                       (async)  │            │ (queue push/pop, pub/sub)
                                ▼            ▼
                     ┌───────────────┐  ┌──────────────┐
                     │  PostgreSQL   │  │    Redis     │
                     │  (system of   │  │ (job queue,  │
                     │   record)     │  │  rate limit, │
                     │               │  │  session     │
                     │               │  │  cache)      │
                     └───────────────┘  └──────┬───────┘
                                                │ BRPOP / consumer group
                                                ▼
                                     ┌─────────────────────┐
                                     │     apps/worker      │
                                     │  Redis queue consumer │
                                     │  - Executes run steps  │
                                     │  - Calls provider APIs  │
                                     │  - Calls tool adapters   │
                                     │  - Writes evidence blobs  │
                                     │  - Reports back via API   │
                                     └──────────┬────────────┘
                                                │ authenticated HTTP
                                                │ (WORKER_AUTH_SECRET)
                                                ▼
                                        back to apps/api
                                        (status callbacks,
                                         run_events, evidence
                                         registration)
```

Supporting services:

- **S3-compatible object storage** (or local filesystem in dev) for evidence blobs, referenced by `STORAGE_BACKEND` in configuration. The API and worker both read/write through a shared storage abstraction — never directly against a vendor SDK in business logic.
- **packages/contracts** and **packages/shared-types** — the single source of truth for cross-language types (e.g., `RunState`, API request/response shapes) so the FastAPI backend and the React frontend never drift out of sync.

### 2.1 apps/api (FastAPI)

- Owns all authentication, authorization, and business rules.
- Exposes versioned REST endpoints under `/api/v1/*` plus unversioned operational endpoints (`/api/health`, `/api/ready`, `/api/auth/*`).
- Talks to PostgreSQL via SQLAlchemy 2 (async engine, `asyncpg` driver) and to Redis for queueing and rate limiting.
- Never executes tools or calls LLM providers directly on the request path for long-running work — it enqueues a job and returns quickly; the worker performs the actual execution.
- Is the only component permitted to write to the `runs`, `run_events`, `approval_requests`, and `evidence` tables that represent authoritative state.

### 2.2 apps/web (React SPA)

- React 19 + TypeScript + Vite + Tailwind CSS.
- Talks to the API exclusively over HTTPS/JSON with `credentials: include` for the session cookie.
- Renders the run state machine, approval queues, evidence viewer, findings, and reports.
- Contains no secrets, no direct database or Redis access, and no direct provider API keys.
- Uses the shared type contracts from `packages/contracts` so state names (e.g., `AWAITING_ACTION_APPROVAL`) can never diverge from the backend enum.

### 2.3 apps/worker (Redis queue consumer)

- A long-running Python process (`apps/worker/app/main.py`) that blocks on the Redis queue for run-step jobs.
- On receiving a job, it re-validates scope (defense in depth — never trusts that the API-side check is still valid at execution time), executes the step via a tool or provider adapter, captures evidence, and reports results back to the API over an authenticated HTTP channel using `WORKER_AUTH_SECRET`.
- Is horizontally scalable — multiple worker processes can consume from the same queue; idempotency keys on `run_steps` prevent duplicate execution if a job is redelivered.
- Never talks directly to the frontend and never holds a browser-facing session.

### 2.4 PostgreSQL

- System of record for users, sessions, projects, engagements, scope entries, runs, run steps, run events, approval requests, evidence metadata, findings, and reports.
- Schema is managed exclusively through Alembic migrations (`apps/api/migrations`) — no ad hoc schema changes.
- Sessions are stored server-side in PostgreSQL (see Authentication, below), not as client-decodable JWTs.

### 2.5 Redis

- Job queue between API and worker.
- Rate-limiting counters (e.g., `AUTH_RATE_LIMIT`, `WORKER_AUTH_RATE_LIMIT`).
- Optional pub/sub channel for pushing run-event notifications toward the API for real-time UI updates (polling or SSE/WebSocket bridge on top of the same event stream).
- Not used as a system of record — anything Redis loses can be rebuilt from PostgreSQL.

## 3. Data Flow

The canonical request/response cycle for a run:

1. **User → Frontend.** A researcher creates or edits a run in the SPA (defines target scope references, agent profile, provider/model choice).
2. **Frontend → API.** The SPA calls `POST /api/v1/projects/:id/runs` (or equivalent). The API authenticates the session, authorizes the action against RBAC, and validates the referenced scope entries.
3. **API → DB.** The API writes a new `Run` row in state `DRAFT`, then transitions it through the state machine (e.g., to `PLANNING`) as business rules dictate, recording each transition as a `RunEvent`.
4. **API → Redis.** When a run reaches `QUEUED`, the API pushes a job payload (run id, step id, idempotency key) onto the Redis queue.
5. **Redis → Worker.** A worker process pops the job, re-validates scope, and executes the step (calling a provider adapter and/or tool adapter).
6. **Worker → API.** The worker calls back into the API (authenticated via `WORKER_AUTH_SECRET`) to report step results, register evidence, and request approvals when a step requires one.
7. **API → DB/Redis.** The API persists the step outcome, updates run state, and — if human approval is required — transitions the run to `AWAITING_ACTION_APPROVAL` and notifies subscribers.
8. **API → Frontend.** The SPA polls (or subscribes to) run status endpoints and re-renders the run detail view, evidence list, and approval queue in near real time.
9. **Frontend → User.** The researcher observes progress, reviews evidence, and approves or rejects the next action, closing the loop back to step 2.

This flow is intentionally uniform whether the actor "driving" a run is a human clicking "run next step" or an AI agent proposing a plan: both paths converge on the same API endpoints, the same scope validator, and the same approval gates.

## 4. Authentication

MORPHIA uses classic, auditable, server-side session authentication — no third-party identity provider dependency and no client-side JWT trust.

| Mechanism | Detail |
|---|---|
| Password hashing | **Argon2id** via `app.core.security`, tunable via `ARGON2_TIME_COST` and `ARGON2_MEMORY_COST` env vars. Never MD5/SHA1/bcrypt-only. |
| Session storage | Server-side sessions in the PostgreSQL `sessions` table (`app.models.auth.Session`): random opaque `token`, a separate `csrf_token`, and `expires_at`. The session id is **not** a JWT — it carries no decodable claims, so a stolen cookie is useless without a corresponding live DB row that the server can revoke. |
| Session transport | HttpOnly, `SameSite=Lax` cookie (`sid`), `Secure` flag forced on in production (`settings.is_production`). Bearer-token fallback (`Authorization: Bearer <token>`) is supported for non-browser clients but resolves to the same session table. |
| Session lifetime | Configurable via `SESSION_LIFETIME_HOURS` (default 24h); expiry enforced both by cookie `max_age` and server-side `expires_at` comparison on every request (`Session.is_valid()`). |
| CSRF protection | A per-session `csrf_token` is issued at login and must be echoed on state-changing requests (double-submit pattern). Because sessions are cookie-based, CSRF protection is mandatory for every `POST`/`PUT`/`PATCH`/`DELETE`. |
| Rate limiting | `AUTH_RATE_LIMIT` (default `10/minute`) throttles login/register attempts per IP/account to blunt credential stuffing and brute force. `WORKER_AUTH_RATE_LIMIT` separately throttles worker callback traffic. |
| Generic error messages | Login failures return a single generic message ("Invalid email or password.") regardless of whether the email exists, to prevent account enumeration. |
| Logout | Deletes the server-side session row and clears the cookie — a true revoke, not just client-side cookie deletion. |

Registration (`POST /api/auth/register`) enforces minimum password length (8) and email uniqueness. New accounts default to the least-privileged role (`researcher`).

## 5. Authorization (RBAC)

Every authenticated request carries a `User.role`. Authorization decisions are made server-side on every request — the frontend's role-based UI hiding is a convenience, never a security control.

| Role | Intended Use | Representative Capabilities |
|---|---|---|
| **Owner** | Organization/workspace owner. | Full control: manage billing, all projects, all users, delete org data. Implicitly has every permission below. |
| **Administrator** | Delegated org administration. | Manage users and roles (except Owner), manage all projects/engagements/scope, override approvals in exceptional cases, view audit log. |
| **Researcher** | Primary hands-on-keyboard user. | Create/edit projects they own or are a member of, define scope proposals, create and drive runs, review evidence, submit findings and reports. Default role for new registrations. |
| **Reviewer** | Second-set-of-eyes for approvals and disclosure. | Approve/reject plan and action approval requests, review findings before report submission, cannot themselves create or execute runs (separation of duties). |
| **Auditor** | Read-only compliance/audit role. | Read all runs, evidence, findings, reports, and the audit log across the org. No write access anywhere. |
| **Worker** | Non-human service identity used by `apps/worker` when calling back into the API. | Report run-step results, register evidence, request approvals. Authenticated via `WORKER_AUTH_SECRET`, not a user session. Cannot read or act outside the run it was dispatched for. |

Authorization rules of thumb enforced in the API layer:

- Resource ownership/membership is checked on every read and write (see `get_project`: 404 if not found, 403 if the requester isn't the owner/member — 404 is returned first to avoid leaking existence to unauthorized callers where appropriate).
- Approval actions (approving a plan or an action) must come from a Reviewer, Administrator, or Owner — never from the same identity that created the run being approved (no self-approval), enforced regardless of role for defense in depth.
- The Worker identity is scoped to callback endpoints only; it cannot list projects, manage users, or read unrelated runs.

## 6. Run State Machine

The run lifecycle is the backbone of orchestration. Its canonical definition lives in `apps/api/app/models/runs.py` as `RunState` and `LEGAL_TRANSITIONS` — this is the **single source of truth**; the frontend derives its state types from the same contract (`packages/contracts`) so the two can never drift.

### 6.1 States

| State | Meaning |
|---|---|
| `DRAFT` | Run created but not yet planned. Freely editable. |
| `PLANNING` | An agent or human is producing an execution plan for the run. |
| `AWAITING_PLAN_APPROVAL` | A plan has been produced and is waiting for a Reviewer/Administrator/Owner to approve it before any execution begins. |
| `QUEUED` | Plan approved; the run is waiting for a worker to pick up the next step. |
| `RUNNING` | A worker is actively executing a step. |
| `AWAITING_ACTION_APPROVAL` | Execution paused because the next action is classified as requiring human sign-off (e.g., an intrusive scan, an exploit attempt, a report submission). |
| `PAUSED` | Execution voluntarily paused by a human (not a hard stop, resumable). |
| `COMPLETED` | Terminal. Run finished successfully. |
| `FAILED` | Terminal (with one exception — see below). Run ended in error. |
| `CANCELLED` | Terminal. Run was cancelled by a human. |

### 6.2 Legal Transitions

```
DRAFT                     → PLANNING, CANCELLED
PLANNING                  → AWAITING_PLAN_APPROVAL, FAILED, CANCELLED
AWAITING_PLAN_APPROVAL     → QUEUED, CANCELLED
QUEUED                     → RUNNING, FAILED, CANCELLED
RUNNING                     → AWAITING_ACTION_APPROVAL, PAUSED, COMPLETED, FAILED, CANCELLED
AWAITING_ACTION_APPROVAL   → RUNNING, CANCELLED
PAUSED                      → QUEUED, CANCELLED
COMPLETED                    → (terminal, no transitions)
FAILED                        → DRAFT (retry only)
CANCELLED                      → (terminal, no transitions)
```

Rules enforced by `validate_transition()`:

- **No self-transitions.** A state can never transition to itself; every state change must be a real change, which keeps `run_events` a meaningful audit trail rather than noise.
- **Terminal states are truly terminal**, with one deliberate exception: `FAILED → DRAFT` is allowed so a failed run can be retried as a fresh draft without losing its history (the prior run's events remain on the old run id).
- **Cancellation is available from every active state** (`CANCELLABLE_STATES` = every non-terminal state), so a human can always stop a run in flight.
- **Approval states are explicit** (`APPROVAL_STATES` = `AWAITING_PLAN_APPROVAL`, `AWAITING_ACTION_APPROVAL`), giving the frontend and any automation a reliable way to know "does this run need a human right now?" without inspecting arbitrary metadata.
- Every transition is recorded as a `RunEvent` (`from_state`, `to_state`, `actor_id`, `payload`, timestamp), giving a full, append-only audit trail per run.

Any transition not present in `LEGAL_TRANSITIONS` **must** be rejected server-side with an error — this is validated directly by the state-machine test suite (`apps/api/tests/test_run_state_machine.py`), which asserts both the legal transitions and that illegal ones (e.g., `DRAFT → RUNNING`, `COMPLETED → *`, `CANCELLED → *`) are rejected.

## 7. Scope Validation

Scope is the primary authorization boundary in MORPHIA (see `docs/security.md` for the threat-model framing). Before **any** tool executes against a target — whether triggered by a human clicking "run" or an agent proposing an action — the following 8-point check must pass:

1. **Target identity resolves to an in-scope entry.** The hostname/IP/URL/asset the action would touch matches (or is a valid sub-resource of) an entry in the engagement's approved scope list, not merely "looks similar."
2. **Engagement is active and unexpired.** The engagement's authorization window (start/end date) covers the current time; expired engagements block all execution.
3. **Scope entry is not explicitly excluded.** Out-of-scope exclusions (e.g., specific subdomains, IP ranges, or asset types carved out by the program) are checked and take precedence over broader inclusions.
4. **Action type is permitted by engagement rules of engagement.** E.g., an engagement that forbids denial-of-service testing must reject any step classified as DoS-capable, even against an in-scope target.
5. **Run's project/engagement linkage is intact.** The run must reference a scope entry that belongs to the same engagement as the run itself — cross-engagement scope references are rejected (see IDOR/cross-org threats in `security.md`).
6. **Requesting identity is authorized for this engagement.** RBAC membership check: the actor (human or worker-on-behalf-of-run) must be a member of the project/engagement, independent of the target-level scope check.
7. **Rate/quantity constraints are respected.** Per-engagement or per-scope-entry limits (e.g., max requests per minute, max concurrent runs) are not exceeded.
8. **No active hold or legal freeze on the engagement.** An engagement can be administratively frozen (e.g., pending legal review, program pause notice) — a frozen engagement blocks all new tool executions even if every other check passes.

This check is performed **twice**, independently: once by the API when a step is enqueued, and again by the worker immediately before execution. The worker never trusts that a scope decision made minutes or hours earlier (at enqueue time) is still valid — scope, engagement status, and holds can change between queueing and execution, and the worker re-checks live state each time. Any failure at either checkpoint blocks execution and generates a `RunEvent` documenting the rejection reason; it never silently drops the step.

## 8. Evidence System

Evidence is the connective tissue between "the agent claims X" and "we can prove X to a program or an auditor." Implemented in `apps/api/app/models/evidence.py`, `apps/api/app/routers/evidence.py`, and `apps/api/app/services/storage.py`.

- **Integrity.** Every evidence artifact (screenshot, HTTP transcript, tool output, log excerpt) is hashed with **SHA-256** at capture time (`EvidenceArtifact.sha256_digest`, a 64-character string column). The hash is computed and stored the moment `POST /api/v1/projects/{id}/evidence` receives the upload, and can be re-verified whenever the artifact is served, so any tampering with stored bytes is detectable.
- **Verification-status lifecycle.** Every evidence artifact carries a `verification_status` that starts at `unreviewed` and moves through `source_captured → integrity_verified → manually_reproduced` on the success path, or to `contradicted`, `inconclusive`, or `rejected` when a reviewer finds a problem. Moving an artifact's status is the one write path in the entire API gated by RBAC role rather than resource ownership: `PATCH /api/v1/evidence/{id}/verify` requires `Role.REVIEWER`, `Role.OWNER`, or `Role.ADMINISTRATOR` — a Researcher who owns the project cannot self-verify their own submitted evidence, enforcing a second set of eyes.
- **Provenance.** Each evidence record captures which run/step produced it, the actor, and a timestamp, plus a `storage_path` pointing at the underlying blob. Provenance is immutable once written; corrections are modeled through the companion `EvidenceRelation` model (relation types `supplements`, `contradicts`, `supersedes`) referencing the original record rather than editing it in place.
- **Storage.** Evidence blobs live in **S3-compatible object storage** (`STORAGE_BACKEND=s3`, backed by `S3StorageBackend`, works against AWS S3 or any S3-API-compatible service such as MinIO) or on the **local filesystem** in development (`STORAGE_BACKEND=local`, backed by `LocalStorageBackend`, path configured via `STORAGE_LOCAL_PATH`). Both backends implement the same interface in `apps/api/app/services/storage.py`, so switching backends is a configuration change, never a code change.
- **Metadata vs. blob separation.** PostgreSQL holds evidence *metadata* (hash, provenance, verification status, links to findings/runs, content type, size); the object store holds the *bytes*. This keeps the database lean and lets evidence storage scale independently.
- **Safe handling.** Evidence content is never executed or rendered as active content in the browser (see `docs/security.md`) — text/log evidence is rendered as plain text, images are served with strict content-type and `Content-Disposition` headers, and no evidence viewer evaluates HTML/JS found inside captured content.
- **Chain to findings.** A finding cannot be marked `verified` without at least one linked evidence record; the report generator refuses to include unverified findings in a disclosure report.

## 9. Finding Lifecycle

Findings are the unit of "we believe we found something" and are implemented in `apps/api/app/models/findings.py` and `apps/api/app/routers/findings.py`. A finding's `state` field moves through a 10-value lifecycle (richer than a simple candidate/verified split, to model the real workflow of a bug-bounty submission):

```
candidate → needs_evidence → needs_reproduction → verified → report_ready → submitted → triaged → resolved
                                                       │
                                                       ├──▶ rejected
                                                       └──▶ duplicate
```

- **`candidate`** — initial state on creation (`POST /api/v1/projects/{id}/findings`). Represents an unverified claim, possibly generated by an AI agent during a run.
- **`needs_evidence`** — the finding lacks a linked evidence artifact; it cannot progress further until one is attached.
- **`needs_reproduction`** — evidence exists but reproduction/confirmation is still required before the finding can be trusted.
- **`verified`** — the finding has been confirmed via a `FindingVerification` record (created by `POST /api/v1/findings/{id}/verify`, which stores a `result` of `confirmed`, `denied`, or `inconclusive` and updates state accordingly).
- **`report_ready`** — a verified finding that has been curated (severity confirmed, description finalized) and is eligible to be linked into a report via `POST /api/v1/reports/{id}/findings`.
- **`submitted`** — the finding has been included in a report that has itself moved to `submitted` status.
- **`triaged`** — the receiving program/vendor has acknowledged and triaged the submission (tracked for record-keeping; MORPHIA does not automate triage).
- **`resolved`** — the underlying issue has been fixed/closed out.
- **`rejected`** — the finding did not hold up under verification (false positive, not exploitable, out of scope).
- **`duplicate`** — the finding was already reported by another submission.

Severity is tracked independently of state via `Finding.severity` (`critical`, `high`, `medium`, `low`, `info`), so a finding's urgency and its lifecycle position are queried and filtered separately (`GET /api/v1/projects/{id}/findings?state=&severity=`).

## 10. Report Generation

Reports assemble one or more `report_ready`/`verified` findings into a disclosure document. Implemented in `apps/api/app/models/reports.py` and `apps/api/app/routers/reports.py`.

- **Status lifecycle.** `draft → review → final → submitted → acknowledged`. A report starts as `draft` on creation (`POST /api/v1/projects/{id}/reports`) and is advanced explicitly via `PATCH /api/v1/reports/{id}`.
- **Formats.** Every report has a `format` of `markdown`, `html`, or `json`, and can be rendered on demand via `GET /api/v1/reports/{id}/export?format=`, independent of the format it was originally created with. There is currently no PDF export — content that needs a PDF is expected to go through the Markdown/HTML export and an external renderer.
- **HackerOne-style templates.** The Markdown/HTML export follows the structure conventional to platform disclosure reports (HackerOne, Bugcrowd, and similar programs): a summary, an impact statement, a numbered step-by-step reproduction section, affected assets/scope references, severity/CVSS-style classification, and a remediation recommendation per finding. This keeps a MORPHIA-generated report pasteable directly into a bug-bounty platform's submission form with minimal reformatting.
- **Finding linkage.** `POST /api/v1/reports/{id}/findings` links findings to a report through the `ReportFinding` junction table. All linked findings must belong to the same project as the report, and the report generator excludes findings that are not yet verified/report-ready — a report cannot silently include an unconfirmed claim.
- **Immutability once final.** Once a report reaches `final`/`submitted`, its content is treated as a point-in-time record; further changes to the underlying findings do not retroactively alter an already-generated report body (a new report or revision is created instead).

## 11. Provider Abstraction (Design — Not Yet Implemented)

**Status: this section describes the intended design. No provider adapter code exists in the repository today** — see `docs/completion-report.md` §4 for the explicit gap. `apps/worker/app/main.py` currently only receives a job from the Redis queue, logs that it was received, and stops; it does not call any LLM or execute any run step. The design below is preserved here so implementation can proceed against an agreed shape rather than being invented ad hoc later.

MORPHIA is intended to never hard-code a single LLM vendor. A provider adapter interface would normalize chat/completion calls, cost accounting, and error handling across:

| Provider | Notes |
|---|---|
| **Mock** | Deterministic, offline adapter intended to be the default in dev/test when no provider keys are configured, so the full run pipeline (planning → approval → execution → evidence) can be exercised in CI without network access or spend. |
| **OpenAI** | Would be configured via `OPENAI_API_KEY` / `OPENAI_BASE_URL` (both present in `.env.example`, currently unused by any code). |
| **OpenRouter** | Would be configured via `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` (present in `.env.example`, currently unused); useful for model choice flexibility and cost comparison across many upstream vendors through one API. |
| **Local model** | Would be configured via `LOCAL_MODEL_URL` (present in `.env.example`, e.g. an Ollama-compatible endpoint at `http://localhost:11434/v1`) for self-hosted/offline model use. |

The intended contract: all adapters implement the same interface (invoke, stream, estimate-cost, classify-error) so the run engine, cost tracker, and retry logic can be provider-agnostic. Adding a new provider would mean writing a new adapter, not touching orchestration code. Provider selection would be a per-run configuration, not a global hard-coded choice, so different runs/engagements could use different providers or models based on cost, capability, or client requirements.

Provider API keys, once this is implemented, must be read exclusively from environment variables at process start (see `docs/security.md`) and never persisted in the database, logged, or exposed to the frontend — this constraint is already reflected in how `.env.example` and `docs/completion-report.md` describe these variables even though no code consumes them yet.

## 12. Deployment

MORPHIA is designed to be **cloud-neutral** and runnable anywhere that can host PostgreSQL, Redis, and three long-running processes.

### 10.1 Docker Compose (reference/dev deployment)

`docker-compose.yml` defines five services: `postgres`, `redis`, `api`, `worker`, `web`, wired together with health checks (`pg_isready`, `redis-cli ping`) so dependent services wait for their dependencies to be ready. This is the default local development and CI environment (`make dev`).

### 10.2 Bare-metal / VM deployment

Each app is a standard process:

- `apps/api`: an ASGI app (`uvicorn`/`gunicorn` with uvicorn workers) behind any reverse proxy (nginx, Caddy) terminating TLS.
- `apps/worker`: a plain Python long-running process (`python -m app.main`), scalable by running multiple instances against the same Redis queue.
- `apps/web`: built to static assets (`vite build`) and served by any static file server or CDN; no server-side rendering requirement.
- PostgreSQL and Redis run as standard managed or self-hosted instances — no platform-specific extensions required.

### 10.3 Cloud-neutral principles

- No dependency on a specific PaaS's auth, storage, or queueing primitives — sessions are plain Postgres rows, queueing is plain Redis, storage is the S3 API (which every major cloud and most self-hosted options implement).
- Configuration is 100% environment-variable driven (`.env.example` documents every variable); there is no code path that requires a specific hosting provider's SDK.
- Database schema changes flow through Alembic migrations that run identically against any PostgreSQL 16 instance, self-hosted or managed.
- The Makefile (`make dev`, `make migrate`, `make backup`, `make restore`, `make verify`) provides a single operational interface regardless of where the stack is deployed.

This directly reflects the "recovery" motivation described in `docs/recovery-audit.md`: the prior implementation's coupling to a single hosting platform is treated as an architectural defect to be designed out, not a convenience to be re-adopted.
