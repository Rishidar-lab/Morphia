/**
 * Shared TypeScript types mirroring backend Pydantic/SQLAlchemy schemas.
 *
 * RunState mirrors the canonical definitions in
 * packages/contracts/src/run_states.ts, which in turn mirrors the backend's
 * single source of truth (apps/api/app/models/runs.py::RunState). Any state
 * added there MUST be mirrored here.
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

// ── Auth ─────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

// ── Projects ─────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

// ── Engagements ──────────────────────────────────────────
export interface Engagement {
  id: string;
  project_id: string;
  program_name: string;
  authorization_basis: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Scope ────────────────────────────────────────────────
export type ScopeRuleType = "include" | "exclude";

export interface ScopeRule {
  id: string;
  engagement_id: string;
  rule_type: ScopeRuleType;
  target_type: string;
  pattern: string;
  is_wildcard: boolean;
  notes: string;
  created_at: string;
}

// ── Assets ───────────────────────────────────────────────
export interface Asset {
  id: string;
  engagement_id: string;
  asset_type: string;
  identifier: string;
  description: string;
  is_excluded: boolean;
  created_at: string;
}

// ── Runs ─────────────────────────────────────────────────
export interface RunPlanStep {
  action: string;
  target: string;
  prompt: string;
}

export interface RunPlan {
  steps: RunPlanStep[];
}

export interface Run {
  id: string;
  project_id: string;
  engagement_id: string | null;
  state: RunState;
  title: string;
  plan: RunPlan | null;
  agent_profile: string | null;
  failure_reason: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_number: number;
  action: string;
  status: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error: string;
  created_at: string;
}

export interface RunEvent {
  id: string;
  run_id: string;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  actor_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ── Approvals ────────────────────────────────────────────
export type ApprovalType = "plan" | "action";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  run_id: string;
  approval_type: ApprovalType;
  status: ApprovalStatus;
  requested_by: string;
  decided_by: string | null;
  justification: string;
  decided_at: string | null;
  created_at: string;
  // Enriched fields the API may include for display purposes.
  run_title?: string;
  project_name?: string;
}

// ── Audit Log ────────────────────────────────────────────
export interface AuditEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  action: string;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ── Findings ─────────────────────────────────────────────
// Mirrors apps/api/app/models/findings.py and FindingResponse.
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export const FINDING_STATES = [
  "candidate",
  "needs_evidence",
  "needs_reproduction",
  "verified",
  "rejected",
  "duplicate",
  "report_ready",
  "submitted",
  "triaged",
  "resolved",
] as const;
export type FindingState = (typeof FINDING_STATES)[number];

export interface Finding {
  id: string;
  project_id: string;
  title: string;
  observation: string;
  hypothesis: string;
  verification_method: string;
  actual_result: string;
  expected_result: string;
  affected_scope: string;
  security_impact: string;
  uncertainty: string;
  severity: FindingSeverity;
  suggested_severity: string | null;
  cwe_id: string | null;
  cvss_vector: string | null;
  remediation: string;
  disclosure_status: string;
  state: FindingState;
  creator_id: string;
  reviewer_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Reports ──────────────────────────────────────────────
// Mirrors apps/api/app/models/reports.py.
export const REPORT_STATUSES = [
  "draft",
  "review",
  "final",
  "submitted",
  "acknowledged",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_FORMATS = ["markdown", "html", "json"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface Report {
  id: string;
  project_id: string;
  project_name?: string;
  title: string;
  summary: string;
  affected_asset: string;
  scope_confirmation: string;
  prerequisites: string;
  reproduction_steps: string;
  expected_result: string;
  actual_result: string;
  impact: string;
  severity_rationale: string;
  cwe_id: string | null;
  cvss_vector: string | null;
  remediation: string;
  limitations: string;
  disclosure_timeline: Array<Record<string, unknown>> | null;
  status: ReportStatus;
  format: ReportFormat;
  creator_id: string;
  created_at: string;
  updated_at: string;
  finding_count?: number;
}

// ── Evidence ─────────────────────────────────────────────
// Mirrors apps/api/app/models/evidence.py and EvidenceResponse.
export const EVIDENCE_VERIFICATION_STATUSES = [
  "unreviewed",
  "source_captured",
  "integrity_verified",
  "manually_reproduced",
  "contradicted",
  "inconclusive",
  "rejected",
] as const;
export type VerificationStatus = (typeof EVIDENCE_VERIFICATION_STATUSES)[number];

export interface EvidenceArtifact {
  id: string;
  project_id: string;
  engagement_id: string | null;
  run_id: string | null;
  run_step_id: string | null;
  creator_id: string;
  source: string;
  acquisition_timestamp: string | null;
  content_type: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  sha256_digest: string;
  sensitivity: string;
  verification_status: VerificationStatus;
  reviewer_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Dashboard ────────────────────────────────────────────
export interface DashboardSummary {
  projects: number;
  engagements: number;
  runs: number;
  active_runs: number;
  pending_approvals: number;
  evidence: number;
  findings: number;
  verified_findings: number;
  reports: number;
}

// ── System status (GET /api/v1/system/status — no secret material) ──
export type HealthState = "ok" | "degraded" | "unknown";

export interface HealthCheck {
  status: HealthState;
  detail: string;
}

export interface SystemStatus {
  version: string;
  environment: string;
  debug: boolean;
  provider: string;
  storage_backend: string;
  session_lifetime_hours: number;
  database: HealthCheck;
  redis: HealthCheck;
  worker: HealthCheck;
  migration: HealthCheck;
  checked_at: string;
}

// ── Agent Profiles ───────────────────────────────────────
export type ApprovalLevel = "none" | "plan_only" | "action_level" | "full";

export interface AgentProfile {
  id: string;
  name: string;
  purpose: string;
  allowed_tools: string[];
  max_cost_usd: number;
  approval_level: ApprovalLevel;
}

// ── Workflows ────────────────────────────────────────────
export type WorkflowNodeType = "entry" | "step" | "approval_gate" | "exit";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  next: string[];
}

export type WorkflowStatus = "active" | "draft" | "archived";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: number;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  last_run_at: string | null;
  created_at: string;
}
