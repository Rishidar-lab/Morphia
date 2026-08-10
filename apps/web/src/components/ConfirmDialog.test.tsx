import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

// jsdom doesn't implement <dialog>.showModal()/.close() — stub them so the
// component's effect-driven open/close logic can run without throwing.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

describe("ConfirmDialog", () => {
  it("does not call showModal when rendered closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Cancel run"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // The <dialog> content is always in the DOM; only its native open state
    // (driven by showModal()/close() in the component's effect) toggles.
    expect(screen.getByText("Cancel run").closest("dialog")).not.toHaveAttribute("open");
  });

  it("shows the title and description when open", () => {
    render(
      <ConfirmDialog
        open
        title="Cancel run"
        description="This will stop the run immediately."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Cancel run")).toBeInTheDocument();
    expect(screen.getByText("This will stop the run immediately.")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Delete scope rule" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Delete scope rule" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows a working label while loading", () => {
    render(
      <ConfirmDialog
        open
        title="Approve run"
        loading
        confirmLabel="Approve"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("renders the error message when one is provided", () => {
    render(
      <ConfirmDialog
        open
        title="Approve run"
        error="Scope validation failed."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Scope validation failed.")).toBeInTheDocument();
  });
});
