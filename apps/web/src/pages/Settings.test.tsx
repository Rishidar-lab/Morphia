import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Settings from "./Settings";

const STATUS = {
  version: "0.2.0-mvp",
  environment: "development",
  debug: false,
  provider: "mock (default)",
  storage_backend: "local",
  session_lifetime_hours: 24,
  database: { status: "ok", detail: "reachable" },
  redis: { status: "ok", detail: "reachable" },
  worker: { status: "ok", detail: "1 worker(s) reporting" },
  migration: { status: "ok", detail: "9c7c1bf0c5c7" },
  checked_at: "2026-09-03T00:00:00Z",
};

function stubStatusOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => STATUS }),
  );
}

describe("Settings / System status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders live health for every service", async () => {
    stubStatusOk();
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByTestId("system-status")).toBeInTheDocument();
    });
    for (const name of ["API", "Database", "Queue", "Worker", "Migrations", "Provider"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByTestId("system-version")).toHaveTextContent("0.2.0-mvp");
    expect(screen.getByText("mock (default)")).toBeInTheDocument();
  });

  it("shows degraded state honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...STATUS, redis: { status: "degraded", detail: "Timeout" } }),
      }),
    );
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByTestId("system-status")).toBeInTheDocument();
    });
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("never renders secret material", async () => {
    stubStatusOk();
    const { container } = renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByTestId("system-status")).toBeInTheDocument();
    });
    const text = container.textContent?.toLowerCase() ?? "";
    // Secret identifiers / values must never appear as data (the footer
    // sentence naming secret *categories* is the only allowed mention).
    for (const word of ["secret_key", "worker_auth_secret", "api_key", "apikey", "change-me"]) {
      expect(text).not.toContain(word);
    }
  });

  it("shows an error state when the endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });
});
