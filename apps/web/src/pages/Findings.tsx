import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Finding, FindingSeverity, FindingState } from "@/lib/types";
import { FINDING_STATES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  critical: "bg-red-500/10 text-red-300 border-red-500/30",
  high: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  info: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

function stateLabel(state: FindingState): string {
  return state
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border capitalize " +
        (SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info)
      }
    >
      {severity}
    </span>
  );
}

export default function Findings() {
  const [stateFilter, setStateFilter] = useState<FindingState | "all">("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["findings"],
    queryFn: () => api.get<Finding[]>("/api/v1/findings"),
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (stateFilter === "all") return items;
    return items.filter((f) => f.state === stateFilter);
  }, [data, stateFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Findings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Security findings surfaced across all runs, tracked through their lifecycle
          </p>
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as FindingState | "all")}
          className="bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All states</option>
          {FINDING_STATES.map((s) => (
            <option key={s} value={s}>
              {stateLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load findings."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title="No findings yet"
          description="Findings identified by agent runs will appear here as candidates, then move through verification to a final disposition."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">CWE</th>
                <th className="px-4 py-3 font-medium">Affected scope</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((finding) => (
                <tr
                  key={finding.id}
                  className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-100 font-medium max-w-xs truncate">
                    <Link
                      to={`/projects/${finding.project_id}`}
                      className="hover:text-blue-400 transition-colors"
                    >
                      {finding.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={finding.severity} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {finding.cwe_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate font-mono text-xs">
                    {finding.affected_scope || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{stateLabel(finding.state)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(finding.created_at).toLocaleDateString()}
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
