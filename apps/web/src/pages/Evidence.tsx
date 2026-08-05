import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { EvidenceArtifact, VerificationStatus } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const VERIFICATION_STYLE: Record<VerificationStatus, string> = {
  verified: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  unverified: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
};

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function Evidence() {
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | "all">("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["evidence"],
    queryFn: () => api.get<EvidenceArtifact[]>("/api/v1/evidence"),
    retry: false,
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (statusFilter === "all") return items;
    return items.filter((e) => e.verification_status === statusFilter);
  }, [data, statusFilter]);

  const notImplemented = isError && error instanceof ApiError && error.status === 404;

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
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}

      {isError && !notImplemented && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load evidence."}
          onRetry={() => refetch()}
        />
      )}

      {(notImplemented || (!isLoading && !isError && filtered.length === 0)) && (
        <EmptyState
          title="No evidence artifacts yet"
          description="Evidence collected by agent runs — screenshots, response bodies, scan output — will appear here once captured, each with a SHA-256 integrity hash."
        />
      )}

      {!isLoading && !isError && !notImplemented && filtered.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Source</th>
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
                  <td className="px-4 py-3 text-gray-100 font-medium">{item.filename}</td>
                  <td className="px-4 py-3 text-gray-400">{item.artifact_type}</td>
                  <td className="px-4 py-3 text-gray-400">{item.source}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {truncateHash(item.sha256)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full border " +
                        VERIFICATION_STYLE[item.verification_status]
                      }
                    >
                      {item.verification_status}
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
