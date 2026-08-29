import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, VerificationStatus } from "@/lib/types";
import { EVIDENCE_VERIFICATION_STATUSES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const VERIFIED_LOOKING = new Set<VerificationStatus>([
  "integrity_verified",
  "manually_reproduced",
  "source_captured",
]);
const BAD_LOOKING = new Set<VerificationStatus>(["contradicted", "rejected"]);

function statusStyle(status: VerificationStatus): string {
  if (VERIFIED_LOOKING.has(status))
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (BAD_LOOKING.has(status)) return "bg-red-500/10 text-red-300 border-red-500/30";
  return "bg-gray-500/10 text-gray-400 border-gray-500/30";
}

function statusLabel(status: VerificationStatus): string {
  return status
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["evidence"],
    queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence"),
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (statusFilter === "all") return items;
    return items.filter((e) => e.verification_status === statusFilter);
  }, [data, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Evidence</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hash-verified artifacts collected during research runs
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VerificationStatus | "all")}
          className="bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All statuses</option>
          {EVIDENCE_VERIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load evidence."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title="No evidence artifacts yet"
          description="Evidence collected by agent runs — screenshots, response bodies, scan output — appears here once captured, each with a SHA-256 integrity hash."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
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
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-100 font-medium">
                    {item.original_filename}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {item.content_type}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{item.source || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{formatBytes(item.file_size)}</td>
                  <td
                    className="px-4 py-3 text-gray-500 font-mono text-xs"
                    title={item.sha256_digest}
                  >
                    {truncateHash(item.sha256_digest)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full border " +
                        statusStyle(item.verification_status)
                      }
                    >
                      {statusLabel(item.verification_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
