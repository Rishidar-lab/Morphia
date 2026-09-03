import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Captures MORPHIA v0.2 Operations Intelligence screenshots from the seeded
 * "Morphia Demo Research" workspace.
 *
 *   ./scripts/demo.sh                         # seed the workspace
 *   SEED_ADMIN_PASSWORD=... npx playwright test screenshots
 *
 * Skips itself unless SEED_ADMIN_PASSWORD is provided.
 */

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@morphia.example.com";
const OUT = path.resolve(__dirname, "../../../docs/assets/screenshots");

test.describe("documentation screenshots", () => {
  test.skip(!PASSWORD, "set SEED_ADMIN_PASSWORD to capture screenshots");
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/operations$/);
  });

  async function shoot(page: Page, name: string): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  }

  test("capture operations intelligence screenshots", async ({ page }) => {
    // 1. Operations Command Center — signature view
    await page.goto("/operations");
    await expect(page.getByText("OPERATIONS — COMMAND CENTER", { exact: true })).toBeVisible();
    await shoot(page, "operations");

    // 2. Human Approval Gate (awaiting run)
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await page.getByRole("link", { name: "Header Hardening Review — Awaiting Approval" }).click();
    await expect(page.getByText("EXECUTION PAUSED — HUMAN AUTHORIZATION REQUIRED")).toBeVisible();
    await shoot(page, "approval-gate");

    // 3. Allowed execution graph (completed run)
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await page.getByRole("link", { name: "Baseline HTTP Security Review" }).click();
    await expect(page.getByText("EXECUTION GRAPH — OPERATION PIPELINE", { exact: true })).toBeVisible();
    await shoot(page, "run-detail");
    await shoot(page, "execution-graph");

    // 4. Scope Policy / Authorization Boundary
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Scope", exact: true }).click();
    await expect(page.getByTestId("authorization-boundary")).toBeVisible();
    await shoot(page, "scope");
    await shoot(page, "authorization-boundary");

    // 5. Blocked out-of-scope execution
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await page.getByRole("link", { name: "Out-of-Scope Probe — Blocked by Policy" }).click();
    await expect(page.getByText("BLOCKED", { exact: true }).first()).toBeVisible();
    await shoot(page, "blocked-execution");

    // 6. Evidence provenance
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "EVIDENCE" })).toBeVisible();
    await shoot(page, "evidence");
    await shoot(page, "evidence-provenance");

    // 7. Finding analyst workspace
    await page.goto("/findings");
    await expect(page.getByRole("heading", { name: "FINDINGS" })).toBeVisible();
    await shoot(page, "findings");
    await shoot(page, "finding-workspace");

    // 8. Report
    await page.goto("/reports");
    await shoot(page, "reports");

    // 9. Audit / Governance
    await page.goto("/audit");
    await expect(page.getByText("GOVERNANCE — AUDIT LOG", { exact: true })).toBeVisible();
    await shoot(page, "audit-log");
    await shoot(page, "governance");

    // Dashboard (overview) for completeness
    await page.goto("/dashboard");
    await shoot(page, "dashboard");

    await page.goto("/operations");
    await shoot(page, "social-preview");

    expect(existsSync(path.join(OUT, "operations.png"))).toBe(true);
    expect(existsSync(path.join(OUT, "approval-gate.png"))).toBe(true);
    expect(existsSync(path.join(OUT, "blocked-execution.png"))).toBe(true);
  });
});
