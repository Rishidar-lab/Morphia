import { useMemo, useState } from "react";
import type { AuditEvent } from "@/lib/types";

const CATEGORIES: Record<string, string[]> = {
  authorization: ["scope.modify", "auth.login", "auth.logout", "auth.failed", "role.change"],
  execution: ["run.transition", "run.claimed", "run.scope_denied", "run.step_completed", "approval.approved", "approval.decide"],
  human: ["approval.decide", "approval.approved", "run.transition"],
  evidence: ["evidence.upload", "evidence.verify"],
  finding: ["finding.create", "finding.verify"],
  report: ["report.generate", "report.export"],
  system: ["project.create", "engagement.create", "user.suspend"],
};

function eventCategory(type: string): string {
  for (const [cat, types] of Object.entries(CATEGORIES)) {
    if (types.includes(type)) return cat;
  }
  return "system";
}

function dotColor(type: string): string {
  if (type.startsWith("auth.")) return "var(--text-muted)";
  if (type.startsWith("scope.")) return "var(--deny)";
  if (type.startsWith("run.")) return "var(--active)";
  if (type.startsWith("approval.")) return "var(--attention)";
  if (type.startsWith("evidence.")) return "var(--pass)";
  if (type.startsWith("finding.")) return "#f97316";
  if (type.startsWith("report.")) return "#a78bfa";
  return "var(--neutral)";
}

export function AuditStream({
  events,
  maxItems = 12,
  title = "Live audit stream",
}: {
  events: AuditEvent[];
  maxItems?: number;
  title?: string;
}) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return events.slice(0, maxItems);
    return events.filter((e) => eventCategory(e.event_type) === filter).slice(0, maxItems);
  }, [events, filter, maxItems]);

  const categories = ["all", "authorization", "execution", "human", "evidence", "finding", "report", "system"] as const;

  if (events.length === 0) {
    return (
      <div className="rounded-[6px] p-6 text-center" style={{ background: "var(--bg-panel)", border: "1px dashed var(--border-default)" }}>
        <p className="mono text-xs" style={{ color: "var(--text-faint)" }}>NO EVENTS YET — audit trail is append-only and begins at first auth or scope change</p>
      </div>
    );
  }

  return (
    <div data-testid="audit-stream" className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--pass)" }} />
          <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>{title}</span>
          <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{events.length} events</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className="mono text-[11px] px-2 py-1 rounded capitalize"
              style={{
                background: filter === c ? "var(--bg-inset)" : "transparent",
                border: `1px solid ${filter === c ? "var(--border-strong)" : "transparent"}`,
                color: filter === c ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {filtered.map((ev) => (
          <div key={ev.id} className="px-4 py-2.5 flex items-start gap-3 hover:opacity-90" style={{ background: "transparent" }}>
            <span className="mono text-[11px] whitespace-nowrap mt-0.5" style={{ color: "var(--text-faint)" }}>
              {new Date(ev.created_at).toLocaleTimeString()}
            </span>
            <span className="h-2 w-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: dotColor(ev.event_type) }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>{ev.event_type}</span>
                <span className="mono text-[11px] px-1.5 py-0.5 rounded capitalize" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{eventCategory(ev.event_type)}</span>
                {ev.actor_id && <span className="mono text-[11px] truncate" style={{ color: "var(--text-faint)" }}>actor {ev.actor_id.slice(0, 8)}</span>}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{ev.action}</p>
              {ev.target_type && <p className="mono text-[11px] truncate" style={{ color: "var(--text-faint)" }}>{ev.target_type} {ev.target_id?.slice(0, 8)}</p>}
            </div>
            {ev.ip_address && <span className="mono text-[11px] hidden sm:inline" style={{ color: "var(--text-faint)" }}>{ev.ip_address}</span>}
          </div>
        ))}
      </div>

      {filtered.length === 0 && <p className="mono text-xs p-4 text-center" style={{ color: "var(--text-faint)" }}>No events for filter “{filter}”</p>}
    </div>
  );
}

export function CompactAuditStream({ events }: { events: AuditEvent[] }) {
  const recent = events.slice(0, 6);
  return (
    <div className="space-y-2">
      {recent.map((ev) => (
        <div key={ev.id} className="flex items-center gap-2 text-xs">
          <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--text-faint)" }}>{new Date(ev.created_at).toLocaleTimeString()}</span>
          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dotColor(ev.event_type) }} />
          <span className="mono truncate" style={{ color: "var(--text-secondary)" }}>{ev.event_type}</span>
          <span className="truncate hidden sm:inline" style={{ color: "var(--text-muted)" }}>{ev.action}</span>
        </div>
      ))}
    </div>
  );
}
