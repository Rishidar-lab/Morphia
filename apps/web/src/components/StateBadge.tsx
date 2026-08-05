import { clsx } from "clsx";
import type { RunState } from "@/lib/types";

interface StateStyle {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
}

const STATE_STYLES: Record<RunState, StateStyle> = {
  DRAFT: {
    label: "Draft",
    dot: "bg-gray-400",
    text: "text-gray-300",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  },
  PLANNING: {
    label: "Planning",
    dot: "bg-blue-400",
    text: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  AWAITING_PLAN_APPROVAL: {
    label: "Awaiting Plan Approval",
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  QUEUED: {
    label: "Queued",
    dot: "bg-sky-400",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
  },
  RUNNING: {
    label: "Running",
    dot: "bg-green-400",
    text: "text-green-300",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  AWAITING_ACTION_APPROVAL: {
    label: "Awaiting Action Approval",
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  PAUSED: {
    label: "Paused",
    dot: "bg-purple-400",
    text: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  COMPLETED: {
    label: "Completed",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  FAILED: {
    label: "Failed",
    dot: "bg-red-400",
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-gray-400",
    text: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  },
};

export function StateBadge({
  state,
  className,
}: {
  state: RunState | string;
  className?: string;
}) {
  const style = STATE_STYLES[state as RunState] ?? {
    label: state,
    dot: "bg-gray-400",
    text: "text-gray-300",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        style.bg,
        style.text,
        style.border,
        className,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full flex-shrink-0", style.dot)} />
      {style.label}
    </span>
  );
}
