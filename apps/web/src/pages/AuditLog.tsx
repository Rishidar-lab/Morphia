import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";
import { AuditStream } from "@/components/AuditStream";

const PAGE_SIZE = 25;
const KNOWN_EVENT_TYPES = ["auth.login","auth.logout","auth.failed","project.create","project.delete","engagement.create","scope.modify","run.transition","run.cancelled","approval.decide","evidence.upload","finding.create","report.generate","role.change","user.suspend"];
const CATS = ["all","authorization","execution","human","evidence","finding","report","system"] as const;

function eventCategory(type: string): string {
  if (["scope.modify","auth.login","auth.logout","auth.failed","role.change"].includes(type)) return "authorization";
  if (type.startsWith("run.") || type.startsWith("approval.")) return "execution";
  if (type.startsWith("evidence.")) return "evidence";
  if (type.startsWith("finding.")) return "finding";
  if (type.startsWith("report.")) return "report";
  return "system";
}

export default function AuditLog() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => api.get<AuditEvent[]>("/api/v1/audit-events"),
    retry: false,
  });
  const notImplemented = isError && error instanceof ApiError && error.status === 404;

  const filtered = useMemo(() => {
    let items = data ?? [];
    if (eventTypeFilter !== "all") items = items.filter((e) => e.event_type === eventTypeFilter);
    if (catFilter !== "all") items = items.filter((e) => eventCategory(e.event_type) === catFilter);
    return items;
  }, [data, eventTypeFilter, catFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>GOVERNANCE — AUDIT LOG</h1>
          <p className="mono text-xs mt-1" style={{ color: "var(--text-faint)" }}>Immutable, append-only record · every security-relevant action · read-only</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className="mono text-xs rounded-[6px] px-3 py-2 focus:outline-none" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={eventTypeFilter} onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }} className="mono text-xs rounded-[6px] px-3 py-2 focus:outline-none" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
            <option value="all">All event types</option>
            {KNOWN_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {!isLoading && !isError && data && data.length > 0 && (
        <AuditStream events={data} maxItems={8} title="Live stream — most recent" />
      )}

      {isLoading && <LoadingSkeleton rows={6} />}
      {isError && !notImplemented && <ErrorState message={error instanceof ApiError ? error.message : "Failed to load audit log."} onRetry={() => refetch()} />}
      {(notImplemented || (!isLoading && !isError && filtered.length === 0)) && (
        <EmptyState title="No audit events yet" description="Every auth event, scope change, run transition, and approval decision is recorded here automatically. The trail is append-only." />
      )}

      {!isLoading && !isError && !notImplemented && filtered.length > 0 && (
        <>
          <div className="rounded-[6px] overflow-hidden overflow-x-auto" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="mono text-[11px] tracking-[0.08em] text-left" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-3 mono text-xs whitespace-nowrap" style={{ color: "var(--text-faint)" }}>{new Date(ev.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>{ev.event_type}</span></td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{ev.actor_id ? (ev.actor_id.startsWith("worker:") ? ev.actor_id : ev.actor_id.slice(0, 8)) : "system"}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--text-muted)" }}>{ev.target_type ? `${ev.target_type} · ${ev.target_id?.slice(0, 8) ?? ""}` : "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{ev.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="mono text-xs px-3 py-1.5 rounded-[6px] disabled:opacity-40" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)", background: "var(--bg-panel)" }}>Previous</button>
              <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="mono text-xs px-3 py-1.5 rounded-[6px] disabled:opacity-40" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)", background: "var(--bg-panel)" }}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
