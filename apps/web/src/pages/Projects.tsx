import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";

function StatusPill({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
        (isActive
          ? "bg-green-500/10 text-green-300 border-green-500/30"
          : "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/30")
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (isActive ? "bg-green-400" : "bg-gray-400")} />
      {status}
    </span>
  );
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      api.post<Project>("/api/v1/projects", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onDone();
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate({ name: name.trim(), description: description.trim() });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-5 mb-6 space-y-4"
    >
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">New Project</h2>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Failed to create project."}
        </div>
      )}

      <div>
        <label htmlFor="proj-name" className="block text-xs text-[var(--text-muted)] mb-1.5">
          Name
        </label>
        <input
          id="proj-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Q3 Red Team Engagement"
        />
      </div>

      <div>
        <label htmlFor="proj-desc" className="block text-xs text-[var(--text-muted)] mb-1.5">
          Description
        </label>
        <textarea
          id="proj-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Optional description of this project's scope and objectives."
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-3.5 py-1.5 text-sm rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim()}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create Project"}
        </button>
      </div>
    </form>
  );
}

export default function Projects() {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/v1/projects"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Projects</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">
            Manage research engagements and their scope
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3.5 py-2 text-sm font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 text-white transition-colors"
          >
            New Project
          </button>
        )}
      </div>

      {showForm && <NewProjectForm onDone={() => setShowForm(false)} />}

      {isLoading && <LoadingSkeleton rows={4} />}

      {isError && (
        <ErrorState
          message={
            error instanceof ApiError ? error.message : "Failed to load projects."
          }
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start orchestrating research engagements."
          action={
            !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 text-white transition-colors"
              >
                Create your first project
              </button>
            )
          }
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-left text-xs text-[var(--text-faint)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-[var(--border-default)]/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${project.id}`}
                      className="text-[var(--text-primary)] font-medium hover:text-[var(--active)] transition-colors"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-faint)] hidden md:table-cell max-w-xs truncate">
                    {project.description || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={project.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-faint)] hidden sm:table-cell">
                    {new Date(project.created_at).toLocaleDateString()}
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
