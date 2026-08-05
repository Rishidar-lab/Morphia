import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Project, Report, ReportFormat, ReportStatus } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

const STATUS_STYLE: Record<ReportStatus, string> = {
  draft: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  generating: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
};

const EXPORT_FORMATS: { label: string; value: ReportFormat }[] = [
  { label: "Markdown", value: "markdown" },
  { label: "PDF", value: "pdf" },
  { label: "JSON", value: "json" },
];

function ExportMenu({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportMutation = useMutation({
    mutationFn: (format: ReportFormat) =>
      api.get<{ url: string }>(`/api/v1/reports/${report.id}/export?format=${format}`),
  });

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={report.status !== "ready"}
        className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-gray-900 border border-gray-800 rounded-md shadow-lg z-10 overflow-hidden">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                exportMutation.mutate(f.value);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {exportMutation.isError && (
        <p className="absolute right-0 mt-1 text-[11px] text-red-400 whitespace-nowrap">
          Export failed
        </p>
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
      api.post<Report>(`/api/v1/projects/${body.project_id}/reports`, {
        title: body.title,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onDone();
    },
  });

  const handleSubmit = () => {
    if (!projectId) return;
    mutation.mutate({ project_id: projectId, title: title.trim() });
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6 space-y-4">
      <h2 className="text-sm font-medium text-gray-300">Generate Report</h2>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Report generation is not available yet."}
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
          placeholder="Q3 2026 Findings Summary"
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
          onClick={handleSubmit}
          disabled={mutation.isPending || !projectId}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Generating..." : "Generate Report"}
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
    retry: false,
  });

  const notImplemented = isError && error instanceof ApiError && error.status === 404;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generated summaries of verified findings, ready for export
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3.5 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Generate Report
          </button>
        )}
      </div>

      {showForm && <GenerateReportForm onDone={() => setShowForm(false)} />}

      {isLoading && <LoadingSkeleton rows={3} />}

      {isError && !notImplemented && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load reports."}
          onRetry={() => refetch()}
        />
      )}

      {(notImplemented || (!isLoading && !isError && data?.length === 0)) && (
        <EmptyState
          title="No reports yet"
          description="Generate a report from a project's verified findings to produce a shareable summary."
        />
      )}

      {!isLoading && !isError && !notImplemented && data && data.length > 0 && (
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
                    {report.project_name ?? report.project_id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full border capitalize " +
                        STATUS_STYLE[report.status]
                      }
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{report.finding_count}</td>
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
