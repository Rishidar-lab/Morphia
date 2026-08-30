import { useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, ApiError } from "@/lib/api";
import type { Engagement, Project, Run, ScopeRule } from "@/lib/types";
import { CANCELLABLE_STATES, APPROVAL_STATES, TERMINAL_STATES } from "@/lib/types";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ListStates";
import { StateBadge } from "@/components/StateBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AuthorizationBoundary } from "@/components/AuthorizationBoundary";

type Tab = "overview" | "engagements" | "scope" | "runs";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "engagements", label: "Engagements" },
  { id: "scope", label: "Scope" },
  { id: "runs", label: "Runs" },
];

// ── Overview ─────────────────────────────────────────────
function OverviewTab({ projectId }: { projectId: string }) {
  const engagementsQuery = useQuery({
    queryKey: ["engagements", projectId],
    queryFn: () => api.get<Engagement[]>(`/api/v1/projects/${projectId}/engagements`),
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.get<Run[]>("/api/v1/runs"),
  });

  const projectRuns = (runsQuery.data ?? []).filter((r) => r.project_id === projectId);

  const stats = [
    {
      label: "Engagements",
      value: engagementsQuery.data?.length ?? 0,
      loading: engagementsQuery.isLoading,
    },
    {
      label: "Runs",
      value: projectRuns.length,
      loading: runsQuery.isLoading,
    },
    {
      label: "Findings",
      value: 0,
      loading: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4"
        >
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider">{stat.label}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">
            {stat.loading ? "—" : stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Engagements ──────────────────────────────────────────
function NewEngagementForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [programName, setProgramName] = useState("");
  const [authorizationBasis, setAuthorizationBasis] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (body: {
      program_name: string;
      authorization_basis: string;
      notes: string;
    }) => api.post<Engagement>(`/api/v1/projects/${projectId}/engagements`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements", projectId] });
      onDone();
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!programName.trim()) return;
    mutation.mutate({
      program_name: programName.trim(),
      authorization_basis: authorizationBasis.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-5 mb-4 space-y-4"
    >
      <h3 className="text-sm font-medium text-[var(--text-secondary)]">New Engagement</h3>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Failed to create engagement."}
        </div>
      )}

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">Program Name</label>
        <input
          required
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Acme Corp Bug Bounty"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">Authorization Basis</label>
        <textarea
          value={authorizationBasis}
          onChange={(e) => setAuthorizationBasis(e.target.value)}
          rows={2}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Signed rules-of-engagement doc, bounty program terms, etc."
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
          disabled={mutation.isPending || !programName.trim()}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create Engagement"}
        </button>
      </div>
    </form>
  );
}

function EngagementsTab({ projectId }: { projectId: string }) {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["engagements", projectId],
    queryFn: () => api.get<Engagement[]>(`/api/v1/projects/${projectId}/engagements`),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Engagements</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 text-white transition-colors"
          >
            New Engagement
          </button>
        )}
      </div>

      {showForm && (
        <NewEngagementForm projectId={projectId} onDone={() => setShowForm(false)} />
      )}

      {isLoading && <LoadingSkeleton rows={3} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load engagements."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          title="No engagements yet"
          description="Engagements group scope rules and assets under an authorized program."
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((eng) => (
            <div
              key={eng.id}
              className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4 flex items-start justify-between gap-4"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{eng.program_name}</p>
                <p className="text-xs text-[var(--text-faint)] mt-1">
                  {eng.authorization_basis || "No authorization basis recorded."}
                </p>
                {eng.notes && <p className="text-xs text-[var(--text-faint)] mt-1">{eng.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className={clsx(
                    "text-xs px-2 py-0.5 rounded-full border",
                    eng.status === "active"
                      ? "bg-green-500/10 text-green-300 border-green-500/30"
                      : "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/30",
                  )}
                >
                  {eng.status}
                </span>
                <span className="text-xs text-[var(--text-faint)]">
                  {new Date(eng.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scope ────────────────────────────────────────────────
const TARGET_TYPES = ["domain", "ip", "api", "repo", "mobile_app", "webapp"];

function NewScopeRuleForm({
  engagementId,
  onDone,
}: {
  engagementId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [ruleType, setRuleType] = useState<"include" | "exclude">("include");
  const [targetType, setTargetType] = useState(TARGET_TYPES[0]);
  const [pattern, setPattern] = useState("");
  const [isWildcard, setIsWildcard] = useState(false);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (body: {
      rule_type: string;
      target_type: string;
      pattern: string;
      is_wildcard: boolean;
      notes: string;
    }) => api.post<ScopeRule>(`/api/v1/engagements/${engagementId}/scope`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scope", engagementId] });
      onDone();
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    mutation.mutate({
      rule_type: ruleType,
      target_type: targetType,
      pattern: pattern.trim(),
      is_wildcard: isWildcard,
      notes: notes.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4 mb-3 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Rule</label>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as "include" | "exclude")}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-2.5 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
          >
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Target Type</label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-2.5 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Pattern</label>
          <input
            required
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-2.5 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="*.example.com"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={isWildcard}
              onChange={(e) => setIsWildcard(e.target.checked)}
              className="rounded border-[var(--border-default)] bg-[var(--bg-inset)] text-blue-500 focus:ring-blue-500"
            />
            Wildcard
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">Notes</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-2.5 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Failed to add scope rule."}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || !pattern.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Adding..." : "Add Rule"}
        </button>
      </div>
    </form>
  );
}

function ScopeRuleRow({
  rule,
  engagementId,
}: {
  rule: ScopeRule;
  engagementId: string;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/scope/${rule.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scope", engagementId] });
      setConfirmOpen(false);
    },
  });

  return (
    <>
      <div data-testid="scope-rule" className="flex items-center justify-between gap-4 py-2.5 px-3 border-b border-[var(--border-default)]/60 last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={clsx(
              "text-xs px-2 py-0.5 rounded-full border flex-shrink-0",
              rule.rule_type === "include"
                ? "bg-blue-500/10 text-[var(--active)] border-blue-500/30"
                : "bg-red-500/10 text-red-300 border-red-500/30",
            )}
          >
            {rule.rule_type}
          </span>
          <span className="text-xs text-[var(--text-faint)] flex-shrink-0">{rule.target_type}</span>
          <span className="text-sm text-[var(--text-primary)] font-mono truncate">{rule.pattern}</span>
          {rule.is_wildcard && (
            <span className="text-xs text-[var(--text-faint)] flex-shrink-0">wildcard</span>
          )}
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-xs text-red-400 hover:text-red-300 flex-shrink-0"
        >
          Remove
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove scope rule"
        description={`Remove the ${rule.rule_type} rule for "${rule.pattern}"? This action is logged in the audit trail.`}
        confirmLabel="Remove"
        variant="danger"
        loading={mutation.isPending}
        error={
          mutation.isError
            ? mutation.error instanceof ApiError
              ? mutation.error.message
              : "Failed to remove rule."
            : null
        }
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function ScopeTab({ projectId }: { projectId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>("");

  const engagementsQuery = useQuery({
    queryKey: ["engagements", projectId],
    queryFn: () => api.get<Engagement[]>(`/api/v1/projects/${projectId}/engagements`),
  });

  const engagements = engagementsQuery.data ?? [];
  const activeEngagementId = selectedEngagementId || engagements[0]?.id || "";

  const scopeQuery = useQuery({
    queryKey: ["scope", activeEngagementId],
    queryFn: () => api.get<ScopeRule[]>(`/api/v1/engagements/${activeEngagementId}/scope`),
    enabled: !!activeEngagementId,
  });

  if (engagementsQuery.isLoading) return <LoadingSkeleton rows={2} />;

  if (engagements.length === 0) {
    return (
      <EmptyState
        title="No engagements to scope"
        description="Create an engagement first, then define its scope rules here."
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Engagement</label>
          <select
            value={activeEngagementId}
            onChange={(e) => setSelectedEngagementId(e.target.value)}
            className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
          >
            {engagements.map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.program_name}
              </option>
            ))}
          </select>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 text-white transition-colors"
          >
            Add Scope Rule
          </button>
        )}
      </div>

      {showForm && (
        <NewScopeRuleForm
          engagementId={activeEngagementId}
          onDone={() => setShowForm(false)}
        />
      )}

      {scopeQuery.isLoading && <LoadingSkeleton rows={3} />}

      {scopeQuery.isError && (
        <ErrorState
          message={
            scopeQuery.error instanceof ApiError
              ? scopeQuery.error.message
              : "Failed to load scope rules."
          }
          onRetry={() => scopeQuery.refetch()}
        />
      )}

      {!scopeQuery.isLoading && !scopeQuery.isError && scopeQuery.data?.length === 0 && (
        <EmptyState
          title="No scope rules yet"
          description="Add include/exclude rules to define what is in bounds for this engagement."
        />
      )}

      {!scopeQuery.isLoading && !scopeQuery.isError && scopeQuery.data && scopeQuery.data.length > 0 && (
        <div className="space-y-4">
          <AuthorizationBoundary
            engagement={engagements.find((e) => e.id === activeEngagementId) ?? null}
            rules={scopeQuery.data}
          />
          <div>
            <p className="mono text-[11px] tracking-[0.08em] mb-2" style={{ color: "var(--text-faint)" }}>RULES — MANAGE</p>
            <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px]">
              {scopeQuery.data.map((rule) => (
                <ScopeRuleRow key={rule.id} rule={rule} engagementId={activeEngagementId} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Runs ─────────────────────────────────────────────────
interface NewRunBody {
  title: string;
  agent_profile: string | null;
  engagement_id: string | null;
  plan: { steps: { action: string; target: string; prompt: string }[] };
}

function NewRunForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [agentProfile, setAgentProfile] = useState("passive_recon");
  const [engagementId, setEngagementId] = useState("");
  const [action, setAction] = useState("http_header_review");
  const [target, setTarget] = useState("");
  const [prompt, setPrompt] = useState("");

  const engagementsQuery = useQuery({
    queryKey: ["engagements", projectId],
    queryFn: () => api.get<Engagement[]>(`/api/v1/projects/${projectId}/engagements`),
  });
  const engagements = engagementsQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: (body: NewRunBody) =>
      api.post<Run>(`/api/v1/projects/${projectId}/runs`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onDone();
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    mutation.mutate({
      title: title.trim() || `Review of ${target.trim()}`,
      agent_profile: agentProfile.trim() || null,
      engagement_id: engagementId || null,
      plan: {
        steps: [
          {
            action: action.trim() || "http_header_review",
            target: target.trim(),
            prompt:
              prompt.trim() ||
              `Review the HTTP response of ${target.trim()} for hardening concerns. Passive only.`,
          },
        ],
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-5 mb-4 space-y-4"
    >
      <h3 className="text-sm font-medium text-[var(--text-secondary)]">New Run</h3>

      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError ? mutation.error.message : "Failed to create run."}
        </div>
      )}

      {engagements.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-md">
          This project has no engagement yet. A run needs an engagement so its
          target can be scope-checked — create one on the Engagements tab first.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="Baseline HTTP Security Review"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Engagement</label>
          <select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
          >
            <option value="">Select an engagement…</option>
            {engagements.map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.program_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Agent profile</label>
          <input
            value={agentProfile}
            onChange={(e) => setAgentProfile(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="passive_recon"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Step action</label>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="http_header_review"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">
          Step target (must be inside the engagement scope)
        </label>
        <input
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
          placeholder="demo-target"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">Step prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500"
          placeholder="Review the HTTP response headers of the target for hardening concerns. Passive only."
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
          disabled={mutation.isPending || !target.trim()}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create Run"}
        </button>
      </div>
    </form>
  );
}

type RunAction = "cancel" | "approve" | "reject";

function RunRow({ run }: { run: Run }) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<RunAction | null>(null);
  const [justification, setJustification] = useState("");

  const cancelMutation = useMutation({
    mutationFn: () => api.post<Run>(`/api/v1/runs/${run.id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api.post<Run>(`/api/v1/runs/${run.id}/approve`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
      setJustification("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api.post<Run>(`/api/v1/runs/${run.id}/reject`, { justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setPendingAction(null);
      setJustification("");
    },
  });

  const activeMutation =
    pendingAction === "cancel"
      ? cancelMutation
      : pendingAction === "approve"
        ? approveMutation
        : rejectMutation;

  const isCancellable = CANCELLABLE_STATES.has(run.state);
  const isAwaitingApproval = APPROVAL_STATES.has(run.state);
  const isTerminal = TERMINAL_STATES.has(run.state);

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-3 px-4 border-b border-[var(--border-default)]/60 last:border-0">
        <div className="min-w-0">
          <Link
            to={`/runs/${run.id}`}
            className="text-sm font-medium text-[var(--text-primary)] truncate hover:text-[var(--active)] transition-colors block"
          >
            {run.title || "Untitled run"}
          </Link>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">
            {run.agent_profile || "no agent profile"} ·{" "}
            {new Date(run.created_at).toLocaleString()}
          </p>
          {run.state === "FAILED" && run.failure_reason && (
            <p className="text-xs text-red-400 mt-1">{run.failure_reason}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StateBadge state={run.state} />

          {isAwaitingApproval && (
            <>
              <button
                onClick={() => setPendingAction("approve")}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--pass)] hover:bg-green-500 text-white transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => setPendingAction("reject")}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Reject
              </button>
            </>
          )}

          {!isAwaitingApproval && isCancellable && (
            <button
              onClick={() => setPendingAction("cancel")}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}

          {isTerminal && <span className="text-xs text-[var(--text-faint)] px-1">no actions</span>}
        </div>
      </div>

      <ConfirmDialog
        open={pendingAction === "cancel"}
        title="Cancel run"
        description={`Cancel "${run.title || "this run"}"? This will move it to the CANCELLED terminal state.`}
        confirmLabel="Cancel Run"
        variant="danger"
        loading={cancelMutation.isPending}
        error={
          cancelMutation.isError
            ? cancelMutation.error instanceof ApiError
              ? cancelMutation.error.message
              : "Failed to cancel run."
            : null
        }
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "approve" || pendingAction === "reject"}
        title={pendingAction === "approve" ? "Approve run" : "Reject run"}
        description={
          pendingAction === "approve"
            ? "Approving will advance this run to the next state."
            : "Rejecting will move this run to CANCELLED."
        }
        confirmLabel={pendingAction === "approve" ? "Approve" : "Reject"}
        variant={pendingAction === "reject" ? "danger" : "default"}
        loading={activeMutation.isPending}
        error={
          activeMutation.isError
            ? activeMutation.error instanceof ApiError
              ? activeMutation.error.message
              : "Action failed."
            : null
        }
        onConfirm={() =>
          pendingAction === "approve" ? approveMutation.mutate() : rejectMutation.mutate()
        }
        onCancel={() => {
          setPendingAction(null);
          setJustification("");
        }}
      >
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">
            Justification (optional)
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            className="w-full bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Reasoning for this decision..."
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

function RunsTab({ projectId }: { projectId: string }) {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.get<Run[]>("/api/v1/runs"),
  });

  const projectRuns = (data ?? []).filter((r) => r.project_id === projectId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Runs</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--text-primary)] hover:opacity-90 text-white transition-colors"
          >
            New Run
          </button>
        )}
      </div>

      {showForm && <NewRunForm projectId={projectId} onDone={() => setShowForm(false)} />}

      {isLoading && <LoadingSkeleton rows={3} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load runs."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && projectRuns.length === 0 && (
        <EmptyState
          title="No runs yet"
          description="Runs execute the agentic research workflow for this project."
        />
      )}

      {!isLoading && !isError && projectRuns.length > 0 && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px]">
          {projectRuns.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: project, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<Project>(`/api/v1/projects/${id}`),
    enabled: !!id,
  });

  if (!id) return null;

  if (isLoading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Failed to load project."}
        onRetry={() => refetch()}
      />
    );
  }

  if (!project) return null;

  return (
    <div>
      <div className="mb-6">
        <Link to="/projects" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
          ← Back to Projects
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{project.name}</h1>
          <span
            className={clsx(
              "text-xs px-2 py-0.5 rounded-full border",
              project.status === "active"
                ? "bg-green-500/10 text-green-300 border-green-500/30"
                : "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/30",
            )}
          >
            {project.status}
          </span>
        </div>
        <p className="text-sm text-[var(--text-faint)] mt-1">
          {project.description || "No description provided."}
        </p>
      </div>

      <div className="border-b border-[var(--border-default)] mb-6">
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t.id
                  ? "border-[var(--active)] text-[var(--active)]"
                  : "border-transparent text-[var(--text-faint)] hover:text-[var(--text-secondary)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && <OverviewTab projectId={id} />}
      {tab === "engagements" && <EngagementsTab projectId={id} />}
      {tab === "scope" && <ScopeTab projectId={id} />}
      {tab === "runs" && <RunsTab projectId={id} />}
    </div>
  );
}
