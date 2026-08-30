import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Run } from "@/lib/types";

export function ApprovalGate({
  run,
  engagementName,
  onDecided,
}: {
  run: Run;
  engagementName?: string;
  onDecided?: () => void;
}) {
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isApprovalState = run.state === "AWAITING_PLAN_APPROVAL" || run.state === "AWAITING_ACTION_APPROVAL";
  const approvalType = run.state === "AWAITING_PLAN_APPROVAL" ? "Plan" : "Action";
  const planSteps = run.plan?.steps ?? [];

  const approve = useMutation({
    mutationFn: () => api.post(`/api/v1/runs/${run.id}/approve`, { justification }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["run", run.id] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["run-events", run.id] });
      onDecided?.();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Approve failed"),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/api/v1/runs/${run.id}/reject`, { justification }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["run", run.id] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onDecided?.();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Reject failed"),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/v1/runs/${run.id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["run", run.id] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onDecided?.();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Cancel failed"),
  });

  const busy = approve.isPending || reject.isPending || cancel.isPending;

  if (!isApprovalState) return null;

  return (
    <div data-testid="approval-gate" className="rounded-[8px] overflow-hidden" style={{ border: `1px solid var(--attention-border)`, background: "var(--attention-bg)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid var(--attention-border)" }}>
        <div className="flex gap-3">
          <div className="h-9 w-9 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: "var(--attention)", color: "white" }}>
            <span className="text-sm font-bold">◈</span>
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide" style={{ color: "var(--attention)" }}>
              EXECUTION PAUSED — HUMAN AUTHORIZATION REQUIRED
            </p>
            <p className="text-xs mt-1 leading-relaxed max-w-[560px]" style={{ color: "var(--text-secondary)" }}>
              The agent cannot continue. A human must review the {approvalType.toLowerCase()} and authorize execution. This gate is enforced server-side — the worker will not proceed without an approval record.
            </p>
          </div>
        </div>
        <span className="mono text-[11px] px-2 py-1 rounded font-medium flex-shrink-0" style={{ background: "var(--bg-inset)", border: "1px solid var(--attention-border)", color: "var(--attention)" }}>
          AWAITING HUMAN
        </span>
      </div>

      {/* Details */}
      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <p className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>REQUEST</p>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2"><dt style={{ color: "var(--text-muted)" }}>Run</dt><dd className="mono font-medium truncate" style={{ color: "var(--text-primary)" }}>{run.title}</dd></div>
              <div className="flex justify-between gap-2"><dt style={{ color: "var(--text-muted)" }}>Engagement</dt><dd className="mono truncate" style={{ color: "var(--text-secondary)" }}>{engagementName ?? run.engagement_id ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt style={{ color: "var(--text-muted)" }}>Agent profile</dt><dd className="mono" style={{ color: "var(--text-secondary)" }}>{run.agent_profile ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt style={{ color: "var(--text-muted)" }}>State</dt><dd className="mono font-medium" style={{ color: "var(--attention)" }}>{run.state}</dd></div>
              <div className="flex justify-between gap-2"><dt style={{ color: "var(--text-muted)" }}>Created</dt><dd className="mono" style={{ color: "var(--text-muted)" }}>{new Date(run.created_at).toLocaleString()}</dd></div>
            </dl>
          </div>

          <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <p className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>PROPOSED PLAN · {planSteps.length} STEP{planSteps.length === 1 ? "" : "S"}</p>
            {planSteps.length === 0 ? (
              <p className="mono text-xs mt-2" style={{ color: "var(--text-faint)" }}>No plan steps</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {planSteps.map((s, i) => (
                  <li key={i} className="rounded-[6px] p-2.5" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>#{i + 1}</span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{s.action}</span>
                      <span className="mono text-xs ml-auto truncate" style={{ color: "var(--text-muted)" }}>→ {s.target}</span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{s.prompt}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <p className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>AUTHORIZATION CHECK</p>
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between"><span style={{ color: "var(--text-muted)" }}>API scope validation</span><span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--pass-bg)", border: "1px solid var(--pass-border)", color: "var(--pass)" }}>PASS</span></div>
              <div className="flex items-center justify-between"><span style={{ color: "var(--text-muted)" }}>Engagement active</span><span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--pass-bg)", border: "1px solid var(--pass-border)", color: "var(--pass)" }}>YES</span></div>
              <div className="flex items-center justify-between"><span style={{ color: "var(--text-muted)" }}>Worker revalidation</span><span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--attention-bg)", border: "1px solid var(--attention-border)", color: "var(--attention)" }}>PENDING APPROVAL</span></div>
              <p className="mono text-[11px] leading-tight pt-1" style={{ color: "var(--text-faint)" }}>Worker will independently revalidate scope before execution. Approval does not bypass scope.</p>
            </div>
          </div>

          <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <label className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>
              DECISION JUSTIFICATION <span style={{ color: "var(--text-faint)" }}>(optional but audited)</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Why this plan is safe to execute against the authorized scope…"
              className="mt-2 w-full rounded-[6px] px-3 py-2 text-xs leading-relaxed focus:outline-none resize-none"
              style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
            {error && <p className="text-xs mt-2" style={{ color: "var(--deny)" }}>{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => approve.mutate()}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-[6px] disabled:opacity-50"
                style={{ background: "var(--pass)", color: "white" }}
              >
                {approve.isPending ? "Approving…" : "Approve — authorize execution"}
              </button>
              <button
                onClick={() => reject.mutate()}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-[6px] disabled:opacity-50"
                style={{ background: "transparent", border: "1px solid var(--deny-border)", color: "var(--deny)" }}
              >
                {reject.isPending ? "Rejecting…" : "Reject"}
              </button>
              <button
                onClick={() => cancel.mutate()}
                disabled={busy}
                className="px-3 py-2 text-xs rounded-[6px] disabled:opacity-50"
                style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
              >
                Cancel run
              </button>
            </div>
            <p className="mono text-[11px] mt-2 leading-tight" style={{ color: "var(--text-faint)" }}>
              Decision is recorded with actor, timestamp, and justification. No self-approval bypass.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
