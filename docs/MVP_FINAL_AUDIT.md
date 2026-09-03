# MORPHIA MVP Final Audit

**Date:** 2026-09-03 (UTC)
**Branch:** `release/morphia-hosted-mvp` (branched from `feat/operations-intelligence-v2`)
**Commit SHA:** `82c593c2bfc629be07e4b6e297c785e9f4dbb29d`
**Auditor method:** code inspection + live `docker compose` stack (Postgres 16, Redis 7, api, worker, web, demo-target) + full test runs. No claims without runtime evidence.

## Baseline test status (pre-change, verified this pass)

| Gate | Result |
|---|---|
| API tests | **60 passed** |
| Worker tests | **8 passed** |
| Frontend tests | **52 passed / 14 files** (docs said 37 — stale count) |
| Frontend lint / typecheck / prod build | **PASS** |
| Backend ruff lint + format | **PASS** |
| mypy strict | **PASS — 37 files, zero issues** (repo `.mypy_cache` is root-owned; run with `MYPY_CACHE_DIR=/tmp/...`) |
| `docker compose config` / stack health | **PASS — all 6 services healthy** |
| `alembic upgrade head` from current DB | **PASS** |
| `python -m app.seed` | **PASS** (idempotent) |
| `demo.sh --journey` CASE A (in-scope `demo-target`) | **PASS — run COMPLETED** |
| `demo.sh --journey` CASE B (out-of-scope `production.example.com`) | **PASS — run FAILED with reason recorded** |

Docs claiming "4 live Playwright tests" are stale in count only — suite now covers the journey; will re-run live in the test phase.

## Architecture (actual)

Browser → React 19 SPA (`apps/web`, Vite, Tailwind 4, TanStack Query) → FastAPI (`apps/api`, session cookie + CSRF double-submit) → PostgreSQL 16 (system of record) + Redis 7 (queue `morphia:jobs`) → Python worker (`apps/worker`, `X-Worker-Auth` callbacks) → provider adapters (mock/OpenAI-compatible/OpenRouter/local). Evidence blobs: local FS dev / S3 prod abstraction. Single Alembic head (`9c7c1bf0c5c7`), 18 tables. Run state machine: 10 states, legal-transition table, approval gates. Scope checked twice (API at approve, worker at claim).

## Features actually working (exercised live)

Register/login/logout/me, Argon2id, server-side sessions, CSRF, auth rate limiting, RBAC + ownership isolation, projects, engagements, scope include/exclude, default-deny validator, run state machine, plan approval, Redis queueing, authenticated worker callbacks, mock provider execution, evidence upload + SHA-256, evidence verification lifecycle, findings lifecycle + verification, reports MD/HTML/JSON, audit log + viewer, dashboard summary, synthetic demo target, `demo.sh` full journey + scope proof.

## Broken / fake / incomplete (gap matrix → this release)

| # | Gap | Severity | Plan |
|---|---|---|---|
| G1 | Self-approval NOT enforced (`approve_run`/`reject_run` allow `created_by == decider`; `docs/security.md` §1.12 claims it as control = stale doc) | P0 | Enforce 403 + tests + docs correction |
| G2 | Scope validator has no SSRF/DNS safety: IP literals in loopback/link-local/unspecified/reserved/multicast pass; cloud-metadata hostnames pass; no DNS-resolution check (`docs/security.md` §1.8 = intent, not code) | P0 | Deny unsafe literals + metadata hostnames at validation AND scope-rule creation; DNS-resolve-and-check hostnames with fail-closed on resolution failure for literal-IP-shaped input; document RFC1918 stance (allowed: demo runs on private docker net; backstop = deployment egress) + tests |
| G3 | Evidence upload trusts client: no size limit, no content-type/magic-byte check, weak filename sanitization (`/` `\` only), no traversal hardening beyond that (`docs/security.md` §1.4 = intent) | P0 | Size cap (env, default 10 MiB, 413), allowlisted content handling, magic-byte sniffing + mismatch rejection, strict filename sanitize + tests |
| G4 | No production secret validation: `SECRET_KEY`/`WORKER_AUTH_SECRET` placeholders accepted in any env; `config.py` has no fail-closed check | P0 | `model_validator`: production refuses placeholder/short secrets; warn in dev + tests |
| G5 | No security headers: no CSP, X-Content-Type-Options, Referrer-Policy, frame denial, HSTS (`main.py`) | P0 | Headers middleware + tests |
| G6 | Settings page is fake UI: saves to `/api/v1/settings/*` which does not exist (always errors); provider defaults mention Anthropic which is not a configured provider | P1 | Replace with real System Status page backed by new `GET /api/v1/system/status` (env, version, provider name only, storage backend, db/redis/worker/migration health). No secrets. |
| G7 | Sidebar not responsive: fixed 224px rail squeezes on mobile; no drawer/hamburger | P1 | Responsive nav (drawer under `md:`) |
| G8 | `infra/deployment/` empty; dev compose has bind mounts, `DEBUG=true`, dev creds, Postgres/Redis published, no TLS, no resource limits | P0 | Add `docker-compose.prod.yml` + Caddy reverse-proxy service, no bind mounts, prod builds, secrets via env file, internal-only db/redis/worker, healthchecks, restart policies, migration strategy |
| G9 | No per-run provider selection (process-global `MORPHIA_PROVIDER`); README already documents as limitation | P3 | Keep documented, no change |
| G10 | Worker executes LLM step, not real tooling; README already documents | P3 | Keep documented, no change |
| G11 | Agents/Workflows pages are reference-only | OK | Already clearly labelled informational (mission §17-B compliant); keep |
| G12 | Frontend test count / Playwright count in docs stale | P3 | Update during docs phase with fresh numbers |

## Security deficiencies (beyond G1–G5)

- `docs/security.md` §1.12 (no self-approval) and §1.8/§1.4 describe unimplemented controls as implemented. Fix code (G1–G3), then reword docs to match runtime truth.
- `verify_evidence` correctly gates on reviewer/owner/admin roles. Ownership checks present on all sampled routers. Worker callbacks HMAC-compared. Login errors generic. No secrets in logs sampled. Report HTML escaping present (spot-check in test phase).

## Deployment deficiencies

- No prod compose, no reverse proxy, no TLS path, no secret-generation story, no persistence guarantees documented. Host: this machine (public IP `110.226.113.9`, Tailscale `cypherdome` 100.125.204.16); no cloud CLIs authenticated. Path: production compose + Caddy on this host; public HTTPS via Cloudflare quick-tunnel if available, else Tailscale Serve (TLS, tailnet-scoped) — decide in deploy phase, verify with smoke tests.

## UX deficiencies

- G6 (fake settings), G7 (mobile nav) are the sharp edges. Core journey pages (Operations, Dashboard, RunDetail, Approvals, Evidence, Findings, Reports, Audit) are already the v0.2 operations-intelligence redesign — dark, dense, coherent. Polish, don't rebuild.
