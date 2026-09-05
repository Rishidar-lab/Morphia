# MORPHIA — Bug Reports

Real defects found while verifying this project against a live stack on
2026-09-05, not manufactured examples. Each was reproduced, root-caused,
fixed, and covered by a regression test in the same work session — commits
`fb999ff` and `dafddde` on `release/morphia-hosted-mvp`. This document is
the "how I actually debug something" artifact referenced by
[`INTERVIEW_PREP.md`](../../INTERVIEW_PREP.md).

---

## BUG-001 — Dev web container unreachable after Dockerfile repurpose for production

- **Severity:** Critical (P0) — the exact command in the project's own
  README Quick Start does not produce a working application.
- **Environment:** Linux, Docker Engine 29.7.2, Docker Compose v5.5.0,
  branch `release/morphia-hosted-mvp` @ `987a0c1`.
- **Reproduction steps:**
  1. `git clone` the repository (or, as reproduced here, start from a
     clean volume state: `docker compose down -v`).
  2. `docker compose up -d --build` — exactly the command documented in
     `README.md`'s Quick Start.
  3. Wait for containers to settle; run `docker compose ps` or
     `docker inspect --format='{{.State.Health.Status}}' morphia-web-1`.
  4. `curl http://localhost:5173/`.
- **Expected result:** The web container reaches `healthy`; the curl
  returns `200` and the MORPHIA sign-in page.
- **Actual result:** The web container stayed `unhealthy` indefinitely;
  `curl` returned `Connection reset by peer`. Every Playwright E2E spec
  (`tests/e2e/tests/mvp-journey.spec.ts`) failed immediately with
  `net::ERR_CONNECTION_RESET` at the very first `page.goto("/sign-in")` —
  6 of 6 specs failed, none of them for a reason related to what they were
  actually testing.
- **Root cause:** `infra/docker/web.Dockerfile` was changed in commit
  `987a0c1` ("hosted MVP … production deploy") to build a static production
  bundle and serve it with `npx vite preview --host 0.0.0.0 --port 3000` —
  correct for `docker-compose.prod.yml`, where Caddy reverse-proxies to
  `web:3000` (confirmed in `infra/caddy/Caddyfile` line 37,
  `reverse_proxy web:3000`). But `docker-compose.yml` (the **dev** Compose
  file, sharing the same Dockerfile) still published host port `5173:5173`,
  health-checked container port `5173`, and bind-mounted `./apps/web:/app`
  expecting the previous `vite dev` hot-reload server. Nothing inside the
  container listened on 5173 — confirmed via `docker exec ... cat
  /proc/net/tcp`, which showed the process bound only to port `3000`
  (`0BB8` hex). The commit that changed the Dockerfile did not touch
  `docker-compose.yml` at all (verified with `git show --stat 987a0c1`).
- **Fix:** Split `infra/docker/web.Dockerfile` into a `dev` stage (installs
  `node_modules` only — source comes from the bind mount at runtime — and
  runs `vite --host 0.0.0.0 --port 5173`) ahead of the unchanged
  `builder`/`runtime` stages. `docker-compose.yml`'s `web.build` now sets
  `target: dev`. `docker-compose.prod.yml` is unaffected — Compose
  defaults to the last stage (`runtime`) when no target is given.
- **Regression test:** `docker compose down -v && docker compose up -d
  --build`, poll for `healthy`, `curl :5173` → `200`; the full Playwright
  suite (`npx playwright test mvp-journey`) run against the rebuilt stack —
  **6/6 passing**, verified on 2026-09-05 from a genuinely wiped volume, not
  a warm re-run.

---

## BUG-002 — Production Compose file hardcodes an absolute developer path

- **Severity:** High (P1) — breaks on any machine other than the original
  author's, and on that machine if the repo is ever moved.
- **Environment:** `docker-compose.prod.yml`, any host.
- **Reproduction steps:**
  1. From the repository root, run `docker compose -f
     docker-compose.prod.yml --env-file infra/deployment/.env config
     --quiet`.
- **Expected result:** Validates silently (the file's own header comment
  says "Bring it up from the repository root").
- **Actual result:** The `configs.caddyfile.file` key was a literal absolute
  path baked into version control — of the shape
  `/home/<developer>/morphia-work/Morphia/infra/caddy/Caddyfile` (redacted
  here; the original commit had one specific developer's home directory
  hardcoded in). On any other machine, or the same machine with the repo
  cloned to a different directory, Compose fails to locate the file.
- **Root cause:** The path was written as an absolute path instead of one
  relative to the Compose file's own directory, most likely pasted in
  directly during initial authoring of the production Compose file rather
  than derived programmatically.
- **Fix:** Changed to `./infra/caddy/Caddyfile`, relative to the Compose
  file location (Compose's documented resolution rule for `configs.*.file`).
- **Regression test:** `docker compose -f docker-compose.prod.yml
  --env-file infra/deployment/.env config --quiet` now passes from the
  repository root with no path errors — verified 2026-09-05. (Recommended
  follow-up, not yet done: add this exact command to CI's `compose` job so
  a future absolute-path regression is caught automatically instead of
  relying on manual review.)

---

## BUG-003 — E2E helper waited on a hardcoded engagement name (test defect, not an app defect)

- **Severity:** Medium (P2) — this bug lived in the test suite, not the
  product. It's included here because misdiagnosing a test bug as a
  product bug is itself a real risk worth documenting, and because it
  directly explains two previously-unresolved Playwright failure artifacts
  left in the repository (`tests/e2e/test-results/mvp-journey-operations-
  can-15059.../error-context.md` and the `scope-denied-path` one next to
  it).
- **Environment:** `tests/e2e/tests/mvp-journey.spec.ts`, any environment.
- **Reproduction steps (before the fix):**
  1. Run the full suite: `npx playwright test mvp-journey`.
  2. Specifically watch the spec `"operations canvas renders with
     execution graph and authorization boundary"`.
- **Expected result:** All specs pass independently of what name they give
  their test engagement.
- **Actual result:** This one spec — the only one of the three specs
  calling `addScopeRule()` that names its engagement `"Ops Validation"`
  instead of `"Local Validation"` — timed out after 30s waiting for
  `locator('option', { hasText: 'Local Validation' })` to attach, then
  failed with `element(s) not found`.
- **Root cause:** `addScopeRule()`'s wait condition (added in an earlier,
  uncommitted fix attempt for what was — incorrectly — suspected to be a
  backend async-session race) hardcoded the string `"Local Validation"`
  instead of taking the actual engagement name as a parameter. Two of the
  suite's three call sites happen to use an engagement literally named
  "Local Validation," which is why this went unnoticed for those two, and
  why the earlier fix attempt (raising Playwright timeouts, adding
  `staleTime: 0` to the frontend's TanStack Query config) didn't resolve
  it — those changes were treating a symptom of the wrong diagnosis. The
  application itself was working correctly the whole time.
- **Fix:** `addScopeRule()` now takes an `engagementName` parameter and
  waits for that engagement's option specifically; all three call sites
  updated to pass the name they actually used with `addEngagement()`.
- **Regression test:** The fixed spec, and the full 6-spec suite, now pass
  reproducibly — verified twice on 2026-09-05 (once against the
  already-running stack, once again from a fully wiped-volume rebuild).
- **Lesson applied:** the backend `get_db()` explicit-commit change from
  the earlier fix attempt was left in place (it's harmless and arguably
  good defensive practice — see `docs/mvp-verification.md`'s 2026-09-05
  update note) but is no longer claimed as *the* fix for this failure,
  because it demonstrably wasn't. Verifying a fix means confirming the
  specific mechanism, not just observing that a retry eventually goes
  green.

---

## BUG-004 — Caddyfile documented a TLS mode it doesn't implement

- **Severity:** Low (P3) — a documentation-accuracy defect, not a runtime
  failure, but it's the same "docs describe a control that isn't code"
  pattern this project's own prior audits (`docs/mvp-gap-analysis.md`,
  `docs/MVP_FINAL_AUDIT.md`) flagged on three separate previous occasions.
- **Environment:** `infra/caddy/Caddyfile`, `scripts/prod-up.sh`.
- **Reproduction steps:** Read the Caddyfile's header comment (claims a
  `DEPLOY_MODE=direct` mode where "Caddy terminates TLS on :443 itself");
  then read the actual Caddy config body.
- **Expected result:** If `direct` mode is documented as available, the
  Caddyfile should contain a site block that enables automatic HTTPS for
  `{$MORPHIA_DOMAIN}`.
- **Actual result:** The file unconditionally sets `auto_https off` and
  defines exactly one site block, `http://:80`. There is no code path that
  reads `$DEPLOY_MODE` or serves HTTPS directly, regardless of the env
  var's value. `scripts/prod-up.sh` separately appended an `AUTO_HTTPS=off`
  line to the env file that nothing in the Caddyfile or Compose file ever
  reads.
- **Root cause:** The comment describing two modes was written ahead of
  implementing the second one — the actually-exercised deployment (verified
  live in this project's own Caddy access logs, which show real traffic
  through a Cloudflare Tunnel) only ever needed `tunnel` mode, so `direct`
  mode was never finished, but the comment wasn't corrected to say so.
- **Fix:** Rewrote the header comment to describe only the implemented
  mode, and to explicitly label `direct`/`DEPLOY_MODE` as an unimplemented
  roadmap item rather than a working option. Removed the dead
  `AUTO_HTTPS` line from `scripts/prod-up.sh`.
- **Regression test:** N/A (documentation-only change); prevention is
  procedural — `docs/security.md` and any infra comment describing a
  control should be checked against the actual code in the same PR that
  changes either one, which is precisely the discipline this project's own
  audit trail (three prior "docs vs. code" corrections) shows it has been
  trying, and failing, to fully establish.
