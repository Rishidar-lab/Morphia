import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Project,
  Engagement,
  ScopeRule,
  Run,
  RunEvent,
  RunStep,
  EvidenceArtifact,
  Finding,
  AuditEvent,
  DashboardSummary,
} from "@/lib/types";
import { ExecutionGraph } from "@/components/ExecutionGraph";
import { AuthorizationBoundary } from "@/components/AuthorizationBoundary";
import { ApprovalGate } from "@/components/ApprovalGate";
import { EvidenceProvenance } from "@/components/EvidenceProvenance";
import { AuditStream } from "@/components/AuditStream";

function Stat({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
      <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="text-lg font-semibold mt-1" style={{ color: accent ?? "var(--text-primary)" }}>{value}</p>
      {sub && <p className="mono text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>{sub}</p>}
    </div>
  );
}

export default function Operations() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/api/v1/projects") });
  const engagementsQ = useQuery({
    queryKey: ["engagements-all"],
    queryFn: async () => {
      const projects = await api.get<Project[]>("/api/v1/projects");
      const all = await Promise.all(
        projects.map((p) => api.get<Engagement[]>(`/api/v1/projects/${p.id}/engagements`).catch(() => [] as Engagement[])),
      );
      return all.flat();
    },
  });
  const runsQ = useQuery({ queryKey: ["runs"], queryFn: () => api.get<Run[]>("/api/v1/runs") });
  const dashboardQ = useQuery({ queryKey: ["dashboard-summary"], queryFn: () => api.get<DashboardSummary>("/api/v1/dashboard/summary") });
  const evidenceQ = useQuery({ queryKey: ["evidence"], queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence") });
  const findingsQ = useQuery({ queryKey: ["findings"], queryFn: () => api.get<Finding[]>("/api/v1/findings") });
  const auditQ = useQuery({ queryKey: ["audit-events"], queryFn: () => api.get<AuditEvent[]>("/api/v1/audit-events") });

  const engagements = useMemo(() => engagementsQ.data ?? [], [engagementsQ.data]);
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const evidence = useMemo(() => evidenceQ.data ?? [], [evidenceQ.data]);
  const findings = useMemo(() => findingsQ.data ?? [], [findingsQ.data]);
  const audit = useMemo(() => auditQ.data ?? [], [auditQ.data]);

  // Pick active engagement: first active or first
  const activeEngagement = useMemo(() => engagements.find((e) => e.status === "active") ?? engagements[0] ?? null, [engagements]);
  const scopeQ = useQuery({
    queryKey: ["scope", activeEngagement?.id],
    queryFn: () => api.get<ScopeRule[]>(`/api/v1/engagements/${activeEngagement!.id}/scope`),
    enabled: !!activeEngagement,
  });
  const scopeRules = scopeQ.data ?? [];

  // Run selection: pending approval first, then active, then most recent
  const activeRun = useMemo(() => {
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) ?? null;
    const awaiting = runs.find((r) => r.state === "AWAITING_PLAN_APPROVAL" || r.state === "AWAITING_ACTION_APPROVAL");
    if (awaiting) return awaiting;
    const live = runs.find((r) => r.state === "QUEUED" || r.state === "RUNNING");
    if (live) return live;
    return runs[0] ?? null;
  }, [runs, selectedRunId]);

  const runEventsQ = useQuery({
    queryKey: ["run-events", activeRun?.id],
    queryFn: () => api.get<RunEvent[]>(`/api/v1/runs/${activeRun!.id}/events`),
    enabled: !!activeRun,
  });
  const runStepsQ = useQuery({
    queryKey: ["run-steps", activeRun?.id],
    queryFn: () => api.get<RunStep[]>(`/api/v1/runs/${activeRun!.id}/steps`),
    enabled: !!activeRun,
  });

  const pendingApprovals = runs.filter((r) => r.state === "AWAITING_PLAN_APPROVAL" || r.state === "AWAITING_ACTION_APPROVAL");
  const activeRuns = runs.filter((r) => r.state === "QUEUED" || r.state === "RUNNING" || r.state === "PLANNING");
  const blockedRuns = runs.filter((r) => r.state === "FAILED");

  const s = dashboardQ.data;

  // Engagement project name
  const engagementProject = activeEngagement ? projects.find((p) => p.id === activeEngagement.project_id) : null;

  const hasData = projects.length > 0 || engagements.length > 0 || runs.length > 0;

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5" data-testid="operations-command-center">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-bold tracking-[0.02em]" style={{ color: "var(--text-primary)" }}>
              OPERATIONS<span style={{ color: "var(--text-faint)", fontWeight: 400 }}> — </span>
              <span className="font-normal" style={{ color: "var(--text-secondary)" }}>COMMAND CENTER</span>
            </h1>
            <span className="mono text-[11px] px-2 py-0.5 rounded hidden sm:inline-flex" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
              Scope → Plan → Approval → Execution → Evidence → Finding → Report → Audit
            </span>
          </div>
          <p className="mono text-xs mt-1.5" style={{ color: "var(--text-faint)" }}>
            Nothing executes merely because an agent requested it. Authorization, dual scope validation, and human approval are enforced server-side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mono text-[11px] px-2.5 py-1.5 rounded-[6px] flex items-center gap-2" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: activeEngagement?.status === "active" ? "var(--pass)" : "var(--attention)" }} />
            {activeEngagement ? activeEngagement.program_name : "No engagement"} · {activeEngagement?.status ?? "—"}
          </div>
          <Link to="/projects" className="mono text-[11px] px-3 py-1.5 rounded-[6px]" style={{ background: "var(--text-primary)", color: "var(--bg-0)" }}>
            Manage engagements
          </Link>
        </div>
      </div>

      {/* Metrics strip — not dominant */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="ACTIVE ENGAGEMENT" value={activeEngagement ? "1" : "0"} sub={engagementProject?.name ?? "—"} accent="var(--pass)" />
        <Stat label="PENDING APPROVAL" value={pendingApprovals.length} accent={pendingApprovals.length ? "var(--attention)" : "var(--text-muted)"} sub="human gate" />
        <Stat label="ACTIVE RUNS" value={activeRuns.length} accent={activeRuns.length ? "var(--active)" : "var(--text-muted)"} />
        <Stat label="BLOCKED / FAILED" value={blockedRuns.length} accent={blockedRuns.length ? "var(--deny)" : "var(--text-muted)"} sub="policy denial" />
        <Stat label="EVIDENCE" value={s?.evidence ?? evidence.length} sub="SHA-256 verified" />
        <Stat label="VERIFIED FINDINGS" value={s?.verified_findings ?? findings.filter((f) => f.state === "verified").length} accent="var(--pass)" />
      </div>

      {!hasData ? (
        <div className="rounded-[8px] p-10 text-center" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>NO ACTIVE OPERATION</p>
          <p className="mono text-xs mt-2 max-w-xl mx-auto leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Create a project, define an engagement with explicit scope, and launch a run. Every run requires scope validation and human approval before execution. Evidence and findings appear here once produced.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/projects" className="mono text-xs px-4 py-2 rounded-[6px]" style={{ background: "var(--text-primary)", color: "var(--bg-0)" }}>Create engagement</Link>
            <Link to="/runs" className="mono text-xs px-4 py-2 rounded-[6px]" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>View runs</Link>
          </div>
          <p className="mono text-[11px] mt-4" style={{ color: "var(--text-faint)" }}>Thesis: Scope before execution · Evidence before conclusions · Humans before consequential actions</p>
        </div>
      ) : (
        <>
          {/* ── Main canvas: left / center / right ──────────────────── */}
          <div className="grid grid-cols-12 gap-4">
            {/* LEFT — Scope / authorization boundary */}
            <div className="col-span-12 lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="mono text-[11px] tracking-[0.1em] font-semibold" style={{ color: "var(--text-faint)" }}>AUTHORIZATION BOUNDARY</h2>
                <Link to={activeEngagement ? `/projects/${activeEngagement.project_id}` : "/projects"} className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>Details →</Link>
              </div>

              {activeEngagement ? (
                <AuthorizationBoundary engagement={activeEngagement} rules={scopeRules} />
              ) : (
                <div className="rounded-[6px] p-4 mono text-xs" style={{ background: "var(--bg-panel)", border: "1px dashed var(--border-default)", color: "var(--text-faint)" }}>
                  No engagement selected
                </div>
              )}

              {/* Quick engagement switcher */}
              {engagements.length > 1 && (
                <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                  <p className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>ENGAGEMENTS</p>
                  <div className="mt-2 space-y-1">
                    {engagements.slice(0, 5).map((e) => (
                      <div key={e.id} className="mono text-xs truncate" style={{ color: e.id === activeEngagement?.id ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {e.id === activeEngagement?.id ? "● " : "○ "}{e.program_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blocked showcase */}
              <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <p data-testid="blocked-execution" className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>BLOCKED EXECUTION — DEMO</p>
                </div>
                <div className="p-3 space-y-2">
                  <div className="rounded-[6px] p-2.5 mono text-xs" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>
                    TARGET: production.example.com → DENY
                  </div>
                  <div className="space-y-1 mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <div className="flex justify-between"><span>API validation</span><span style={{ color: "var(--deny)" }}>BLOCKED</span></div>
                    <div className="flex justify-between"><span>Worker revalidation</span><span style={{ color: "var(--deny)" }}>BLOCKED</span></div>
                    <div className="flex justify-between"><span>Execution</span><span style={{ color: "var(--deny)" }}>PREVENTED</span></div>
                    <div className="flex justify-between"><span>Audit event</span><span style={{ color: "var(--pass)" }}>RECORDED</span></div>
                  </div>
                  <p className="mono text-[11px] leading-tight" style={{ color: "var(--text-faint)" }}>
                    Explicit exclusion · reason recorded · run state FAILED · no evidence produced
                  </p>
                </div>
              </div>
            </div>

            {/* CENTER — Execution graph */}
            <div className="col-span-12 lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="mono text-[11px] tracking-[0.1em] font-semibold" style={{ color: "var(--text-faint)" }}>EXECUTION GRAPH — OPERATION TIMELINE</h2>
                <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{runs.length} runs</span>
              </div>

              {/* Run selector */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {runs.slice(0, 8).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className="mono text-xs px-2.5 py-1.5 rounded-[6px] whitespace-nowrap flex-shrink-0"
                    style={{
                      background: r.id === activeRun?.id ? "var(--text-primary)" : "var(--bg-panel)",
                      color: r.id === activeRun?.id ? "var(--bg-0)" : "var(--text-secondary)",
                      border: `1px solid ${r.id === activeRun?.id ? "var(--text-primary)" : "var(--border-default)"}`,
                    }}
                  >
                    {r.title.slice(0, 22)} · {r.state}
                  </button>
                ))}
                {runs.length === 0 && <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>No runs</span>}
              </div>

              {activeRun ? (
                <div className="rounded-[6px] p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{activeRun.title}</span>
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{activeRun.state}</span>
                    <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{activeRun.agent_profile ?? "—"}</span>
                    <Link to={`/runs/${activeRun.id}`} className="mono text-[11px] ml-auto" style={{ color: "var(--active)" }}>Open run →</Link>
                  </div>

                  {activeRun.state === "FAILED" && activeRun.failure_reason && (
                    <div className="mt-3 mono text-xs p-2.5 rounded-[6px]" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>
                      {activeRun.failure_reason}
                    </div>
                  )}

                  <div className="mt-4">
                    <ExecutionGraph run={activeRun} events={runEventsQ.data ?? []} steps={runStepsQ.data ?? []} />
                  </div>

                  {/* Human approval gate embedded when needed */}
                  {(activeRun.state === "AWAITING_PLAN_APPROVAL" || activeRun.state === "AWAITING_ACTION_APPROVAL") && (
                    <div className="mt-4">
                      <ApprovalGate run={activeRun} engagementName={activeEngagement?.program_name} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[6px] p-6 text-center mono text-xs" style={{ background: "var(--bg-panel)", border: "1px dashed var(--border-default)", color: "var(--text-faint)" }}>
                  Select a run to view its execution graph
                </div>
              )}

              {/* Run timeline summary */}
              <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>RUNS</p>
                <div className="mt-2 space-y-1.5 max-h-[180px] overflow-y-auto">
                  {runs.slice(0, 10).map((r) => (
                    <Link key={r.id} to={`/runs/${r.id}`} className="flex items-center gap-2 mono text-xs py-1 hover:opacity-80">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: r.state === "COMPLETED" ? "var(--pass)" : r.state === "FAILED" ? "var(--deny)" : r.state.includes("AWAITING") ? "var(--attention)" : "var(--active)" }} />
                      <span className="truncate flex-1" style={{ color: "var(--text-secondary)" }}>{r.title}</span>
                      <span className="mono text-[11px] flex-shrink-0" style={{ color: "var(--text-faint)" }}>{r.state}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT — Evidence + findings + approvals */}
            <div className="col-span-12 lg:col-span-3 space-y-3">
              <h2 className="mono text-[11px] tracking-[0.1em] font-semibold" style={{ color: "var(--text-faint)" }}>EVIDENCE · FINDINGS · APPROVALS</h2>

              {/* Pending approvals */}
              <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <span className="mono text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>AWAITING HUMAN DECISION</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: pendingApprovals.length ? "var(--attention-bg)" : "var(--bg-inset)", border: `1px solid ${pendingApprovals.length ? "var(--attention-border)" : "var(--border-subtle)"}`, color: pendingApprovals.length ? "var(--attention)" : "var(--text-faint)" }}>{pendingApprovals.length}</span>
                </div>
                {pendingApprovals.length === 0 ? (
                  <p className="mono text-xs p-3" style={{ color: "var(--text-faint)" }}>No pending approvals — operations are clear</p>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {pendingApprovals.slice(0, 3).map((r) => (
                      <div key={r.id} className="p-3">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.title}</p>
                        <p className="mono text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{r.state} · {new Date(r.updated_at).toLocaleString()}</p>
                        <Link to={`/runs/${r.id}`} className="mono text-[11px] mt-1 inline-block" style={{ color: "var(--attention)" }}>Review →</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Latest evidence */}
              <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <span className="mono text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>LATEST EVIDENCE</span>
                  <Link to="/evidence" className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>{evidence.length} artifacts →</Link>
                </div>
                {evidence.length === 0 ? (
                  <p className="mono text-xs p-3" style={{ color: "var(--text-faint)" }}>No artifacts yet</p>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {evidence.slice(0, 3).map((e) => (
                      <div key={e.id} className="p-3">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.original_filename}</p>
                        <p className="mono text-[11px] truncate" style={{ color: "var(--text-muted)" }} title={e.sha256_digest}>sha256:{e.sha256_digest.slice(0, 16)}…</p>
                        <p className="mono text-[11px]" style={{ color: e.verification_status.includes("verified") ? "var(--pass)" : "var(--text-faint)" }}>{e.verification_status} · {new Date(e.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Latest findings */}
              <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <span className="mono text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>LATEST FINDINGS</span>
                  <Link to="/findings" className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>{findings.length} →</Link>
                </div>
                {findings.length === 0 ? (
                  <p className="mono text-xs p-3" style={{ color: "var(--text-faint)" }}>No findings yet</p>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {findings.slice(0, 3).map((f) => (
                      <div key={f.id} className="p-3">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{f.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="mono text-[11px] px-1 py-0.5 rounded capitalize" style={{ background: f.severity === "critical" ? "var(--deny-bg)" : f.severity === "high" ? "rgba(249,115,22,0.12)" : "var(--bg-inset)", border: `1px solid ${f.severity === "critical" ? "var(--deny-border)" : "var(--border-subtle)"}`, color: f.severity === "critical" ? "var(--deny)" : "var(--text-muted)" }}>{f.severity}</span>
                          <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{f.state}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Governance quick */}
              <div className="rounded-[6px] p-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>GOVERNANCE</p>
                <div className="mt-2 space-y-1 mono text-xs" style={{ color: "var(--text-muted)" }}>
                  <div className="flex justify-between"><span>Audit events</span><span style={{ color: "var(--text-primary)" }}>{audit.length}</span></div>
                  <div className="flex justify-between"><span>Reports</span><span style={{ color: "var(--text-primary)" }}>{dashboardQ.data?.reports ?? 0}</span></div>
                  <div className="flex justify-between"><span>Engagements</span><span style={{ color: "var(--text-primary)" }}>{engagements.length}</span></div>
                </div>
                <Link to="/audit" className="mono text-[11px] mt-2 inline-block" style={{ color: "var(--active)" }}>View audit trail →</Link>
              </div>
            </div>
          </div>

          {/* ── Evidence provenance (if relevant) ─────────────────── */}
          {evidence.length > 0 && (
            <div className="rounded-[6px] p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                <h3 className="mono text-[11px] tracking-[0.1em] font-semibold" style={{ color: "var(--text-faint)" }}>EVIDENCE PROVENANCE — TRACEABILITY</h3>
                <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>RUN → STEP → ARTIFACT → HASH → VERIFICATION → FINDING → REPORT</span>
              </div>
              <div className="mt-3">
                <EvidenceProvenance evidence={evidence.slice(0, 2)} findings={findings} onCopy={(t) => navigator.clipboard.writeText(t)} />
              </div>
            </div>
          )}

          {/* ── Audit stream ─────────────────────────────────────── */}
          <AuditStream events={audit} maxItems={10} />
        </>
      )}
    </div>
  );
}
