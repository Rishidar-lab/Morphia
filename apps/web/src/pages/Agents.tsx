import { useState } from "react";
import type { AgentProfile, ApprovalLevel } from "@/lib/types";

/**
 * Agent profiles are config-driven on the backend (loaded from YAML/JSON
 * profile definitions consumed by the orchestrator). Until a
 * GET /api/v1/agents endpoint exists, we surface the documented default
 * profiles here so operators can see what governs each run.
 */
const DEFAULT_PROFILES: AgentProfile[] = [
  {
    id: "project_planner",
    name: "Project Planner",
    purpose:
      "Decomposes a project's objectives into an ordered plan of engagements and runs, respecting scope boundaries.",
    allowed_tools: ["read_scope", "read_engagements", "propose_plan"],
    max_cost_usd: 2,
    approval_level: "plan_only",
  },
  {
    id: "scope_analyst",
    name: "Scope Analyst",
    purpose:
      "Validates that proposed targets fall within authorized scope rules before any active testing begins.",
    allowed_tools: ["read_scope", "validate_target", "flag_out_of_scope"],
    max_cost_usd: 1,
    approval_level: "none",
  },
  {
    id: "passive_recon",
    name: "Passive Recon",
    purpose:
      "Performs non-intrusive reconnaissance — DNS enumeration, certificate transparency, public metadata gathering.",
    allowed_tools: ["dns_lookup", "cert_search", "osint_search", "store_evidence"],
    max_cost_usd: 5,
    approval_level: "none",
  },
  {
    id: "active_scanner",
    name: "Active Scanner",
    purpose:
      "Runs authenticated and unauthenticated scans against in-scope assets. Requires action-level approval before executing.",
    allowed_tools: ["port_scan", "vuln_scan", "http_probe", "store_evidence"],
    max_cost_usd: 15,
    approval_level: "action_level",
  },
  {
    id: "exploit_researcher",
    name: "Exploit Researcher",
    purpose:
      "Investigates candidate findings for exploitability and drafts proof-of-concept steps. Highest-risk profile — requires full approval.",
    allowed_tools: [
      "read_findings",
      "poc_sandbox",
      "store_evidence",
      "propose_finding",
    ],
    max_cost_usd: 25,
    approval_level: "full",
  },
  {
    id: "report_writer",
    name: "Report Writer",
    purpose:
      "Synthesizes verified findings and evidence into a structured report for a project.",
    allowed_tools: ["read_findings", "read_evidence", "generate_report"],
    max_cost_usd: 3,
    approval_level: "plan_only",
  },
];

const APPROVAL_LEVEL_STYLE: Record<ApprovalLevel, string> = {
  none: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  plan_only: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  action_level: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  full: "bg-red-500/10 text-red-300 border-red-500/30",
};

const APPROVAL_LEVEL_LABEL: Record<ApprovalLevel, string> = {
  none: "No approval required",
  plan_only: "Plan approval",
  action_level: "Action-level approval",
  full: "Full approval chain",
};

function ConfigurePlaceholder({
  profile,
  onClose,
}: {
  profile: AgentProfile;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl p-5">
        <h2 className="text-base font-semibold text-gray-100 mb-2">
          Configure {profile.name}
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Agent profile configuration is managed via server-side config files
          today. Editable in-app configuration (tool allowlists, cost caps,
          approval routing) is planned but not yet available.
        </p>
        <div className="bg-gray-950/50 border border-gray-800 rounded-md p-3 text-xs text-gray-500 mb-4">
          Coming soon: edit allowed tools, cost ceiling, and approval routing
          per profile directly from this dialog.
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Agents() {
  const [configuring, setConfiguring] = useState<AgentProfile | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Agents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Config-driven agent profiles that govern what each run is permitted to do
        </p>
      </div>

      <div className="mb-5 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
        Reference view. Agent profiles are defined in server-side config today;
        in-app management (<code>GET /api/v1/agents</code>) is on the roadmap.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEFAULT_PROFILES.map((profile) => (
          <div
            key={profile.id}
            className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 flex flex-col"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-100">{profile.name}</h2>
              <span
                className={
                  "text-xs px-2 py-0.5 rounded-full border whitespace-nowrap " +
                  APPROVAL_LEVEL_STYLE[profile.approval_level]
                }
              >
                {APPROVAL_LEVEL_LABEL[profile.approval_level]}
              </span>
            </div>

            <p className="text-sm text-gray-400 mt-2 flex-1">{profile.purpose}</p>

            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <div>
                <p className="text-gray-500 uppercase tracking-wider">Allowed Tools</p>
                <p className="text-gray-300 mt-0.5">{profile.allowed_tools.length} tools</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wider">Max Cost</p>
                <p className="text-gray-300 mt-0.5">${profile.max_cost_usd.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {profile.allowed_tools.map((tool) => (
                <span
                  key={tool}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-500"
                >
                  {tool}
                </span>
              ))}
            </div>

            <button
              onClick={() => setConfiguring(profile)}
              className="mt-4 self-start px-3 py-1.5 text-xs font-medium rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Configure
            </button>
          </div>
        ))}
      </div>

      {configuring && (
        <ConfigurePlaceholder profile={configuring} onClose={() => setConfiguring(null)} />
      )}
    </div>
  );
}
