import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { HealthCheck, HealthState, SystemStatus } from "@/lib/types";
import { LoadingSkeleton, ErrorState } from "@/components/ListStates";

const HEALTH_STYLE: Record<HealthState, string> = {
  ok: "bg-green-500/10 text-green-300 border-green-500/30",
  degraded: "bg-red-500/10 text-red-300 border-red-500/30",
  unknown: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

const HEALTH_LABEL: Record<HealthState, string> = {
  ok: "Operational",
  degraded: "Degraded",
  unknown: "Unknown",
};

function ServiceCard({
  name,
  description,
  check,
  extra,
}: {
  name: string;
  description: string;
  check: HealthCheck;
  extra?: string;
}) {
  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{name}</h2>
        <span
          className={
            "text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap " +
            HEALTH_STYLE[check.status]
          }
        >
          {HEALTH_LABEL[check.status]}
        </span>
      </div>
      <p className="text-xs text-[var(--text-faint)] mt-1">{description}</p>
      <p className="mono text-[11px] mt-2 text-[var(--text-muted)]">
        {extra ?? check.detail}
      </p>
    </div>
  );
}

function ConfigRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={`text-xs text-[var(--text-secondary)] text-right break-all ${mono ? "mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function Settings() {
  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.get<SystemStatus>("/api/v1/system/status"),
    refetchInterval: 30_000,
    retry: false,
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">System</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">
            Live service health and non-secret configuration
          </p>
        </div>
        {status && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-[11px] mono px-2 py-1 rounded border border-[var(--border-default)] text-[var(--text-muted)]"
              data-testid="system-version"
            >
              v{status.version}
            </span>
            <span className="text-[11px] px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-[var(--active)]">
              {status.environment}
            </span>
            <button
              onClick={() => refetch()}
              className="text-[11px] px-2 py-1 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-gray-800 transition-colors"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {isLoading && <LoadingSkeleton rows={4} />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Failed to load system status."}
          onRetry={() => refetch()}
        />
      )}

      {status && (
        <div data-testid="system-status">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <ServiceCard
              name="API"
              description="FastAPI process serving this page"
              check={{ status: "ok", detail: "serving" }}
              extra={`responded just now · request checked ${new Date(dataUpdatedAt).toLocaleTimeString()}`}
            />
            <ServiceCard
              name="Database"
              description="PostgreSQL system of record"
              check={status.database}
            />
            <ServiceCard name="Queue" description="Redis job queue + heartbeats" check={status.redis} />
            <ServiceCard
              name="Worker"
              description="Background execution (Redis heartbeat)"
              check={status.worker}
            />
            <ServiceCard
              name="Migrations"
              description="Alembic schema revision"
              check={status.migration}
              extra={`revision ${status.migration.detail}`}
            />
            <ServiceCard
              name="Provider"
              description="Model provider for run steps"
              check={{ status: "ok", detail: status.provider }}
              extra={`${status.provider} · selection is process-wide, not per-run`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Configuration</h2>
              <p className="text-xs text-[var(--text-faint)] mt-1 mb-2">
                Non-secret values only. Secrets are environment-only and never exposed here.
              </p>
              <ConfigRow label="Environment" value={status.environment} />
              <ConfigRow label="Version" value={status.version} />
              <ConfigRow label="Storage backend" value={status.storage_backend} />
              <ConfigRow label="Model provider" value={status.provider} />
              <ConfigRow
                label="Session lifetime"
                value={`${status.session_lifetime_hours} hours`}
              />
              <ConfigRow label="Debug mode" value={status.debug ? "enabled" : "disabled"} />
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[6px] p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Enforcement posture
              </h2>
              <p className="text-xs text-[var(--text-faint)] mt-1 mb-2">
                Live controls, not documentation promises.
              </p>
              <ConfigRow label="Scope validation" value="default-deny · API + worker" mono={false} />
              <ConfigRow label="Approval gate" value="human decision required" mono={false} />
              <ConfigRow
                label="Self-approval"
                value="justified + flagged in audit trail"
                mono={false}
              />
              <ConfigRow label="Evidence integrity" value="SHA-256 at capture" mono={false} />
              <ConfigRow label="Upload validation" value="size + type + signature" mono={false} />
              <ConfigRow label="Audit trail" value="append-only" mono={false} />
            </div>
          </div>

          <p className="mono text-[11px] mt-4" style={{ color: "var(--text-faint)" }}>
            checked at {new Date(status.checked_at).toLocaleString()} · API keys, worker
            secrets, database credentials, and session secrets are never rendered.
          </p>
        </div>
      )}
    </div>
  );
}
