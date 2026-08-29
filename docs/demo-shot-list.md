# MORPHIA — Demo Shot List

| # | Time | Screen | Action on screen | Capture note |
|---|------|--------|------------------|--------------|
| 1 | 0:00 | `/sign-in` | idle, then it's already signed in — cut to dashboard | title card overlay "MORPHIA" |
| 2 | 0:15 | `/dashboard` | hover the four tiles; scroll the recent-activity list | hold on the activity feed 3s |
| 3 | 0:35 | `/projects` | click "Morphia Demo Research" | — |
| 4 | 0:42 | `/projects/:id` Overview | click **Engagements** tab | highlight the authorization-basis text |
| 5 | 1:00 | Scope tab | scroll the three rules | zoom the exclude rule |
| 6 | 1:25 | Runs tab | **New Run**, fill engagement + `http_header_review` + `demo-target`, Create | keep the form fill snappy (~8s) |
| 7 | 1:45 | Runs tab | click the new run's title | — |
| 8 | 1:50 | `/runs/:id` DRAFT | click **Start planning**, then **Submit plan for approval** | show state badge changing |
| 9 | 2:00 | `/runs/:id` AWAITING_PLAN_APPROVAL | read the Plan card, type a justification, **Approve** | — |
| 10 | 2:10 | `/runs/:id` QUEUED→RUNNING→COMPLETED | let it auto-refresh; do not touch | ~4s of the page updating itself |
| 11 | 2:25 | `/runs/:id` COMPLETED | scroll: Step results (mock response), Event timeline | hold on `worker:` rows |
| 12 | 2:35 | `/evidence` | hover the SHA-256 cell | tooltip shows the full hash |
| 13 | 2:42 | `/findings` | click the `[SYNTHETIC DEMO]` finding row | — |
| 14 | 2:55 | `/reports` | **Export ▾ → markdown**, new tab opens with the rendered report | scroll the report 3s |
| 15 | 3:15 | terminal | run `./scripts/demo.sh --journey`; show CASE A ✓ / CASE B ✓ | terminal fills ~⅓ of frame |
| 16 | 3:22 | `/audit` | scroll the audit table; use the event-type filter once | — |
| 17 | 3:30 | GitHub repo page | show README hero + CI badge + release tag | end card |

## Assets to have open in tabs beforehand
- `http://localhost:5173/dashboard`
- `https://github.com/Rishidar-lab/Morphia`
- terminal at the repo root

## Overlays / captions (optional)
- 0:03 "Human-in-the-loop orchestration for authorized security research"
- 2:10 "worker re-validates scope — independently, no DB access"
- 3:15 "out-of-scope target → run FAILED, reason recorded"
