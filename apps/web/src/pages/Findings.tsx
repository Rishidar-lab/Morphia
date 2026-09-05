import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, Finding, FindingSeverity, FindingState } from "@/lib/types";
import { FINDING_STATES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const SEVERITY_STYLE: Record<FindingSeverity, { bg: string; border: string; color: string }> = {
  critical: { bg: "var(--deny-bg)", border: "var(--deny-border)", color: "var(--deny)" },
  high: { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)", color: "#fb923c" },
  medium: { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.3)", color: "#facc15" },
  low: { bg: "var(--active-bg)", border: "var(--active-border)", color: "var(--active)" },
  info: { bg: "var(--bg-inset)", border: "var(--border-subtle)", color: "var(--text-muted)" },
};

function stateLabel(state: FindingState): string {
  return state.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export default function Findings() {
  const [stateFilter, setStateFilter] = useState<FindingState | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["findings"],
    queryFn: () => api.get<Finding[]>("/api/v1/findings"),
  });
  const evidenceQ = useQuery({ queryKey: ["evidence"], queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence") });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (stateFilter === "all") return items;
    return items.filter((f) => f.state === stateFilter);
  }, [data, stateFilter]);

  const selected = filtered.find((f) => f.id === selectedId) ?? null;
  const linkedEvidence = useMemo(() => {
    if (!selected) return [];
    return (evidenceQ.data ?? []).filter((e) => e.project_id === selected.project_id).slice(0, 3);
  }, [selected, evidenceQ.data]);

  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>FINDINGS</h1>
          <p className="mono text-xs mt-1" style={{ color: "var(--text-faint)" }}>Analyst workspace · evidence-linked · verification lifecycle</p>
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as FindingState | "all")}
          className="mono text-xs rounded-[6px] px-3 py-2 focus:outline-none"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="all">All states</option>
          {FINDING_STATES.map((s) => <option key={s} value={s}>{stateLabel(s)}</option>)}
        </select>
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}
      {isError && <ErrorState message={error instanceof ApiError ? error.message : "Failed to load findings."} onRetry={() => refetch()} />}
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState title="No findings yet" description="Findings identified by runs appear here as candidates, then move through verification to a final disposition. Evidence must be linked before verification." />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-12 gap-4">
          {/* List */}
          <div className={`rounded-[6px] overflow-hidden ${selected ? "col-span-12 lg:col-span-7" : "col-span-12"}`} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="mono text-[11px] tracking-[0.08em] text-left" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">CWE</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((finding) => {
                    const sev = SEVERITY_STYLE[finding.severity] ?? SEVERITY_STYLE.info;
                    const isSel = selectedId === finding.id;
                    return (
                      <tr
                        key={finding.id}
                        onClick={() => setSelectedId(isSel ? null : finding.id)}
                        className="cursor-pointer"
                        style={{ background: isSel ? "var(--bg-inset)" : "transparent", borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td className="px-4 py-3 font-medium max-w-[280px] truncate" style={{ color: isSel ? "var(--text-primary)" : "var(--text-secondary)" }}>{finding.title}</td>
                        <td className="px-4 py-3">
                          <span className="mono text-[11px] px-2 py-0.5 rounded capitalize" style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}>{finding.severity}</span>
                        </td>
                        <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{finding.cwe_id || "—"}</td>
                        <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{stateLabel(finding.state)}</td>
                        <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-faint)" }}>{new Date(finding.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail pane */}
          {selected && (
            <div className="col-span-12 lg:col-span-5 rounded-[6px] overflow-hidden flex flex-col" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <span className="mono text-[11px] tracking-[0.08em] font-medium" style={{ color: "var(--text-faint)" }}>FINDING DETAIL</span>
                <button onClick={() => setSelectedId(null)} className="mono text-[11px] px-2 py-1 rounded" style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>Close</button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                <div>
                  <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{selected.title}</h3>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="mono text-[11px] px-2 py-0.5 rounded capitalize" style={{ background: SEVERITY_STYLE[selected.severity].bg, border: `1px solid ${SEVERITY_STYLE[selected.severity].border}`, color: SEVERITY_STYLE[selected.severity].color }}>{selected.severity}</span>
                    <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{stateLabel(selected.state)}</span>
                    {selected.cwe_id && <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{selected.cwe_id}</span>}
                    {selected.cvss_vector && <span className="mono text-[11px] truncate max-w-[120px]" style={{ color: "var(--text-faint)" }}>{selected.cvss_vector}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mono text-xs">
                  <div><dt style={{ color: "var(--text-faint)" }}>Affected scope</dt><dd className="truncate" style={{ color: "var(--text-secondary)" }}>{selected.affected_scope || "—"}</dd></div>
                  <div><dt style={{ color: "var(--text-faint)" }}>Disclosure</dt><dd style={{ color: "var(--text-secondary)" }}>{selected.disclosure_status || "—"}</dd></div>
                  <div><dt style={{ color: "var(--text-faint)" }}>Confidence / uncertainty</dt><dd style={{ color: "var(--text-secondary)" }}>{selected.uncertainty || "—"}</dd></div>
                  <div><dt style={{ color: "var(--text-faint)" }}>Created</dt><dd style={{ color: "var(--text-muted)" }}>{new Date(selected.created_at).toLocaleString()}</dd></div>
                </div>

                <div className="space-y-3 text-xs leading-relaxed">
                  {selected.observation && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>OBSERVATION</p><p style={{ color: "var(--text-secondary)" }}>{selected.observation}</p></div>}
                  {selected.hypothesis && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>HYPOTHESIS</p><p style={{ color: "var(--text-secondary)" }}>{selected.hypothesis}</p></div>}
                  {selected.verification_method && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>VERIFICATION METHOD</p><p style={{ color: "var(--text-secondary)" }}>{selected.verification_method}</p></div>}
                  {selected.actual_result && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>ACTUAL RESULT</p><p style={{ color: "var(--text-secondary)" }}>{selected.actual_result}</p></div>}
                  {selected.security_impact && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>SECURITY IMPACT</p><p style={{ color: "var(--text-secondary)" }}>{selected.security_impact}</p></div>}
                  {selected.remediation && <div><p className="mono text-[11px] tracking-[0.08em] mb-1" style={{ color: "var(--text-faint)" }}>REMEDIATION</p><p style={{ color: "var(--text-secondary)" }}>{selected.remediation}</p></div>}
                </div>

                <div>
                  <p className="mono text-[11px] tracking-[0.08em] mb-2" style={{ color: "var(--text-faint)" }}>LINKED EVIDENCE</p>
                  {linkedEvidence.length === 0 ? (
                    <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>No linked evidence in this project — findings require evidence for verification</p>
                  ) : (
                    <div className="space-y-1.5">
                      {linkedEvidence.map((e) => (
                        <div key={e.id} className="mono text-xs p-2 rounded-[6px] flex items-center gap-2" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                          <span className="truncate" style={{ color: "var(--text-secondary)" }}>{e.original_filename}</span>
                          <span className="ml-auto text-[11px] truncate" style={{ color: "var(--text-faint)" }} title={e.sha256_digest}>sha256:{e.sha256_digest.slice(0, 10)}…</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
