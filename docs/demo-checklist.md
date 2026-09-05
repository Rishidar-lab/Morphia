# MORPHIA — Demo / Recording Checklist

Run through this immediately before recording or live-demoing, in order. Each
item names the exact command or thing to look at — don't just eyeball it.

## Environment

- [ ] **Clean git status.** `git status` — no unexpected modified/untracked
      files in frame if you're going to show a terminal or an editor.
- [ ] **Services running and healthy.** `docker compose ps` — all six
      services (`api`, `worker`, `web`, `db`, `redis`, `demo-target`) show
      `healthy`, not just `running`.
- [ ] **Health endpoints answer.** `curl -fsS http://localhost:8000/api/ready`
      → `{"status":"ready", "database":"ok", "redis":"ok"}`.
- [ ] **Demo data seeded.** The "Morphia Demo Research" workspace exists —
      sign in and confirm the dashboard tiles show non-zero projects/runs, or
      re-run `docker compose exec api python -m app.seed`.

## Journeys to have ready

- [ ] **Successful execution path.** CASE A from `./scripts/demo.sh
      --journey` (target `demo-target`) — confirm it reaches `COMPLETED`
      before recording, so you're not debugging live.
- [ ] **Failure / scope-denial path.** CASE B (target
      `production.example.com`) — confirm the run reaches `FAILED` with a
      `run.scope_denied` event and a visible reason.
- [ ] **Evidence record visible.** `/evidence` page shows at least one
      artifact with a rendered SHA-256 hash and `integrity_verified` status.
- [ ] **CI status visible.** The GitHub Actions badge on the README, or
      `gh pr checks <PR#>`, shows green before you reference it on camera.

## Nothing sensitive on screen

- [ ] **No secrets visible.** `.env` is not open in any visible tab/editor;
      confirm it isn't tracked: `git ls-files | grep -i '\.env$'` should only
      list `.env.example` files.
- [ ] **No API keys visible.** Demo runs use `MORPHIA_PROVIDER=mock` — no
      `OPENAI_API_KEY`/`OPENROUTER_API_KEY` value should ever be typed,
      pasted, or shown, even redacted.
- [ ] **No private tokens visible.** `WORKER_AUTH_SECRET` is generated
      per-environment and never rendered in the UI or printed by anything
      you'd show on screen — if a terminal printed it while generating
      `.env`, scroll past that before recording.
- [ ] **No personal paths unnecessarily exposed.** Terminal prompt doesn't
      leak more of the host path than `~/…`; no absolute `/home/<user>/...`
      path appears in a shown file (see `docs/qa/BUG_REPORTS.md` BUG-002 for
      why this specifically matters here — it was a real bug, not just a
      cosmetic concern).
- [ ] **Credentials on screen are the printed demo ones only.** The seed
      admin password shown by `./scripts/demo.sh` is generated fresh for that
      run and only ever valid against the local synthetic stack — fine to
      show; nothing else should be.
