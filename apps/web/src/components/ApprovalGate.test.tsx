import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ApprovalGate } from "./ApprovalGate";
import type { Run } from "@/lib/types";

const baseRun: Run = {
  id: "run-1",
  project_id: "proj-1",
  engagement_id: "eng-1",
  state: "AWAITING_PLAN_APPROVAL",
  title: "Test Run",
  plan: { steps: [{ action: "http_header_review", target: "demo-target", prompt: "Review headers" }] },
  agent_profile: "passive_recon",
  failure_reason: "",
  created_by: "user-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ApprovalGate", () => {
  it("renders consequential approval workspace when awaiting", () => {
    renderWithProviders(<ApprovalGate run={baseRun} engagementName="Test Program" />);
    expect(screen.getByText("EXECUTION PAUSED — HUMAN AUTHORIZATION REQUIRED")).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("The agent cannot continue"))).toBeInTheDocument();
    expect(screen.getByText("AWAITING HUMAN")).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Approve — authorize execution"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("PROPOSED PLAN"))).toBeInTheDocument();
  });

  it("returns null when not in approval state", () => {
    const completed = { ...baseRun, state: "COMPLETED" as const };
    const { container } = renderWithProviders(<ApprovalGate run={completed} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows plan target and prompt", () => {
    renderWithProviders(<ApprovalGate run={baseRun} />);
    expect(screen.getByText((c) => c.includes("demo-target"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Review headers"))).toBeInTheDocument();
  });
});
