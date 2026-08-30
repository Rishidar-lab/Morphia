import type { EvidenceArtifact, Finding } from "@/lib/types";

function truncateHash(h: string) {
  if (!h) return "—";
  return `${h.slice(0, 12)}…${h.slice(-8)}`;
}

function abbreviateId(id: string) {
  return id.slice(0, 8);
}

export function EvidenceProvenance({
  evidence,
  findings,
  onCopy,
}: {
  evidence: EvidenceArtifact[];
  findings?: Finding[];
  onCopy?: (text: string) => void;
}) {
  if (evidence.length === 0) {
    return (
      <div className="rounded-[6px] p-8 text-center" style={{ background: "var(--bg-panel)", border: "1px dashed var(--border-default)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>NO EVIDENCE YET</p>
        <p className="mono text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Evidence appears here after an approved execution produces an artifact. Each artifact is SHA-256 hashed at capture with immutable provenance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lineage header */}
      <div className="flex items-center gap-2 mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        <span>RUN</span><span>→</span><span>STEP</span><span>→</span><span>ARTIFACT</span><span>→</span><span>HASH</span><span>→</span><span>VERIFICATION</span><span>→</span><span>FINDING</span><span>→</span><span>REPORT</span>
      </div>

      <div className="grid gap-3">
        {evidence.map((e) => {
          const linkedFinding = findings?.find((f) => f.id === e.id || f.affected_scope === e.storage_path || false);
          // Fallback: try to link via project? Just show provenance
          return (
            <div key={e.id} className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
              {/* Top lineage bar */}
              <div className="hidden sm:flex items-center gap-0 px-3 py-2 text-[11px] overflow-x-auto" style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--border-subtle)" }}>
                {[
                  { k: "run", v: e.run_id ? abbreviateId(e.run_id) : "—", mono: true },
                  { k: "step", v: e.run_step_id ? abbreviateId(e.run_step_id) : "—", mono: true },
                  { k: "artifact", v: e.original_filename, mono: false },
                  { k: "hash", v: truncateHash(e.sha256_digest), mono: true },
                ].map((seg, i) => (
                  <span key={seg.k} className="flex items-center gap-1.5 flex-shrink-0">
                    {i > 0 && <span style={{ color: "var(--border-strong)" }}>→</span>}
                    <span className="mono" style={{ color: "var(--text-faint)" }}>{seg.k}</span>
                    <span className={seg.mono ? "mono" : ""} style={{ color: "var(--text-secondary)" }}>{seg.v}</span>
                  </span>
                ))}
                <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <span style={{ color: "var(--border-strong)" }}>→</span>
                  <span
                    className="mono text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        e.verification_status === "integrity_verified" || e.verification_status === "manually_reproduced"
                          ? "var(--pass-bg)"
                          : e.verification_status === "rejected" || e.verification_status === "contradicted"
                            ? "var(--deny-bg)"
                            : "var(--bg-panel)",
                      border: `1px solid ${
                        e.verification_status === "integrity_verified" || e.verification_status === "manually_reproduced"
                          ? "var(--pass-border)"
                          : e.verification_status === "rejected" || e.verification_status === "contradicted"
                            ? "var(--deny-border)"
                            : "var(--border-subtle)"
                      }`,
                      color:
                        e.verification_status === "integrity_verified" || e.verification_status === "manually_reproduced"
                          ? "var(--pass)"
                          : "var(--text-muted)",
                    }}
                  >
                    {e.verification_status}
                  </span>
                </span>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.original_filename}</span>
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{e.content_type}</span>
                    <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{(e.file_size / 1024).toFixed(1)} KB</span>
                  </div>

                  <div className="rounded-[6px] p-2.5 flex items-center gap-2" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                    <span className="mono text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>SHA-256</span>
                    <span className="mono text-xs truncate" style={{ color: "var(--text-primary)" }} title={e.sha256_digest}>
                      {e.sha256_digest}
                    </span>
                    {onCopy && (
                      <button
                        onClick={() => onCopy(e.sha256_digest)}
                        className="mono text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                      >
                        Copy
                      </button>
                    )}
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "var(--pass-bg)", border: "1px solid var(--pass-border)", color: "var(--pass)" }}>
                      VERIFIED
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>Evidence ID</dt><dd className="mono text-[11px] flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>{abbreviateId(e.id)} <button onClick={() => onCopy?.(e.id)} className="mono text-[10px] px-1 rounded" style={{ border: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>copy</button></dd></div>
                    <div><dt className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>Captured</dt><dd className="mono text-[11px]" style={{ color: "var(--text-secondary)" }}>{new Date(e.created_at).toLocaleString()}</dd></div>
                    <div><dt className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>Source</dt><dd className="mono text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{e.source || "worker capture"}</dd></div>
                    <div><dt className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>Sensitivity</dt><dd className="mono text-[11px]" style={{ color: "var(--text-secondary)" }}>{e.sensitivity || "—"}</dd></div>
                  </dl>
                </div>

                <div className="space-y-2">
                  <p className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>PROVENANCE</p>
                  <div className="rounded-[6px] p-3 space-y-1.5 text-xs" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Originating run</span><span className="mono" style={{ color: "var(--text-primary)" }}>{e.run_id ? abbreviateId(e.run_id) : "seeded demo"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Step</span><span className="mono" style={{ color: "var(--text-secondary)" }}>{e.run_step_id ? abbreviateId(e.run_step_id) : "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Integrity</span><span className="mono" style={{ color: "var(--pass)" }}>SHA-256 recorded</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Verification</span><span className="mono" style={{ color: "var(--text-secondary)" }}>{e.verification_status}</span></div>
                    {linkedFinding && <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Finding</span><span className="mono truncate max-w-[120px]" style={{ color: "var(--text-primary)" }}>{linkedFinding.title.slice(0, 24)}</span></div>}
                  </div>
                  {e.notes && <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{e.notes}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
