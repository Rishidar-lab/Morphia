import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading placeholder before the projects request resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getAllByText("—")).not.toHaveLength(0);
  });

  it("renders the real project count once the request resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "1", name: "Project One" },
          { id: "2", name: "Project Two" },
          { id: "3", name: "Project Three" },
        ],
      }),
    );

    renderWithProviders(<Dashboard />);

    // Regression check: Dashboard previously called api.get() with no type
    // argument, so `projects` was untyped and `projects?.length` broke the
    // build. This asserts the actual rendered count, not just that it builds.
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  });

  it("shows zero when the project list is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      const activeProjectsCard = screen.getByText("Active Projects").closest("div")!;
      // Scoped to this card specifically — the other three stat cards also
      // render "0" (hardcoded), so an unscoped query would pass regardless
      // of whether the project count was actually computed correctly.
      expect(within(activeProjectsCard).getByText("0")).toBeInTheDocument();
    });
  });
});
