# Test Evidence

This document records verification that has actually been executed against the repository. It is a ledger, not a claim of production readiness.

## Verification environment

The sandbox had Python 3.11 and Node.js 22 available. Docker, PostgreSQL client tools, Redis client tools, and a browser-backed live service stack were not available. API tests therefore use the repository’s disposable in-memory SQLite test harness introduced in `apps/api/tests/conftest.py`; production remains PostgreSQL + Redis.

## Executed commands

| Command | Result | Evidence |
|---|---|---|
| `python -m ruff check apps/api apps/worker` | PASS | Ruff reported `All checks passed!` |
| `python -m ruff format --check apps/api apps/worker` | PASS | 60 files already formatted |
| `cd apps/api && python -m mypy app/` | PASS | `Success: no issues found in 36 source files` |
| `cd apps/api && python -m pytest -q` | PASS | 57 passed |
| `cd apps/worker && python -m pytest -q` | PASS | 8 passed |
| `cd apps/web && npm run lint` | PASS | ESLint completed successfully |
| `cd apps/web && npm run typecheck` | PASS | TypeScript completed successfully |
| `cd apps/web && npm run test -- --run` | PASS | 9 test files, 37 tests passed |
| `cd apps/web && npm run build` | PASS | Vite production build completed |
| `cd tests/e2e && npm install --package-lock-only` | PASS | Lockfile generated; npm reported 0 vulnerabilities |

## Not executed

| Check | Reason |
|---|---|
| `docker compose up --build` | Docker is unavailable in the execution environment. |
| PostgreSQL-backed integration verification | No PostgreSQL service or client is available in the execution environment. |
| Redis-backed worker lifecycle verification | No Redis service or client is available in the execution environment. |
| `cd tests/e2e && npx playwright test` | The browser suite requires a live API, database, Redis, and frontend stack; those services were unavailable. |
| Backup/restore round trip | Requires a running PostgreSQL instance. |

## Interpretation

The application and worker unit/route suites now run from a clean checkout without a developer-owned `.env` because tests set safe test-only settings before importing the application. This does **not** replace PostgreSQL or Redis integration testing. CI validates Compose configuration and image builds on GitHub-hosted runners, while live Playwright and backup/restore checks remain release-readiness work until a service-backed environment is available.
