import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, ApiError } from "@/lib/api";
import type { Workflow, WorkflowNode, WorkflowNodeType, WorkflowStatus } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const STATUS_STYLE: Record<WorkflowStatus, string> = {
  active: "bg-green-500/10 text-green-300 border-green-500/30",
  draft: "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/30",
  archived: "bg-red-500/10 text-red-300 border-red-500/30",
};

const NODE_TYPE_STYLE: Record<WorkflowNodeType, { bg: string; text: string; border: string; label: string }> = {
  entry: { bg: "bg-blue-500/10", text: "text-[var(--active)]", border: "border-blue-500/40", label: "Entry" },
  step: { bg: "bg-gray-800/60", text: "text-[var(--text-primary)]", border: "border-[var(--border-default)]", label: "Step" },
  approval_gate: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/40",
    label: "Approval Gate",
  },
  exit: { bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/40", label: "Exit" },
};

/**
 * Default workflow templates, shown until GET /api/v1/workflows is backed
 * by a real store. Node graphs are explicit — not decorative — reflecting
 * how the orchestrator actually walks entry -> steps -> approval gates -> exit.
 */
const DEFAULT_WORKFLOWS: Workflow[] = [
  {
    id: "standard_recon_to_report",
    name: "Standard Recon → Report",
    description:
      "Passive reconnaissance, scope-checked active scanning gated by approval, finding triage, and report generation.",
    version: 3,
    status: "active",
    last_run_at: "2026-08-01T14:22:00Z",
    created_at: "2026-05-12T09:00:00Z",
    nodes: [
      { id: "entry", type: "entry", name: "Project Planning", next: ["passive_recon"] },
      { id: "passive_recon", type: "step", name: "Passive Recon", next: ["scope_check"] },
      { id: "scope_check", type: "step", name: "Scope Validation", next: ["plan_approval"] },
      {
        id: "plan_approval",
        type: "approval_gate",
        name: "Plan Approval",
        next: ["active_scan"],
      },
      { id: "active_scan", type: "step", name: "Active Scanning", next: ["action_approval"] },
      {
        id: "action_approval",
        type: "approval_gate",
        name: "Action Approval",
        next: ["triage"],
      },
      { id: "triage", type: "step", name: "Finding Triage", next: ["report"] },
      { id: "report", type: "step", name: "Report Generation", next: ["exit"] },
      { id: "exit", type: "exit", name: "Complete", next: [] },
    ],
  },
  {
    id: "bug_bounty_triage",
    name: "Bug Bounty Triage",
    description:
      "Lightweight loop for continuous passive monitoring of bounty-program scope with human review before any active step.",
    version: 1,
    status: "draft",
    last_run_at: null,
    created_at: "2026-07-20T11:00:00Z",
    nodes: [
      { id: "entry", type: "entry", name: "Scope Sync", next: ["monitor"] },
      { id: "monitor", type: "step", name: "Passive Monitoring", next: ["review_gate"] },
      { id: "review_gate", type: "approval_gate", name: "Human Review", next: ["exit"] },
      { id: "exit", type: "exit", name: "Complete", next: [] },
    ],
  },
];

function WorkflowGraph({ nodes }: { nodes: WorkflowNode[] }) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entry = nodes.find((n) => n.type === "entry");

  // Linearize by following `next` from the entry node — workflows here are
  // simple chains, but this walk still works for the common case and falls
  // back to declaration order for anything unreachable from entry.
  const ordered: WorkflowNode[] = [];
  const visited = new Set<string>();
  let current = entry;
  while (current && !visited.has(current.id)) {
    ordered.push(current);
    visited.add(current.id);
    current = current.next.length > 0 ? nodeById.get(current.next[0]) : undefined;
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) ordered.push(n);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ordered.map((node, i) => {
        const style = NODE_TYPE_STYLE[node.type];
        return (
          <div key={node.id} className="flex items-center gap-2">
            <div
              className={clsx(
                "rounded-md border px-3 py-2 text-xs",
                style.bg,
                style.text,
                style.border,
              )}
            >
              <p className="text-[10px] uppercase tracking-wider opacity-70">{style.label}</p>
              <p className="font-medium mt-0.5">{node.name}</p>
            </div>
            {i < ordered.length - 1 && <span className="text-[var(--text-faint)]">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const [expanded, setExpanded] = useState(false);
  const stepCount = workflow.nodes.filter((n) => n.type === "step").length;
  const gateCount = workflow.nodes.filter((n) => n.type === "approval_gate").length;

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{workflow.name}</h2>
            <span className="text-xs text-[var(--text-faint)]">v{workflow.version}</span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">{workflow.description}</p>
        </div>
        <span
          className={
            "text-xs px-2 py-0.5 rounded-full border capitalize whitespace-nowrap " +
            STATUS_STYLE[workflow.status]
          }
        >
          {workflow.status}
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-faint)]">
        <span>{workflow.nodes.length} nodes</span>
        <span>{stepCount} steps</span>
        <span>{gateCount} approval gates</span>
        <span>
          {workflow.last_run_at
            ? `Last run ${new Date(workflow.last_run_at).toLocaleDateString()}`
            : "Never run"}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[var(--active)] hover:text-[var(--active)]"
        >
          {expanded ? "Hide structure" : "View structure"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border-default)] overflow-x-auto">
          <WorkflowGraph nodes={workflow.nodes} />
        </div>
      )}
    </div>
  );
}

export default function Workflows() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.get<Workflow[]>("/api/v1/workflows"),
    retry: false,
    placeholderData: DEFAULT_WORKFLOWS,
  });

  const notImplemented = isError && error instanceof ApiError && error.status === 404;
  const workflows = notImplemented ? DEFAULT_WORKFLOWS : data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Workflows</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">
            Orchestration templates defining how runs move from entry to exit
          </p>
        </div>
        <button
          disabled
          title="Workflow authoring is not available yet"
          className="px-3.5 py-2 text-sm font-medium rounded-md bg-blue-800 text-white/60 cursor-not-allowed"
        >
          Create Workflow
        </button>
      </div>

      <div className="mb-5 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
        Reference view. These are the built-in orchestration templates; authoring
        and a <code>GET /api/v1/workflows</code> endpoint are on the roadmap.
      </div>

      {isLoading && <LoadingSkeleton rows={3} />}

      {isError && !notImplemented && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load workflows."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && workflows.length === 0 && (
        <EmptyState
          title="No workflows defined"
          description="Workflows describe the entry, step, approval-gate, and exit nodes a run traverses."
        />
      )}

      {!isLoading && workflows.length > 0 && (
        <div className="space-y-4">
          {workflows.map((wf) => (
            <WorkflowCard key={wf.id} workflow={wf} />
          ))}
        </div>
      )}
    </div>
  );
}
