# MORPHIA — Representative Test Cases

Companion to [`TEST_PLAN.md`](./TEST_PLAN.md). This is a representative
sample across the domain, not an exhaustive catalog — the automated suites
(`apps/api/tests/`, `apps/worker/tests/`, `apps/web/src/**/*.test.tsx`,
`tests/e2e/tests/mvp-journey.spec.ts`) are the exhaustive one, currently 130
+ 8 + 53 + 6 tests. Each case below is written the way it would be executed
manually, and is cross-referenced to the automated test that already covers
it where one exists, so the mapping between "manual test design" and "what's
actually automated" stays honest and visible.

Priority: **P1** = release-blocking if broken, **P2** = should fix before
release, **P3** = polish.

---

### TC-001 — Register with a valid email and password

- **Feature:** Authentication
- **Preconditions:** Stack is up (`docker compose up`), no existing account
  with the test email.
- **Steps:**
  1. Navigate to `/sign-in`.
  2. Click "Need an account? Register."
  3. Fill display name, a unique `@morphia.example.com` email, and a
     password meeting the minimum policy.
  4. Click "Create account."
- **Expected result:** Account is created, session cookie is set, user is
  redirected to `/operations`, and `GET /api/auth/me` resolves to the new
  account with role `researcher` (self-registration can never set a
  different role).
- **Priority:** P1
- **Automated:** `apps/api/tests/test_auth.py`; `tests/e2e/tests/mvp-journey.spec.ts::registerAndSignIn`

### TC-002 — Login with wrong password gives a generic error

- **Feature:** Authentication / account-enumeration resistance
- **Preconditions:** A registered account exists.
- **Steps:**
  1. Attempt login with the correct email and an incorrect password.
  2. Separately, attempt login with an email that has never been registered.
- **Expected result:** Both attempts return the same generic error message
  and the same status code — the response must not reveal whether the email
  exists.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_auth.py`

### TC-003 — Auth endpoints are rate-limited

- **Feature:** Authentication / abuse resistance
- **Preconditions:** `AUTH_RATE_LIMIT` at its configured value (default
  `10/minute`).
- **Steps:** Submit login requests in a tight loop past the configured
  limit from the same client.
- **Expected result:** Requests beyond the limit receive `429`, not a
  silent pass-through; the limit resets after the configured window.
- **Priority:** P2
- **Automated:** covered indirectly by rate-limiter configuration tests;
  no dedicated flood test exists yet — **gap**, see `TEST_PLAN.md` §6/§7
  spirit (recommend a load-style test here before claiming abuse resistance
  as fully verified).

### TC-004 — A mutation without a CSRF token is rejected

- **Feature:** CSRF protection
- **Preconditions:** Authenticated session (cookie present).
- **Steps:** Send `POST /api/v1/projects` with a valid session cookie but
  without the `X-CSRF-Token` header.
- **Expected result:** `403 CSRF_TOKEN_MISSING`; the project is not created.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_projects.py`

### TC-005 — A user cannot read another user's project (IDOR)

- **Feature:** Authorization / ownership isolation
- **Preconditions:** Two accounts, A and B; A owns project `P`.
- **Steps:** Authenticated as B, request `GET /api/v1/projects/{P.id}`.
- **Expected result:** `404` (not `403`, to avoid confirming the resource
  exists) for a project B has no relationship to.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_projects.py`, `test_scope_enforcement.py`

### TC-006 — Scope rule creation rejects an SSRF-shaped target

- **Feature:** Scope validation / `target_safety.py`
- **Preconditions:** An authorized engagement exists.
- **Steps:** Attempt to create a scope rule whose pattern resolves to a
  loopback address, a link-local address, or a cloud-metadata hostname
  (e.g. `169.254.169.254`).
- **Expected result:** The scope rule is rejected at creation time with a
  specific denial reason, not silently accepted.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_target_safety.py`

### TC-007 — Run against an out-of-scope target is refused and recorded

- **Feature:** Scope enforcement (the product's primary security boundary)
- **Preconditions:** An engagement with a defined allow-list scope.
- **Steps:**
  1. Create a run targeting something not in the allow-list
     (e.g. `production.example.com`).
  2. Approve the plan.
  3. Let the worker claim the run.
- **Expected result:** The worker's independent scope re-check refuses the
  target; the run transitions to `FAILED`; the specific denial reason is
  visible on the run timeline and in the audit log (`run.scope_denied`).
- **Priority:** P1
- **Automated:** `apps/api/tests/test_scope_enforcement.py`;
  `tests/e2e/tests/mvp-journey.spec.ts::"scope-denied path"`

### TC-008 — Illegal run-state transition is rejected

- **Feature:** Run state machine
- **Preconditions:** A run in `DRAFT`.
- **Steps:** Attempt to transition the run directly to `COMPLETED`
  (skipping the legal path).
- **Expected result:** `409`, run state unchanged, no audit event claiming
  a transition that didn't happen.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_run_state_machine.py`

### TC-009 — Approving your own run requires a written justification

- **Feature:** Separation of duties (documented compensating control, not a
  hard block — see `docs/security.md` §1.12)
- **Preconditions:** A run created by user A, `AWAITING_PLAN_APPROVAL`,
  approved by the same user A.
- **Steps:** As A, attempt to approve the run (a) with no justification
  text, then (b) with justification under 10 characters, then (c) with a
  proper justification.
- **Expected result:** (a) and (b) are rejected; (c) succeeds, and the
  resulting approval record and run timeline are flagged `self_approved:
  true`, distinct from a normal cross-user approval.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_approval_duties.py`

### TC-010 — Evidence upload over the size cap is rejected

- **Feature:** Evidence upload validation
- **Preconditions:** `EVIDENCE_MAX_UPLOAD_BYTES` at its default (10 MiB).
- **Steps:** Upload a file larger than the configured cap.
- **Expected result:** `413`, no partial file left on disk, no evidence
  row created.
- **Priority:** P2
- **Automated:** `apps/api/tests/test_evidence_upload.py`

### TC-011 — A renamed file is rejected on content-type mismatch

- **Feature:** Evidence upload validation (magic-byte sniffing)
- **Preconditions:** A binary file whose real signature doesn't match its
  extension (e.g. a PNG renamed to `.txt`, or vice versa).
- **Steps:** Upload the mismatched file with the extension's implied
  content type.
- **Expected result:** Upload is rejected or the server-detected type
  overrides the client-declared one — the stored `content_type` must never
  be trusted from the client alone.
- **Priority:** P2
- **Automated:** `apps/api/tests/test_evidence_upload.py`

### TC-012 — Evidence hash is verified on read, not just on write

- **Feature:** Evidence integrity
- **Preconditions:** An evidence artifact exists with a stored
  `sha256_digest`.
- **Steps:** Fetch the artifact; separately, simulate a tampered blob (test
  only) and fetch again.
- **Expected result:** A hash mismatch is surfaced as a tamper warning to
  the caller, never silently served as if verified.
- **Priority:** P2
- **Automated:** `apps/api/tests/test_evidence.py`

### TC-013 — A finding cannot be verified without linked evidence

- **Feature:** Findings lifecycle
- **Preconditions:** A `candidate` finding with no linked evidence.
- **Steps:** Attempt `POST /findings/{id}/verify`.
- **Expected result:** Rejected — a verified finding must have at least one
  linked evidence artifact, per the product's stated thesis ("evidence
  before conclusions").
- **Priority:** P1
- **Automated:** `apps/api/tests/test_findings.py`

### TC-014 — Report export renders identically across formats

- **Feature:** Reports
- **Preconditions:** A finalized report with at least one verified finding.
- **Steps:** `GET /reports/{id}/export?format=markdown`, then `...=html`,
  then `...=json`; compare the finding content across all three.
- **Expected result:** All three exports contain the same underlying
  finding data; the HTML export escapes finding content (no raw HTML/script
  injection from finding text).
- **Priority:** P2
- **Automated:** report generator tests + manual spot-check (HTML escaping
  is currently spot-checked per `docs/mvp-verification.md`, not covered by
  a dedicated XSS-payload test — **gap**, worth a dedicated
  `<script>`-in-finding-title test case).

### TC-015 — Every state-changing action produces an audit event

- **Feature:** Audit log completeness
- **Preconditions:** A fresh project.
- **Steps:** Perform one of each: create project, create engagement, add
  scope rule, create run, approve run, upload evidence, create finding,
  export report. Then load `/audit`.
- **Expected result:** Each action has a corresponding, human-readable
  audit entry, in order, attributed to the correct actor (including the
  worker's distinct actor id for its own actions).
- **Priority:** P1
- **Automated:** `tests/e2e/tests/mvp-journey.spec.ts::"dashboard and audit log reflect activity"`

### TC-016 — Unauthenticated access redirects to sign-in; unknown routes 404

- **Feature:** Route protection
- **Preconditions:** No session cookie.
- **Steps:** Navigate directly to `/dashboard`, `/projects`, `/runs`,
  `/settings`, `/operations` while logged out; separately navigate to a
  nonexistent route.
- **Expected result:** Every protected route redirects to `/sign-in`; the
  nonexistent route renders the app's 404 page, not a blank screen or a
  server error.
- **Priority:** P1
- **Automated:** `tests/e2e/tests/mvp-journey.spec.ts::"unauthenticated access..."`

### TC-017 — Sidebar collapses to a drawer under the mobile breakpoint

- **Feature:** Responsive UI
- **Preconditions:** None.
- **Steps:** Load `/operations` at a viewport under the `lg` breakpoint.
- **Expected result:** The fixed sidebar is replaced by a hamburger-toggled
  drawer with a scrim; no horizontal overflow/clipping.
- **Priority:** P2
- **Automated:** none — **manual only today**. Recommend a Playwright
  viewport-resize assertion as a follow-up.

### TC-018 — `docker compose up` from a clean, wiped state serves the UI

- **Feature:** Deployment path (this project's own history shows this is a
  real, distinct failure class — see BUG-001 in `BUG_REPORTS.md`)
- **Preconditions:** No prior containers, volumes, or images
  (`docker compose down -v`; optionally `docker image rm` the built images).
- **Steps:** `docker compose up -d --build`; poll `docker compose ps` for
  all six services to reach `healthy`.
- **Expected result:** All six services reach `healthy` within the
  healthcheck's configured retries; `curl localhost:5173` and
  `curl localhost:8000/api/ready` both return success.
- **Priority:** P1
- **Automated:** CI `compose`/`integration`/`e2e` jobs; manually re-verified
  for this test cycle on 2026-09-05 with a full volume wipe.

### TC-019 — Production Compose validates from a clean checkout

- **Feature:** Deployment path (production)
- **Preconditions:** `infra/deployment/.env` populated from
  `infra/deployment/.env.example`.
- **Steps:** From the repository root (not a special path), run
  `docker compose -f docker-compose.prod.yml config --quiet`.
- **Expected result:** Validates with no missing-variable or path-resolution
  errors, on any machine/path — not just the original author's.
- **Priority:** P1
- **Automated:** none — was previously **broken** (BUG-002); now
  manually verified, recommend adding to CI's `compose` job.

### TC-020 — System Status page shows real health, never a secret

- **Feature:** `GET /api/v1/system/status` + Settings/System page
- **Preconditions:** Authenticated session.
- **Steps:** Load the System Status page; inspect the network response.
- **Expected result:** Shows version, environment, configured provider
  name, storage backend, and health for db/redis/worker/migrations — and
  the response body contains no secret material (API keys, `SECRET_KEY`,
  `WORKER_AUTH_SECRET`) under any field name.
- **Priority:** P1
- **Automated:** `apps/api/tests/test_system_status.py`
