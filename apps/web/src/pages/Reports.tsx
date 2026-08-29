import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Project, Report, ReportFormat, ReportStatus } from "@/lib/types";
import { REPORT_FORMATS } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const STATUS_STYLE: Record<ReportStatus, string> = {
  draft: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  review: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  final: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  submitted: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  acknowledged: "bg-purple-500/10 text-purple-300 border-purple-500/30",
};

function ExportMenu({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-gray-900 border border-gray-800 rounded-md shadow-lg z-10 overflow-hidden">
          {REPORT_FORMATS.map((f: ReportFormat) => (
            <a
              key={f}
              href={`/api/v1/reports/${report.id}/export?format=${f}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors capitalize"
            >
              {f}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateReportForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/v1/projects"),
  });

  const mutation = useMutation({
    mutationFn: (body: { project_id: string; title: string }) =>
      api.post<Report>(`/api/v1/projects/${body.project_id}/reports`, { title: body.title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onDone();
    },
  });

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6 space-y-4">
      <h2 className="text-sm font-medium text-gray-300">New Report</h2>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Failed to create report."}
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Project</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select a project…</option>
          {(projectsQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Authorized Local Validation — Baseline HTTP Review"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onDone}
          className="px-3.5 py-1.5 text-sm rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            projectId && mutation.mutate({ project_id: projectId, title: title.trim() })
          }
          disabled={mutation.isPending || !projectId || !title.trim()}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create Report"}
        </button>
      </div>
    </div>
  );
}

export default function Reports() {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<Report[]>("/api/v1/reports"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Disclosure-ready summaries of verified findings, exportable as Markdown, HTML, or JSON
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3.5 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            New Report
          </button>
        )}
      </div>

      {showForm && <GenerateReportForm onDone={() => setShowForm(false)} />}

      {isLoading && <LoadingSkeleton rows={3} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load reports."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <EmptyState
          title="No reports yet"
          description="Create a report from a project's verified findings to produce a shareable, disclosure-style summary."
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Findings</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((report) => (
                <tr
                  key={report.id}
                  className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-100 font-medium">{report.title}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {report.project_name ?? report.project_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full border capitalize " +
                        (STATUS_STYLE[report.status] ?? STATUS_STYLE.draft)
                      }
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{report.finding_count ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <ExportMenu report={report} />
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
