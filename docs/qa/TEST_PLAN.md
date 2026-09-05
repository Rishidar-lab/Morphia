# MORPHIA — Test Plan

**Owner:** Rishi (Rishidar-lab)
**Last updated:** 2026-09-05
**Applies to:** `release/morphia-hosted-mvp`, v0.2.x

This is a working test plan for an actively-developed project, not a
retrospective document. It describes what is actually tested today, how,
and what is deliberately out of scope for this stage — see
[`BUG_REPORTS.md`](./BUG_REPORTS.md) for real defects this plan's execution
found, and [`TEST_CASES.md`](./TEST_CASES.md) for the representative case
catalog.

## 1. Scope

**In scope:**

- The FastAPI backend (`apps/api`) — auth, RBAC/ownership, projects,
  engagements, scope rules, the run state machine, approval gates, evidence
  upload/integrity, findings, reports, audit log, worker-callback API.
- The Python worker (`apps/worker`) — Redis job consumption, provider
  adapters, scope re-validation at execution time.
- The React SPA (`apps/web`) — all 14 routed pages, component-level
  behavior, loading/empty/error states.
- The Docker Compose deployment path (dev and prod) as a system under test —
  "does the documented way of running this thing actually work" is treated
  as a first-class test target, not an afterthought.
- Cross-cutting: authentication/authorization boundaries, API input
  validation, audit-trail completeness.

**Out of scope for this stage:**

- Load/performance testing beyond a manual sanity check — no automated
  performance suite exists yet (see §7).
- Automated accessibility testing (no axe-core integration yet — a real
  gap, tracked, not hidden; see §6).
- Penetration testing of the deployed instance from an external network
  position (this plan governs testing *this repository's* code and local
  runtime, not offensive testing of any live host).
- The worker's LLM provider integrations (OpenAI/OpenRouter/local) beyond
  the deterministic mock — provider correctness is Anthropic/OpenAI/etc.'s
  concern, not this project's; only the adapter *interface* is tested here.

## 2. Objectives

1. Every state-changing API endpoint has an owning test that exercises both
   the success path and at least one authorization/validation failure path.
2. The full user journey (register → project → engagement → scope → run →
   approval → worker execution → evidence → finding → report → audit) is
   provably reproducible against a live stack, not just asserted in
   documentation.
3. A regression that breaks the *deployment path itself* (not just
   application logic) is caught before it reaches a reviewer — this
   project's own history shows that class of bug is at least as likely as
   an application-logic bug (see BUG-001 in `BUG_REPORTS.md`).
4. No claim in project documentation about test status is allowed to be
   unverifiable — every PASS in `docs/mvp-verification.md` has a command
   next to it that reproduces it.

## 3. Test Strategy

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit / component | pytest (API), pytest (worker), Vitest (web) | Individual functions, single React components in isolation, provider adapters | `apps/api/tests/`, `apps/worker/tests/`, `apps/web/src/**/*.test.tsx` |
| Integration / API | pytest against an in-memory SQLite schema (fast, per-test isolated) via `apps/api/tests/conftest.py`; CI additionally runs the same suite against a real Postgres+Redis service stack | Full request/response cycle through FastAPI's dependency injection, real ORM behavior, real scope-validator logic | `apps/api/tests/test_*.py` |
| End-to-end | Playwright, real Chromium, against a real `docker compose` stack (Postgres, Redis, API, worker, web, synthetic demo target) | The actual user journey through the actual UI, with no mocking of the backend | `tests/e2e/tests/mvp-journey.spec.ts` |
| Deployment / infra | Manual + CI `compose`/`integration`/`e2e` jobs | `docker compose build`, `docker compose up`, migrations, seeding, healthchecks, from a genuinely fresh state | `.github/workflows/ci.yml`, verified manually for this plan by tearing down with `-v` and rebuilding |
| Static analysis | ruff, mypy (strict), eslint, tsc --noEmit | Type safety and lint-level correctness before a test is even run | CI `python`/`web` jobs |
| Security (manual + automated) | Gitleaks (CI), targeted code review against `docs/security.md`'s threat model | Secret leakage, and spot-checking that documented controls actually exist in code | CI `secrets` job; manual review for this plan |

**Why this mix:** unit tests are fast and pin down individual logic
(especially the scope validator and the run state-machine's legal-transition
table, which are the two components this project treats as its actual
security boundary). Integration tests catch the FastAPI-wiring class of bug
(dependency injection, auth middleware ordering) that a pure unit test can't
see. E2E is the only level that catches deployment-path bugs — and this
plan's most significant finding this cycle (BUG-001) was exactly that kind
of bug: every lower test level was green while the actual `docker compose
up` path was completely broken.

## 4. Supported Environments

| Environment | Status |
|---|---|
| Linux + Docker Compose v2 (the only environment this has been tested against) | **Primary / verified** |
| macOS + Docker Desktop | **Not verified** — no known blocker, not tested this cycle |
| Windows (WSL2 + Docker Desktop) | **Not verified** |
| Browsers (E2E) | Chromium only (Playwright default project). Firefox/WebKit are not currently run — a real, disclosed gap, not a hidden one. |
| Node | 22.x (pinned in CI) |
| Python | 3.11+ (pinned in CI) |

## 5. Functional Testing

Organized by the domain lifecycle the product itself is built around:

1. **Auth** — register, login, logout, session persistence, CSRF
   enforcement, rate limiting, account-enumeration resistance.
2. **Authorization / RBAC** — role-gated endpoints, ownership isolation
   (a user cannot read/write another user's project via a guessed ID).
3. **Projects & engagements** — CRUD, authorization-basis requirement.
4. **Scope** — include/exclude rule creation, the 8-point default-deny
   validator, SSRF/metadata/loopback denial (`target_safety.py`).
5. **Runs** — the 10-state state machine, legal-transition enforcement,
   illegal-transition rejection.
6. **Approvals** — the human gate before execution, self-approval
   justification requirement.
7. **Worker execution** — Redis hand-off, authenticated callback API,
   per-step scope re-validation, mock-provider determinism.
8. **Evidence** — upload, SHA-256 integrity, size cap, magic-byte
   validation, filename sanitization.
9. **Findings & reports** — verification lifecycle, Markdown/HTML/JSON
   export correctness.
10. **Audit log** — every state-changing action above produces a
    corresponding, readable audit event.

See `TEST_CASES.md` for the representative case-by-case breakdown.

## 6. Accessibility Testing

**Current state, stated plainly:** this is a real gap. A repo-wide search
found `aria-*` attributes in exactly one frontend file. No automated
accessibility tooling (axe-core, Playwright's accessibility snapshot
assertions) is wired in yet. Manual testing performed for this plan was
limited to keyboard-navigation spot checks on the sign-in and run-approval
flows (both are operable via keyboard) and a color-contrast eyeball check
against the dark "operations" theme (no automated contrast ratio
measurement was performed).

**Planned, not yet done:** wire `@axe-core/playwright` into the existing
E2E suite as a smoke assertion on the three or four highest-traffic pages
(dashboard, run detail, approvals) before claiming "accessible UI" as a
completed capability.

## 7. Performance Testing

No automated load/performance testing exists. For this project's actual
scale (a single-tenant demo/portfolio deployment, not a production SaaS),
that is a reasonable and disclosed limitation rather than an oversight.
Manual observation during this test cycle: the E2E suite's own timings
(each spec 1.5s–12.5s against a cold, freshly-migrated stack) are the only
performance data currently collected.

## 8. Security Testing

Performed as static code review plus local dynamic testing of this
repository only — no testing was performed against any external system.
Method: cross-reference every claim in `docs/security.md` against the
actual implementation (this is exactly the exercise that found the
docs-ahead-of-code pattern documented in `docs/mvp-gap-analysis.md` and
`docs/MVP_FINAL_AUDIT.md` on three prior occasions). Automated: Gitleaks
secret scanning runs on every CI push/PR.

## 9. Regression Testing

- Every bug fixed under this test plan gets a corresponding regression
  test in the same commit (see `BUG_REPORTS.md` for the mapping from each
  bug to its regression test).
- The full Playwright suite is treated as the regression gate for the
  user-facing journey — it is run against a **freshly rebuilt, wiped-volume**
  stack before any release claim, not just against whatever stack happens
  to already be running (this distinction is what caught BUG-001).
- CI re-runs the full suite on every push to `main` and every pull request.

## 10. Release Criteria

A release is NOT tagged unless, from a clean checkout:

- [ ] `docker compose down -v && docker compose up -d --build` brings all
      six services to `healthy`.
- [ ] `alembic upgrade head` and `python -m app.seed` succeed.
- [ ] `pytest apps/api/tests` and `pytest apps/worker/tests` are 100% green.
- [ ] `npm run lint && npm run typecheck && npm run test -- --run && npm run build`
      (in `apps/web`) are all green.
- [ ] The full Playwright suite (`npx playwright test mvp-journey`) is 6/6
      against the freshly-built stack above.
- [ ] `docker compose -f docker-compose.prod.yml config --quiet` validates
      from the repository root with no absolute-path or missing-variable
      errors.
- [ ] No new Gitleaks findings.
- [ ] Every number in the README's "Testing" section matches what the
      commands above actually printed that day.
