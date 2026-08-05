# MORPHIA API Reference

This document lists every API endpoint implemented in `apps/api/app/routers/`
as registered in `apps/api/app/main.py`. All nine router groups described
below are shipped and covered (at least partially) by
`apps/api/tests/`. Endpoint groups that were previously listed as "planned"
(engagements, scope, runs, evidence, findings, reports) are now implemented —
this document reflects that.

Base URL (local dev): `http://localhost:8000`
Interactive OpenAPI docs (local dev): `http://localhost:8000/api/docs`

## Conventions

- All request/response bodies are JSON.
- Authenticated endpoints require either the `sid` session cookie (browser
  clients, set automatically by `POST /api/auth/login`) or an
  `Authorization: Bearer <token>` header (non-browser clients), resolving to
  the same server-side session row.
- State-changing endpoints (`POST`/`PUT`/`PATCH`/`DELETE`) require the CSRF
  token issued at login to be echoed back in the `X-CSRF-Token` header per
  the double-submit pattern (see `docs/security.md`), except for the CSRF
  middleware's exempt paths (`/api/auth/register`, `/api/auth/login`,
  `/api/health`, `/api/ready`).
- Standard error shape: `{"detail": "human-readable message"}` with an
  appropriate HTTP status code (`400`, `401`, `403`, `404`, `409`, `422`).
- Almost every resource is ownership-checked through its parent chain (e.g.
  a scope rule is checked via `scope rule → engagement → project →
  owner_id`); requests for resources the caller does not own return `403`
  (or `404` where existence itself should not be revealed).
- One endpoint departs from ownership-only authorization and instead
  requires an explicit role: `PATCH /api/v1/evidence/{id}/verify` requires
  `Role.REVIEWER`, `Role.OWNER`, or `Role.ADMINISTRATOR` (see
  `middleware/rbac.py`'s `require_role()`).
- Timestamps are ISO 8601 UTC strings. Resource identifiers are UUID v4
  strings.

## Operational Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Liveness check. Returns process status without checking dependencies. Used by container/process health checks. |
| `GET` | `/api/ready` | None | Readiness check. Verifies the API can reach PostgreSQL and Redis before reporting ready. Used by orchestrators/load balancers to gate traffic. |

## Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create a new user account. Body: `{ email, password, display_name }`. Password minimum length 8. New accounts default to the `researcher` role. Returns `201` with the created user (no password hash). Returns `409` if the email is already registered. Rate-limited (`AUTH_RATE_LIMIT`, default `10/minute`). |
| `POST` | `/api/auth/login` | None | Authenticate with email/password. Body: `{ email, password }`. On success, sets the `sid` session cookie (HttpOnly, Secure in production, SameSite=Lax) and returns `{ user, csrfToken }`. Returns `401` with a generic error message on invalid credentials (no account enumeration), `403` if the account is inactive. Rate-limited. |
| `POST` | `/api/auth/logout` | Session | Invalidates the current session (deletes the server-side session row) and clears the `sid` cookie. Returns `{ "status": "logged_out" }`. |
| `GET` | `/api/auth/me` | Session | Returns the currently authenticated user's profile: `{ id, email, display_name, role }`. Returns `401` if unauthenticated or the session has expired. |

### Schemas

**`RegisterRequest`**
```json
{ "email": "user@example.com", "password": "at-least-8-characters", "display_name": "Jane Researcher" }
```

**`LoginRequest`**
```json
{ "email": "user@example.com", "password": "correct-password" }
```

**`UserResponse`**
```json
{ "id": "uuid", "email": "user@example.com", "display_name": "Jane Researcher", "role": "researcher" }
```

## Projects (`/api/v1/projects`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/projects` | Session | List projects owned by the current user, most recently created first. |
| `POST` | `/api/v1/projects` | Session | Create a new project. Body: `{ name, description? }`. The authenticated user becomes `owner_id`. Returns `201`. |
| `GET` | `/api/v1/projects/{id}` | Session | Fetch a single project by ID. `404` if it does not exist; `403` if it exists but the requester is not the owner. |

### Schemas

**`CreateProjectRequest`**
```json
{ "name": "Acme Corp Bug Bounty", "description": "Optional, up to 2000 characters" }
```

**`ProjectResponse`**
```json
{
  "id": "uuid",
  "name": "Acme Corp Bug Bounty",
  "description": "",
  "status": "active",
  "owner_id": "uuid",
  "created_at": "2026-08-05T00:00:00Z",
  "updated_at": "2026-08-05T00:00:00Z"
}
```

## Engagements (`/api/v1/projects/{project_id}/engagements`, `/api/v1/engagements`)

An engagement is an authorized piece of work inside a project — it carries
the authorization window and rules of engagement that the scope validator
checks against.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/projects/{project_id}/engagements` | Session, project owner | Create an engagement under a project. Body includes name, authorization window (start/end), and rules-of-engagement fields. Returns `201`. |
| `GET` | `/api/v1/projects/{project_id}/engagements` | Session, project owner | List engagements for a project. |
| `GET` | `/api/v1/engagements/{engagement_id}` | Session, ownership via parent project | Fetch a single engagement. |
| `PUT` | `/api/v1/engagements/{engagement_id}` | Session, ownership via parent project | Update an engagement's fields (name, authorization window, rules of engagement, active/frozen status). |

## Scope (`/api/v1/engagements/{engagement_id}/scope`, `/api/v1/scope`)

Scope rules are the explicit allow/exclude list of targets a run is
validated against before any tool executes (see `docs/architecture.md` §7
for the full 8-point check).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/engagements/{engagement_id}/scope` | Session, ownership via parent project | Create a scope rule. Body: `{ rule_type: "include"|"exclude", target_type: "domain"|"ip"|"api"|"repo"|"mobile_app", pattern }`. Logs an `AuditEventType.SCOPE_MODIFY` audit event. Returns `201`. |
| `GET` | `/api/v1/engagements/{engagement_id}/scope` | Session, ownership via parent project | List all scope rules for an engagement. |
| `DELETE` | `/api/v1/scope/{scope_rule_id}` | Session, ownership via parent project | Remove a scope rule. Logs an audit event. |

## Runs (`/api/v1/runs`, `/api/v1/projects/{project_id}/runs`)

Runs are bounded units of orchestrated work and move through the state
machine defined in `apps/api/app/models/runs.py` (`RunState`,
`LEGAL_TRANSITIONS`) — see `docs/architecture.md` §6 for the full transition
table.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/runs` | Session | List runs across every project the current user owns. |
| `POST` | `/api/v1/projects/{project_id}/runs` | Session, project owner | Create a new run under a project, starting in state `DRAFT`. |
| `GET` | `/api/v1/runs/{run_id}` | Session, ownership via parent project | Fetch a single run, including its current state. |
| `POST` | `/api/v1/runs/{run_id}/transition` | Session, ownership via parent project | Body: `{ to_state, payload? }`. Validated against `LEGAL_TRANSITIONS`; illegal transitions (e.g. `DRAFT → RUNNING`) return `409`. Records a `RunEvent` on success. |
| `POST` | `/api/v1/runs/{run_id}/cancel` | Session, ownership via parent project | Cancels the run from any non-terminal state (idempotent — calling it twice does not error). |
| `POST` | `/api/v1/runs/{run_id}/approve` | Session, ownership via parent project (Reviewer/Administrator/Owner in practice) | Approves a pending `ApprovalRequest` (plan or action), advancing the run out of `AWAITING_PLAN_APPROVAL`/`AWAITING_ACTION_APPROVAL`. |
| `POST` | `/api/v1/runs/{run_id}/reject` | Session, ownership via parent project | Rejects a pending `ApprovalRequest`, transitioning the run to `CANCELLED`. |
| `GET` | `/api/v1/runs/{run_id}/events` | Session, ownership via parent project | Returns the append-only `RunEvent` history for the run (audit trail of every state transition). |

### Schemas

**`RunResponse`**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "name": "Initial recon pass",
  "state": "DRAFT",
  "created_at": "2026-08-05T00:00:00Z",
  "updated_at": "2026-08-05T00:00:00Z"
}
```

**`TransitionRequest`**
```json
{ "to_state": "PLANNING", "payload": {} }
```

## Evidence (`/api/v1/projects/{project_id}/evidence`, `/api/v1/evidence`)

Evidence artifacts are hashed with SHA-256 at capture time and stored
through a pluggable local/S3 backend (see `docs/architecture.md` §8).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/projects/{project_id}/evidence` | Session, project owner | Upload an evidence artifact. Computes and stores its SHA-256 digest, writes the blob through the configured storage backend, and creates a metadata row with `verification_status = unreviewed`. |
| `GET` | `/api/v1/projects/{project_id}/evidence` | Session, project owner | List evidence for a project. Optional query param `verification_status` filters by status (`unreviewed`, `source_captured`, `integrity_verified`, `manually_reproduced`, `contradicted`, `inconclusive`, `rejected`). |
| `GET` | `/api/v1/evidence/{evidence_id}` | Session, ownership via parent project | Fetch a single evidence artifact's metadata (and, depending on content type, a link/stream to the underlying blob). |
| `PATCH` | `/api/v1/evidence/{evidence_id}/verify` | Session **and** `Role.REVIEWER`/`Role.OWNER`/`Role.ADMINISTRATOR` | Updates `verification_status`. This is the one endpoint in the API gated by role rather than ownership alone — a Researcher who owns the project cannot self-verify their own evidence. |

## Findings (`/api/v1/projects/{project_id}/findings`, `/api/v1/findings`)

Findings move through a lifecycle from an unverified candidate to a
report-ready, evidence-backed claim (see `docs/architecture.md`'s finding
lifecycle section).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/projects/{project_id}/findings` | Session, project owner | Create a finding, starting in state `candidate`. Body includes `severity` (`critical`\|`high`\|`medium`\|`low`\|`info`), title, description, and optional linked evidence IDs. |
| `GET` | `/api/v1/projects/{project_id}/findings` | Session, project owner | List findings for a project. Optional query params `state` and `severity` filter results. |
| `GET` | `/api/v1/findings/{finding_id}` | Session, ownership via parent project | Fetch a single finding, including linked evidence and verification history. |
| `PATCH` | `/api/v1/findings/{finding_id}` | Session, ownership via parent project | Update finding fields (title, description, severity, state, linked evidence). |
| `POST` | `/api/v1/findings/{finding_id}/verify` | Session, ownership via parent project | Records a `FindingVerification` row with `result` (`confirmed`\|`denied`\|`inconclusive`) and moves the finding's `state` accordingly. |

## Reports (`/api/v1/projects/{project_id}/reports`, `/api/v1/reports`)

Reports assemble verified findings into a disclosure document.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/projects/{project_id}/reports` | Session, project owner | Create a report, starting in status `draft`. Body: `{ title, format: "markdown"|"html"|"json" }`. |
| `GET` | `/api/v1/projects/{project_id}/reports` | Session, project owner | List reports for a project. |
| `GET` | `/api/v1/reports/{report_id}` | Session, ownership via parent project | Fetch a single report's metadata and current content. |
| `PATCH` | `/api/v1/reports/{report_id}` | Session, ownership via parent project | Update report fields (title, status: `draft`\|`review`\|`final`\|`submitted`\|`acknowledged`). |
| `GET` | `/api/v1/reports/{report_id}/export?format=` | Session, ownership via parent project | Render and return the report in the requested format (`markdown`, `html`, or `json`; defaults to the report's stored `format`). |
| `POST` | `/api/v1/reports/{report_id}/findings` | Session, ownership via parent project | Link one or more findings to the report via the `ReportFinding` junction table. All linked findings must belong to the same project as the report; findings that are not yet `verified`/`report_ready` are rejected by the report generator. |

### Schemas

**`CreateReportRequest`**
```json
{ "title": "Q3 2026 Disclosure — Acme Corp", "format": "markdown" }
```

**`ReportResponse`**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "title": "Q3 2026 Disclosure — Acme Corp",
  "status": "draft",
  "format": "markdown",
  "created_at": "2026-08-05T00:00:00Z",
  "updated_at": "2026-08-05T00:00:00Z"
}
```

## Known Gaps

- **Worker callback endpoints.** The API and worker are designed to
  communicate over an authenticated HTTP channel using `WORKER_AUTH_SECRET`
  (see `docs/architecture.md` §2.3 and §3), but the worker
  (`apps/worker/app/main.py`) does not yet make those callbacks — it only
  logs job receipt. No dedicated worker-callback router exists yet to
  document here.
- **Provider/agent-profile endpoints.** `docs/architecture.md` §11 describes
  a provider abstraction (mock/OpenAI/OpenRouter/local); there is no
  corresponding `/api/v1/agents` or `/api/v1/providers` router in the
  codebase today, only the frontend's `Agents.tsx` page rendering against
  placeholder/local state.
- **Workflow templates.** The frontend has a `Workflows.tsx` page, but there
  is no backend `/api/v1/workflows` router; workflow data in the UI is not
  yet backed by a persisted API resource.
