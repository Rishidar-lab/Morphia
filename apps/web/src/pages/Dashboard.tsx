import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditEvent, DashboardSummary } from "@/lib/types";

const EMPTY: DashboardSummary = {
  projects: 0,
  engagements: 0,
  runs: 0,
  active_runs: 0,
  pending_approvals: 0,
  evidence: 0,
  findings: 0,
  verified_findings: 0,
  reports: 0,
};

export default function Dashboard() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/api/v1/dashboard/summary"),
  });
  const activityQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => api.get<AuditEvent[]>("/api/v1/audit-events"),
  });

  const s = summaryQuery.data ?? EMPTY;
  const loading = summaryQuery.isLoading;
  const recent = (activityQuery.data ?? []).slice(0, 8);

  const tiles: { label: string; value: number; to: string; accent: string }[] = [
    { label: "Projects", value: s.projects, to: "/projects", accent: "text-blue-300" },
    {
      label: "Pending approvals",
      value: s.pending_approvals,
      to: "/approvals",
      accent: "text-amber-300",
    },
    { label: "Active runs", value: s.active_runs, to: "/runs", accent: "text-green-300" },
    {
      label: "Verified findings",
      value: s.verified_findings,
      to: "/findings",
      accent: "text-cyan-300",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Research orchestration command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider">{t.label}</p>
            <p className={"text-3xl font-bold mt-1 " + t.accent}>
              {loading ? "—" : t.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">Recent activity</h2>
            <Link to="/audit" className="text-xs text-blue-400 hover:text-blue-300">
              Audit log →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((ev) => (
                <li key={ev.id} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-gray-500 whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </span>
                  <span className="text-gray-300 font-mono">{ev.event_type}</span>
                  <span className="text-gray-600 truncate">{ev.action}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">At a glance</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ["Engagements", s.engagements],
              ["Total runs", s.runs],
              ["Evidence artifacts", s.evidence],
              ["Findings (all states)", s.findings],
              ["Reports", s.reports],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-gray-200 font-medium">{loading ? "—" : value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
