import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Not a test of behaviour — this captures the documentation screenshots into
 * docs/assets/screenshots/ from the seeded "Morphia Demo Research" workspace.
 *
 *   ./scripts/demo.sh                         # seed the workspace
 *   SEED_ADMIN_PASSWORD=... npx playwright test screenshots
 *
 * Skips itself unless SEED_ADMIN_PASSWORD is provided (it needs the seeded
 * owner account to have something worth showing).
 */

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@morphia.example.com";
const OUT = path.resolve(__dirname, "../../../docs/assets/screenshots");

test.describe("documentation screenshots", () => {
  test.skip(!PASSWORD, "set SEED_ADMIN_PASSWORD to capture screenshots");
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  async function shoot(page: Page, name: string): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  }

  test("capture all pages", async ({ page }) => {
    await page.goto("/dashboard");
    await shoot(page, "dashboard");

    await page.goto("/projects");
    await shoot(page, "projects");

    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await expect(page.getByRole("heading", { name: "Morphia Demo Research" })).toBeVisible();
    await shoot(page, "project-overview");

    await page.getByRole("button", { name: "Scope", exact: true }).click();
    await shoot(page, "scope");

    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await shoot(page, "project-runs");

    await page.getByRole("link", { name: "Baseline HTTP Security Review" }).click();
    await expect(
      page.getByRole("heading", { name: "Baseline HTTP Security Review" }),
    ).toBeVisible();
    await shoot(page, "run-detail");

    await page.goto("/approvals");
    await shoot(page, "approvals");

    await page.goto("/evidence");
    await shoot(page, "evidence");

    await page.goto("/findings");
    await shoot(page, "findings");

    await page.goto("/reports");
    await shoot(page, "reports");

    await page.goto("/audit");
    await shoot(page, "audit-log");

    expect(existsSync(path.join(OUT, "dashboard.png"))).toBe(true);
  });
});
