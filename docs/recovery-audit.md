# MORPHIA Recovery Audit

## Purpose

This document records why MORPHIA was rebuilt from a prior implementation, what was salvaged versus replaced, and the rationale behind the architectural decisions made during the rebuild. It exists so future contributors (and future us) don't re-litigate decisions already made deliberately, and so the cost of the rebuild is accounted for honestly rather than glossed over.

## 1. Previous State

The prior implementation of MORPHIA was:

- Hosted on **Replit**, using Replit's managed deployment and database tooling.
- Built as an **Express/Node.js monorepo** (single language, single runtime across frontend and backend).
- Backed by **Drizzle ORM** over **PostgreSQL**, with roughly **40 tables** modeling projects, engagements, scope, runs, evidence, findings, reports, users, and related orchestration state.
- Authenticated via **Replit Auth**, Replit's platform-native identity provider.
- Styled with an in-house design system referred to as **"Aurora"** — the product's visual identity (color system, typography, component language).
- Covered by **787 tests** across the stack (unit, integration, and behavioral coverage of the run orchestration logic in particular).
- Functionally further along than the current rebuild in absolute feature count: more endpoints, more UI surface area, more of the product built out.

This was a real, working system — not a prototype. The decision to rebuild was not "the old thing didn't work," it was "the platform it was built on and coupled to became untenable to keep building on."

## 2. Why It Was Rebuilt

Four concrete, compounding reasons drove the decision:

### 2.1 Replit billing unpredictability

Usage-based costs on Replit's platform did not scale predictably with actual product usage, making budgeting for continued development and any future production deployment difficult to reason about. A security research orchestration platform that runs long-lived worker processes and queues jobs is exactly the workload shape most exposed to this kind of unpredictable metering.

### 2.2 Platform coupling

The prior stack was coupled to Replit-specific primitives at multiple layers — most notably **Replit Auth** for identity and Replit's deployment/hosting model. This directly conflicted with a core product requirement: MORPHIA needs to be deployable in environments a security team actually trusts and controls (self-hosted, on customer infrastructure, or on a cloud vendor of the customer's choosing) — not locked to a single consumer-facing developer platform. Every Replit-specific dependency was a future migration cost being deferred, not avoided.

### 2.3 A stuck agent

Development had reached a state where the AI coding agent working on the prior codebase got stuck — unable to make forward progress on the existing implementation without extensive, high-risk surgery on deeply intertwined platform-specific code (auth, deployment config, and framework-specific patterns woven through the 40-table schema and the Express routing layer). Rather than spend an unbounded amount of time unwinding that coupling in place, the decision was made to rebuild on a foundation without the coupling in the first place.

### 2.4 Deployment cost

Beyond the billing unpredictability itself, the *operational* cost of eventually deploying the Replit-coupled system to a real production environment (for actual bug-bounty engagements, potentially handling sensitive client scope and evidence data) was judged higher than the cost of a deliberate rebuild on cloud-neutral primitives from day one.

## 3. What Was Salvaged

The rebuild is not a rewrite from a blank slate of ideas — the product thinking and domain modeling from the prior implementation carried forward directly:

| Salvaged | Detail |
|---|---|
| **Product concept** | The overall mission — orchestrating authorized security research with human oversight, scope enforcement, and evidence-backed findings — is unchanged. |
| **Domain model** | The core entities (projects, engagements, scope, runs, evidence, findings, reports, users/roles) and their relationships carried over conceptually, even though the concrete schema was rebuilt (Drizzle → SQLAlchemy/Alembic, see §4). |
| **Run state machine design** | The 10-state run lifecycle (`DRAFT` → ... → terminal states) and its approval gates (`AWAITING_PLAN_APPROVAL`, `AWAITING_ACTION_APPROVAL`) are a direct carry-forward of the state machine designed in the prior system — this logic was validated by extensive testing previously and re-implemented faithfully rather than redesigned. See `docs/architecture.md` §6 for the current canonical definition. |
| **Aurora visual identity** | The "Aurora" design language (color system, typography choices, component visual style) from the prior frontend is being carried into the new React/Tailwind frontend rather than discarded — the product's look and feel is a deliberate asset independent of the backend framework underneath it. |
| **Scope enforcement rules** | The specific rules that make up scope validation (matching targets to approved scope, respecting exclusions, engagement expiry, rules-of-engagement checks) were preserved as product/security requirements and re-implemented in the new stack — see `docs/architecture.md` §7 and `docs/security.md` §2. |

## 4. What Was Replaced

| Prior | Current | Rationale |
|---|---|---|
| **Express (Node.js)** backend | **FastAPI (Python)** backend | Removes the Node/Express-specific coupling that had accumulated; FastAPI + Pydantic v2 gives strong typed request/response validation and auto-generated API docs, and Python's ecosystem is a better fit for the security-tooling and AI-provider integration work the platform does (many security tools and ML/LLM SDKs are Python-first). |
| **Drizzle ORM** | **SQLAlchemy 2 + Alembic** | SQLAlchemy's async engine pairs naturally with FastAPI's async request handling; Alembic gives explicit, reviewable, versioned migrations as the sole path to schema change — matching the "no ad hoc schema changes" operational discipline the team wanted going forward. |
| **Replit Auth** | **Argon2id password hashing + server-side PostgreSQL sessions** | Removes the single largest platform-coupling risk. Server-side sessions with Argon2id hashing are a well-understood, portable, auditable pattern with no dependency on any specific identity vendor — see `docs/architecture.md` §4 and `docs/security.md` §3. |
| **pnpm monorepo (single-language)** | **Python/Node hybrid monorepo** (`apps/api`, `apps/worker` in Python; `apps/web` in Node/TypeScript; shared contracts in `packages/`) | Accepts a two-toolchain monorepo in exchange for using the best-fit language per component (Python for backend/orchestration/security-tool integration, TypeScript/React for the SPA). Type drift risk between the two languages is mitigated by `packages/contracts` and `packages/shared-types` acting as the explicit, versioned source of truth for cross-language contracts (e.g., the `RunState` enum). |
| **Replit-hosted deployment** | **Docker Compose / bare-metal / cloud-neutral deployment** | Directly addresses the platform-coupling and billing-unpredictability drivers behind the rebuild. See `docs/architecture.md` §10. |

Notably **not** replaced: the underlying database engine (PostgreSQL) and the general shape of using a Redis-backed queue for worker dispatch — these were sound choices in the prior system and were kept, with the ORM/migration tooling around them replaced rather than the engines themselves.

## 5. Architecture Decisions and Rationale

Beyond the direct prior-vs-current replacements above, several architecture decisions were made explicitly during the rebuild, informed by the reasons for the rebuild in the first place:

1. **Single source of truth for shared types (`packages/contracts`).** Given the move to a two-language monorepo, the team explicitly decided that the risk of frontend/backend drift (e.g., the frontend inventing a run state that doesn't exist in the backend enum) had to be designed out via a shared contracts package, rather than managed by convention or documentation alone.

2. **Scope validation checked twice, independently (API + worker).** Learning from the "stuck agent" experience — where deeply intertwined logic became hard to reason about and hard to safely change — the rebuild deliberately keeps the scope validator as a small, isolated, twice-invoked check rather than a single shared code path threaded through both processes. This trades a small amount of duplication for independent verifiability and a higher bar for accidental regression.

3. **Environment-variable-only configuration, no platform SDKs in business logic.** Every configuration value, credential, and storage backend choice is environment-driven (`.env.example`), and storage/queue/database access goes through generic drivers (`asyncpg`/SQLAlchemy, standard Redis client, S3 API) rather than any cloud-vendor-specific SDK. This is a direct, deliberate response to the platform-coupling failure mode that motivated the rebuild — the team does not want to face this same decision again in three years.

4. **Mock provider as the default in dev/test.** To avoid the rebuilt system silently re-acquiring a hard dependency on a specific AI vendor (mirroring the platform-coupling lesson from Replit Auth), the provider abstraction defaults to a deterministic mock adapter unless real provider keys are explicitly configured — the full orchestration pipeline must be exercisable with zero external dependencies.

5. **Re-implement, don't redesign, the run state machine.** Given that the 10-state machine had already been designed and validated (787 tests in the prior system exercised orchestration logic heavily), the rebuild treated this as a spec to re-implement faithfully in the new stack rather than an opportunity to redesign — reducing the risk surface of the rebuild by not combining "new framework" with "new business logic" at the same time.

6. **Aurora identity ported, not redesigned.** For the same reason — reducing simultaneous sources of risk/change during the rebuild — the visual identity was treated as a fixed target for the new Tailwind-based frontend rather than an opportunity to redesign the product's look while also rebuilding its foundation.

## 6. Status and Scope of This Rebuild

As of this writing, the rebuild has reached parity on: health/readiness endpoints, authentication (register/login/logout/me), project CRUD basics, and the run state machine core logic (validated by its own dedicated test suite, `apps/api/tests/test_run_state_machine.py`). Engagements, scope, runs execution, evidence, findings, reports, workflows, agents, and audit-log endpoints are planned in subsequent phases — see `docs/api.md` for the current versus planned endpoint inventory. The 787-test count from the prior system is a target for eventual coverage parity, not yet a current state.
