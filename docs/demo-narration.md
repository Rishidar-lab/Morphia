# MORPHIA — Demo Narration

Read this at a calm pace. ~430 words, lands around 3:20 at 130 wpm, leaving
room for the pauses in the shot list.

---

MORPHIA is a human-in-the-loop orchestration platform for authorized security
research. If you run bug-bounty or vulnerability-disclosure work, you know the
hard part isn't the scanning — it's doing it inside real authorization
boundaries. Scope. Approval. Evidence you can stand behind. MORPHIA makes those
boundaries the structure of the tool.

This is the dashboard. Every number is live, and every line in this activity
feed is an append-only audit event — logins, scope changes, approvals, run
transitions, all of it.

A project holds engagements. Each engagement records why the work is
authorized — here, a synthetic target that this instance owns — and whether
it's currently active.

Scope is the primary security boundary. Two include rules for the demo target,
one explicit exclude for a production host. The validator is default-deny:
if a target doesn't match an include rule, it's refused. No exceptions,
no guessing.

Let's create a run. A run carries a plan — an ordered list of steps, each with
an action, a target, and a prompt. I'll review the response headers of the
demo target. The run starts in draft.

Now the run is waiting for a human. Nothing has been queued for a worker yet.
I read the plan, I add a justification, and I approve. Approving is what
enqueues it — and the API re-checks scope at this point.

A worker picks it up. The worker has no database access, so it re-validates
scope through an authenticated callback — a completely independent check from
the one the API just did. Then it calls the provider. For this demo that's a
deterministic mock: no API key, no spend. It records the step result and
transitions the run to completed. You can see the worker-attributed events
right here on the timeline.

Evidence is hashed with SHA-256 at the moment it's captured. And a finding —
this one's clearly marked synthetic — can't be marked verified without linked
evidence behind it.

Verified findings assemble into a disclosure report. HackerOne-style structure,
exportable as Markdown, HTML, or JSON.

Now the important part. Two runs, driven live. The in-scope one completes. The
out-of-scope one — production dot example dot com — is refused by the worker's
check, and the run fails with the reason recorded. That's the boundary between
a research platform and an attack tool, and it's enforced twice, by two
different processes.

MORPHIA is an MVP — alpha — but the journey you just watched is verified end to
end against a live stack. Repo and the full verification matrix are linked
below.
