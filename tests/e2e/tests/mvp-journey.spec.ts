import { test, expect, type Page } from "@playwright/test";

/**
 * The MORPHIA MVP journey, end to end, through the real browser UI against a
 * live stack:
 *
 *   register → sign in → project → authorized engagement → allowed scope →
 *   run (with plan) → review plan → approve → worker executes (mock provider,
 *   safe synthetic target) → step result captured → audit trail →
 *   + the scope-DENIED path (out-of-scope target is refused).
 *
 * Nothing here touches a real external system: the only target is the local
 * synthetic `demo-target` compose service.
 */

const PASSWORD = "Journey-Pass-9x7q!";

function uniqueEmail(): string {
  return `e2e.${Date.now()}.${Math.floor(Math.random() * 1e5)}@morphia.example.com`;
}

async function registerAndSignIn(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /need an account\? register/i }).click();
  await page.fill("#display_name", "E2E Journey");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Land in the authenticated shell (sidebar + dashboard heading), not just
  // a URL change — the Layout re-checks the session on mount.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /New Project|Create your first project/ })
    .first()
    .click();
  await page.fill("#proj-name", name);
  await page.fill("#proj-desc", "Created by the Playwright MVP journey.");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.goto("/projects");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function tab(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function addEngagement(page: Page, programName: string): Promise<void> {
  await tab(page, "Engagements");
  await page.getByRole("button", { name: "New Engagement" }).click();
  await page.getByPlaceholder("Acme Corp Bug Bounty").fill(programName);
  await page
    .getByPlaceholder(/Signed rules-of-engagement/i)
    .fill("Self-authorized synthetic local target.");
  await page.getByRole("button", { name: "Create Engagement" }).click();
  await expect(page.getByText(programName).first()).toBeVisible();
}

async function addScopeRule(page: Page, pattern: string): Promise<void> {
  await tab(page, "Scope");
  await page.getByRole("button", { name: "Add Scope Rule" }).click();
  await page.getByPlaceholder("*.example.com").fill(pattern);
  await page.getByRole("button", { name: "Add Rule" }).click();
  await expect(page.getByText(pattern, { exact: true })).toBeVisible();
}

async function createRun(
  page: Page,
  opts: { title: string; engagement: string; target: string },
): Promise<void> {
  await tab(page, "Runs");
  await page.getByRole("button", { name: "New Run" }).click();
  await page.getByPlaceholder("Baseline HTTP Security Review").fill(opts.title);
  await page
    .getByRole("combobox")
    .filter({ hasText: /Select an engagement/ })
    .selectOption({ label: opts.engagement });
  await page.getByPlaceholder("demo-target").fill(opts.target);
  await page.getByRole("button", { name: "Create Run" }).click();
  await expect(page.getByRole("link", { name: opts.title })).toBeVisible();
}

async function driveRunToApproval(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page.getByRole("button", { name: "Submit plan for approval" })).toBeVisible();
  await page.getByRole("button", { name: "Submit plan for approval" }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
}

// ---------------------------------------------------------------------------

test("full journey: allowed run completes end to end", async ({ page }) => {
  await registerAndSignIn(page);

  const project = `Journey ${Date.now()}`;
  await createProject(page, project);
  await openProject(page, project);
  await addEngagement(page, "Local Validation");
  await addScopeRule(page, "demo-target");

  const runTitle = `Allowed run ${Date.now()}`;
  await createRun(page, {
    title: runTitle,
    engagement: "Local Validation",
    target: "demo-target",
  });

  await driveRunToApproval(page, runTitle);
  await page.getByRole("button", { name: "Approve" }).click();

  // Worker (mock provider) picks it up and drives it to COMPLETED — the
  // timeline records the worker-attributed transition and the captured step.
  await expect(page.getByText("RUNNING → COMPLETED")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("run.step_completed")).toBeVisible();
  await expect(page.getByText(/mock-provider deterministic response/i)).toBeVisible();
  await expect(page.getByText("worker:", { exact: false }).first()).toBeVisible();
});

test("scope-denied path: out-of-scope target is refused", async ({ page }) => {
  await registerAndSignIn(page);

  const project = `Denied ${Date.now()}`;
  await createProject(page, project);
  await openProject(page, project);
  await addEngagement(page, "Local Validation");
  await addScopeRule(page, "demo-target"); // production.example.com is NOT added

  const runTitle = `Denied run ${Date.now()}`;
  await createRun(page, {
    title: runTitle,
    engagement: "Local Validation",
    target: "production.example.com",
  });

  await driveRunToApproval(page, runTitle);
  await page.getByRole("button", { name: "Approve" }).click();

  // The worker's independent scope re-check refuses it; the run ends FAILED
  // with the reason recorded on the timeline.
  await expect(page.getByText("run.scope_denied")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/does not match any allowed scope rule/i).first(),
  ).toBeVisible();
});

test("dashboard and audit log reflect activity", async ({ page }) => {
  await registerAndSignIn(page);
  const project = `Dash ${Date.now()}`;
  await createProject(page, project);

  await page.goto("/dashboard");
  // The "Projects" tile links to /projects and shows a live count (not the
  // loading "—").
  const projectsTile = page.locator("main a[href='/projects']").first();
  await expect(projectsTile).toContainText("Projects");
  await expect(projectsTile).toContainText(/[1-9]/, { timeout: 15_000 });

  await page.goto("/audit");
  await expect(page.locator("tbody").getByText("project.create").first()).toBeVisible();
  await expect(page.locator("tbody").getByText("auth.login").first()).toBeVisible();
});

test("unauthenticated access redirects to sign-in; 404 does not", async ({ page }) => {
  await page.context().clearCookies();
  for (const route of ["/dashboard", "/projects", "/runs", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
  await page.goto("/no-such-page-xyz");
  await expect(page.getByText("404")).toBeVisible();
});
