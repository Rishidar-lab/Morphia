# MORPHIA Threat Model

This document describes the threats MORPHIA is designed to resist and the controls implemented against each. It is a living document — new threat categories should be added as new features are built, not retrofitted after an incident.

MORPHIA's overriding security posture: **scope enforcement is the primary security boundary.** Every other control (auth, RBAC, evidence integrity, worker authentication) exists to protect the integrity of the scope check and the audit trail around it. A vulnerability that lets an actor bypass scope validation is treated as critical severity regardless of where in the stack it occurs.

## 1. Threat Categories and Controls

### 1.1 Cross-organization access

**Threat:** A user in Organization A reads or modifies data belonging to Organization B (projects, engagements, scope, runs, evidence, findings).

**Controls:**
- Every query that returns org-scoped data filters by the requester's organization/project membership at the query level (not filtered client-side or added as an afterthought).
- Foreign-key relationships (`project_id`, `run_id`, `engagement_id`) are validated end-to-end on write: a scope entry cannot be attached to a run in a different engagement, a run cannot be attached to a project the actor doesn't belong to.
- Session-to-user-to-org resolution happens once per request in the auth dependency (`get_current_user`) and is passed down explicitly — there is no code path that trusts an org id supplied in a request body over the one derived from the authenticated session.

### 1.2 IDOR (Insecure Direct Object Reference)

**Threat:** An authenticated user guesses or enumerates another user's resource IDs (e.g., `GET /api/v1/projects/{id}`) and accesses data they don't own.

**Controls:**
- Ownership/membership is re-checked on every single-resource fetch, not just on list endpoints. `get_project` is the reference pattern: fetch by ID, then explicitly verify `project.owner_id == user.id` (or engagement membership for shared resources) before returning data, returning `404` for missing and `403` for unauthorized-but-existing to avoid over-leaking existence where policy requires it.
- Resource identifiers are UUIDs (`String(36)`, `uuid.uuid4()`), not sequential integers — this doesn't replace authorization checks but removes trivial enumeration as an attack vector.
- The same ownership check pattern is required for every new resource type (runs, evidence, findings, reports, workflows) as they are implemented — this is a standing code-review requirement, not a per-endpoint judgment call.

### 1.3 Stored XSS in evidence

**Threat:** A malicious or compromised target returns content (HTML, JavaScript, SVG with embedded scripts) that gets captured as evidence and later rendered in the researcher's browser, executing attacker-controlled script in an authenticated session.

**Controls:**
- Evidence content is never rendered as live HTML. Text/log evidence is rendered as plain text (escaped) in the frontend; there is no "render as HTML" evidence view.
- Image evidence is served with strict `Content-Type` and `Content-Disposition: attachment` (or `inline` only for known-safe raster types) headers, and the API validates the declared content type against the actual file signature before serving — a `.svg` renamed to `.png` is rejected.
- The evidence viewer runs any structured/JSON evidence through a schema-validated renderer rather than `dangerouslySetInnerHTML` or equivalent unsanitized-HTML injection paths.
- Evidence blobs are served from a storage domain / path structure that does not share cookies or session context with the main application origin where feasible, limiting blast radius if a rendering gap is ever found.

### 1.4 Malicious file uploads

**Threat:** A user uploads a file (evidence attachment, report asset) crafted to exploit a parser, deliver malware to other users, or achieve remote code execution on the server.

**Controls:**
- File type is validated by content inspection (magic bytes / signature), not by trusting the client-supplied `Content-Type` header or file extension.
- Upload size limits are enforced at both the reverse-proxy/ASGI layer and application layer.
- Uploaded files are stored in object storage under generated keys, never written to a path derived from user-supplied filenames, and never stored inside any web-servable application directory.
- Files are never passed to a shell, an image-processing library, or a document parser without going through a hardened, sandboxed conversion step; no upload path invokes `eval`, dynamic imports, or template rendering of file contents.
- Antivirus/malware scanning hook point exists in the storage adapter for deployments that require it (e.g., ClamAV integration at the S3 write path) — deployments handling sensitive client data are expected to enable it.

### 1.5 Command injection

**Threat:** Tool execution (in `apps/worker`) that shells out to external security tools is manipulated via crafted target strings or parameters to execute arbitrary commands on the worker host.

**Controls:**
- Tool adapters invoke external binaries using argument-vector execution (`subprocess` with a list of args), never a shell string that gets interpolated (`shell=True` with string concatenation is disallowed by policy and lint rule).
- All parameters that flow into a tool invocation (target hostnames, ports, flags) are validated against strict allow-lists/regex before being placed into the argument vector — a target that fails validation never reaches the subprocess call.
- Tool adapters run with the minimum OS privileges required and, where the deployment supports it, inside a per-run container/sandbox so a compromised tool cannot pivot to the worker host itself.
- Scope validation (see `docs/architecture.md` §7) happens before the tool adapter is even invoked, so this control is defense-in-depth layered on top of authorization, not a substitute for it.

### 1.6 Prompt injection

**Threat:** Content retrieved during a run (a target's HTTP response, a file, a tool's output) contains text engineered to manipulate the AI agent into ignoring its instructions, exfiltrating data, or proposing an out-of-scope or destructive action.

**Controls:**
- The agent's proposed actions are never auto-executed. Every plan passes through `AWAITING_PLAN_APPROVAL` and intrusive/ambiguous actions pass through `AWAITING_ACTION_APPROVAL` — a human reviews the actual proposed action text before it can affect a live target, regardless of what convinced the model to propose it.
- Untrusted content (tool output, fetched pages) is passed to the model as clearly delimited data, never concatenated into the system/instruction prompt in a way that lets it masquerade as an operator instruction.
- The scope validator does not consult the model's own claims about what's in scope — scope is checked against the engagement's stored scope table, a source the model cannot influence via its output.
- Tool and provider actions available to the agent are capability-scoped per run/engagement; a prompt-injected agent cannot invoke a tool that was never granted to that run, no matter what it's convinced to attempt.

### 1.7 Provider key exposure

**Threat:** OpenAI/OpenRouter/local-model API keys leak via source control, client bundles, logs, or error messages, leading to unauthorized spend or impersonation.

**Controls:**
- Keys are read exclusively from environment variables (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc.) at process start; `.env` is git-ignored and `.env.example` contains no real values.
- Keys never reach the frontend bundle — all provider calls are made server-side (API/worker), and no endpoint echoes a configured key back to a client.
- Structured logging redacts known secret-shaped fields; provider client errors are caught and re-raised with the key stripped before they reach application logs or client-facing error responses.
- Provider credentials are not persisted in the database; per-run provider *selection* (which provider/model) is stored, but not the secret itself.

### 1.8 SSRF (Server-Side Request Forgery)

**Threat:** A run or tool configuration causes the API or worker to make outbound requests to internal infrastructure (cloud metadata endpoints, internal admin panels, other internal services) instead of, or in addition to, the intended external target.

**Controls:**
- Scope entries and any user-supplied URL/hostname used in a server-initiated request are validated against a deny-list of private/link-local/loopback ranges (RFC 1918, `169.254.169.254`, `::1`, etc.) before any request is made, both at scope-entry creation time and again at execution time.
- DNS resolution results are checked, not just the literal hostname string, to prevent DNS-rebinding-style bypasses (a hostname that resolves to a public IP at validation time but an internal IP at request time).
- Redirects followed during tool execution are re-validated against the same deny-list at each hop rather than trusted blindly.
- Outbound requests from the worker to targets are made from network contexts (e.g., isolated egress, dedicated worker network segment) that cannot reach the platform's own internal services, providing a network-layer backstop to the application-layer checks.

### 1.9 Webhook forgery

**Threat:** An attacker sends forged callback/webhook requests (e.g., a fake "step completed" or "provider usage" callback) to influence run state or cost accounting without having actually performed the work.

**Controls:**
- Worker-to-API callbacks are authenticated via `WORKER_AUTH_SECRET` (a shared secret distinct from user session tokens), checked on every callback endpoint, with rate limiting via `WORKER_AUTH_RATE_LIMIT`.
- Any future outbound webhooks (e.g., to a bug-bounty program's notification endpoint) will be signed (HMAC over the payload with a per-integration secret) and verified on receipt for inbound webhook consumption, with timestamp checks to reject stale/replayed payloads.
- Callback payloads are validated against the run/step they claim to belong to — a callback for a step that isn't currently in an executable state (e.g., a `COMPLETED` step receiving a new "in progress" callback) is rejected and logged as an anomaly.

### 1.10 Worker impersonation

**Threat:** An attacker who obtains network access to the API attempts to act as a worker — submitting fabricated step results, evidence, or approval requests without having gone through actual scope-checked execution.

**Controls:**
- Worker identity is a distinct authentication mechanism (`WORKER_AUTH_SECRET`), not a user session; it is never issued to browser clients and never stored in a cookie.
- Worker-authenticated requests are restricted, by role (see the **Worker** role in `docs/architecture.md` §5), to a narrow set of callback endpoints — a worker credential cannot list users, change roles, or read unrelated runs even if leaked.
- The worker secret should be rotated on any suspected compromise; the API supports validating against a currently-configured secret so rotation doesn't require a schema change (operationally, a short dual-valid window during rotation is recommended).
- All worker-authenticated writes are attributed in `run_events`/audit records to the worker identity, distinct from any human actor id, so a compromised worker's activity is distinguishable in review.

### 1.11 Replay attacks

**Threat:** A captured request (login, step-completion callback, approval decision) is resent later to duplicate an effect — e.g., re-submitting an old "approved" decision, or replaying a step-completion to double-count cost or duplicate evidence.

**Controls:**
- `RunStep.idempotency_key` is unique-constrained; a replayed step-completion callback with the same key is rejected as a duplicate rather than processed twice.
- Session tokens and CSRF tokens are opaque, single-purpose, and expire (`SESSION_LIFETIME_HOURS`); logout revokes the session server-side so a captured cookie stops working immediately after logout rather than remaining valid until natural expiry.
- Approval decisions are recorded with a `decided_at` timestamp and a status transition (`pending → approved/rejected`); once decided, the approval request is immutable, so replaying an old "approve" call against an already-decided (or superseded) approval request is a no-op rejected by a state check, not a re-application of the decision.
- State-changing endpoints validate the current state before applying a transition (the run state machine itself is the general-purpose replay defense for run lifecycle actions — see `docs/architecture.md` §6).

### 1.12 Privilege escalation

**Threat:** A lower-privileged user (Researcher, Reviewer, Auditor) manipulates a request to grant themselves or another account elevated permissions (Administrator/Owner), or a Worker credential is used to perform user-level actions.

**Controls:**
- Role is never accepted as client-supplied input on any endpoint a non-privileged user can call — role changes are exposed only via an Administrator/Owner-gated endpoint, and that endpoint itself checks the *caller's* role server-side before applying the change (never the caller's self-reported claim).
- New registrations are hard-coded to the least-privileged role (`researcher`) at creation time in `register()` — there is no request field that lets a self-registering user set their own role.
- No self-approval: the actor who created/owns a run is blocked from approving that same run's plan or action approval requests, regardless of their role, closing the "Administrator approves their own risky action" gap.
- Role checks are centralized in dependency functions rather than duplicated ad hoc per endpoint, reducing the chance that a new endpoint is added without the check.

## 2. Scope Enforcement as the Primary Security Boundary

Scope validation (the 8-point check in `docs/architecture.md` §7) is treated as the single most important control in the system because it is the boundary between "research platform" and "unauthorized attack tool." Consequently:

- It is checked **twice**, independently, by two different processes (API at enqueue, worker at execution) — a bypass requires compromising both checkpoints, not one.
- It consults **live, authoritative data** (the engagement/scope tables in PostgreSQL) — never cached decisions, never claims embedded in agent-generated plans or model output.
- Every rejection is logged as a `RunEvent` with the specific failing check, so scope-check failures are auditable and cannot be silently swallowed.
- Any code change that touches the scope validator requires explicit security review; it is the one component in the codebase held to a stricter review bar than ordinary feature code.

## 3. Auth Hardening

See `docs/architecture.md` §4 for the full description. Summary of the security-relevant properties:

- **Argon2id** password hashing with tunable cost parameters (`ARGON2_TIME_COST`, `ARGON2_MEMORY_COST`), resistant to GPU/ASIC cracking better than bcrypt/PBKDF2 at equivalent settings.
- **Server-side sessions** in PostgreSQL — opaque tokens with no embedded claims, individually revocable, with explicit expiry checked on every request.
- **CSRF tokens** issued per-session and required on state-changing requests, protecting the cookie-based session against cross-site request forgery.
- **Rate limiting** on authentication endpoints (`AUTH_RATE_LIMIT`) to blunt brute force and credential stuffing, and on worker callbacks (`WORKER_AUTH_RATE_LIMIT`) to blunt callback-flooding.
- **Generic error responses** on login failure to prevent account enumeration.
- **Secure cookie flags**: `HttpOnly` (no JS access), `Secure` in production (HTTPS only), `SameSite=Lax` (baseline CSRF mitigation in addition to explicit CSRF tokens).

## 4. Evidence Safety

See `docs/architecture.md` §8 for the full evidence-system description. Security-relevant properties:

- **Safe rendering only.** No evidence viewer executes scripts from evidence content; text is escaped, HTML is never interpreted as markup, and structured content goes through schema-validated renderers.
- **No script execution.** Evidence is data, never code — there is no feature that "runs" or "previews" evidence content in a way that would execute it (no live HTML preview, no macro-enabled document preview).
- **SHA-256 verification.** Every artifact's hash is checked on read as well as on write; a mismatch is surfaced as a tamper warning rather than silently served.
- **Content-type enforcement.** Declared and actual content types are cross-checked before serving, and download responses use headers that prevent browser content-type sniffing from upgrading a benign-looking file into an executable context.

## 5. Worker Security

- **Authenticated communication.** All worker-to-API traffic is authenticated with `WORKER_AUTH_SECRET`; the API never accepts an unauthenticated write to run/evidence state.
- **Signed credentials.** Where the worker needs to prove which run/step it is reporting on, callback payloads are tied to the run/step's idempotency key, preventing a worker instance from reporting results for work it wasn't dispatched.
- **Scope validation at execution time.** The worker re-validates scope immediately before executing any tool call, independent of the API's earlier check (see §2), so a scope or engagement-status change that occurs while a job sits in the queue is caught before execution.
- **Least privilege.** Worker OS-level processes run with the minimum privileges needed to execute tool adapters and communicate with the API and storage — no direct database access, no direct access to user session data.

## 6. Secrets Management

- **Environment-only.** All secrets (`SECRET_KEY`, `WORKER_AUTH_SECRET`, database credentials, provider API keys, storage credentials) are supplied exclusively via environment variables, documented (with placeholder values) in `.env.example`.
- **Never in source control.** `.env` is git-ignored; `.env.example` contains no real credentials, only descriptive placeholders (e.g., `change-me-to-a-random-64-char-string`).
- **Never in client bundles.** The frontend build never embeds a secret — any value that must reach the browser is a public, non-secret configuration value (e.g., `FRONTEND_URL` is used server-side for CORS, not shipped to the client).
- **Never in logs.** Structured logging is configured to redact known secret-shaped keys and to avoid logging full request/response bodies on authentication and provider-call code paths.
- **Rotation-friendly.** Secrets are referenced by name from configuration (`app.core.config`), not hard-coded, so rotating a secret is an environment change and a restart, not a code change.
