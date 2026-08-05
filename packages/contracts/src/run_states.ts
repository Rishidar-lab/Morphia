/**
 * Canonical Run State definitions — shared between frontend and backend.
 *
 * The Python backend defines these in apps/api/app/models/runs.py (RunState enum).
 * This TypeScript mirror MUST stay in sync. Any state added to the backend
 * must be added here, and vice versa.
 */

export const RUN_STATES = [
  "DRAFT",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "QUEUED",
  "RUNNING",
  "AWAITING_ACTION_APPROVAL",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type RunState = (typeof RUN_STATES)[number];

/** States where the cancel control should appear */
export const CANCELLABLE_STATES: ReadonlySet<RunState> = new Set([
  "DRAFT",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "QUEUED",
  "RUNNING",
  "AWAITING_ACTION_APPROVAL",
  "PAUSED",
]);

/** States where approval/reject controls should appear */
export const APPROVAL_STATES: ReadonlySet<RunState> = new Set([
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_ACTION_APPROVAL",
]);

/** Terminal states — no further transitions possible */
export const TERMINAL_STATES: ReadonlySet<RunState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

/** Legal state transitions (mirrors backend LEGAL_TRANSITIONS) */
export const LEGAL_TRANSITIONS: Record<RunState, ReadonlySet<RunState>> = {
  DRAFT: new Set(["PLANNING", "CANCELLED"]),
  PLANNING: new Set(["AWAITING_PLAN_APPROVAL", "FAILED", "CANCELLED"]),
  AWAITING_PLAN_APPROVAL: new Set(["QUEUED", "CANCELLED"]),
  QUEUED: new Set(["RUNNING", "FAILED", "CANCELLED"]),
  RUNNING: new Set([
    "AWAITING_ACTION_APPROVAL",
    "PAUSED",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ]),
  AWAITING_ACTION_APPROVAL: new Set(["RUNNING", "CANCELLED"]),
  PAUSED: new Set(["QUEUED", "CANCELLED"]),
  COMPLETED: new Set(),
  FAILED: new Set(["DRAFT"]),
  CANCELLED: new Set(),
};
