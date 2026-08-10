import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Settings from "./Settings";

// All 5 SettingsSections mount at once and each GETs its own endpoint on
// load; none of them exist server-side yet, so every load 404s and each
// section falls back to its local defaults (this is real behavior — see
// the component's "not yet wired to a live config store" fallback message).
function stubAllSettingsGetsFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
  );
}

describe("Settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to defaults for text, select, number, and checkbox fields when nothing loads", async () => {
    stubAllSettingsGetsFail();
    renderWithProviders(<Settings />);

    // Regression check: SettingsSection<T extends Record<string, unknown>>
    // previously broke every one of these bindings at the type level
    // (GeneralSettings/SecuritySettings/etc. have no index signature). This
    // asserts the actual rendered values, not just that it type-checks.
    await waitFor(() => {
      expect(screen.getByLabelText("Organization Name")).toHaveValue("MORPHIA Research");
    });
    expect(screen.getByLabelText("Timezone")).toHaveValue("UTC");
    expect(screen.getByLabelText("Default Project Status")).toHaveValue("active");
    expect(screen.getByLabelText("Session Timeout (min)")).toHaveValue(60);
    expect(screen.getByLabelText("Password Min Length")).toHaveValue(8);
    expect(screen.getByRole("checkbox", { name: "Enabled" })).not.toBeChecked();
  });

  it("updates field state as the user types, selects, and toggles", async () => {
    stubAllSettingsGetsFail();
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Organization Name")).toHaveValue("MORPHIA Research");
    });

    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Cypherdome Security" },
    });
    expect(screen.getByLabelText("Organization Name")).toHaveValue("Cypherdome Security");

    fireEvent.change(screen.getByLabelText("Default Project Status"), {
      target: { value: "archived" },
    });
    expect(screen.getByLabelText("Default Project Status")).toHaveValue("archived");

    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
  });

  it("PUTs the edited section to its endpoint and shows a saved confirmation", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => JSON.parse(opts.body as string),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Organization Name")).toHaveValue("MORPHIA Research");
    });

    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Cypherdome Security" },
    });

    const generalSection = screen.getByText("General").closest("div")!;
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Changes" }).find((btn) =>
        generalSection.contains(btn),
      )!,
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/settings/general",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("Cypherdome Security"),
        }),
      ),
    );
  });
});
