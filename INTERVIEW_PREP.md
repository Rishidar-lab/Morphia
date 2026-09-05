# MORPHIA — Interview Preparation

Realistic questions an interviewer might ask about this specific project,
with answers grounded in what the code actually does — not aspirational
architecture. Cross-references point at the real file/doc so you can pull
it up live if asked to show, not just tell.

---

**1. Why FastAPI + React instead of a single framework (e.g. Django, Next.js)?**

The API and the worker are separate processes on purpose — the worker
needs to run independently of request/response cycles and never touch the
database directly (see Q7). A single monolithic framework makes that split
awkward. FastAPI's async support and Pydantic validation fit the
request/response API layer; a separate SPA keeps the frontend decoupled
enough that the same API could serve a different client later. It's a
reasonable choice for this shape of problem, not a "best practice" claim —
a Django + DRF stack would have worked too.

**2. How does authentication work end to end?**

Argon2id-hashed passwords, server-side opaque sessions stored in
PostgreSQL (not JWT — a session can be revoked immediately by deleting the
row, which a JWT can't do without a blocklist). Login sets an `HttpOnly`,
`SameSite=Lax` cookie containing the opaque session id and returns a CSRF
token in the response body. Every subsequent mutating request must include
that token in an `X-CSRF-Token` header — the double-submit pattern. See
`apps/api/app/routers/auth.py` and `apps/api/app/middleware/csrf.py`.

**3. Why sessions instead of JWT?**

Immediate revocation (logout actually invalidates the session server-side,
not just client-side), and no need to embed claims that go stale — role
changes take effect on the next request, not after token expiry. The
tradeoff is a database read per authenticated request, which is fine at
this scale and would need a cache layer at much higher scale.

**4. Walk me through debugging a failed API request in this stack.**

Concretely, this is what I did for BUG-001: `curl` the endpoint directly
to separate "the browser is wrong" from "the server is wrong." Here it was
neither — `curl localhost:5173` got connection-reset before the request
even reached application code, which pointed at the transport/container
layer, not the app. From there: `docker compose ps` to check container
health, `docker logs <container>` to see what the process actually bound
to, then `docker exec <container> cat /proc/net/tcp` to check what port
was actually listening. That's the general method — narrow down which
layer (network → container → process → application code) actually owns
the failure before reading application logic.

**5. What's the difference between your unit, integration, and E2E tests?**

Unit (pytest/Vitest): a single function or component, dependencies mocked,
runs in milliseconds. Integration (`apps/api/tests/`): real FastAPI
dependency injection and a real (in-memory SQLite for speed, or real
Postgres in CI) database schema — this is the layer that catches "the auth
middleware runs in the wrong order" bugs a unit test can't see because it
mocks that middleware away. E2E (Playwright): a real browser driving the
real built frontend against a real `docker compose` stack with real
Postgres/Redis/worker — the only layer that catches deployment-path bugs,
which is exactly what BUG-001 was: every unit and integration test was
green because they never touch Docker networking at all.

**6. How would you investigate a production failure you can't reproduce locally?**

Start with what's actually observable: container health status, logs, and
(for this project specifically) the audit log, since every state-changing
action writes one — a failure usually leaves a trace there even if the
error message itself is generic. If it's a "someone tried something and it
silently failed" report, check the run's `run_events` timeline first;
MORPHIA's design deliberately makes every rejection (scope denial, illegal
transition, CSRF failure) an explicit, queryable event rather than a
swallowed exception, specifically so this kind of investigation doesn't
require SSH access to grep application logs.

**7. Why does the worker not have direct database access?**

Least privilege and a smaller blast radius: if the worker process (which
executes an LLM step against a target) is ever compromised or buggy, it
can only reach the API through a narrow, HMAC-authenticated callback
surface (`claim` / `steps` / `transition`), not arbitrary SQL. It also
means the worker's failure modes are visible in the audit trail with its
own distinct actor id (`worker:worker-1`), separately from any human
actor.

**8. How are database migrations handled?**

Alembic, single linear history (`apps/api/migrations/versions/`, currently
one head, `9c7c1bf0c5c7`). In production, migrations run as a dedicated
one-shot Compose service (`migrate` in `docker-compose.prod.yml`) with
`restart: "no"`, and the API/worker services declare
`depends_on: migrate: condition: service_completed_successfully` — so the
API literally cannot start against an unmigrated schema. One bug this
project's earlier history hit and fixed: `alembic upgrade head` failed
from a clean checkout because `migrations/env.py` imported the app package
in a way that assumed an editable install; fixed by anchoring `sys.path`
on the env file's own location (`docs/mvp-gap-analysis.md` §1).

**9. What security risks did you consider, and what did you deliberately not fix?**

Considered and implemented: IDOR (ownership re-checked on every
single-resource fetch, not just lists), CSRF, SSRF/cloud-metadata access
(`apps/api/app/services/target_safety.py`), privilege escalation (role is
never client-suppliable), replay (idempotency keys on worker callbacks).
Deliberately not hard-blocked, and stated as such: self-approval — for a
single-owner MVP, blocking it entirely would deadlock every approval, so
a mandatory written-justification-plus-audit-flag is used as a
compensating control instead (`docs/security.md` §1.12). That's a
judgment call under a real constraint, not an oversight — and it's exactly
the sentence I'd say in an interview instead of pretending it's blocked.

**10. How does scope enforcement actually work, and why check it twice?**

An 8-point default-deny validator checks the target against the
engagement's stored scope rules. It runs at two independent points: once
by the API when a run is approved, and again by the worker immediately
before it executes each step — against live database state both times,
never against anything the run's own plan claims. Checking twice means a
bypass requires compromising two separate processes, not one; it also
catches a scope change that happens *while a job sits in the queue*
between approval and execution.

**11. What happens if the worker crashes mid-run?**

Today: the run stays in whatever state it was last transitioned to
(`RUNNING`, most likely) with no automatic timeout/requeue — this is a
real, disclosed gap, not a solved problem. A production-grade version
would need a heartbeat-based dead-worker detection and a requeue policy;
the current heartbeat key (`WORKER_HEARTBEAT_INTERVAL`) exists but nothing
consumes it to force a stuck run to `FAILED` yet.

**12. Why two separate Docker Compose files instead of one with profiles?**

They have fundamentally different postures, not just different values for
the same shape: dev bind-mounts source for hot reload and publishes every
port for local debugging; prod builds immutable images, keeps
db/redis/api/worker off any published port (only Caddy is internet-facing),
and fails closed on missing secrets. Compose profiles would work for minor
variation; this is closer to two different deployment models sharing some
Dockerfiles, and keeping them as separate files makes that difference
explicit instead of hidden behind a flag.

**13. Tell me about a real bug you found and fixed in this project.**

BUG-001 in `docs/qa/BUG_REPORTS.md`: a commit correctly changed the
production Dockerfile to serve a static build on port 3000 (for Caddy to
proxy to), but didn't update the dev Compose file, which still expected
port 5173. Every automated test was green because none of them exercised
`docker compose up` from a clean state — they'd been run against an
already-warm stack. I found it by doing exactly that (`docker compose
down -v && up --build`) as part of re-verifying a "should be done" claim,
watched the web container go permanently `unhealthy`, and traced it down
to `/proc/net/tcp` inside the container showing nothing bound to 5173.
Fix: split the Dockerfile into a `dev` build target and left prod's
target as the default.

**14. Tell me about a bug you *misdiagnosed* — how did you catch it?**

BUG-003, same doc. An earlier attempt diagnosed a flaky E2E test as an
async database session race and added defensive `commit()` calls to fix
it. The test kept failing after that fix. When I actually ran it, the
real cause was much simpler: the test helper waited for an engagement
named "Local Validation" to appear in a dropdown, but the specific failing
test created an engagement named "Ops Validation" — a hardcoded string in
shared test code, not a backend bug at all. I caught it by not trusting
the earlier fix's own comment and instead reading exactly what the
assertion was waiting for versus what the test actually set up. I left
the earlier defensive commit changes in place (they're harmless) but
corrected the record to say they didn't fix what they were credited with
fixing.

**15. How do your E2E tests avoid flakiness (brittle selectors, sleeps)?**

Selectors are role/text/`data-testid`-based (`getByRole`, `getByTestId`),
not CSS class or DOM-position based, so a style refactor doesn't break the
suite. There are no hardcoded `sleep`/`waitForTimeout` calls — every wait
is an assertion with a timeout (`expect(...).toBeVisible({ timeout })`) or
an explicit `page.waitForResponse()` keyed to the actual network call the
test cares about, so the test proceeds the instant the real condition is
met instead of a guessed delay.

**16. What would you do differently if you were starting over?**

Wire `packages/contracts`/`packages/shared-types` up for real from day
one — right now they're placeholder scaffolding that isn't actually
imported anywhere (confirmed by grep), which is a real "we meant to do
this and didn't" gap. I'd also add the axe-core accessibility check and
the CI-level `docker compose -f docker-compose.prod.yml config` validation
from the start, rather than discovering both gaps in a later audit pass.

**17. How does CI enforce quality, and what happens on failure?**

Six GitHub Actions jobs (`.github/workflows/ci.yml`): Python
lint/format/mypy/tests, frontend lint/typecheck/tests/build, Compose
config+build validation, a service-backed integration job (real
Postgres/Redis, runs the actual demo journey), a full Playwright E2E job
(uploads the HTML report and a recorded demo video as artifacts on every
run), and Gitleaks secret scanning. Any job failing blocks the PR — there's
no soft-fail/allow-failure step in the pipeline.

**18. Why PostgreSQL and Redis specifically, not something else?**

Postgres because the domain is genuinely relational (projects →
engagements → scope rules → runs → steps → evidence → findings, with real
foreign-key integrity requirements) and because server-side sessions need
a durable, queryable store. Redis for the job queue because the access
pattern is a simple `BRPOP` producer/consumer — no need for a heavier
message broker's delivery guarantees at this scale, and Redis is already
a reasonable dependency to have for rate limiting too.

**19. What's not tested at all right now, and why is that OK for this stage?**

Accessibility (no automated a11y assertions) and performance/load testing
— both stated plainly in `docs/qa/TEST_PLAN.md` rather than glossed over.
For a single-tenant demo/portfolio project, that's a reasonable, disclosed
tradeoff; it would not be reasonable to leave undisclosed on anything
handling real user traffic at scale.

**20. If you had one more week, what would you fix first?**

Wire the worker's heartbeat into an actual dead-run detector (Q11) — it's
the one gap where a real failure (worker crash mid-run) would leave a run
stuck with no automatic recovery path, which is a worse failure mode than
anything currently in `docs/qa/BUG_REPORTS.md` because there's no
automatic signal that it happened at all.
