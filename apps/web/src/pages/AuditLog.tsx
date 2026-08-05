import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const PAGE_SIZE = 25;

const KNOWN_EVENT_TYPES = [
  "auth.login",
  "auth.logout",
  "auth.failed",
  "project.create",
  "project.delete",
  "engagement.create",
  "scope.modify",
  "run.transition",
  "run.cancelled",
  "approval.decide",
  "evidence.upload",
  "finding.create",
  "report.generate",
  "role.change",
  "user.suspend",
];

function EventTypeTag({ eventType }: { eventType: string }) {
  const [namespace] = eventType.split(".");
  const colorByNamespace: Record<string, string> = {
    auth: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    run: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    approval: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    scope: "bg-red-500/10 text-red-300 border-red-500/30",
    project: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    engagement: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    evidence: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    finding: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    report: "bg-gray-500/10 text-gray-300 border-gray-500/30",
    role: "bg-red-500/10 text-red-300 border-red-500/30",
    user: "bg-red-500/10 text-red-300 border-red-500/30",
  };

  return (
    <span
      className={
        "text-xs px-2 py-0.5 rounded-full border font-mono whitespace-nowrap " +
        (colorByNamespace[namespace] ?? "bg-gray-500/10 text-gray-400 border-gray-500/30")
      }
    >
      {eventType}
    </span>
  );
}

export default function AuditLog() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => api.get<AuditEvent[]>("/api/v1/audit-events"),
    retry: false,
  });

  const notImplemented = isError && error instanceof ApiError && error.status === 404;

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (eventTypeFilter === "all") return items;
    return items.filter((e) => e.event_type === eventTypeFilter);
  }, [data, eventTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Immutable record of every security-relevant action — read only
          </p>
        </div>

        <select
          value={eventTypeFilter}
          onChange={(e) => {
            setEventTypeFilter(e.target.value);
            setPage(1);
          }}
          className="bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All event types</option>
          {KNOWN_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSkeleton rows={6} />}

      {isError && !notImplemented && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load audit log."}
          onRetry={() => refetch()}
        />
      )}

      {(notImplemented || (!isLoading && !isError && filtered.length === 0)) && (
        <EmptyState
          title="No audit events yet"
          description="Every auth event, scope change, run transition, and approval decision is recorded here automatically."
        />
      )}

      {!isLoading && !isError && !notImplemented && filtered.length > 0 && (
        <>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Event Type</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <EventTypeTag eventType={event.event_type} />
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {event.actor_name || event.actor_id || "system"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {event.target_type
                        ? `${event.target_type}${event.target_id ? ` · ${event.target_id.slice(0, 8)}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{event.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
