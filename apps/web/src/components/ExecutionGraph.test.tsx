import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ExecutionGraph } from "./ExecutionGraph";
import type { Run, RunEvent, RunStep } from "@/lib/types";

const baseRun: Run = {
  id: "run-1",
  project_id: "proj-1",
  engagement_id: "eng-1",
  state: "AWAITING_PLAN_APPROVAL",
  title: "Test Run",
  plan: { steps: [{ action: "http_header_review", target: "demo-target", prompt: "test" }] },
  agent_profile: "passive_recon",
  failure_reason: "",
  created_by: "user-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const events: RunEvent[] = [
  { id: "e1", run_id: "run-1", event_type: "run.created", from_state: null, to_state: "DRAFT", actor_id: "user-1", payload: null, created_at: new Date().toISOString() },
];

const steps: RunStep[] = [];

describe("ExecutionGraph", () => {
  it("renders pipeline nodes and reflects awaiting approval state", () => {
    renderWithProviders(<ExecutionGraph run={baseRun} events={events} steps={steps} />);
    expect(screen.getAllByText("TARGET").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SCOPE VALIDATION").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HUMAN APPROVAL").length).toBeGreaterThan(0);
    expect(screen.getAllByText((c) => c.includes("AWAITING")).length).toBeGreaterThan(0);
    expect(screen.getByText("ACTION REQUIRED")).toBeInTheDocument();
  });

  it("shows blocked state for scope-denied run", () => {
    const failedRun: Run = { ...baseRun, state: "FAILED", failure_reason: "Scope validation failed: target 'production.example.com' is explicitly excluded" };
    renderWithProviders(<ExecutionGraph run={failedRun} events={events} steps={steps} />);
    expect(screen.getAllByText("BLOCKED").length).toBeGreaterThan(0);
  });

  it("shows completed state", () => {
    const completed: Run = { ...baseRun, state: "COMPLETED" };
    const completedSteps: RunStep[] = [{ id: "s1", run_id: "run-1", step_number: 1, action: "http_header_review", status: "completed", input_data: null, output_data: { response: "ok" }, error: "", created_at: new Date().toISOString() }];
    renderWithProviders(<ExecutionGraph run={completed} events={events} steps={completedSteps} />);
    expect(screen.getAllByText("EVIDENCE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FINDING").length).toBeGreaterThan(0);
  });
});
