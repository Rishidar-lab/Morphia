import {
  useEffect,
  useId,
  useState,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

interface GeneralSettings {
  organization_name: string;
  timezone: string;
  default_project_status: string;
}

interface SecuritySettings {
  session_timeout_minutes: number;
  require_mfa: boolean;
  password_min_length: number;
}

interface ProviderSettings {
  default_model_provider: string;
  default_model: string;
  max_run_cost_usd: number;
}

interface StorageSettings {
  evidence_bucket: string;
  retention_days: number;
}

interface WorkerSettings {
  max_concurrent_runs: number;
  queue_backend: string;
}

const DEFAULTS = {
  general: {
    organization_name: "MORPHIA Research",
    timezone: "UTC",
    default_project_status: "active",
  } as GeneralSettings,
  security: {
    session_timeout_minutes: 60,
    require_mfa: false,
    password_min_length: 8,
  } as SecuritySettings,
  provider: {
    default_model_provider: "anthropic",
    default_model: "claude-sonnet",
    max_run_cost_usd: 25,
  } as ProviderSettings,
  storage: {
    evidence_bucket: "morphia-evidence",
    retention_days: 365,
  } as StorageSettings,
  worker: {
    max_concurrent_runs: 5,
    queue_backend: "redis",
  } as WorkerSettings,
};

function SettingsSection<T>({
  title,
  description,
  endpoint,
  defaults,
  children,
}: {
  title: string;
  description: string;
  endpoint: string;
  defaults: T;
  children: (value: T, setValue: (v: T) => void) => ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["settings", endpoint],
    queryFn: () => api.get<T>(endpoint),
    retry: false,
  });

  const [value, setValue] = useState<T>(defaults);
  const [saved, setSaved] = useState(false);

  // Sync server config into local editable state once it arrives, without
  // clobbering in-progress edits on every background refetch.
  useEffect(() => {
    if (data) setValue(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (body: T) => api.put<T>(endpoint, body),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      <p className="text-xs text-gray-500 mt-1 mb-4">{description}</p>

      <div className="space-y-3">{children(value, setValue)}</div>

      {mutation.isError && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Failed to save — this section is not yet wired to a live config store, showing defaults."}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => mutation.mutate(value)}
          disabled={mutation.isPending}
          className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white transition-colors"
        >
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </button>
        {saved && <span className="text-xs text-green-400">Saved.</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  // Inject the generated id into the field's control so the <label> below
  // is actually associated with it (via htmlFor) — previously the label
  // had no htmlFor and wasn't wrapping the control either, so screen
  // readers had no way to connect "Organization Name" to its input.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;

  return (
    <div className="grid grid-cols-3 items-center gap-3">
      <label htmlFor={id} className="text-xs text-gray-400 col-span-1">
        {label}
      </label>
      <div className="col-span-2">{control}</div>
    </div>
  );
}

const inputClass =
  "w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function Settings() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Organization-wide configuration</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        <SettingsSection
          title="General"
          description="Basic organization identity and defaults."
          endpoint="/api/v1/settings/general"
          defaults={DEFAULTS.general}
        >
          {(value, setValue) => (
            <>
              <Field label="Organization Name">
                <input
                  className={inputClass}
                  value={value.organization_name}
                  onChange={(e) =>
                    setValue({ ...value, organization_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Timezone">
                <input
                  className={inputClass}
                  value={value.timezone}
                  onChange={(e) => setValue({ ...value, timezone: e.target.value })}
                />
              </Field>
              <Field label="Default Project Status">
                <select
                  className={inputClass}
                  value={value.default_project_status}
                  onChange={(e) =>
                    setValue({ ...value, default_project_status: e.target.value })
                  }
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          title="Security"
          description="Session handling and authentication policy."
          endpoint="/api/v1/settings/security"
          defaults={DEFAULTS.security}
        >
          {(value, setValue) => (
            <>
              <Field label="Session Timeout (min)">
                <input
                  type="number"
                  min={5}
                  className={inputClass}
                  value={value.session_timeout_minutes}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      session_timeout_minutes: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Require MFA">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={value.require_mfa}
                    onChange={(e) =>
                      setValue({ ...value, require_mfa: e.target.checked })
                    }
                    className="rounded border-gray-700 bg-gray-950 text-blue-500 focus:ring-blue-500"
                  />
                  Enabled
                </label>
              </Field>
              <Field label="Password Min Length">
                <input
                  type="number"
                  min={8}
                  className={inputClass}
                  value={value.password_min_length}
                  onChange={(e) =>
                    setValue({ ...value, password_min_length: Number(e.target.value) })
                  }
                />
              </Field>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          title="Provider Configuration"
          description="Default model provider and per-run cost ceiling for agentic runs."
          endpoint="/api/v1/settings/providers"
          defaults={DEFAULTS.provider}
        >
          {(value, setValue) => (
            <>
              <Field label="Model Provider">
                <select
                  className={inputClass}
                  value={value.default_model_provider}
                  onChange={(e) =>
                    setValue({ ...value, default_model_provider: e.target.value })
                  }
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="local">Local / Self-hosted</option>
                </select>
              </Field>
              <Field label="Default Model">
                <input
                  className={inputClass}
                  value={value.default_model}
                  onChange={(e) => setValue({ ...value, default_model: e.target.value })}
                />
              </Field>
              <Field label="Max Run Cost (USD)">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputClass}
                  value={value.max_run_cost_usd}
                  onChange={(e) =>
                    setValue({ ...value, max_run_cost_usd: Number(e.target.value) })
                  }
                />
              </Field>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          title="Storage"
          description="Evidence artifact storage and retention policy."
          endpoint="/api/v1/settings/storage"
          defaults={DEFAULTS.storage}
        >
          {(value, setValue) => (
            <>
              <Field label="Evidence Bucket">
                <input
                  className={inputClass}
                  value={value.evidence_bucket}
                  onChange={(e) =>
                    setValue({ ...value, evidence_bucket: e.target.value })
                  }
                />
              </Field>
              <Field label="Retention (days)">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={value.retention_days}
                  onChange={(e) =>
                    setValue({ ...value, retention_days: Number(e.target.value) })
                  }
                />
              </Field>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          title="Worker"
          description="Background execution capacity for run orchestration."
          endpoint="/api/v1/settings/worker"
          defaults={DEFAULTS.worker}
        >
          {(value, setValue) => (
            <>
              <Field label="Max Concurrent Runs">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={value.max_concurrent_runs}
                  onChange={(e) =>
                    setValue({ ...value, max_concurrent_runs: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Queue Backend">
                <select
                  className={inputClass}
                  value={value.queue_backend}
                  onChange={(e) => setValue({ ...value, queue_backend: e.target.value })}
                >
                  <option value="redis">Redis</option>
                  <option value="sqs">Amazon SQS</option>
                </select>
              </Field>
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
