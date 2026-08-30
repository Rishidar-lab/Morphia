import { test, expect, type Page } from "@playwright/test";

/**
 * Records a concise, deterministic walkthrough of the seeded MORPHIA MVP.
 *
 * This is intentionally separate from the behavioural E2E suite: the test
 * uses the same live Docker stack, but adds chapter cards and short holds so
 * the resulting video is useful as a portfolio/demo artifact.
 *
 *   ./scripts/demo.sh
 *   cd tests/e2e
 *   set -a; source ../../.env; set +a
 *   npx playwright test demo-video
 */

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@morphia.example.com";

test.use({
  viewport: { width: 1280, height: 720 },
  video: { mode: "on", size: { width: 1280, height: 720 } },
});

test.describe("portfolio demo recording", () => {
  test.skip(!PASSWORD, "set SEED_ADMIN_PASSWORD to record the seeded demo");

  async function settle(page: Page, holdMs = 1_400): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(holdMs);
  }

  async function chapter(
    page: Page,
    title: string,
    subtitle: string,
    holdMs = 2_300,
  ): Promise<void> {
    await page.evaluate(
      ({ heading, copy }) => {
        document.querySelector("[data-morphia-demo-card]")?.remove();
        const card = document.createElement("div");
        card.dataset.morphiaDemoCard = "true";
        card.style.cssText = [
          "position:fixed",
          "left:32px",
          "bottom:28px",
          "z-index:2147483647",
          "max-width:620px",
          "padding:14px 18px",
          "border:1px solid rgba(96,165,250,.45)",
          "border-radius:12px",
          "background:rgba(10,14,23,.94)",
          "box-shadow:0 14px 44px rgba(0,0,0,.45)",
          "color:#f3f4f6",
          "font-family:Inter,ui-sans-serif,system-ui,sans-serif",
          "pointer-events:none",
        ].join(";");
        card.innerHTML =
          `<div style="font-size:18px;font-weight:700;color:#60a5fa">${heading}</div>` +
          `<div style="margin-top:4px;font-size:13px;line-height:1.45;color:#cbd5e1">${copy}</div>`;
        document.body.appendChild(card);
      },
      { heading: title, copy: subtitle },
    );
    await page.waitForTimeout(holdMs);
    await page.evaluate(() =>
      document.querySelector("[data-morphia-demo-card]")?.remove(),
    );
  }

  test("record the verified MVP walkthrough", async ({ page }) => {
    await page.goto("/sign-in");
    await settle(page, 900);
    await chapter(
      page,
      "MORPHIA",
      "Human-in-the-loop orchestration for authorized security research",
      2_600,
    );

    await page.locator("#email").pressSequentially(EMAIL, { delay: 18 });
    await page.locator("#password").pressSequentially(PASSWORD, { delay: 18 });
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await settle(page);
    await chapter(
      page,
      "Live dashboard",
      "Projects, active runs, pending approvals, verified findings, and recent audit events",
    );

    await page.goto("/projects");
    await settle(page);
    await chapter(
      page,
      "Authorized workspace",
      "Every run begins inside an owned project",
    );

    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await expect(
      page.getByRole("heading", { name: "Morphia Demo Research" }),
    ).toBeVisible();
    await settle(page, 900);
    await page
      .getByRole("button", { name: "Engagements", exact: true })
      .click();
    await settle(page, 700);
    await chapter(
      page,
      "Authorization before execution",
      "The engagement records the authorization basis before any target can be evaluated",
    );

    await page.getByRole("button", { name: "Scope", exact: true }).click();
    await settle(page, 800);
    await chapter(
      page,
      "Default-deny scope",
      "Include and exclude rules are enforced by the API and independently by the worker",
      2_700,
    );

    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await settle(page, 700);
    await chapter(
      page,
      "Auditable run state",
      "Plans pause at a human approval gate",
    );

    await page
      .getByRole("link", { name: "Baseline HTTP Security Review" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Baseline HTTP Security Review" }),
    ).toBeVisible();
    await settle(page, 1_000);
    await chapter(
      page,
      "Execution with provenance",
      "The completed step, deterministic provider result, and worker-attributed timeline stay together",
      3_000,
    );

    await page.goto("/evidence");
    await settle(page, 900);
    await chapter(
      page,
      "Evidence integrity",
      "Every artifact carries capture provenance and a SHA-256 digest",
    );

    await page.goto("/findings");
    await settle(page, 900);
    await chapter(
      page,
      "Verified findings",
      "A finding cannot be verified without linked evidence",
    );

    await page.goto("/reports");
    await settle(page, 900);
    await chapter(
      page,
      "Disclosure-ready reports",
      "Verified findings export as Markdown, HTML, or JSON",
    );

    await page.goto("/audit");
    await settle(page, 1_000);
    await chapter(
      page,
      "Append-only audit trail",
      "Authentication, scope, approval, execution, evidence, findings, and reports remain attributable",
      3_000,
    );

    await page.goto("/dashboard");
    await settle(page, 600);
    await chapter(
      page,
      "MORPHIA v0.1.0 MVP",
      "Verified end to end against PostgreSQL, Redis, the worker, and a synthetic local target",
      3_200,
    );
  });
});
