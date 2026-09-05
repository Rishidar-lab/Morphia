# MORPHIA Engineering Case Study — Verifiable Tool Execution

This case study covers one specific, recent, fully-attributable unit of work:
replacing "the model said a tool ran" with a real subprocess invocation whose
stdout/stderr/exit code become the evidence. It is written for a technical
hiring manager or engineer deciding whether this repository represents real
engineering judgment, not just working code.

## The Problem

Before this change, every step of a MORPHIA run — however carefully scoped and
approved — ended the same way: the worker sent a prompt to an LLM provider and
recorded whatever text came back as the step's `output_data`. That is a
legitimate way to capture an agent's *reasoning*, but it is not evidence that
any tool actually touched the target. An LLM can describe a plausible-looking
HTTP response it never made. In a platform whose entire premise is "scope
before execution, evidence before conclusions," treating a model's prose as
equivalent to a tool's output was the one place the premise didn't hold.

The fix isn't exotic — it's the same problem every AI-agent framework runs
into once you need the agent's claims to be checkable: separate what the model
*says* from what a real, versioned binary *did*, and make the second thing the
one that counts as evidence.

## Architecture

MORPHIA already had the right seams for this. A run's plan is a JSON list of
steps; each step is claimed by the worker through an authenticated callback
(`POST /api/worker/runs/{id}/claim`, `apps/api/app/routers/worker.py`), which
independently re-validates the target against the engagement's scope
(`ScopeValidator.validate_target`) before returning it. The worker has no
direct database access at all — it only ever sees what that endpoint hands it
and only ever reports back through `submit_step` / `transition_run`
(`apps/worker/app/api_client.py`). That boundary already existed for the
provider (LLM) path; the work here was adding a second, parallel execution
path through the *same* claim/scope/report pipeline, not a new unchecked one.

## The Evidence Integrity Gap

Concretely: a plan step had an `action`, a `target`, and a `prompt`. There was
no way to say "run a real tool here" — the worker's step loop
(`apps/worker/app/main.py`) only ever called `provider.invoke(messages)`. Any
step tagged as a scan or probe was, underneath, still an LLM completion. This
is the precise gap the professionalization audit and `docs/mvp-gap-analysis.md`
had already flagged in earlier passes, and it's the reason `docs/security.md`
and `docs/architecture.md` are explicit that pre-this-change, "execution"
meant a chat completion, not a scan.

## Engineering Change

The change is a `ToolAdapter` abstraction (`apps/worker/app/tools/base.py`)
mirroring the existing `ProviderAdapter` pattern: an abstract `run(target) ->
ToolResult`, where `ToolResult` carries `argv`, `exit_code`, `stdout`,
`stderr`, `duration_ms`, `timed_out`, and `truncated` — the actual, complete
record of one subprocess invocation. The first (and currently only) real
implementation is `HttpxTool` (`apps/worker/app/tools/httpx_tool.py`),
wrapping ProjectDiscovery's `httpx` binary — a read-only HTTP probe with no
redirect-following and no active/destructive checks, chosen deliberately as
the lowest-blast-radius first tool. It's invoked via
`asyncio.create_subprocess_exec` with a fixed argument vector (no shell, no
string interpolation into a command line), an absolute binary path pinned in
config (`TOOL_HTTPX_PATH`), a hard outer timeout, and output capped at 256 KB
per stream with the process killed on overflow to avoid a pipe deadlock.

A plan step now optionally carries `"tool": "httpx"`. `claim_run` passes that
field through unchanged (`apps/api/app/routers/worker.py`); the worker's step
loop branches on it (`run_tool_step` in `apps/worker/app/main.py`) and, on
success or failure, submits `output_data` tagged `"source": "tool"` — a
model-sourced step is now explicitly tagged `"source": "model"` for symmetry.
Both paths go through the identical `ScopeValidator` call at claim time; there
is no separate, less-checked route for tool execution. The binary itself is
installed in the worker image with a pinned version and a checksum verified
against the upstream release (`infra/docker/worker.Dockerfile`), and CI proves
the shipped image can actually run it against the live demo target, not just
that the Python code compiles (`.github/workflows/ci.yml`, "Tool adapter
proof").

## Verification

13 worker tests (`apps/worker/tests/test_tools_httpx.py`) — 5 deterministic
subprocess-plumbing tests against tiny fake scripts (missing binary, hard
timeout, output cap, non-zero exit, argv/version capture) plus 2 integration
tests against the *real* httpx binary and the *real* demo-target server. 2
API tests (`apps/api/tests/test_scope_enforcement.py`) prove a tool-tagged
step is still scope-checked and still refused when out of scope. CI installs
the real, checksum-verified binary for both the unit-test job and the
service-backed integration job, and a dedicated step runs it against the live
`demo-target` container through the shipped worker image. `ruff`, `ruff
format --check`, and `mypy` are clean. At the time of writing, the full
suite is 132 API + 13 worker (2 real-binary tests skip only when the binary
isn't installed on the host running them — CI always has it) + 53 frontend
unit tests, all passing, verified by running them directly rather than
assumed from a prior report.

## Engineering Tradeoffs

**Tool-specific adapter vs. a generic "run any binary" capability.** A single
`ToolAdapter.run(target)` interface with one narrow, purpose-built
implementation was chosen over a generic "execute this command" facility. The
generic version would have been less code, but it would have turned the scope
validator into the *only* thing standing between an approved plan and
arbitrary command execution. The narrow version means each new tool is its
own reviewable, testable unit.

**Correctness over a shared convention.** `ToolResult.succeeded` is a field
each adapter computes explicitly, not one derived automatically from
`exit_code == 0` — because the real httpx binary exits 0 unconditionally, even
against an unreachable target, verified by actually running it that way. The
honest fix costs a slightly awkward per-adapter contract instead of one clean
shared rule.

**No per-run sandbox, yet.** The subprocess runs inside the worker container
itself — no dedicated container or sandbox per invocation, and the worker
shares one Docker Compose network with the rest of the stack. This is
documented as a known gap in `docs/security.md` §1.5, not hidden behind a
"sandboxed" claim, because building that isolation properly (a per-run
container or gVisor/nsjail-style boundary) is real infrastructure work that
didn't belong bundled into this change.

## What I Would Improve Next

1. Formalize provenance beyond the `"source"` JSON marker — a dedicated schema
   column and API field so tool- vs. model-sourced evidence is queryable, not
   just visible if you read the JSON.
2. Per-run sandboxing for tool subprocesses (the gap above).
3. Wire a second, higher-blast-radius tool behind the same `ToolAdapter`
   interface to prove the abstraction holds under a real second case.
4. Surface the tool/model distinction in the frontend run view and in
   disclosure-report export, not just in the raw step JSON.
5. An SSRF/DNS-rebinding deny-list check specifically at tool-invocation time,
   as defense-in-depth on top of the scope validator.
