import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Project, Run, RunState } from "@/lib/types";
import { RUN_STATES, CANCELLABLE_STATES, APPROVAL_STATES, TERMINAL_STATES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";
import { StateBadge } from "@/components/StateBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type RunAction = "cancel" | "approve" | "reject";

function RunListItem({
  run,
  projectName,
  expanded,
  onToggle,
}: {
  run: Run;
  projectName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<RunAction | null>(null);
  const [justification, setJustification] = useState("");

  const cancelMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/approve`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
      setJustification("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/reject`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
      setJustification("");
    },
  });

  const activeMutation =
    pendingAction === "cancel"
      ? cancelMutation
      : pendingAction === "approve"
        ? approveMutation
        : rejectMutation;

  const isCancellable = CANCELLABLE_STATES.has(run.state);
  const isAwaitingApproval = APPROVAL_STATES.has(run.state);
  const isTerminal = TERMINAL_STATES.has(run.state);

  return (
    <>
      <div className="border-b border-gray-800/60 last:border-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 py-3 px-4 text-left hover:bg-gray-800/30 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">
              {run.title || "Untitled run"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {projectName} · {new Date(run.created_at).toLocaleString()}
            </p>
          </div>
          <StateBadge state={run.state} className="flex-shrink-0" />
        </button>

        {expanded && (
          <div className="px-4 pb-4 -mt-1">
            <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Agent profile: </span>
                  <span className="text-gray-300">{run.agent_profile || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Updated: </span>
                  <span className="text-gray-300">
                    {new Date(run.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>
              {run.failure_reason && (
                <p className="text-xs text-red-400">{run.failure_reason}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                {isAwaitingApproval && (
                  <>
                    <button
                      onClick={() => setPendingAction("approve")}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setPendingAction("reject")}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                {!isAwaitingApproval && isCancellable && (
                  <button
                    onClick={() => setPendingAction("cancel")}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    Cancel Run
                  </button>
                )}
                {isTerminal && (
                  <span className="text-xs text-gray-600">
                    Terminal state — no further actions.
                  </span>
                )}
                <Link
                  to={`/projects/${run.project_id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
                >
                  View project →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingAction === "cancel"}
        title="Cancel run"
        description={`Cancel "${run.title || "this run"}"? This will move it to the CANCELLED terminal state.`}
        confirmLabel="Cancel Run"
        variant="danger"
        loading={cancelMutation.isPending}
        error={
          cancelMutation.isError
            ? cancelMutation.error instanceof ApiError
              ? cancelMutation.error.message
              : "Failed to cancel run."
            : null
        }
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "approve" || pendingAction === "reject"}
        title={pendingAction === "approve" ? "Approve run" : "Reject run"}
        description={
          pendingAction === "approve"
            ? "Approving will advance this run to the next state."
            : "Rejecting will move this run to CANCELLED."
        }
        confirmLabel={pendingAction === "approve" ? "Approve" : "Reject"}
        variant={pendingAction === "reject" ? "danger" : "default"}
        loading={activeMutation.isPending}
        error={
          activeMutation.isError
            ? activeMutation.error instanceof ApiError
              ? activeMutation.error.message
              : "Action failed."
            : null
        }
        onConfirm={() =>
          pendingAction === "approve" ? approveMutation.mutate() : rejectMutation.mutate()
        }
        onCancel={() => {
          setPendingAction(null);
          setJustification("");
        }}
      >
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Justification (optional)
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Reasoning for this decision..."
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

export default function Runs() {
  const [stateFilter, setStateFilter] = useState<RunState | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.get<Run[]>("/api/v1/runs"),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/v1/projects"),
  });

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectsQuery.data ?? []) map.set(p.id, p.name);
    return map;
  }, [projectsQuery.data]);

  const filteredRuns = useMemo(() => {
    const runs = runsQuery.data ?? [];
    if (stateFilter === "all") return runs;
    return runs.filter((r) => r.state === stateFilter);
  }, [runsQuery.data, stateFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Runs</h1>
          <p className="text-sm text-gray-500 mt-1">
            All orchestration runs across every project
          </p>
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as RunState | "all")}
          className="bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All states</option>
          {RUN_STATES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {runsQuery.isLoading && <LoadingSkeleton rows={5} />}

      {runsQuery.isError && (
        <ErrorState
          message={
            runsQuery.error instanceof ApiError
              ? runsQuery.error.message
              : "Failed to load runs."
          }
          onRetry={() => runsQuery.refetch()}
        />
      )}

      {!runsQuery.isLoading && !runsQuery.isError && filteredRuns.length === 0 && (
        <EmptyState
          title="No runs found"
          description={
            stateFilter === "all"
              ? "Create a run from within a project to get started."
              : `No runs currently in the ${stateFilter.replace(/_/g, " ")} state.`
          }
        />
      )}

      {!runsQuery.isLoading && !runsQuery.isError && filteredRuns.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
          {filteredRuns.map((run) => (
            <RunListItem
              key={run.id}
              run={run}
              projectName={projectNameById.get(run.project_id) ?? "Unknown project"}
              expanded={expandedId === run.id}
              onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
