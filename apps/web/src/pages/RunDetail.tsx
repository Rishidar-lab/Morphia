import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, Run, RunEvent, RunStep } from "@/lib/types";
import { TERMINAL_STATES } from "@/lib/types";
import { LoadingSkeleton, ErrorState } from "@/components/ListStates";
import { StateBadge } from "@/components/StateBadge";

// Which explicit transition button, if any, a given state offers the operator.
const NEXT_STEP: Record<string, { label: string; target: string } | undefined> = {
  DRAFT: { label: "Start planning", target: "PLANNING" },
  PLANNING: { label: "Submit plan for approval", target: "AWAITING_PLAN_APPROVAL" },
  PAUSED: { label: "Resume", target: "QUEUED" },
  FAILED: { label: "Retry (new draft)", target: "DRAFT" },
};

function isLiveState(state: string): boolean {
  return state === "QUEUED" || state === "RUNNING";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
      <h2 className="text-sm font-medium text-gray-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const runQuery = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.get<Run>(`/api/v1/runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data && isLiveState(q.state.data.state) ? 1500 : false,
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
  const evidenceQuery = useQuery({
    queryKey: ["evidence"],
    queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence"),
  });

  // When the run reaches a terminal state, the steps/events polling stops —
  // but the last poll may have landed a beat before the final events (e.g.
  // `run.scope_denied`) were written. Force one more fetch on that transition.
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
      setJustification("");
      invalidate();
    },
    onError: (e) =>
      setActionError(e instanceof ApiError ? e.message : "Action failed."),
  });

  if (runQuery.isLoading) return <LoadingSkeleton rows={6} />;
  if (runQuery.isError || !runQuery.data) {
    return (
      <ErrorState
        message={
          runQuery.error instanceof ApiError
            ? runQuery.error.message
            : "Failed to load run."
        }
        onRetry={() => runQuery.refetch()}
      />
    );
  }

  const run = runQuery.data;
  const planSteps = run.plan?.steps ?? [];
  const isTerminal = TERMINAL_STATES.has(run.state);
  const isApprovalState =
    run.state === "AWAITING_PLAN_APPROVAL" || run.state === "AWAITING_ACTION_APPROVAL";
  const nextStep = NEXT_STEP[run.state];
  const runEvidence = (evidenceQuery.data ?? []).filter((e) => e.run_id === run.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/runs" className="text-xs text-gray-500 hover:text-gray-300">
          ← All runs
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-100">
            {run.title || "Untitled run"}
          </h1>
          <StateBadge state={run.state} />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {run.agent_profile || "no agent profile"} ·{" "}
          <Link to={`/projects/${run.project_id}`} className="hover:text-blue-400">
            project
          </Link>{" "}
          · created {new Date(run.created_at).toLocaleString()}
        </p>
        {run.state === "FAILED" && run.failure_reason && (
          <p className="mt-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2">
            {run.failure_reason}
          </p>
        )}
      </div>

      {/* ── Controls ───────────────────────────────────── */}
      {!isTerminal || run.state === "FAILED" ? (
        <Section title="Human-in-the-loop controls">
          {actionError && (
            <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
              {actionError}
            </div>
          )}
          {isApprovalState && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1.5">
                Decision justification
              </label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={2}
                className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="Why this plan/action is safe to proceed…"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isApprovalState && (
              <>
                <button
                  onClick={() =>
                    act.mutate(() =>
                      api.post(`/api/v1/runs/${run.id}/approve`, { justification }),
                    )
                  }
                  disabled={act.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() =>
                    act.mutate(() =>
                      api.post(`/api/v1/runs/${run.id}/reject`, { justification }),
                    )
                  }
                  disabled={act.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Reject
                </button>
              </>
            )}
            {nextStep && (
              <button
                onClick={() =>
                  act.mutate(() =>
                    api.post(`/api/v1/runs/${run.id}/transition`, {
                      target_state: nextStep.target,
                    }),
                  )
                }
                disabled={act.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                {nextStep.label}
              </button>
            )}
            {!isTerminal && (
              <button
                onClick={() => act.mutate(() => api.post(`/api/v1/runs/${run.id}/cancel`))}
                disabled={act.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel run
              </button>
            )}
            {isLiveState(run.state) && (
              <span className="text-xs text-gray-500">
                worker executing — refreshing automatically…
              </span>
            )}
          </div>
        </Section>
      ) : (
        <Section title="Human-in-the-loop controls">
          <p className="text-sm text-gray-500">
            This run is in the terminal <code>{run.state}</code> state. No further
            actions are possible.
          </p>
        </Section>
      )}

      {/* ── Plan ──────────────────────────────────────── */}
      <Section title={`Plan (${planSteps.length} step${planSteps.length === 1 ? "" : "s"})`}>
        {planSteps.length === 0 ? (
          <p className="text-sm text-gray-500">No plan attached to this run.</p>
        ) : (
          <ol className="space-y-3">
            {planSteps.map((step, i) => (
              <li
                key={i}
                className="border border-gray-800 rounded-md p-3 bg-gray-950/40 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-500">#{i + 1}</span>
                  <span className="text-gray-200 font-medium">{step.action}</span>
                  <span className="text-xs font-mono text-gray-500">→ {step.target}</span>
                </div>
                <p className="text-xs text-gray-500">{step.prompt}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* ── Step results ──────────────────────────────── */}
      <Section title="Step results">
        {(stepsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">
            No steps executed yet. Steps are produced by the worker after approval.
          </p>
        ) : (
          <div className="space-y-3">
            {stepsQuery.data!.map((s) => (
              <div key={s.id} className="border border-gray-800 rounded-md p-3 bg-gray-950/40">
                <div className="flex items-center gap-2 text-sm mb-1">
                  <span className="text-xs font-mono text-gray-500">#{s.step_number}</span>
                  <span className="text-gray-200">{s.action}</span>
                  <span
                    className={
                      "text-xs px-1.5 py-0.5 rounded " +
                      (s.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : s.status === "failed"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-gray-500/10 text-gray-400")
                    }
                  >
                    {s.status}
                  </span>
                </div>
                {s.output_data?.response != null && (
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap mt-2 max-h-48 overflow-y-auto">
                    {String(s.output_data.response)}
                  </pre>
                )}
                {s.error && <p className="text-xs text-red-400 mt-1">{s.error}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Evidence ──────────────────────────────────── */}
      {runEvidence.length > 0 && (
        <Section title="Evidence">
          <ul className="space-y-2 text-sm">
            {runEvidence.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className="text-gray-200">{e.original_filename}</span>
                <span
                  className="text-xs font-mono text-gray-500"
                  title={e.sha256_digest}
                >
                  sha256:{e.sha256_digest.slice(0, 12)}…
                </span>
                <span className="text-xs text-gray-600">{e.verification_status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Event timeline ────────────────────────────── */}
      <Section title="Event timeline">
        <ol className="relative border-l border-gray-800 ml-2 space-y-3">
          {(eventsQuery.data ?? []).map((ev) => (
            <li key={ev.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-gray-700 border border-gray-600" />
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-gray-500">
                  {new Date(ev.created_at).toLocaleTimeString()}
                </span>
                <span className="text-gray-200 font-mono">{ev.event_type}</span>
                {ev.from_state && ev.to_state && (
                  <span className="text-gray-500">
                    {ev.from_state} → {ev.to_state}
                  </span>
                )}
                <span className="text-gray-600">{ev.actor_id}</span>
              </div>
              {ev.payload?.reason != null && (
                <p className="text-xs text-red-400 mt-0.5">{String(ev.payload.reason)}</p>
              )}
              {ev.payload?.justification != null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  “{String(ev.payload.justification)}”
                </p>
              )}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
