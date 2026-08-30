# MORPHIA — Demo Script

A ~3-minute walkthrough of the MVP journey. Everything runs locally against
synthetic data; nothing touches a real target.

For a shorter, silent portfolio cut, CI records the seeded live application
with Playwright and uploads `morphia-demo-video` as an MP4 artifact. The
recording comes from `tests/e2e/tests/demo-video.spec.ts`; it is produced only
after the same job has built, migrated, seeded, and exercised the live stack.

## Before you record

```bash
./scripts/prepare-demo.sh        # fresh stack + seeded workspace, prints credentials
```

Then open `http://localhost:5173` and sign in with the printed credentials.
Have a second terminal ready for the live-journey command.

Recording settings: 1920×1080, 30 fps, hide notifications, hide bookmarks bar,
zoom the browser to ~110% so text is legible in the recording.

---

## Beats

### 1 · Title + problem (0:00–0:15)
> "MORPHIA is a human-in-the-loop orchestration platform for *authorized*
> security research. The problem it solves: running bug-bounty work with
> real authorization boundaries — scope, approval, evidence integrity —
> instead of a pile of shell scripts."

Show the sign-in screen, then the **Dashboard**.

### 2 · Dashboard (0:15–0:35)
Point at the tiles (projects, pending approvals, active runs, verified
findings) and the recent-activity feed sourced from the audit log.
> "Every number here is live, and every row in the activity feed is an
> append-only audit event."

### 3 · Project + authorized engagement (0:35–1:00)
Open **Projects → Morphia Demo Research → Engagements**.
> "A project holds engagements. Each engagement records its *authorization
> basis* — here, a synthetic local target we own — and its status."

### 4 · Scope (1:00–1:25)
**Scope** tab.
> "Scope is the primary security boundary. Two include rules for the demo
> target, one exclude rule for a production host. The validator is
> default-deny: anything that doesn't match an include is refused."

### 5 · Create a run (1:25–1:50)
**Runs** tab → **New Run**. Pick the engagement, action `http_header_review`,
target `demo-target`, a short prompt. Create.
> "A run carries a plan — an ordered list of steps, each with an action, a
> target, and a prompt. It starts in DRAFT."

Open the run.

### 6 · Human approval (1:50–2:10)
On the run page: **Start planning → Submit plan for approval**.
> "The run is now waiting for a human. Nothing has been queued for a worker."

Read the plan, then click **Approve** with a justification.
> "Approving enqueues it. The API validates scope again at this point."

### 7 · Worker execution (2:10–2:35)
The page auto-refreshes.
> "A worker claims the run, re-validates scope *independently* — it has no
> database access — calls the provider (a deterministic mock here, no API
> keys, no spend), records the step result, and transitions the run to
> COMPLETED."

Show the step result and the event timeline with `worker:` actor rows.

### 8 · Evidence + finding (2:35–2:55)
**Evidence** — show the SHA-256 hash and `integrity_verified` status.
**Findings** — open the synthetic CORS finding.
> "Evidence is hashed at capture. A finding can't be marked verified without
> linked evidence."

### 9 · Report (2:55–3:15)
**Reports** → **Export → markdown** on the seeded report.
> "Verified findings assemble into a HackerOne-style disclosure report —
> Markdown, HTML, or JSON."

### 10 · Scope-denied + audit (3:15–3:30)
Second terminal:
```bash
./scripts/demo.sh --journey
```
> "Two runs, live. The in-scope one completes. The out-of-scope one —
> `production.example.com` — is refused by the *worker's* check and the run
> fails with the reason recorded."

Cut to the **Audit Log** page.
> "All of it — the login, the scope change, the approval, the transitions —
> is here, append-only."

### 11 · Close (3:30–end)
Show the GitHub repo and the CI badge.
> "MVP, alpha — the journey is verified end to end against a live stack.
> Repo and the verification matrix are linked below."
