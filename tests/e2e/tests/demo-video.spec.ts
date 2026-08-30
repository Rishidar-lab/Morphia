import { test, expect, type Page } from "@playwright/test";

/**
 * MORPHIA v0.2 — Operations Intelligence demo recording.
 *
 * Records a deterministic 60–90s walkthrough of the seeded live application
 * at 1920×1080, H.264 MP4.
 *
 * Narrative:
 *  1. Operations Command Center (thesis)
 *  2. Authorized target → scope PASS → plan → human approval → approval → worker PASS → evidence
 *  3. Blocked: production.example.com → POLICY DENIAL
 *  4. Evidence provenance → finding
 *  5. Report + audit → end frame
 *
 * Uses the seeded "Morphia Demo Research" workspace (completed, awaiting, blocked runs).
 */

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@morphia.example.com";

test.use({
  viewport: { width: 1920, height: 1080 },
  video: { mode: "on", size: { width: 1920, height: 1080 } },
});

test.describe("portfolio demo recording", () => {
  test.skip(!PASSWORD, "set SEED_ADMIN_PASSWORD to record the seeded demo");

  async function settle(page: Page, holdMs = 1_200): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(holdMs);
  }

  async function chapter(page: Page, title: string, subtitle: string, holdMs = 2_000): Promise<void> {
    await page.evaluate(
      ({ heading, copy }) => {
        document.querySelector("[data-morphia-demo-card]")?.remove();
        const card = document.createElement("div");
        card.dataset.morphiaDemoCard = "true";
        card.style.cssText = [
          "position:fixed",
          "left:36px",
          "bottom:32px",
          "z-index:2147483647",
          "max-width:680px",
          "padding:16px 20px",
          "border:1px solid rgba(96,165,250,.45)",
          "border-radius:12px",
          "background:rgba(7,10,20,.96)",
          "box-shadow:0 14px 44px rgba(0,0,0,.55)",
          "color:#f3f4f6",
          "font-family:Inter,ui-sans-serif,system-ui,sans-serif",
          "pointer-events:none",
        ].join(";");
        card.innerHTML =
          `<div style="font-size:19px;font-weight:700;letter-spacing:.02em;color:#60a5fa">${heading}</div>` +
          `<div style="margin-top:5px;font-size:13.5px;line-height:1.5;color:#cbd5e1">${copy}</div>`;
        document.body.appendChild(card);
      },
      { heading: title, copy: subtitle },
    );
    await page.waitForTimeout(holdMs);
    await page.evaluate(() => document.querySelector("[data-morphia-demo-card]")?.remove());
  }

  test("record the verified v0.2 walkthrough", async ({ page }) => {
    // Chapter 1 — Thesis
    await page.goto("/sign-in");
    await settle(page, 800);
    await chapter(page, "MORPHIA", "Human-governed orchestration for authorized security research", 2_400);
    await chapter(page, "Thesis", "Scope before execution · Evidence before conclusions · Humans before consequential actions", 2_200);

    await page.locator("#email").pressSequentially(EMAIL, { delay: 14 });
    await page.locator("#password").pressSequentially(PASSWORD, { delay: 14 });
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await settle(page, 1_200);
    await chapter(page, "Operations Command Center", "Scope → Plan → Human Approval → Execution → Evidence → Finding → Report → Audit", 2_800);

    // Chapter 2 — Authorized run
    await page.getByTestId("operations-command-center").waitFor();
    await settle(page, 800);
    await chapter(page, "Authorized scope", "demo-target is inside the engagement · production.example.com is explicitly excluded", 2_400);

    // Open the awaiting-approval run to show human gate
    await page.goto("/projects");
    await settle(page, 800);
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await settle(page, 800);
    await page.getByRole("link", { name: "Header Hardening Review — Awaiting Approval" }).click();
    await expect(page.getByTestId("approval-gate")).toBeVisible();
    await settle(page, 1_000);
    await chapter(page, "Human approval gate", "Execution paused — a human must authorize before the worker can proceed", 2_800);
    await chapter(page, "Worker revalidation", "The worker independently revalidates scope before execution · approval does not bypass policy", 2_400);

    // Show completed run's execution graph
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await page.getByRole("link", { name: "Baseline HTTP Security Review" }).click();
    await expect(page.getByTestId("execution-graph")).toBeVisible();
    await settle(page, 1_000);
    await chapter(page, "Evidence captured", "Artifact with SHA-256 · worker-attributed · audit recorded", 2_400);

    // Chapter 3 — Policy denial (strongest shot)
    await page.goto("/projects");
    await page.getByRole("link", { name: "Morphia Demo Research" }).click();
    await page.getByRole("button", { name: "Runs", exact: true }).click();
    await page.getByRole("link", { name: "Out-of-Scope Probe — Blocked by Policy" }).click();
    await expect(page.getByText("BLOCKED").first()).toBeVisible();
    await settle(page, 1_000);
    await chapter(page, "EXECUTION BLOCKED", "Policy decision: DENY · Explicit exclusion matched", 2_600);
    await chapter(page, "Dual enforcement", "API scope check: DENY · Worker execution: PREVENTED · Reason recorded · Audit event recorded", 3_000);

    // Also show the operations canvas blocked showcase
    await page.goto("/operations");
    await expect(page.getByTestId("blocked-execution")).toBeVisible();
    await settle(page, 800);
    await chapter(page, "Authorization boundary", "Allowed and denied are visible before any execution is attempted", 2_200);

    // Chapter 4 — Evidence to finding
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "EVIDENCE" })).toBeVisible();
    await settle(page, 1_000);
    await chapter(page, "Evidence provenance", "Run → Step → Artifact → SHA-256 → Verification → Finding → Report", 2_600);

    await page.goto("/findings");
    await expect(page.getByRole("heading", { name: "FINDINGS" })).toBeVisible();
    await settle(page, 800);
    await chapter(page, "Analyst workspace", "Finding linked to hash-verified evidence · verification required", 2_400);

    // Chapter 5 — Report + Audit
    await page.goto("/reports");
    await settle(page, 800);
    await chapter(page, "Disclosure report", "Verified finding → disclosure-ready report · Markdown / HTML / JSON", 2_200);

    await page.goto("/audit");
    await expect(page.getByTestId("audit-stream")).toBeVisible();
    await settle(page, 1_000);
    await chapter(page, "Governance", "Every decision is attributable · append-only audit trail", 2_600);

    // End frame
    await page.goto("/operations");
    await settle(page, 800);
    await chapter(
      page,
      "MORPHIA v0.2 — Operations Intelligence",
      "Authorization-aware orchestration · Nothing executes merely because an agent requested it",
      3_200,
    );
  });
});
