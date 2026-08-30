# MORPHIA — Portfolio Copy

Reusable descriptions of the project at different lengths. All accurate as of
the MVP (see `docs/mvp-verification.md`).

---

## One-line

Human-in-the-loop orchestration for authorized security research.

## Short (2–3 sentences)

MORPHIA is a self-hostable platform for running bug-bounty and
vulnerability-disclosure work inside real authorization boundaries: scoped
engagements, a run state machine with human approval gates, scope validation
enforced independently by both the API and the worker, SHA-256 evidence
integrity, and disclosure-ready reports. It is explicitly not an autonomous
attack tool — no code path reaches execution without clearing scope and, for
the plan, a human. The MVP journey is verified end to end against a live
Docker Compose stack.

## Medium (technical portfolio paragraph)

MORPHIA is a cloud-neutral orchestration platform for authorized security
research, built as a FastAPI + async SQLAlchemy backend, a Redis-queued Python
worker, and a React 19 / TypeScript SPA, all wired together with Docker
Compose. The domain model runs projects → engagements → explicit scope → runs,
where a run advances through a 10-state machine with a single legal-transition
table enforced server-side and two explicit human-approval states. Scope is
the primary security boundary: an 8-point default-deny validator is run once by
the API when a run is approved and again by the worker — which has no database
access — immediately before it executes each step, so an out-of-scope target
fails the run with the reason recorded on an append-only audit trail. Evidence
is SHA-256 hashed at capture with a verification lifecycle; verified findings
assemble into HackerOne-style reports exportable as Markdown, HTML, or JSON.
The build includes a synthetic local demo target, a one-command demo that
drives both an allowed run and a scope-denied run live, service-backed
integration tests, and a Playwright suite that exercises the full journey
through the browser. CI runs Python/worker/frontend quality gates, a
compose-backed integration job, and the E2E suite with the report uploaded as
an artifact.

## LinkedIn (project description)

**MORPHIA — Human-in-the-loop orchestration for authorized security research**

A self-hostable platform for running bug-bounty and disclosure work with the
authorization boundaries built in, not bolted on. Researchers define scoped
engagements; runs move through a state machine that *pauses for human approval*
before anything executes; scope is validated independently by both the API and
a database-less worker; evidence is hash-verified; verified findings become
disclosure-ready reports. Stack: FastAPI, PostgreSQL, Redis, a pluggable
provider worker, and a React 19 SPA, orchestrated with Docker Compose. The
end-to-end journey — including the scope-denial path — is verified against a
live stack by integration tests and a Playwright browser suite, and runs in CI.
MVP / alpha.

## Résumé (3 bullets)

- Designed and built MORPHIA, a cloud-neutral orchestration platform for
  authorized security research (FastAPI + async SQLAlchemy, Redis-queued Python
  worker, React 19/TS SPA, Docker Compose) with a 10-state run machine and
  explicit human-approval gates.
- Made scope enforcement the primary security boundary: an 8-point default-deny
  validator checked independently by the API at approval time and by a
  database-less worker at execution time; proved both the allowed and
  scope-denied paths with service-backed integration tests and a live
  Playwright suite in CI.
- Shipped SHA-256 evidence integrity, a finding-verification lifecycle,
  HackerOne-style report export (MD/HTML/JSON), an append-only audit trail, a
  one-command seeded demo with a synthetic local target, and a fully green CI
  pipeline (98 backend/frontend unit tests + 4 live E2E).

## Hackathon submission (100–150 words)

MORPHIA is a human-in-the-loop orchestration platform for authorized
security research. Instead of a pile of scripts, it gives bug-bounty and
disclosure work real structure: projects and engagements with an explicit,
validated scope; runs that move through a 10-state machine and *stop for a
human to approve the plan* before any worker touches a target; scope re-checked
independently by a database-less worker at execution time; SHA-256 evidence
integrity; and disclosure-ready report export. Every action — auth, scope
changes, approvals, transitions — lands on an append-only audit trail. It ships
with a synthetic local target and a one-command demo that drives an allowed run
and an out-of-scope run live to prove the boundary holds. Stack: FastAPI,
PostgreSQL, Redis, a pluggable-provider worker, React 19, Docker Compose. The
full journey is verified end to end in CI.
