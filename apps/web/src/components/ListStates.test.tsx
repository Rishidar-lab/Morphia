import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadingSkeleton, EmptyState, ErrorState } from "./ListStates";

describe("LoadingSkeleton", () => {
  it("renders 4 placeholder rows by default", () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("renders the requested number of rows", () => {
    const { container } = render(<LoadingSkeleton rows={7} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(7);
  });
});

describe("EmptyState", () => {
  it("renders the title and, optionally, a description and action", () => {
    render(
      <EmptyState
        title="No projects yet"
        description="Create your first project to get started."
        action={<button>New project</button>}
      />,
    );
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first project to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
  });

  it("omits the description and action when not provided", () => {
    render(<EmptyState title="No projects yet" />);
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("renders the message and a retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed to load projects." onRetry={onRetry} />);

    expect(screen.getByText("Failed to load projects.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when onRetry is not provided", () => {
    render(<ErrorState message="Failed to load projects." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
