import { useState } from "react";
import type { Run, RunEvent, RunStep } from "@/lib/types";
import { clsx } from "clsx";

type NodeState = "pending" | "active" | "passed" | "blocked" | "failed" | "awaiting" | "completed";

interface GraphNode {
  id: string;
  label: string;
  sublabel: string;
  state: NodeState;
  detail?: string;
  timestamp?: string;
  actor?: string;
}

function stateStyles(state: NodeState) {
  switch (state) {
    case "passed":
    case "completed":
      return {
        border: "1px solid var(--pass-border)",
        bg: "var(--pass-bg)",
        dot: "var(--pass)",
        text: "var(--pass)",
        label: "var(--text-primary)",
      };
    case "active":
      return {
        border: "1px solid var(--active-border)",
        bg: "var(--active-bg)",
        dot: "var(--active)",
        text: "var(--active)",
        label: "var(--text-primary)",
      };
    case "awaiting":
      return {
        border: "1px solid var(--attention-border)",
        bg: "var(--attention-bg)",
        dot: "var(--attention)",
        text: "var(--attention)",
        label: "var(--text-primary)",
      };
    case "blocked":
    case "failed":
      return {
        border: "1px solid var(--deny-border)",
        bg: "var(--deny-bg)",
        dot: "var(--deny)",
        text: "var(--deny)",
        label: "var(--text-primary)",
      };
    case "pending":
    default:
      return {
        border: "1px solid var(--border-subtle)",
        bg: "transparent",
        dot: "var(--text-faint)",
        text: "var(--text-faint)",
        label: "var(--text-muted)",
      };
  }
}

function deriveGraph(run: Run, events: RunEvent[], steps: RunStep[]): GraphNode[] {
  const hasEvent = (type: string) => events.some((e) => e.event_type === type);
  const lastEvent = (type: string) => [...events].reverse().find((e) => e.event_type === type);
  const isFailedScope = run.state === "FAILED" && run.failure_reason?.toLowerCase().includes("scope");
  const isFailed = run.state === "FAILED";
  const isCompleted = run.state === "COMPLETED";

  // Determine where we are
  const order: Record<string, number> = {
    DRAFT: 0,
    PLANNING: 1,
    AWAITING_PLAN_APPROVAL: 2,
    QUEUED: 3,
    RUNNING: 4,
    AWAITING_ACTION_APPROVAL: 4,
    PAUSED: 4,
    COMPLETED: 7,
    FAILED: 7,
    CANCELLED: 7,
  };
  const pos = order[run.state] ?? 0;

  const planSteps = run.plan?.steps ?? [];
  const target = planSteps[0]?.target ?? "—";

  const nodes: GraphNode[] = [
    {
      id: "target",
      label: "TARGET",
      sublabel: target,
      state: pos >= 0 ? "passed" : "pending",
      detail: `Submitted target: ${target}`,
      timestamp: run.created_at,
    },
    {
      id: "scope-api",
      label: "SCOPE VALIDATION",
      sublabel: "API · default-deny",
      state: isFailedScope ? "blocked" : pos >= 1 ? "passed" : "pending",
      detail: isFailedScope ? run.failure_reason : "API scope check: PASS — engagement scope matched",
      timestamp: events.find((e) => e.event_type === "run.transition")?.created_at,
    },
    {
      id: "planning",
      label: "PLANNING",
      sublabel: planSteps.length ? `${planSteps.length} step${planSteps.length > 1 ? "s" : ""}` : "no plan",
      state:
        run.state === "PLANNING"
          ? "active"
          : pos > 1
            ? "passed"
            : pos === 1
              ? "active"
              : "pending",
      detail: planSteps.map((s) => `${s.action} → ${s.target}`).join(", ") || "Drafting plan",
    },
    {
      id: "approval",
      label: "HUMAN APPROVAL",
      sublabel: run.state === "AWAITING_PLAN_APPROVAL" || run.state === "AWAITING_ACTION_APPROVAL" ? "AWAITING" : pos > 2 ? "APPROVED" : "GATE",
      state:
        run.state === "AWAITING_PLAN_APPROVAL" || run.state === "AWAITING_ACTION_APPROVAL"
          ? "awaiting"
          : pos > 2
            ? "passed"
            : "pending",
      detail:
        hasEvent("approval.approved") || hasEvent("run.approved")
          ? `Approved — ${lastEvent("approval.approved")?.payload?.justification ?? lastEvent("run.approved")?.payload?.justification ?? "human authorization recorded"}`
          : run.state === "AWAITING_PLAN_APPROVAL"
            ? "Execution paused — human authorization required"
            : "Gate closed until human approves",
      timestamp: lastEvent("approval.approved")?.created_at ?? lastEvent("run.approved")?.created_at,
      actor: lastEvent("approval.approved")?.actor_id ?? undefined,
    },
    {
      id: "queue",
      label: "QUEUE",
      sublabel: "Redis · morphia:jobs",
      state: run.state === "QUEUED" ? "active" : pos > 3 ? "passed" : "pending",
      detail: pos >= 3 ? "Enqueued for worker" : "Awaiting approval",
    },
    {
      id: "revalidation",
      label: "WORKER REVALIDATION",
      sublabel: "independent · live check",
      state: isFailedScope ? "blocked" : run.state === "RUNNING" || pos > 4 ? "passed" : "pending",
      detail: isFailedScope ? "Worker scope revalidation: DENY — execution prevented" : pos >= 4 ? "Worker scope revalidation: PASS" : "Awaiting dispatch",
    },
    {
      id: "execution",
      label: "EXECUTION",
      sublabel: steps.length ? `${steps.length} step${steps.length > 1 ? "s" : ""}` : "—",
      state:
        run.state === "RUNNING"
          ? "active"
          : isFailed
            ? "failed"
            : isCompleted
              ? "passed"
              : pos > 4
                ? "passed"
                : "pending",
      detail: isFailed ? run.failure_reason || "Execution failed" : steps[0]?.output_data ? String(steps[0].output_data.response ?? "").slice(0, 120) : "Provider execution",
      timestamp: steps[0]?.created_at,
    },
    {
      id: "evidence",
      label: "EVIDENCE",
      sublabel: steps.length ? "artifact captured" : "—",
      state: steps.length || isCompleted ? "passed" : isFailed ? "failed" : "pending",
      detail: steps.length ? "Evidence artifact captured with SHA-256" : "No evidence yet",
    },
    {
      id: "finding",
      label: "FINDING",
      sublabel: isCompleted ? "verified" : "—",
      state: isCompleted ? "completed" : isFailed ? "failed" : "pending",
      detail: isCompleted ? "Finding verified from evidence" : "Awaiting evidence verification",
    },
  ];

  // If blocked, mark downstream as blocked
  if (isFailedScope) {
    let block = false;
    for (const n of nodes) {
      if (n.id === "scope-api" || n.id === "revalidation") block = true;
      if (block && n.state === "pending") n.state = "blocked";
      if (block && (n.id === "execution" || n.id === "evidence" || n.id === "finding")) {
        n.state = "blocked";
        n.sublabel = "PREVENTED";
      }
    }
  }

  return nodes;
}

export function ExecutionGraph({
  run,
  events,
  steps,
  compact,
}: {
  run: Run;
  events: RunEvent[];
  steps: RunStep[];
  compact?: boolean;
}) {
  const nodes = deriveGraph(run, events, steps);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  return (
    <div data-testid="execution-graph">
      {/* Desktop: horizontal graph, Mobile: vertical timeline */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <div className="flex items-stretch gap-0 min-w-[960px]">
          {nodes.map((node, i) => {
            const s = stateStyles(node.state);
            const isSelected = selected === node.id;
            return (
              <div key={node.id} className="flex items-stretch flex-1">
                <button
                  onClick={() => setSelected(isSelected ? null : node.id)}
                  className={clsx(
                    "flex-1 flex flex-col items-center text-left p-3 rounded-[6px] transition-all text-center relative",
                    isSelected && "ring-1 ring-offset-0",
                  )}
                  style={{
                    background: s.bg,
                    border: s.border,
                    opacity: node.state === "pending" ? 0.6 : 1,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full mb-2 flex-shrink-0"
                    style={{ background: s.dot, boxShadow: node.state === "active" ? `0 0 8px ${s.dot}` : undefined }}
                  />
                  <span
                    className="text-[11px] font-semibold tracking-[0.08em] leading-none"
                    style={{ color: s.label }}
                  >
                    {node.label}
                  </span>
                  <span className="mono text-[10px] mt-1 leading-tight line-clamp-2" style={{ color: s.text }}>
                    {node.sublabel}
                  </span>
                  {node.state === "awaiting" && (
                    <span
                      className="mt-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "var(--attention-bg)", border: "1px solid var(--attention-border)", color: "var(--attention)" }}
                    >
                      ACTION REQUIRED
                    </span>
                  )}
                  {node.state === "blocked" && (
                    <span className="mt-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>
                      BLOCKED
                    </span>
                  )}
                  {node.state === "active" && (
                    <span className="mt-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium animate-pulse" style={{ background: "var(--active-bg)", border: "1px solid var(--active-border)", color: "var(--active)" }}>
                      ACTIVE
                    </span>
                  )}
                </button>
                {i < nodes.length - 1 && (
                  <div className="flex items-center px-1 flex-shrink-0">
                    <div
                      className="w-4 h-px"
                      style={{
                        background:
                          nodes[i].state === "pending" || nodes[i + 1].state === "pending"
                            ? "var(--border-subtle)"
                            : nodes[i + 1].state === "blocked"
                              ? "var(--deny)"
                              : "var(--border-strong)",
                      }}
                    />
                    <div
                      className="w-1 h-1 rotate-45 -ml-0.5"
                      style={{
                        borderTop: `1px solid ${nodes[i + 1].state === "blocked" ? "var(--deny)" : "var(--border-strong)"}`,
                        borderRight: `1px solid ${nodes[i + 1].state === "blocked" ? "var(--deny)" : "var(--border-strong)"}`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile / compact: vertical timeline */}
      <div className={clsx("lg:hidden", compact && "hidden lg:block")}>
        <div className="relative pl-6 space-y-0">
          <div className="absolute left-2 top-2 bottom-2 w-px" style={{ background: "var(--border-subtle)" }} />
          {nodes.map((node) => {
            const s = stateStyles(node.state);
            const isSelected = selected === node.id;
            return (
              <button
                key={node.id}
                onClick={() => setSelected(isSelected ? null : node.id)}
                className="relative flex items-center gap-3 w-full text-left py-2.5"
              >
                <span
                  className="absolute left-[-20px] h-2.5 w-2.5 rounded-full border-2"
                  style={{ background: node.state === "pending" ? "var(--bg-0)" : s.dot, borderColor: s.dot }}
                />
                <span className="mono text-[11px] font-medium tracking-wide flex-1" style={{ color: s.label }}>
                  {node.label}
                </span>
                <span className="mono text-[11px]" style={{ color: s.text }}>
                  {node.sublabel}
                </span>
                <span className={clsx("text-[10px] px-1.5 py-0.5 rounded", node.state === "blocked" && "font-bold")} style={{ background: s.bg, border: s.border, color: s.text }}>
                  {node.state.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="mt-3 rounded-[6px] p-3 flex items-start justify-between gap-3" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)" }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
              {selectedNode.label}{" "}
              <span className="mono font-normal" style={{ color: "var(--text-muted)" }}>
                · {selectedNode.sublabel}
              </span>
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {selectedNode.detail}
            </p>
            {selectedNode.timestamp && (
              <p className="mono text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                {new Date(selectedNode.timestamp).toLocaleString()} {selectedNode.actor ? `· ${selectedNode.actor}` : ""}
              </p>
            )}
          </div>
          <button onClick={() => setSelected(null)} className="text-[11px] px-2 py-1 rounded flex-shrink-0" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
            Close
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
        {[
          ["passed", "var(--pass)"],
          ["active", "var(--active)"],
          ["awaiting", "var(--attention)"],
          ["blocked", "var(--deny)"],
          ["pending", "var(--text-faint)"],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="mono" style={{ color: "var(--text-muted)" }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
