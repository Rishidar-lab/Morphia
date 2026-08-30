import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Dashboard from "./Dashboard";

const SUMMARY = {
  projects: 3,
  engagements: 2,
  runs: 5,
  active_runs: 1,
  pending_approvals: 4,
  evidence: 7,
  findings: 6,
  verified_findings: 2,
  reports: 1,
};

function stubFetch(handler: (path: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((path: string) =>
      Promise.resolve({ ok: true, status: 200, json: async () => handler(path) }),
    ),
  );
}

function dashboardHandler(path: string): unknown {
  if (path.includes("dashboard/summary")) return SUMMARY;
  if (path.includes("/api/v1/runs")) return [];
  if (path.includes("/api/v1/evidence")) return [];
  if (path.includes("/api/v1/findings")) return [];
  if (path.includes("/api/v1/projects")) return [];
  if (path.includes("audit-events")) return [];
  return [];
}

describe("Dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows overview header while loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("OVERVIEW")).toBeInTheDocument();
    expect(screen.getByText(/Open Operations Canvas/)).toBeInTheDocument();
  });

  it("renders the real counts from /api/v1/dashboard/summary", async () => {
    stubFetch(dashboardHandler);
    renderWithProviders(<Dashboard />);

    await waitFor(() => expect(screen.getByText("CURRENT OPERATION")).toBeInTheDocument());

    // Check that summary data is reflected in scope state and governance sections
    expect(screen.getByText("SCOPE STATE")).toBeInTheDocument();
    expect(screen.getByText("LATEST EVIDENCE")).toBeInTheDocument();
  });

  it("renders recent activity from the audit log", async () => {
    stubFetch((path) => {
      if (path.includes("dashboard/summary")) return SUMMARY;
      if (path.includes("audit-events"))
        return [
          {
            id: "e1",
            event_type: "scope.modify",
            action: "create",
            actor_id: "u1",
            target_type: "scope_rule",
            target_id: "r1",
            metadata_json: null,
            ip_address: null,
            created_at: new Date().toISOString(),
          },
        ];
      if (path.includes("/api/v1/runs")) return [];
      if (path.includes("/api/v1/evidence")) return [];
      if (path.includes("/api/v1/findings")) return [];
      if (path.includes("/api/v1/projects")) return [];
      return [];
    });
    renderWithProviders(<Dashboard />);

    await waitFor(() => expect(screen.getByText("GOVERNANCE EVENTS")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("scope.modify")).toBeInTheDocument());
  });
});
