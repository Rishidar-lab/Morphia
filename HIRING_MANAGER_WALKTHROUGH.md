# MORPHIA — 60-Second Technical Walkthrough

A one-page explanation of this project for a technical interviewer skimming
the repository, written the way I'd actually explain it out loud.

## 1. Problem

Bug-bounty and vulnerability-disclosure work has a recurring failure mode:
tooling that's fast to run is also fast to run against the wrong target, or
to skip the human judgment call that authorized security research depends
on. I built MORPHIA to force a specific discipline into the workflow —
every action against a target has to pass through an explicit scope
definition and a human approval gate before anything executes, and every
step of that chain is auditable afterward. The "AI agent" angle is
secondary to that; the actual engineering problem is a state machine, an
authorization boundary, and an audit trail that can't be bypassed by a
faster code path.

## 2. Architecture

```
React SPA (Vite/TanStack Query)
        │  session cookie + CSRF
        ▼
FastAPI  ──async SQLAlchemy──▶  PostgreSQL  (system of record)
        │
        └── Redis queue ──▶  Python worker  ──▶  provider adapter (mock/LLM)
```

The API and the worker are separate processes with separate credentials —
the worker never touches the database directly, only authenticated HTTP
callbacks. That split exists specifically so that a compromised or buggy
worker can't forge run state; it can only report through a narrow,
authenticated surface. A run moves through a 10-state machine
(`DRAFT → PLANNING → AWAITING_PLAN_APPROVAL → QUEUED → RUNNING → ... →
COMPLETED/FAILED/CANCELLED`) with a server-side legal-transition table —
nothing about the state machine's rules lives in the frontend.

## 3. Most difficult engineering challenge

Not the state machine — that's mechanical once you draw the transition
table. The actual hard problem was **keeping documentation and
implementation from drifting apart**, because this project's own history
shows that failure mode repeating: three separate audit passes
(`docs/mvp-gap-analysis.md`, `docs/MVP_FINAL_AUDIT.md`, and this session's
own `docs/qa/BUG_REPORTS.md`) each independently found `docs/security.md`
or a Compose/Caddy file describing a control that the code didn't actually
implement yet. The fix isn't a clever technique, it's process: nothing
gets marked "implemented" without a runtime reproduction, and every audit
gets appended to, not silently rewritten, so the drift is visible over
time instead of hidden.

The single concrete bug that best represents this: a commit that correctly
hardened the *production* Dockerfile to serve a static build on port 3000
broke the *dev* Compose file, which still expected port 5173 — because
the two files' assumptions were never cross-checked against each other in
the same change. Every automated test was green; the actual `docker
compose up` path was completely broken. Full writeup:
`docs/qa/BUG_REPORTS.md` BUG-001.

## 4. Testing strategy

Four layers, each catching a different failure class:

- **Unit/component** (pytest, Vitest) — fast, isolated logic, run on every
  commit.
- **Integration** (pytest against a real schema) — catches FastAPI wiring
  bugs a unit test can't see (dependency injection, auth ordering).
- **E2E** (Playwright, real Chromium, real Docker stack) — the only layer
  that catches deployment-path bugs, which is exactly the bug class above.
- **Manual, disclosed as manual** — accessibility and performance testing
  are honestly not automated yet; `docs/qa/TEST_PLAN.md` says so directly
  rather than papering over it.

The discipline that matters more than any tool choice: before claiming a
fix works, rebuild from a wiped state (`docker compose down -v && docker
compose up -d --build`), not just re-run against whatever's already
running. That distinction is what caught BUG-001 — a warm re-test would
have missed it, because the already-running container from before the
regression was still healthy.

## 5. Security considerations

Scope validation is treated as the single most important control — it's
checked twice, independently, by two different processes (the API at
approval time, the worker again immediately before execution), against
live database state, never against anything the AI agent itself claims.
Real controls verified in code, not just documented: Argon2id hashing,
server-side sessions, CSRF double-submit, 6-role RBAC with per-resource
ownership checks, HMAC-compared worker credentials, and a dedicated
`target_safety.py` that blocks loopback/link-local/metadata-endpoint
targets. Deliberately **not** implemented, and stated plainly rather than
hidden: hard blocking of self-approval (a written-justification
compensating control is used instead, appropriate for a single-owner MVP)
and automated accessibility testing.

## 6. Deployment

Two Docker Compose files — dev (bind-mounted source, hot reload, published
ports) and prod (Caddy reverse proxy, internal-only network for
db/redis/api/worker, a one-shot `migrate` service gating API startup,
named volumes, no bind mounts). GitHub Actions runs both a service-backed
integration job and a full Playwright job against a freshly built stack on
every push. The production Compose file fails closed on missing secrets
(`${POSTGRES_PASSWORD:?required}`) rather than silently booting insecure.

## 7. What I learned

That "all tests green" and "the product actually works" are different
claims, and the gap between them is exactly where deployment-path bugs
live — no unit test can catch a Dockerfile and a Compose file disagreeing
about which port to serve on. The habit that closes that gap isn't a
smarter test, it's re-verifying from a genuinely clean state before
trusting a green run, and writing down what was actually reproduced
instead of what should theoretically be true.
