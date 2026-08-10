import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import NotFound from "./NotFound";

describe("NotFound", () => {
  it("renders a 404 message with a link back to the dashboard", () => {
    renderWithProviders(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Back to Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
