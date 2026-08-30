import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, Finding, VerificationStatus } from "@/lib/types";
import { EVIDENCE_VERIFICATION_STATUSES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";
import { EvidenceProvenance } from "@/components/EvidenceProvenance";

const VERIFIED_LOOKING = new Set<VerificationStatus>(["integrity_verified", "manually_reproduced", "source_captured"]);
const BAD_LOOKING = new Set<VerificationStatus>(["contradicted", "rejected"]);

function statusStyle(status: VerificationStatus) {
  if (VERIFIED_LOOKING.has(status)) return { bg: "var(--pass-bg)", border: "var(--pass-border)", color: "var(--pass)" };
  if (BAD_LOOKING.has(status)) return { bg: "var(--deny-bg)", border: "var(--deny-border)", color: "var(--deny)" };
  return { bg: "var(--bg-inset)", border: "var(--border-subtle)", color: "var(--text-muted)" };
}

function statusLabel(status: VerificationStatus): string {
  return status.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
function truncateHash(hash: string): string {
  if (!hash) return "—";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Evidence() {
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | "all">("all");
  const [view, setView] = useState<"provenance" | "table">("provenance");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["evidence"],
    queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence"),
  });
  const findingsQ = useQuery({ queryKey: ["findings"], queryFn: () => api.get<Finding[]>("/api/v1/findings") });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (statusFilter === "all") return items;
    return items.filter((e) => e.verification_status === statusFilter);
  }, [data, statusFilter]);

  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>EVIDENCE</h1>
          <p className="mono text-xs mt-1" style={{ color: "var(--text-faint)" }}>Hash-verified artifacts · provenance lineage · integrity verification</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
            <button onClick={() => setView("provenance")} className="mono text-xs px-3 py-1.5" style={{ background: view === "provenance" ? "var(--text-primary)" : "var(--bg-panel)", color: view === "provenance" ? "var(--bg-0)" : "var(--text-muted)" }}>Provenance</button>
            <button onClick={() => setView("table")} className="mono text-xs px-3 py-1.5" style={{ background: view === "table" ? "var(--text-primary)" : "var(--bg-panel)", color: view === "table" ? "var(--bg-0)" : "var(--text-muted)" }}>Table</button>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VerificationStatus | "all")}
            className="mono text-xs rounded-[6px] px-3 py-2 focus:outline-none"
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          >
            <option value="all">All statuses</option>
            {EVIDENCE_VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="mono text-[11px] tracking-[0.08em] flex items-center gap-2" style={{ color: "var(--text-faint)" }}>
        <span>RUN</span><span>→</span><span>STEP</span><span>→</span><span>ARTIFACT</span><span>→</span><span>HASH</span><span>→</span><span>VERIFICATION</span><span>→</span><span>FINDING</span><span>→</span><span>REPORT</span>
        <span className="ml-auto hidden sm:inline" style={{ color: "var(--text-faint)" }}>{filtered.length} artifact{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}
      {isError && <ErrorState message={error instanceof ApiError ? error.message : "Failed to load evidence."} onRetry={() => refetch()} />}
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState title="No evidence artifacts yet" description="Evidence appears here after an approved execution produces an artifact. Each artifact carries SHA-256 integrity, provenance, and verification state." />
      )}
      {!isLoading && !isError && filtered.length > 0 && view === "provenance" && (
        <EvidenceProvenance evidence={filtered} findings={findingsQ.data ?? []} onCopy={(t) => navigator.clipboard.writeText(t)} />
      )}
      {!isLoading && !isError && filtered.length > 0 && view === "table" && (
        <div className="rounded-[6px] overflow-hidden overflow-x-auto" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left mono text-[11px] tracking-[0.08em]" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">SHA-256</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const st = statusStyle(item.verification_status);
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{item.original_filename}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{item.content_type}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{item.source || "—"}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-faint)" }}>{formatBytes(item.file_size)}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-faint)" }} title={item.sha256_digest}>{truncateHash(item.sha256_digest)}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{statusLabel(item.verification_status)}</span>
                    </td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-faint)" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
