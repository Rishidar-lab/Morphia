import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, Run, RunEvent, RunStep, Engagement, Project } from "@/lib/types";
import { TERMINAL_STATES } from "@/lib/types";
import { LoadingSkeleton, ErrorState } from "@/components/ListStates";
import { StateBadge } from "@/components/StateBadge";
import { ExecutionGraph } from "@/components/ExecutionGraph";
import { ApprovalGate } from "@/components/ApprovalGate";

const NEXT_STEP: Record<string, { label: string; target: string } | undefined> = {
  DRAFT: { label: "Start planning", target: "PLANNING" },
  PLANNING: { label: "Submit plan for approval", target: "AWAITING_PLAN_APPROVAL" },
  PAUSED: { label: "Resume", target: "QUEUED" },
  FAILED: { label: "Retry (new draft)", target: "DRAFT" },
};

function isLiveState(state: string): boolean {
  return state === "QUEUED" || state === "RUNNING";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="mono text-[11px] tracking-[0.08em] font-semibold" style={{ color: "var(--text-faint)" }}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const runQuery = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.get<Run>(`/api/v1/runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && isLiveState(q.state.data.state) ? 1500 : false),
  });
  const live = !!runQuery.data && isLiveState(runQuery.data.state);
  const stepsQuery = useQuery({
    queryKey: ["run-steps", id],
    queryFn: () => api.get<RunStep[]>(`/api/v1/runs/${id}/steps`),
    enabled: !!id,
    refetchInterval: live ? 1500 : false,
  });
  const eventsQuery = useQuery({
    queryKey: ["run-events", id],
    queryFn: () => api.get<RunEvent[]>(`/api/v1/runs/${id}/events`),
    enabled: !!id,
    refetchInterval: live ? 1500 : false,
  });
  const evidenceQuery = useQuery({ queryKey: ["evidence"], queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence") });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/api/v1/projects") });
  const engagementQ = useQuery({
    queryKey: ["engagement", runQuery.data?.engagement_id],
    queryFn: () => api.get<Engagement>(`/api/v1/engagements/${runQuery.data!.engagement_id}`),
    enabled: !!runQuery.data?.engagement_id,
  });

  const prevState = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = runQuery.data?.state;
    if (s && prevState.current && prevState.current !== s && TERMINAL_STATES.has(s)) {
      queryClient.invalidateQueries({ queryKey: ["run-steps", id] });
      queryClient.invalidateQueries({ queryKey: ["run-events", id] });
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
    }
    prevState.current = s;
  }, [runQuery.data?.state, id, queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["run", id] });
    queryClient.invalidateQueries({ queryKey: ["run-steps", id] });
    queryClient.invalidateQueries({ queryKey: ["run-events", id] });
    queryClient.invalidateQueries({ queryKey: ["runs"] });
  };

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : "Action failed."),
  });

  if (runQuery.isLoading) return <div className="px-6 py-6"><LoadingSkeleton rows={6} /></div>;
  if (runQuery.isError || !runQuery.data) {
    return (
      <div className="px-6 py-6">
        <ErrorState message={runQuery.error instanceof ApiError ? runQuery.error.message : "Failed to load run."} onRetry={() => runQuery.refetch()} />
      </div>
    );
  }

  const run = runQuery.data;
  const planSteps = run.plan?.steps ?? [];
  const isTerminal = TERMINAL_STATES.has(run.state);
  const isApprovalState = run.state === "AWAITING_PLAN_APPROVAL" || run.state === "AWAITING_ACTION_APPROVAL";
  const nextStep = NEXT_STEP[run.state];
  const runEvidence = (evidenceQuery.data ?? []).filter((e) => e.run_id === run.id);
  const projectName = projectsQ.data?.find((p) => p.id === run.project_id)?.name ?? "project";
  const engagementName = engagementQ.data?.program_name;

  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">
      {/* Header */}
      <div>
        <Link to="/runs" className="mono text-xs" style={{ color: "var(--text-faint)" }}>← All runs</Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>{run.title || "Untitled run"}</h1>
          <StateBadge state={run.state} />
          {isLiveState(run.state) && <span className="mono text-[11px] px-2 py-0.5 rounded animate-pulse" style={{ background: "var(--active-bg)", border: "1px solid var(--active-border)", color: "var(--active)" }}>● WORKER EXECUTING</span>}
        </div>
        <p className="mono text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: "var(--text-faint)" }}>
          <span>{run.agent_profile || "no agent profile"}</span>
          <span>·</span>
          <Link to={`/projects/${run.project_id}`} style={{ color: "var(--text-muted)" }}>{projectName}</Link>
          {engagementName && <><span>·</span><span>{engagementName}</span></>}
          <span>·</span>
          <span>{new Date(run.created_at).toLocaleString()}</span>
          <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}>{run.id.slice(0, 8)}</span>
        </p>
        {run.state === "FAILED" && run.failure_reason && (
          <div className="mt-3 mono text-xs p-3 rounded-[6px]" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>
            <span className="font-semibold">EXECUTION PREVENTED / FAILED:</span> {run.failure_reason}
          </div>
        )}
      </div>

      {/* Execution graph — always visible */}
      <Panel title="EXECUTION GRAPH — OPERATION PIPELINE">
        <ExecutionGraph run={run} events={eventsQuery.data ?? []} steps={stepsQuery.data ?? []} />
      </Panel>

      {/* Approval gate when awaiting */}
      {isApprovalState && (
        <ApprovalGate run={run} engagementName={engagementName} />
      )}

      {/* Controls for non-gate transitions */}
      {(!isTerminal || run.state === "FAILED") && !isApprovalState && (
        <Panel title="CONTROLS">
          {actionError && <div className="mb-3 mono text-xs p-2.5 rounded-[6px]" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>{actionError}</div>}
          <div className="flex flex-wrap items-center gap-2">
            {nextStep && (
              <button onClick={() => act.mutate(() => api.post(`/api/v1/runs/${run.id}/transition`, { target_state: nextStep.target }))} disabled={act.isPending} className="mono text-xs px-3 py-2 rounded-[6px] font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-0)" }}>
                {nextStep.label}
              </button>
            )}
            {!isTerminal && (
              <button onClick={() => act.mutate(() => api.post(`/api/v1/runs/${run.id}/cancel`))} disabled={act.isPending} className="mono text-xs px-3 py-1.5 rounded-[6px]" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
                Cancel run
              </button>
            )}
            {isLiveState(run.state) && <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>worker executing — refreshing automatically…</span>}
          </div>
          {isApprovalState === false && !isTerminal && (
            <p className="mono text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>Transitions are enforced server-side via legal-transition table</p>
          )}
        </Panel>
      )}
      {isTerminal && run.state !== "FAILED" && (
        <Panel title="CONTROLS">
          <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>Terminal <span style={{ color: "var(--text-secondary)" }}>{run.state}</span> — no further actions.</p>
        </Panel>
      )}

      {/* Plan & steps in two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`PLAN — ${planSteps.length} STEP${planSteps.length === 1 ? "" : "S"}`}>
          {planSteps.length === 0 ? (
            <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>No plan attached</p>
          ) : (
            <ol className="space-y-2">
              {planSteps.map((step, i) => (
                <li key={i} className="rounded-[6px] p-3" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>#{i + 1}</span>
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{step.action}</span>
                    <span className="mono text-xs ml-auto truncate" style={{ color: "var(--text-muted)" }}>→ {step.target}</span>
                  </div>
                  <p className="mono text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.prompt}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="STEP RESULTS — WORKER OUTPUT">
          {(stepsQuery.data ?? []).length === 0 ? (
            <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>No steps executed yet. Steps appear after approval and worker execution.</p>
          ) : (
            <div className="space-y-2">
              {stepsQuery.data!.map((s) => (
                <div key={s.id} className="rounded-[6px] p-3" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>#{s.step_number}</span>
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{s.action}</span>
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded ml-auto" style={{ background: s.status === "completed" ? "var(--pass-bg)" : s.status === "failed" ? "var(--deny-bg)" : "var(--bg-panel)", border: `1px solid ${s.status === "completed" ? "var(--pass-border)" : s.status === "failed" ? "var(--deny-border)" : "var(--border-subtle)"}`, color: s.status === "completed" ? "var(--pass)" : s.status === "failed" ? "var(--deny)" : "var(--text-muted)" }}>{s.status}</span>
                  </div>
                  {s.output_data?.response != null && <pre className="mono text-xs whitespace-pre-wrap mt-2 p-2 rounded max-h-48 overflow-y-auto" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>{String(s.output_data.response)}</pre>}
                  {s.error && <p className="mono text-xs mt-1" style={{ color: "var(--deny)" }}>{s.error}</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Evidence */}
      {runEvidence.length > 0 && (
        <Panel title={`EVIDENCE — ${runEvidence.length} ARTIFACT${runEvidence.length === 1 ? "" : "S"}`}>
          <div className="space-y-2">
            {runEvidence.map((e) => (
              <div key={e.id} className="flex items-center gap-3 mono text-xs p-2.5 rounded-[6px]" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.original_filename}</span>
                <span className="truncate" style={{ color: "var(--text-muted)" }} title={e.sha256_digest}>sha256:{e.sha256_digest.slice(0, 12)}…</span>
                <span className="px-1.5 py-0.5 rounded text-[11px] ml-auto" style={{ background: e.verification_status.includes("verified") ? "var(--pass-bg)" : "var(--bg-panel)", border: `1px solid ${e.verification_status.includes("verified") ? "var(--pass-border)" : "var(--border-subtle)"}`, color: e.verification_status.includes("verified") ? "var(--pass)" : "var(--text-faint)" }}>{e.verification_status}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Event timeline */}
      <Panel title="EVENT TIMELINE — AUDIT TRAIL">
        <ol className="relative ml-2 space-y-3" style={{ borderLeft: "1px solid var(--border-subtle)" }}>
          {(eventsQuery.data ?? []).map((ev) => (
            <li key={ev.id} className="ml-4 relative">
              <span className="absolute -left-[21px] mt-1 h-2.5 w-2.5 rounded-full" style={{ background: ev.event_type.includes("scope_denied") || ev.event_type.includes("failed") ? "var(--deny)" : ev.event_type.includes("approval") || ev.event_type.includes("approved") ? "var(--attention)" : ev.event_type.includes("transition") ? "var(--active)" : "var(--text-faint)", border: "2px solid var(--bg-panel)" }} />
              <div className="flex items-center gap-2 mono text-xs flex-wrap">
                <span style={{ color: "var(--text-faint)" }}>{new Date(ev.created_at).toLocaleTimeString()}</span>
                <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{ev.event_type}</span>
                {ev.from_state && ev.to_state && <span style={{ color: "var(--text-faint)" }}>{ev.from_state} → {ev.to_state}</span>}
                <span style={{ color: "var(--text-faint)" }}>{ev.actor_id}</span>
              </div>
              {ev.payload?.reason != null && <p className="mono text-xs mt-1" style={{ color: "var(--deny)" }}>{String(ev.payload.reason)}</p>}
              {ev.payload?.justification != null && <p className="mono text-xs mt-1 italic" style={{ color: "var(--text-muted)" }}>“{String(ev.payload.justification)}”</p>}
            </li>
          ))}
          {(eventsQuery.data ?? []).length === 0 && <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>No events yet</p>}
        </ol>
      </Panel>
    </div>
  );
}
