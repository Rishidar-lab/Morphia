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
 * v0.2 adds operations-intelligence coverage: Operations Canvas, execution
 * graph, authorization boundary, approval gate, blocked execution, evidence
 * provenance.
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
  // Registration navigates to /operations; wait for auth to settle then verify shell
  await expect(page).not.toHaveURL(/\/sign-in$/, { timeout: 15_000 });
  await page.goto("/operations");
  await expect(page.getByTestId("operations-command-center")).toBeVisible({ timeout: 15_000 });
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
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/projects") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Create Project" }).click(),
  ]);
  if (!resp.ok()) throw new Error(`Create project failed: ${resp.status()} ${await resp.text()}`);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 15_000 });
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.goto("/projects");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
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
  await expect(page.getByText(programName).first()).toBeVisible({ timeout: 15_000 });
}

async function addScopeRule(page: Page, pattern: string): Promise<void> {
  await tab(page, "Scope");
  await page.getByRole("button", { name: "Add Scope Rule" }).click();
  await page.getByPlaceholder("*.example.com").fill(pattern);
  await page.getByRole("button", { name: "Add Rule" }).click();
  // Scope rule is rendered with data-testid="scope-rule"; scope to that to avoid duplicate demo-target in evaluator
  await expect(page.getByTestId("scope-rule").filter({ hasText: pattern })).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByRole("link", { name: opts.title, exact: true })).toBeVisible({ timeout: 15_000 });
}

async function driveRunToApproval(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByTestId("execution-graph")).toBeVisible();
  const startBtn = page.getByRole("button", { name: "Start planning" });
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  const [r1] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/runs/") && r.url().includes("/transition")),
    startBtn.click(),
  ]);
  if (!r1.ok()) throw new Error(`Start planning failed: ${r1.status()} ${await r1.text()}`);
  await expect(page.getByRole("button", { name: "Submit plan for approval" })).toBeVisible({ timeout: 20_000 });
  const submitBtn = page.getByRole("button", { name: "Submit plan for approval" });
  const [r2] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/runs/") && r.url().includes("/transition")),
    submitBtn.click(),
  ]);
  if (!r2.ok()) throw new Error(`Submit plan failed: ${r2.status()} ${await r2.text()}`);
  await expect(page.getByTestId("approval-gate")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("EXECUTION PAUSED — HUMAN AUTHORIZATION REQUIRED")).toBeVisible();
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
  await page
    .getByPlaceholder(/Why this plan is safe/)
    .fill("E2E approval: synthetic in-scope target, mock provider, reviewed plan.");
  await page.getByRole("button", { name: /Approve — authorize execution/ }).click();

  await expect(page.getByText("RUNNING → COMPLETED")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("run.step_completed")).toBeVisible();
  await expect(page.getByText(/mock-provider deterministic response/i)).toBeVisible();
  await expect(page.getByTestId("execution-graph")).toBeVisible();
});

test("scope-denied path: out-of-scope target is refused", async ({ page }) => {
  await registerAndSignIn(page);

  const project = `Denied ${Date.now()}`;
  await createProject(page, project);
  await openProject(page, project);
  await addEngagement(page, "Local Validation");
  await addScopeRule(page, "demo-target");

  const runTitle = `Denied run ${Date.now()}`;
  await createRun(page, {
    title: runTitle,
    engagement: "Local Validation",
    target: "production.example.com",
  });

  await driveRunToApproval(page, runTitle);
  await page
    .getByPlaceholder(/Why this plan is safe/)
    .fill("E2E approval: expecting scope refusal for out-of-scope target.");
  await page.getByRole("button", { name: /Approve — authorize execution/ }).click();

  await expect(page.getByText("run.scope_denied")).toBeVisible({ timeout: 45_000 });
  await expect(
    page.getByText(/does not match any allowed scope rule|explicitly excluded/i).first(),
  ).toBeVisible();
  await expect(page.getByTestId("execution-graph").getByText("BLOCKED").first()).toBeVisible();
  await expect(page.getByText("EXECUTION PREVENTED").first()).toBeVisible();
});

test("dashboard and audit log reflect activity", async ({ page }) => {
  await registerAndSignIn(page);
  const project = `Dash ${Date.now()}`;
  await createProject(page, project);

  await page.goto("/dashboard");
  await expect(page.getByTestId("current-operation")).toBeVisible();
  await expect(page.getByText("SCOPE STATE", { exact: true })).toBeVisible();
  // Dashboard shows current operation and scope state even for new projects; project name itself is on /projects
  await expect(page.getByText("LATEST EVIDENCE")).toBeVisible();

  await page.goto("/audit");
  await expect(page.getByTestId("audit-stream")).toBeVisible();
  await expect(page.locator("tbody").getByText("project.create").first()).toBeVisible();
});

test("operations canvas renders with execution graph and authorization boundary", async ({ page }) => {
  await registerAndSignIn(page);
  const project = `Ops ${Date.now()}`;
  await createProject(page, project);
  await openProject(page, project);
  await addEngagement(page, "Ops Validation");
  await addScopeRule(page, "demo-target");

  const runTitle = `Ops run ${Date.now()}`;
  await createRun(page, { title: runTitle, engagement: "Ops Validation", target: "demo-target" });
  await driveRunToApproval(page, runTitle);

  await page.goto("/operations");
  await expect(page.getByTestId("operations-command-center")).toBeVisible();
  await expect(page.getByTestId("authorization-boundary")).toBeVisible();
  await expect(page.getByTestId("execution-graph")).toBeVisible();
  await expect(page.getByTestId("blocked-execution")).toBeVisible();
  await expect(page.getByTestId("approval-gate")).toBeVisible();
  await expect(page.getByPlaceholder("demo-target or production.example.com")).toBeVisible();
});

test("evidence provenance and findings workspace accessible", async ({ page }) => {
  await registerAndSignIn(page);
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "EVIDENCE" })).toBeVisible();
  await expect(page.getByText(/Hash-verified artifacts/)).toBeVisible();
  // Brand-new user has no evidence — empty state is correct; seeded user would show provenance
  await expect(page.getByText(/No evidence artifacts yet|NO EVIDENCE YET/)).toBeVisible();

  await page.goto("/findings");
  await expect(page.getByRole("heading", { name: "FINDINGS" })).toBeVisible();
  await expect(page.getByText("Analyst workspace")).toBeVisible();
});

test("unauthenticated access redirects to sign-in; 404 does not", async ({ page }) => {
  await page.context().clearCookies();
  for (const route of ["/dashboard", "/projects", "/runs", "/settings", "/operations"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
  await page.goto("/no-such-page-xyz");
  await expect(page.getByText("404")).toBeVisible();
});
