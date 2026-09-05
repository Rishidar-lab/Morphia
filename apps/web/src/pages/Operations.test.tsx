import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Operations from "./Operations";

function stubFetch(handler: (path: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((path: string) =>
      Promise.resolve({ ok: true, status: 200, json: async () => handler(path) }),
    ),
  );
}

describe("Operations Canvas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders operations command center header", async () => {
    stubFetch(() => []);
    renderWithProviders(<Operations />);
    expect(await screen.findByText((c) => c.includes("OPERATIONS"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Nothing executes merely because"))).toBeInTheDocument();
  });

  it("shows empty state when no projects", async () => {
    stubFetch((path) => {
      if (path.includes("/api/v1/projects")) return [];
      if (path.includes("/api/v1/runs")) return [];
      if (path.includes("dashboard/summary")) return { projects: 0, engagements: 0, runs: 0, active_runs: 0, pending_approvals: 0, evidence: 0, findings: 0, verified_findings: 0, reports: 0 };
      return [];
    });
    renderWithProviders(<Operations />);
    expect(await screen.findByText("NO ACTIVE OPERATION")).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Scope before execution"))).toBeInTheDocument();
  });

  it("renders authorization boundary and execution graph when data exists", async () => {
    const projects = [{ id: "proj-1", name: "Test Project", description: "", status: "active", owner_id: "u1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    const engagements = [{ id: "eng-1", project_id: "proj-1", program_name: "Test Program", authorization_basis: "Test", start_date: null, end_date: null, status: "active", notes: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    const runs = [{ id: "run-1", project_id: "proj-1", engagement_id: "eng-1", state: "AWAITING_PLAN_APPROVAL", title: "Test Run", plan: { steps: [{ action: "http_header_review", target: "demo-target", prompt: "test" }] }, agent_profile: "passive_recon", failure_reason: "", created_by: "u1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    const scope = [{ id: "r1", engagement_id: "eng-1", rule_type: "include" as const, target_type: "domain", pattern: "demo-target", is_wildcard: false, notes: "", created_at: new Date().toISOString() }];

    stubFetch((path) => {
      if (path.includes("/api/v1/projects") && !path.includes("engagements") && !path.includes("scope")) return projects;
      if (path.includes("/engagements") && !path.includes("scope")) return engagements;
      if (path.includes("/scope")) return scope;
      if (path.includes("/api/v1/runs") && !path.includes("events") && !path.includes("steps")) return runs;
      if (path.includes("/events")) return [];
      if (path.includes("/steps")) return [];
      if (path.includes("/api/v1/evidence")) return [];
      if (path.includes("/api/v1/findings")) return [];
      if (path.includes("audit-events")) return [];
      if (path.includes("dashboard/summary")) return { projects: 1, engagements: 1, runs: 1, active_runs: 0, pending_approvals: 1, evidence: 0, findings: 0, verified_findings: 0, reports: 0 };
      return [];
    });

    renderWithProviders(<Operations />);
    expect(await screen.findByText((c) => c.includes("AUTHORIZATION BOUNDARY"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("EXECUTION GRAPH"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("BLOCKED EXECUTION"))).toBeInTheDocument();
  });
});
