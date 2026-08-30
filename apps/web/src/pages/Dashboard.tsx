import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AuditEvent,
  DashboardSummary,
  EvidenceArtifact,
  Finding,
  Project,
  Run,
} from "@/lib/types";

const EMPTY: DashboardSummary = {
  projects: 0,
  engagements: 0,
  runs: 0,
  active_runs: 0,
  pending_approvals: 0,
  evidence: 0,
  findings: 0,
  verified_findings: 0,
  reports: 0,
};

export default function Dashboard() {
  const summaryQ = useQuery({ queryKey: ["dashboard-summary"], queryFn: () => api.get<DashboardSummary>("/api/v1/dashboard/summary") });
  const auditQ = useQuery({ queryKey: ["audit-events"], queryFn: () => api.get<AuditEvent[]>("/api/v1/audit-events") });
  const runsQ = useQuery({ queryKey: ["runs"], queryFn: () => api.get<Run[]>("/api/v1/runs") });
  const evidenceQ = useQuery({ queryKey: ["evidence"], queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence") });
  const findingsQ = useQuery({ queryKey: ["findings"], queryFn: () => api.get<Finding[]>("/api/v1/findings") });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/api/v1/projects") });

  const s = summaryQ.data ?? EMPTY;
  const audit = auditQ.data ?? [];
  const runs = runsQ.data ?? [];
  const evidence = evidenceQ.data ?? [];
  const findings = findingsQ.data ?? [];
  const projects = projectsQ.data ?? [];

  const pending = runs.filter((r) => r.state === "AWAITING_PLAN_APPROVAL" || r.state === "AWAITING_ACTION_APPROVAL");
  const active = runs.filter((r) => r.state === "QUEUED" || r.state === "RUNNING");
  const latestEvidence = evidence[0];
  const latestFinding = findings.find((f) => f.state === "verified") ?? findings[0];
  const recentAudit = audit.slice(0, 6);

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-bold tracking-[0.02em]" style={{ color: "var(--text-primary)" }}>OVERVIEW</h1>
          <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
            {projects.length} project{projects.length === 1 ? "" : "s"} · {s.engagements} engagement{s.engagements === 1 ? "" : "s"}
          </span>
          <Link to="/operations" className="mono text-[11px] px-3 py-1 rounded-[6px] ml-auto" style={{ background: "var(--text-primary)", color: "var(--bg-0)" }}>
            Open Operations Canvas →
          </Link>
        </div>
        <p className="mono text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          Active engagement · current operation · scope state · pending decisions · governance
        </p>
      </div>

      {/* Current operation — prioritized over metrics */}
      {pending.length > 0 && (
        <div className="rounded-[6px] p-4 flex items-center justify-between gap-4" style={{ background: "var(--attention-bg)", border: "1px solid var(--attention-border)" }}>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--attention)" }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--attention)" }}>{pending.length} EXECUTION{pending.length > 1 ? "S" : ""} AWAITING HUMAN AUTHORIZATION</p>
              <p className="mono text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{pending[0].title} · {pending[0].state} · agent {pending[0].agent_profile ?? "—"}</p>
            </div>
          </div>
          <Link to={`/runs/${pending[0].id}`} className="mono text-xs px-3 py-1.5 rounded-[6px] flex-shrink-0" style={{ background: "var(--attention)", color: "white" }}>
            Review gate →
          </Link>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: engagement / scope / operation */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <span className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>CURRENT OPERATION</span>
              <Link to="/runs" className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>{runs.length} runs →</Link>
            </div>
            {runs.length === 0 ? (
              <div className="p-6 text-center mono text-xs" style={{ color: "var(--text-faint)" }}>
                No runs yet — create an engagement and launch a run to begin the Scope → Plan → Approval → Execution → Evidence flow
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {runs.slice(0, 5).map((r) => (
                  <Link key={r.id} to={`/runs/${r.id}`} className="px-4 py-3 flex items-center gap-3 hover:opacity-80">
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: r.state === "COMPLETED" ? "var(--pass)" : r.state === "FAILED" ? "var(--deny)" : r.state.includes("AWAITING") ? "var(--attention)" : r.state === "RUNNING" || r.state === "QUEUED" ? "var(--active)" : "var(--text-faint)" }} />
                    <span className="text-xs font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>{r.title}</span>
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{r.state}</span>
                    <span className="mono text-[11px] hidden sm:inline" style={{ color: "var(--text-faint)" }}>{new Date(r.created_at).toLocaleDateString()}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-[6px] p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
              <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>SCOPE STATE</p>
              <div className="mt-3 space-y-2 mono text-xs">
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Active engagements</span><span style={{ color: "var(--text-primary)" }}>{s.engagements}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Active runs</span><span style={{ color: active.length ? "var(--active)" : "var(--text-muted)" }}>{active.length}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Pending approvals</span><span style={{ color: pending.length ? "var(--attention)" : "var(--text-muted)" }}>{pending.length}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Blocked (policy)</span><span style={{ color: runs.filter((r) => r.state === "FAILED").length ? "var(--deny)" : "var(--text-muted)" }}>{runs.filter((r) => r.state === "FAILED").length}</span></div>
              </div>
              <Link to="/operations" className="mono text-[11px] mt-3 inline-block" style={{ color: "var(--active)" }}>Authorization boundary →</Link>
            </div>

            <div className="rounded-[6px] p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
              <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>LATEST EVIDENCE</p>
              {latestEvidence ? (
                <div className="mt-3">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{latestEvidence.original_filename}</p>
                  <p className="mono text-[11px] truncate mt-1" style={{ color: "var(--text-muted)" }} title={latestEvidence.sha256_digest}>sha256:{latestEvidence.sha256_digest.slice(0, 16)}…</p>
                  <p className="mono text-[11px] mt-1" style={{ color: latestEvidence.verification_status.includes("verified") ? "var(--pass)" : "var(--text-faint)" }}>{latestEvidence.verification_status} · {new Date(latestEvidence.created_at).toLocaleDateString()}</p>
                  <Link to="/evidence" className="mono text-[11px] mt-2 inline-block" style={{ color: "var(--active)" }}>Provenance →</Link>
                </div>
              ) : (
                <p className="mono text-xs mt-3" style={{ color: "var(--text-faint)" }}>No evidence yet — appears after approved execution</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: findings + governance */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>LATEST VERIFIED FINDING</p>
            </div>
            {latestFinding ? (
              <div className="p-4">
                <p className="text-xs font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{latestFinding.title}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded capitalize" style={{ background: latestFinding.severity === "critical" ? "var(--deny-bg)" : "var(--bg-inset)", border: `1px solid ${latestFinding.severity === "critical" ? "var(--deny-border)" : "var(--border-subtle)"}`, color: latestFinding.severity === "critical" ? "var(--deny)" : "var(--text-muted)" }}>{latestFinding.severity}</span>
                  <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{latestFinding.state} · {latestFinding.cwe_id ?? "—"}</span>
                </div>
                <p className="text-xs mt-2 line-clamp-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>{latestFinding.observation || latestFinding.hypothesis || "—"}</p>
                <Link to="/findings" className="mono text-[11px] mt-3 inline-block" style={{ color: "var(--active)" }}>Analyst workspace →</Link>
              </div>
            ) : (
              <p className="mono text-xs p-4" style={{ color: "var(--text-faint)" }}>No findings yet — findings are created from evidence and move through verification</p>
            )}
          </div>

          <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <span className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>GOVERNANCE EVENTS</span>
              <Link to="/audit" className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>Audit →</Link>
            </div>
            {recentAudit.length === 0 ? (
              <p className="mono text-xs p-4" style={{ color: "var(--text-faint)" }}>No events</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {recentAudit.map((ev) => (
                  <div key={ev.id} className="px-4 py-2.5 flex items-center gap-2">
                    <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--text-faint)" }}>{new Date(ev.created_at).toLocaleTimeString()}</span>
                    <span className="mono text-xs truncate" style={{ color: "var(--text-secondary)" }}>{ev.event_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[6px] p-3 flex items-center justify-between mono text-xs" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
            <span>Reports: {s.reports} · Findings: {s.findings} · Evidence: {s.evidence}</span>
            <Link to="/reports" className="mono text-[11px]" style={{ color: "var(--active)" }}>Reports →</Link>
          </div>
        </div>
      </div>

      {/* Thesis footer */}
      <div className="rounded-[6px] p-3 flex items-center justify-between mono text-[11px]" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
        <span>Scope before execution · Evidence before conclusions · Humans before consequential actions</span>
        <span className="hidden sm:inline">MORPHIA v0.2 α — Operations Intelligence Interface</span>
      </div>
    </div>
  );
}
