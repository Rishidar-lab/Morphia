# MORPHIA — Job Application Snippets

Reusable material for applications, profiles, and interviews. Everything here
is grounded in the repository as of `feat/real-tool-adapter` (PR #5) — the
real, subprocess-backed tool execution described in
`docs/portfolio-case-study.md`. Nothing below claims a user base, production
deployment, or benchmark result the repo doesn't demonstrate.

---

## A. One-line CV bullet

> Built MORPHIA, a human-in-the-loop security-research orchestration platform
> (FastAPI, React, PostgreSQL, Redis) with server-enforced scope validation
> and real, subprocess-verified tool execution as evidence.

## B. Two-line CV version

> Designed and built MORPHIA, a self-hostable orchestration platform for
> authorized security research: a 10-state run machine with human approval
> gates, an 8-point default-deny scope validator enforced independently by
> both the API and a database-less worker, and real tool execution (not just
> LLM output) captured as SHA-256-integrity, audit-logged evidence — fully
> covered by unit, integration, and live-Playwright CI.

## C. Four-bullet technical CV version

- Designed and built MORPHIA (FastAPI + async SQLAlchemy, Redis-queued Python
  worker, React 19/TS SPA, Docker Compose): a 10-state run machine with
  explicit human-approval gates before any execution.
- Made scope enforcement the primary security boundary — an 8-point
  default-deny validator checked independently by the API at approval time
  and by a database-less worker at execution time — proved with
  service-backed integration tests and a live Playwright suite in CI.
- Built a `ToolAdapter` abstraction that replaced LLM-described tool output
  with real subprocess execution (argv/stdout/stderr/exit code captured under
  a hard timeout and output cap); found and fixed three real integration bugs
  (an always-exit-0 CLI, a stderr-only version banner, a PATH-shadowing
  dependency) by running the real binary, not by assumption.
- Shipped SHA-256 evidence integrity, a 10-state finding-verification
  lifecycle, HackerOne-style report export (Markdown/HTML/JSON), an
  append-only audit trail, and a CI pipeline covering Python/frontend
  quality, Docker builds, a service-backed integration job, and Playwright
  E2E against a freshly built stack.

## D. GitHub repository description

Current live description (under 160 characters, factually accurate):

> Human-in-the-loop orchestration for authorized security research — scoped
> engagements, auditable execution, evidence integrity, and disclosure-ready
> reports.

## E. LinkedIn project description

**MORPHIA — Human-in-the-loop orchestration for authorized security research**

A self-hostable platform for running bug-bounty and disclosure work with
authorization boundaries built in, not bolted on. Researchers define scoped
engagements; runs move through a state machine that *pauses for human
approval* before anything executes; scope is re-validated independently by
both the API and a database-less worker; a step's evidence can now be a real
tool's captured stdout/stderr/exit code, not only a model's description of
one; evidence is hash-verified; verified findings become disclosure-ready
reports. Stack: FastAPI, PostgreSQL, Redis, a pluggable provider/tool worker,
and a React 19 SPA, orchestrated with Docker Compose. The end-to-end journey —
including the scope-denial path — is verified against a live stack by
integration tests and a Playwright browser suite, and runs in CI. MVP / alpha.

## F. 30-second interview explanation

"MORPHIA is an orchestration platform for authorized security research —
think bug-bounty or disclosure work, but with the discipline a careful team
actually uses built into the software instead of left to process. Every
target has to clear an explicit scope check before anything runs, a human has
to approve the plan, and the evidence a step produces is either a real tool's
actual output or a clearly-labeled model response — never one pretending to
be the other. It's FastAPI, Postgres, Redis, and a React frontend, and the
whole journey, including the scope-denial path, is covered by CI running
against a live Docker stack."

## G. 90-second interview explanation

"MORPHIA orchestrates authorized security research — scoped engagements,
human-approved runs, and evidence that can actually be trusted. The
architecture is a FastAPI API backed by Postgres, a Redis queue, and a Python
worker that has no direct database access at all — it only talks to the API
through an authenticated callback surface, so a compromised or buggy worker
can't forge run state. A run moves through a 10-state machine with a
server-side legal-transition table; it pauses at `AWAITING_PLAN_APPROVAL`
until a human signs off, and scope is checked twice — once by the API at
approval time, again by the worker immediately before execution — against
live data, never against anything the plan itself claims.

The most recent piece of work closes a gap that existed since the first
version: a run step's evidence was always whatever an LLM said happened, even
for steps meant to represent a real scan. I built a `ToolAdapter` abstraction
that lets a plan step run a real binary — currently ProjectDiscovery's httpx —
and captures its actual argv, stdout, stderr, and exit code as the evidence,
going through the exact same scope-validation path as every other step. That
work turned up three real bugs I only found by running the real tool: it
prints its version to stderr, not stdout; it exits 0 even when it observed
nothing, so 'succeeded' can't be exit-code-derived; and a naive timeout equal
to the tool's own timeout could kill a probe that was about to finish. None of
that shows up if you only read the tool's --help text."

## H. "What was the hardest technical problem you solved?"

"Integrating a real external tool honestly, not the state machine — the state
machine is mechanical once you draw the transition table. Wiring in
ProjectDiscovery's `httpx` binary as the worker's first real `ToolAdapter`
looked like a subprocess call, but three things only showed up by actually
running the binary against real targets: it writes its version banner to
stderr, not stdout, so a naive parser reports 'unknown' forever; it exits `0`
unconditionally, even against an unreachable host with zero output, so
`ToolResult.succeeded` couldn't be `exit_code == 0` — I made it a field each
adapter computes explicitly instead of a shared convention; and giving the
subprocess a hard timeout equal to the tool's own `-timeout` flag actually
killed a probe that was about to finish successfully, because the tool needs
headroom to exit cleanly after its own timeout fires. Each of those is a
one-line fix once you know about it, and none of them would have been caught
by reading documentation or by a mocked test — only by running the real
binary and checking what actually came back."

## I. "What did you personally build?"

"The most recent, cleanly-scoped unit is the real tool-execution path: the
`ToolAdapter` abstract base and `ToolResult` dataclass
(`apps/worker/app/tools/base.py`), the `HttpxTool` implementation wrapping
ProjectDiscovery's httpx binary with a hard timeout and a 256 KB output cap
per stream (`apps/worker/app/tools/httpx_tool.py`), the wiring through the
worker's step loop and the API's claim endpoint so a tool-tagged step goes
through the identical scope-validation path as an LLM-backed one
(`apps/worker/app/main.py`, `apps/api/app/routers/worker.py`), a
checksum-verified binary install in the worker's Docker image, 13 worker
tests and 2 additional API tests, and a CI step that proves the *shipped
image* can run the real binary against a live target — not just that the code
imports cleanly."

## J. "What would you improve next?"

- Formalize tool-vs-model provenance as a real schema field and UI treatment,
  not just a `"source"` marker inside a JSON blob.
- Add per-run sandboxing for tool subprocesses — today they run inside the
  worker container itself, which is a disclosed, known gap.
- Wire a second tool behind the same `ToolAdapter` interface to prove the
  abstraction holds under a real second case, not just one.
- Wire the worker's existing heartbeat key into an actual dead-run detector —
  today a crashed worker leaves a run stuck with no automatic recovery.
- Enforce approver ≠ run creator server-side instead of the current
  written-justification compensating control.

## K. Skills demonstrated

Python · FastAPI · PostgreSQL · Redis · React · Docker / Docker Compose ·
CI/CD (GitHub Actions) · pytest · REST API design · asynchronous
Redis-queue workers · security architecture (defense-in-depth scope
validation, least-privilege worker credentials) · evidence-integrity design
(SHA-256) · controlled subprocess execution (argument-vector exec, timeouts,
output capping — not full per-run sandboxing, which is a disclosed gap, not a
claimed one) · automated testing across unit/integration/E2E layers
(pytest, Vitest, Playwright).
