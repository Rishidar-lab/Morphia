import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Project, Run } from "@/lib/types";
import { APPROVAL_STATES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Decision = "approve" | "reject";

function ApprovalCard({ run, projectName }: { run: Run; projectName: string }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [justification, setJustification] = useState("");

  const approveMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/approve`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setDecision(null);
      setJustification("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/reject`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setDecision(null);
      setJustification("");
    },
  });

  const activeMutation = decision === "approve" ? approveMutation : rejectMutation;

  const approvalType = run.state === "AWAITING_PLAN_APPROVAL" ? "Plan" : "Action";

  return (
    <>
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-100 truncate">
              {run.title || "Untitled run"}
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/30">
              {approvalType} approval
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {projectName} · requested by {run.created_by} ·{" "}
            {new Date(run.updated_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setDecision("approve")}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => setDecision("reject")}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Reject
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={decision !== null}
        title={decision === "approve" ? "Approve run" : "Reject run"}
        description={
          decision === "approve"
            ? `Approve the ${approvalType.toLowerCase()} for "${run.title || "this run"}"? This advances it to the next state.`
            : `Reject the ${approvalType.toLowerCase()} for "${run.title || "this run"}"? This moves it to CANCELLED.`
        }
        confirmLabel={decision === "approve" ? "Approve" : "Reject"}
        variant={decision === "reject" ? "danger" : "default"}
        loading={activeMutation.isPending}
        error={
          activeMutation.isError
            ? activeMutation.error instanceof ApiError
              ? activeMutation.error.message
              : "Action failed."
            : null
        }
        onConfirm={() =>
          decision === "approve" ? approveMutation.mutate() : rejectMutation.mutate()
        }
        onCancel={() => {
          setDecision(null);
          setJustification("");
        }}
      >
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Justification</label>
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

export default function Approvals() {
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

  const pendingRuns = useMemo(
    () => (runsQuery.data ?? []).filter((r) => APPROVAL_STATES.has(r.state)),
    [runsQuery.data],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Runs currently awaiting plan or action approval
        </p>
      </div>

      {runsQuery.isLoading && <LoadingSkeleton rows={3} />}

      {runsQuery.isError && (
        <ErrorState
          message={
            runsQuery.error instanceof ApiError
              ? runsQuery.error.message
              : "Failed to load approvals."
          }
          onRetry={() => runsQuery.refetch()}
        />
      )}

      {!runsQuery.isLoading && !runsQuery.isError && pendingRuns.length === 0 && (
        <EmptyState title="No pending approvals" />
      )}

      {!runsQuery.isLoading && !runsQuery.isError && pendingRuns.length > 0 && (
        <div className="space-y-3">
          {pendingRuns.map((run) => (
            <ApprovalCard
              key={run.id}
              run={run}
              projectName={projectNameById.get(run.project_id) ?? "Unknown project"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
