import type { RunState } from "@/lib/types";

interface StateStyle {
  label: string;
  color: string;
  bg: string;
  border: string;
}

const STATE_STYLES: Record<RunState, StateStyle> = {
  DRAFT: { label: "Draft", color: "var(--text-muted)", bg: "transparent", border: "var(--border-subtle)" },
  PLANNING: { label: "Planning", color: "var(--active)", bg: "var(--active-bg)", border: "var(--active-border)" },
  AWAITING_PLAN_APPROVAL: { label: "Awaiting Plan Approval", color: "var(--attention)", bg: "var(--attention-bg)", border: "var(--attention-border)" },
  QUEUED: { label: "Queued", color: "#7dd3fc", bg: "rgba(125,211,252,0.08)", border: "rgba(125,211,252,0.25)" },
  RUNNING: { label: "Running", color: "var(--active)", bg: "var(--active-bg)", border: "var(--active-border)" },
  AWAITING_ACTION_APPROVAL: { label: "Awaiting Action Approval", color: "var(--attention)", bg: "var(--attention-bg)", border: "var(--attention-border)" },
  PAUSED: { label: "Paused", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)" },
  COMPLETED: { label: "Completed", color: "var(--pass)", bg: "var(--pass-bg)", border: "var(--pass-border)" },
  FAILED: { label: "Failed", color: "var(--deny)", bg: "var(--deny-bg)", border: "var(--deny-border)" },
  CANCELLED: { label: "Cancelled", color: "var(--text-faint)", bg: "transparent", border: "var(--border-subtle)" },
};

export function StateBadge({ state, className }: { state: RunState | string; className?: string }) {
  const style = STATE_STYLES[state as RunState] ?? { label: state, color: "var(--text-muted)", bg: "transparent", border: "var(--border-subtle)" };
  return (
    <span
      className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap mono " + (className ?? "")}
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: style.color }} />
      {style.label}
    </span>
  );
}
