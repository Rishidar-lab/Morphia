import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

describe("Dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading placeholders before the summary resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders the real counts from /api/v1/dashboard/summary", async () => {
    stubFetch((path) => (path.includes("dashboard/summary") ? SUMMARY : []));
    renderWithProviders(<Dashboard />);

    const projectsCard = screen.getByText("Projects").closest("a")!;
    await waitFor(() =>
      expect(within(projectsCard).getByText("3")).toBeInTheDocument(),
    );

    const pendingCard = screen.getByText("Pending approvals").closest("a")!;
    expect(within(pendingCard).getByText("4")).toBeInTheDocument();

    const verifiedCard = screen.getByText("Verified findings").closest("a")!;
    expect(within(verifiedCard).getByText("2")).toBeInTheDocument();
  });

  it("renders recent activity from the audit log", async () => {
    stubFetch((path) =>
      path.includes("dashboard/summary")
        ? SUMMARY
        : [
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
          ],
    );
    renderWithProviders(<Dashboard />);

    await waitFor(() =>
      expect(screen.getByText("scope.modify")).toBeInTheDocument(),
    );
  });
});
