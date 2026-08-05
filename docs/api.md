# MORPHIA API Reference

This document lists all API endpoints currently implemented, plus the categories of endpoints planned for subsequent phases. It reflects the state of `apps/api/app/routers/` at the time of writing — see `docs/recovery-audit.md` §6 for overall project status.

Base URL (local dev): `http://localhost:8000`
Interactive OpenAPI docs (local dev): `http://localhost:8000/api/docs`

## Conventions

- All request/response bodies are JSON.
- Authenticated endpoints require either the `sid` session cookie (browser clients, set automatically by `POST /api/auth/login`) or an `Authorization: Bearer <token>` header (non-browser clients), resolving to the same server-side session.
- State-changing endpoints (`POST`/`PUT`/`PATCH`/`DELETE`) require the CSRF token issued at login to be echoed back per the double-submit pattern (see `docs/security.md` §3).
- Standard error shape: `{"detail": "human-readable message"}` with an appropriate HTTP status code (`400`, `401`, `403`, `404`, `409`, `422`).
- Timestamps are ISO 8601 UTC strings.
- Resource identifiers are UUID v4 strings.

## Operational Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Liveness check. Returns process status without checking dependencies. Used by container/process health checks. |
| `GET` | `/api/ready` | None | Readiness check. Verifies the API can reach PostgreSQL and Redis before reporting ready. Used by orchestrators/load balancers to gate traffic. |

## Authentication Endpoints (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create a new user account. Body: `{ email, password, display_name }`. Password minimum length 8. New accounts default to the `researcher` role. Returns `201` with the created user (no password hash). Returns `409` if the email is already registered. |
| `POST` | `/api/auth/login` | None | Authenticate with email/password. Body: `{ email, password }`. On success, sets the `sid` session cookie (HttpOnly, Secure in production, SameSite=Lax) and returns `{ user, csrfToken }`. Returns `401` with a generic error message on invalid credentials (no account enumeration), `403` if the account is inactive. |
| `POST` | `/api/auth/logout` | Session | Invalidates the current session (deletes the server-side session row) and clears the `sid` cookie. Returns `{ "status": "logged_out" }`. |
| `GET` | `/api/auth/me` | Session | Returns the currently authenticated user's profile: `{ id, email, display_name, role }`. Returns `401` if unauthenticated or the session has expired. |

### Request/Response Schemas

**`RegisterRequest`**

```json
{
  "email": "user@example.com",
  "password": "at-least-8-characters",
  "display_name": "Jane Researcher"
}
```

**`LoginRequest`**

```json
{
  "email": "user@example.com",
  "password": "correct-password"
}
```

**`UserResponse`**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "Jane Researcher",
  "role": "researcher"
}
```

## Projects Endpoints (`/api/v1/projects`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/projects` | Session | List projects owned by (or, in future phases, shared with) the current user, ordered by most recently created first. |
| `POST` | `/api/v1/projects` | Session | Create a new project. Body: `{ name, description? }`. The authenticated user becomes `owner_id`. Returns `201` with the created project. |
| `GET` | `/api/v1/projects/{id}` | Session | Fetch a single project by ID. Returns `404` if it does not exist, `403` if it exists but the requester is not the owner (or member, in future phases). |

### Request/Response Schemas

**`CreateProjectRequest`**

```json
{
  "name": "Acme Corp Bug Bounty",
  "description": "Optional free-text description, up to 2000 characters"
}
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

## Planned Endpoints (Subsequent Phases)

The following endpoint groups are part of the product surface described in `docs/architecture.md` but are not yet implemented. They are listed here so the API's eventual shape is documented ahead of implementation and so this reference can be extended incrementally rather than rewritten.

| Group | Representative Endpoints | Purpose |
|---|---|---|
| **Engagements** | `GET/POST /api/v1/projects/{id}/engagements`, `GET/PATCH /api/v1/engagements/{id}` | Define authorized engagements within a project, including their authorization window and rules of engagement. |
| **Scope** | `GET/POST /api/v1/engagements/{id}/scope`, `DELETE /api/v1/scope/{id}` | Manage the explicit allow/exclude list of targets that runs are validated against (see `docs/architecture.md` §7). |
| **Runs** | `GET/POST /api/v1/engagements/{id}/runs`, `GET /api/v1/runs/{id}`, `POST /api/v1/runs/{id}/transition`, `POST /api/v1/runs/{id}/cancel` | Create and drive runs through the state machine described in `docs/architecture.md` §6. |
| **Evidence** | `GET /api/v1/runs/{id}/evidence`, `GET /api/v1/evidence/{id}`, `GET /api/v1/evidence/{id}/download` | Retrieve evidence metadata and integrity-verified content linked to runs and findings. |
| **Findings** | `GET/POST /api/v1/engagements/{id}/findings`, `PATCH /api/v1/findings/{id}` | Manage verified findings, each requiring at least one linked evidence record before being marked verified. |
| **Reports** | `GET/POST /api/v1/engagements/{id}/reports`, `GET /api/v1/reports/{id}` | Generate and retrieve responsible-disclosure reports assembled from verified findings. |
| **Workflows** | `GET/POST /api/v1/workflows`, `GET /api/v1/workflows/{id}` | Reusable orchestration templates/playbooks that seed a run's initial plan. |
| **Agents** | `GET/POST /api/v1/agents`, `GET /api/v1/agents/{id}` | Manage AI agent profiles (provider/model configuration, capability/tool grants) usable by runs. |
| **Audit** | `GET /api/v1/audit-log` | Read-only, org-scoped audit trail (primarily for the Auditor role) covering auth events, role changes, run transitions, and approval decisions. |

Approval endpoints (`POST /api/v1/runs/{id}/approvals/{approval_id}/decision`) and worker-callback endpoints (authenticated via `WORKER_AUTH_SECRET`, distinct from the user-facing API surface above) will be documented here once implemented, alongside the run and evidence groups they depend on.
