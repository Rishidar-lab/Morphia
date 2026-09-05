# MORPHIA

[![CI](https://github.com/Rishidar-lab/Morphia/actions/workflows/ci.yml/badge.svg)](https://github.com/Rishidar-lab/Morphia/actions/workflows/ci.yml)

**MORPHIA is a human-governed orchestration layer for authorized security research.**

It coordinates:

**scope → plans → approvals → controlled execution → evidence → findings → reports**

with an append-only audit trail spanning the whole chain. Nothing executes merely because an agent requested it — authorization, dual scope validation, human approval, and evidence provenance are enforced server-side and made visible in the interface.

![MORPHIA Operations Canvas](docs/assets/screenshots/operations.png)

> **Status: v0.2.1 — Hosted MVP.** The end-to-end journey works against a live stack — verified from a completely fresh `docker compose down -v && up --build`, not just a warm re-run — and is covered by service-backed integration tests and a 6-spec browser E2E suite (see `docs/mvp-verification.md`). It is not production-hardened for multi-tenant use — see [Limitations](#limitations). Full release notes, including real bugs found and fixed in this pass: `docs/releases/v0.2.1-hosted-mvp.md`.

---

## What it is

MORPHIA is a platform-independent workspace for running bug-bounty and
vulnerability-disclosure work the way a careful team actually does it:

- **Projects → engagements → explicit scope.** Every engagement carries an
  authorization basis and an include/exclude scope list.
- **Runs under a state machine.** A run moves `DRAFT → PLANNING →
  AWAITING_PLAN_APPROVAL → QUEUED → RUNNING → COMPLETED` (10 states, one
  legal-transition table, enforced server-side).
- **A human approves before execution.** The run pauses at
  `AWAITING_PLAN_APPROVAL`; nothing is queued for a worker until a person
  approves it.
- **Scope is checked twice.** Once by the API when the run is approved, and
  again by the worker immediately before it executes each step — independently,
  against live data. An out-of-scope target fails the run with the reason
  recorded.
- **Evidence has integrity.** Every artifact is SHA-256 hashed at capture and
  carries provenance and a verification lifecycle.
- **Findings become reports.** A verified finding can be assembled into a
  HackerOne-style disclosure report, exportable as Markdown, HTML, or JSON.
- **Everything is audited.** Auth, scope changes, approvals, run transitions,
  evidence, findings, and reports all write to an append-only audit log.

MORPHIA is **not** an autonomous attack tool. There is no code path that reaches
a tool invocation without first clearing scope and (for the plan) a human.

## Why it exists

The first version of this was coupled to a single hosting platform's auth,
storage, and deploy primitives — which broke the core requirement that a
security team be able to self-host it on their own infrastructure. MORPHIA is
the cloud-neutral rebuild: plain Postgres rows for sessions, plain Redis for the
queue, the S3 API for blobs, 100% environment-variable config, no vendor SDK in
business logic. Full rationale in `docs/recovery-audit.md`.

## Key capabilities

| Area | State |
|---|---|
| Auth (register/login/logout/me), Argon2id, server-side sessions, CSRF, per-IP rate limiting | Implemented, tested |
| RBAC (6 roles), ownership isolation on every resource fetch | Implemented, tested |
| Projects, engagements, scope rules + 8-point default-deny scope validator | Implemented, tested |
| Run state machine (10 states, legal-transition table, approval gates) | Implemented, tested |
| Redis queue hand-off + authenticated worker-callback API (`claim` / `steps` / `transition`) | Implemented, tested |
| Worker execution via pluggable provider (mock / OpenAI / OpenRouter / local) | Implemented; mock path is the demo default |
| Real tool execution via `ToolAdapter` — a plan step's evidence is a real binary's own stdout/stderr/exit code | Implemented for one tool (`httpx`), tested |
| Evidence: SHA-256 integrity, local/S3 storage, verification lifecycle | Implemented, tested |
| Findings: 10-state lifecycle + verification records | Implemented, tested |
| Reports: draft→final, Markdown/HTML/JSON export, HackerOne-style template | Implemented, tested |
| React SPA: dashboard, projects, run detail, approvals, evidence, findings, reports, audit log | Implemented |
| Synthetic local demo target + one-command demo + scope-enforcement proof | Implemented |

## Architecture

```
Browser ── React SPA (apps/web)
   │  HTTPS / JSON / session cookie + CSRF
   ▼
FastAPI (apps/api) ──SQLAlchemy async──▶ PostgreSQL 16   (system of record)
   │                                     Storage (local FS / S3)  ── evidence blobs
   └── Redis client ──▶ Redis 7 ──BRPOP──▶ Worker (apps/worker)
                                            │  authenticated callbacks (X-Worker-Auth)
                                            └─▶ Provider adapter (mock / OpenAI-compatible)
```

Scope → validation → approval → execution → evidence → finding → report, with
the audit log spanning the whole chain. See `docs/architecture.md` and
`docs/assets/architecture.svg`.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, TanStack Query |
| API | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic |
| Database | PostgreSQL 16 |
| Queue | Redis 7 |
| Worker | Python long-running process, provider adapters |
| Storage | Local filesystem (dev) / S3-compatible (prod) |
| Testing | pytest, vitest, Playwright |

## Quick start

**Prerequisites:** Docker + Docker Compose v2, and Python 3 on the host (for
`.env` generation).

```bash
git clone https://github.com/Rishidar-lab/Morphia.git
cd Morphia
make demo          # or: ./scripts/demo.sh
```

`make demo` builds the images, starts the six services, runs migrations, seeds
the demo workspace, verifies health, and then drives one allowed run and one
out-of-scope run live to prove scope enforcement. It prints the UI URL and the
ephemeral local demo credentials at the end.

- Web UI: http://localhost:5173
- API docs: http://localhost:8000/api/docs
- Synthetic demo target: http://localhost:9000

Stop it with `make demo-down`; wipe the database and rebuild with
`make demo-reset`.

### Manual

```bash
cp .env.example .env       # then set SECRET_KEY, WORKER_AUTH_SECRET, SEED_ADMIN_PASSWORD
docker compose up -d --build
docker compose exec -w /app/apps/api api alembic upgrade head
docker compose exec api python -m app.seed
```

## Demo mode

The seeded **"Morphia Demo Research"** workspace already contains an authorized
engagement, an allowed scope, a completed run with a hash-verified evidence
artifact, a verified (clearly-synthetic) finding, and a disclosure-style report.

`./scripts/demo.sh --journey` (stack already up) drives two fresh runs through
the real API and worker:

- **CASE A** — target `demo-target` (in scope) → run **COMPLETED**
- **CASE B** — target `production.example.com` (out of scope) → run **FAILED**,
  refused by the worker's independent scope re-check, reason on the timeline

The demo target (`apps/demo-target/server.py`) is a ~90-line stdlib HTTP service
that serves fixed synthetic payloads. Nothing about the demo touches a real
external system.

For recording a walkthrough, see `docs/demo-script.md`,
`docs/demo-shot-list.md`, `docs/demo-narration.md`, and
`scripts/prepare-demo.sh`.

## Screenshots — Operations Intelligence Interface (v0.2)

| | |
|---|---|
| ![Operations Command Center](docs/assets/screenshots/operations.png) | ![Human Approval Gate](docs/assets/screenshots/approval-gate.png) |
| ![Execution Graph](docs/assets/screenshots/execution-graph.png) | ![Authorization Boundary](docs/assets/screenshots/authorization-boundary.png) |
| ![Blocked Execution](docs/assets/screenshots/blocked-execution.png) | ![Evidence Provenance](docs/assets/screenshots/evidence-provenance.png) |
| ![Finding Workspace](docs/assets/screenshots/finding-workspace.png) | ![Report](docs/assets/screenshots/reports.png) |
| ![Governance / Audit](docs/assets/screenshots/governance.png) | ![Scope](docs/assets/screenshots/scope.png) |

More in [`docs/assets/screenshots/`](docs/assets/screenshots/). Social preview: `docs/assets/screenshots/social-preview.png`.

The Operations Canvas makes the thesis visible within ~10 seconds: **scope before execution, evidence before conclusions, humans before consequential actions.**

## Verifiable tool execution

Before this, every run step's evidence was whatever an LLM said happened —
even for a step meant to represent a real scan. A model can describe a
plausible HTTP response it never actually made; on a platform whose thesis is
"evidence before conclusions," that gap mattered.

A `ToolAdapter` abstraction (`apps/worker/app/tools/base.py`) mirrors the
existing `ProviderAdapter` pattern, but for real subprocesses instead of LLM
calls. Its first implementation, `HttpxTool`
(`apps/worker/app/tools/httpx_tool.py`), wraps ProjectDiscovery's `httpx`
binary — a read-only HTTP probe, invoked by absolute path with a fixed
argument vector (no shell), under a hard timeout and a 256 KB per-stream
output cap. A plan step tagged `"tool": "httpx"` goes through the *identical*
claim-time `ScopeValidator` call as every other step
(`apps/api/app/routers/worker.py`) — there is no separate, less-checked
dispatch route for tool execution. On completion, the step's `output_data`
carries the real `argv`, `exit_code`, `stdout`, `stderr`, and duration, tagged
`"source": "tool"`; an LLM-backed step is now tagged `"source": "model"` for
symmetry. The binary itself is installed in the worker image with a pinned
version and a checksum verified against the upstream release
(`infra/docker/worker.Dockerfile`), and CI proves the *shipped image* can run
it against the live demo target (`.github/workflows/ci.yml`, "Tool adapter
proof") — not just that the Python compiles.

Getting this right surfaced three real, non-obvious bugs, found only by
running the actual binary: it writes its version banner to stderr, not
stdout; it exits `0` unconditionally even against an unreachable target with
zero output, so `ToolResult.succeeded` is a field each adapter computes
explicitly rather than one derived from the exit code; and an outer timeout
equal to the tool's own `-timeout` flag could kill a probe that was about to
finish successfully. Full writeup, including the tradeoffs behind the
tool-specific (not generic-shell-out) design:
[`docs/portfolio-case-study.md`](docs/portfolio-case-study.md).

Only `httpx` is wired today — this is one real tool, not a generic ability to
run arbitrary binaries, and tool subprocesses run inside the worker container
itself with no additional per-run sandbox yet (`docs/security.md` §1.5).

## Security boundaries

- **Authorization before execution** — every target validated against the
  engagement's stored scope, never against agent-supplied claims.
- **Scope before tools** — the 8-point check is default-deny and runs twice, in
  two processes.
- **Human approval before intrusive actions** — `AWAITING_PLAN_APPROVAL` /
  `AWAITING_ACTION_APPROVAL` are explicit states.
- **Evidence before conclusions** — a finding can't be verified without linked
  evidence; a report can't include an unverified finding.
- **Worker is least-privilege** — no database access, a distinct shared-secret
  identity, restricted to callback endpoints.

Threat model in `docs/security.md`; what is and isn't enforced in
`docs/mvp-verification.md` § Security review.

## Testing

```bash
make verify                       # ruff + ruff format + mypy + pytest (api & worker) + vitest
cd apps/web && npm run build      # production build (Tailwind compiled)
make demo && cd tests/e2e && npm test   # live Playwright MVP-journey suite
```

CI (`.github/workflows/ci.yml`) runs: Python quality, worker quality, frontend
quality + build, Docker image build, a **service-backed integration** job
(compose up → migrate → seed → live journey → scope proof), a **Playwright E2E**
job (report uploaded as an artifact), and secret scanning.

Current snapshot, as of `feat/real-tool-adapter` (PR #5), verified by running
each suite directly rather than assumed from a prior report: 132 API + 13
worker (2 of those are real-httpx-binary integration tests, skipped only on a
host without the binary installed — CI always has it) + 53 web unit tests, 6
live Playwright tests — all green, verified against a freshly built stack
with a wiped database (not just re-run against a warm one). Evidence matrix:
`docs/mvp-verification.md`. QA process docs (test plan, test cases, real bug
reports found while verifying this project): `docs/qa/`.

## Project status

**MVP / hosted-alpha** — [`v0.2.1`](docs/releases/v0.2.1-hosted-mvp.md), following
[`v0.2.0-alpha`](docs/releases/v0.2.0-alpha.md) and
[`v0.1.0-mvp`](docs/releases/v0.1.0-mvp.md). The journey in
`docs/mvp-verification.md` is fully working and verified against a live,
freshly-built stack. The full history of what was found and fixed to get
here — including bugs found while auditing this exact repository for
portfolio use — is in `docs/mvp-gap-analysis.md`, `docs/MVP_FINAL_AUDIT.md`,
and `docs/qa/BUG_REPORTS.md`.

## Limitations

- **Single-tenant demo posture.** RBAC and ownership checks are real, but there
  is no organization/tenant model and no admin UI for user/role management.
- **Self-approval is flagged, not blocked.** A single-owner MVP has no second
  approver to fall back to, so approving your own run requires a written
  justification (≥10 chars) and is permanently recorded as `self_approved: true`
  in the audit trail, rather than being prevented (`docs/security.md` §1.12).
- **Only one real tool is wired: httpx.** A plan step tagged `"tool": "httpx"`
  runs the real ProjectDiscovery `httpx` binary — its actual stdout/stderr/exit
  code/argv/version become the step's evidence, going through the same scope
  validator as every other step. An untagged step still invokes the LLM
  provider as before. Provenance isn't yet formalized beyond a `source` marker
  in the step's JSON output — a dedicated schema field, UI treatment, and
  disclosure-report distinction between tool- and model-sourced evidence
  remain unbuilt. Tool subprocesses run inside the worker container itself,
  with no additional per-run sandbox, and the worker shares one Docker Compose
  network with the rest of the stack (no dedicated egress segment yet).
- **Production deployment configuration exists** (`docker-compose.prod.yml`,
  Caddy TLS, generated secrets, prod secret validation) but has not been
  exercised against a real external host/domain — only locally.
- **Backup/restore scripts exist but are unexercised.**
- **Provider selection is process-wide**, not per-run.

## For reviewers

Three documents specifically written for someone evaluating this as a work
sample, not for end users of the product:

- [`HIRING_MANAGER_WALKTHROUGH.md`](HIRING_MANAGER_WALKTHROUGH.md) — a
  60-second technical explanation: the problem, the architecture, the
  hardest bug found while building this, and what was learned.
- [`INTERVIEW_PREP.md`](INTERVIEW_PREP.md) — 20 realistic questions about
  this specific codebase with accurate answers, including two real,
  previously-undiscovered bugs found and fixed while auditing this
  repository (not hypothetical examples).
- [`docs/qa/`](docs/qa/) — a test plan, a representative test-case catalog,
  and full bug reports (repro steps, root cause, fix, regression test) for
  every defect referenced above.
- [`docs/portfolio-case-study.md`](docs/portfolio-case-study.md) — a focused
  engineering case study on the real-tool-execution change above: the gap it
  closed, the implementation, verification, and genuine tradeoffs.
- [`docs/job-application-snippets.md`](docs/job-application-snippets.md) — CV
  bullets, interview pitches, and answers to common interview questions,
  all grounded in this repository.

## Roadmap

- Organization/tenant model + user & role management UI
- Enforce approver ≠ run creator
- SSRF deny-list + DNS-rebinding checks in the scope validator
- Content-type/magic-byte validation on evidence upload
- Per-run sandboxing for tool execution (the `httpx` adapter itself is
  implemented and tested; it runs inside the worker container today, not a
  dedicated sandbox — see [Verifiable tool execution](#verifiable-tool-execution))
- A second real tool behind the same `ToolAdapter` interface
- Production deployment manifests + a verified backup/restore drill
- Per-run / per-engagement provider selection

## License

Private. All rights reserved.
