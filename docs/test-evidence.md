# MORPHIA Test Evidence

This document is the ledger of verification commands for MORPHIA. Every row
below is currently marked `PENDING` because no command has been executed
against a live database/Redis/browser stack in the sandbox that produced
this documentation set — there is no PostgreSQL/Redis instance, no installed
Node/Python dependency tree, and no browser runtime available in that
environment. This is not a claim that the tests fail; it is an honest
statement that they have not yet been run and recorded. See
`docs/completion-report.md` §9 for the risk this creates.

Whoever picks this up next should run each command locally or in CI, replace
`PENDING` with `PASS`/`FAIL`, fill in the real exit code, and paste a short
excerpt of the actual output (or a link to the CI run) into the Notes column.

## How to Fill This In

1. Follow the setup in `docs/completion-report.md` §8 up through `docker
   compose up --build` (or the non-Docker equivalent in `README.md`) so
   PostgreSQL, Redis, and the API are actually running.
2. Run `make migrate` to apply the schema before any test that touches the
   database.
3. Run each command below from the repository root unless otherwise noted.
4. Update the table: replace `PENDING` with `PASS` or `FAIL`, fill in the
   real numeric exit code (`echo $?` immediately after the command), and add
   any notable output (failing test names, warnings, coverage numbers) to
   Notes.
5. Re-run `make verify` before signing off on a release — it is the single
   command that chains lint, typecheck, and test for both apps.
6. For the Playwright suite specifically, also attach the HTML report
   (`tests/e2e/playwright-report/`) or a CI artifact link in Notes, since a
   bare PASS/FAIL loses the per-test breakdown that `critical-workflow.spec.ts`
   provides (15 tests across 7 `describe` blocks).

## Verification Matrix

| Command | Result | Exit Code | Notes |
|---|---|---|---|
| `docker compose up --build -d` | PENDING | — | Brings up postgres, redis, api, worker, web. Confirm all five containers report healthy (`docker compose ps`) before running anything else. |
| `make migrate` | PENDING | — | `alembic upgrade head` against `DATABASE_URL_SYNC`. Confirm no migration errors and that the expected tables exist (`psql \dt`). |
| `make seed` | PENDING | — | `python -m app.seed`. Optional; only needed if manual/e2e testing wants pre-populated data beyond what the test suites create themselves. |
| `make lint` | PENDING | — | `ruff check` (API) + `npm run lint` (web). Record any lint violations found. |
| `make typecheck` | PENDING | — | `mypy app/` (API) + `npm run typecheck` (web). Record any type errors found. |
| `make test-api` | PENDING | — | `cd apps/api && pytest tests/ -v`. Covers `test_auth.py`, `test_evidence.py`, `test_findings.py`, `test_health.py`, `test_projects.py`, `test_run_state_machine.py`, `test_scope_validator.py`. Record pass/fail counts per file. |
| `make test-web` | PENDING | — | `cd apps/web && npm run test`. Record pass/fail counts. |
| `make verify` | PENDING | — | Chains `lint` + `typecheck` + `test`. This is the canonical "is the repo healthy" gate — treat any failure here as blocking. |
| `cd tests/e2e && npm install` | PENDING | — | Installs `@playwright/test`. Record the resolved Playwright version. |
| `cd tests/e2e && npx playwright install --with-deps chromium` | PENDING | — | Installs the Chromium browser binary and OS dependencies required to actually launch a browser in CI/sandboxed environments. |
| `cd tests/e2e && npm test` | PENDING | — | Runs `critical-workflow.spec.ts` against `chromium` and `mobile` (Pixel 5) projects, 15 tests each = up to 30 executions. Requires the web dev server reachable at `http://localhost:5173` (Playwright's `webServer` config will start it automatically if not already running) and the API reachable at `http://localhost:8000`. Record per-test pass/fail; attach `playwright-report/index.html`. |
| `./scripts/backup.sh` | PENDING | — | Produces `backups/morphia_<timestamp>.sql.gz` via `pg_dump | gzip`. Confirm the file is non-empty and note its size. |
| `./scripts/restore.sh backups/morphia_<timestamp>.sql.gz` | PENDING | — | Restores the dump above into a **separate, disposable** database before ever running it against anything containing real data — the script overwrites the target database. Confirm row counts match the source after restore. |
| `curl -f http://localhost:8000/api/health` | PENDING | — | Should return `200` with a liveness payload, independent of DB/Redis state. |
| `curl -f http://localhost:8000/api/ready` | PENDING | — | Should return `200` only once PostgreSQL and Redis are both reachable; useful as a smoke test immediately after `docker compose up`. |
| `make clean` | PENDING | — | Confirms teardown (stopped containers, removed volumes/build artifacts as defined in the Makefile) leaves no stray state before the next run. |

## Manual Smoke Test Checklist (if automation is unavailable)

If for any reason the Playwright suite cannot be run (no browser runtime,
network-restricted sandbox, etc.), the following manual pass through the UI
covers the same critical paths as `critical-workflow.spec.ts` and should be
recorded with the same PASS/FAIL/Notes discipline:

| Step | Result | Notes |
|---|---|---|
| Visit `/sign-in`, register a new account | PENDING | |
| Log in with the new account | PENDING | |
| Land on `/dashboard` without error | PENDING | |
| Visit every primary nav link (Projects, Runs, Agents, Evidence, Findings, Reports, Workflows, Approvals, Audit, Settings) | PENDING | |
| Create a project, confirm it appears in the list | PENDING | |
| Refresh the browser, confirm the project is still listed | PENDING | |
| Open the project, create a run, confirm it starts in `DRAFT` | PENDING | |
| Confirm the run shows a cancel control and no approve control while in `DRAFT` | PENDING | |
| Visit a nonexistent URL, confirm a 404 page renders | PENDING | |
| Log out, confirm redirect to `/sign-in` | PENDING | |
| After logout, visit `/dashboard` directly, confirm redirect back to `/sign-in` | PENDING | |
| Resize to a mobile viewport (375px wide), confirm no horizontal scrollbar on the dashboard | PENDING | |
| Open browser dev tools console throughout the above, confirm no uncaught errors | PENDING | |
