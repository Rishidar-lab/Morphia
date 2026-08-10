import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBadge } from "./StateBadge";

describe("StateBadge", () => {
  it("renders the human-readable label for a known run state", () => {
    render(<StateBadge state="AWAITING_PLAN_APPROVAL" />);
    expect(screen.getByText("Awaiting Plan Approval")).toBeInTheDocument();
  });

  it("falls back to the raw value for a state it doesn't recognize", () => {
    render(<StateBadge state="SOME_FUTURE_STATE" />);
    expect(screen.getByText("SOME_FUTURE_STATE")).toBeInTheDocument();
  });

  it("applies an additional className alongside the state styling", () => {
    render(<StateBadge state="COMPLETED" className="extra-class" />);
    expect(screen.getByText("Completed").closest("span")).toHaveClass("extra-class");
  });
});
