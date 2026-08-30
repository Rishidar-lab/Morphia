import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import SignIn from "./SignIn";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignIn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    navigateMock.mockClear();
  });

  it("posts credentials to /api/auth/login and navigates to the dashboard on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<SignIn />);
    fillAndSubmit("researcher@example.com", "correct-horse-battery");

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/operations"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "researcher@example.com",
          password: "correct-horse-battery",
        }),
      }),
    );
  });

  it("shows the server's error message and does not navigate on invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "Invalid email or password." }),
      }),
    );

    renderWithProviders(<SignIn />);
    fillAndSubmit("researcher@example.com", "wrong-password");

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a network-error message when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderWithProviders(<SignIn />);
    fillAndSubmit("researcher@example.com", "correct-horse-battery");

    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve))),
    );

    renderWithProviders(<SignIn />);
    fillAndSubmit("researcher@example.com", "correct-horse-battery");

    expect(await screen.findByRole("button", { name: "Signing in..." })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });
});
