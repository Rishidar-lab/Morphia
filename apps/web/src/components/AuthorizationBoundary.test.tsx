import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { AuthorizationBoundary } from "./AuthorizationBoundary";
import type { ScopeRule, Engagement } from "@/lib/types";

const engagement: Engagement = {
  id: "eng-1",
  project_id: "proj-1",
  program_name: "Test Program",
  authorization_basis: "Test basis",
  start_date: null,
  end_date: null,
  status: "active",
  notes: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const rules: ScopeRule[] = [
  { id: "r1", engagement_id: "eng-1", rule_type: "include", target_type: "domain", pattern: "demo-target", is_wildcard: false, notes: "", created_at: new Date().toISOString() },
  { id: "r2", engagement_id: "eng-1", rule_type: "exclude", target_type: "domain", pattern: "production.example.com", is_wildcard: false, notes: "", created_at: new Date().toISOString() },
];

describe("AuthorizationBoundary", () => {
  it("renders authorized and excluded sections", () => {
    renderWithProviders(<AuthorizationBoundary engagement={engagement} rules={rules} />);
    expect(screen.getByText(/AUTHORIZED — 1/)).toBeInTheDocument();
    expect(screen.getByText(/EXCLUDED \/ DENIED — 1/)).toBeInTheDocument();
    expect(screen.getByText("demo-target")).toBeInTheDocument();
    expect(screen.getByText("production.example.com")).toBeInTheDocument();
  });

  it("evaluates allow target", async () => {
    renderWithProviders(<AuthorizationBoundary engagement={engagement} rules={rules} />);
    const input = screen.getByPlaceholderText("demo-target or production.example.com");
    fireEvent.change(input, { target: { value: "demo-target" } });
    fireEvent.click(screen.getByRole("button", { name: "Evaluate" }));
    expect(await screen.findByText(/POLICY DECISION — ALLOW/)).toBeInTheDocument();
    expect(screen.getByText(/EXECUTION PERMITTED/)).toBeInTheDocument();
  });

  it("evaluates deny target", async () => {
    renderWithProviders(<AuthorizationBoundary engagement={engagement} rules={rules} />);
    const input = screen.getByPlaceholderText("demo-target or production.example.com");
    fireEvent.change(input, { target: { value: "production.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Evaluate" }));
    expect(await screen.findByText(/POLICY DECISION — DENY/)).toBeInTheDocument();
    expect(screen.getByText(/EXECUTION PREVENTED/)).toBeInTheDocument();
  });
});
