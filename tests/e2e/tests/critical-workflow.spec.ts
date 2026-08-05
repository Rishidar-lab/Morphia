import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * Critical workflow end-to-end tests for MORPHIA.
 *
 * These tests exercise the React SPA (apps/web) against a live API
 * (apps/api) and are the acceptance gate for the orchestration UI described
 * in docs/architecture.md. Each `test.describe` block is independent: it
 * creates its own user via the registration flow (or signs in an existing
 * one) rather than relying on shared fixtures or execution order, so any
 * single test can be run in isolation with `npx playwright test -g "<name>"`.
 *
 * Conventions used throughout:
 * - Unique emails per test run via Date.now() + Math.random() to avoid
 *   colliding with the `409 email already registered` behavior documented
 *   in docs/api.md.
 * - Selectors prefer accessible roles/text over CSS classes so the tests
 *   stay stable across styling changes.
 * - No test depends on a prior test's browser state; Playwright's default
 *   per-test isolated browser context is relied upon for that.
 */

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@morphia.local`;
}

const TEST_PASSWORD = 'CorrectHorseBatteryStaple1!';

async function registerAndLogin(
  page: Page,
  opts: { email?: string; displayName?: string } = {}
): Promise<{ email: string; displayName: string }> {
  const email = opts.email ?? uniqueEmail('e2e');
  const displayName = opts.displayName ?? 'E2E Test User';

  await page.goto('/sign-in');

  // The sign-in page hosts both login and registration; toggle to the
  // registration form if it is not already showing a "display name" field.
  const registerToggle = page.getByRole('button', { name: /create an account|sign up|register/i });
  if (await registerToggle.isVisible().catch(() => false)) {
    await registerToggle.click();
  }

  await page.fill('input[name="display_name"], input[name="displayName"], #display_name', displayName).catch(async () => {
    // Fallback: some layouts label the field differently.
    await page.fill('input[placeholder*="name" i]', displayName);
  });
  await page.fill('input[name="email"], input[type="email"], #email', email);
  await page.fill('input[name="password"], input[type="password"], #password', TEST_PASSWORD);

  await page.click('button[type="submit"]');

  // Successful registration either logs the user in immediately or lands
  // them back on sign-in to log in explicitly — handle both.
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 15000 }).catch(async () => {
    // Explicit login step required.
    await page.fill('input[name="email"], input[type="email"], #email', email);
    await page.fill('input[name="password"], input[type="password"], #password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 15000 });
  });

  return { email, displayName };
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"], input[type="email"], #email', email);
  await page.fill('input[name="password"], input[type="password"], #password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 15000 });
}

// ---------------------------------------------------------------------------

test.describe('App shell loads', () => {
  test('app loads without fatal errors', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    const response = await page.goto('/');
    expect(response, 'root document should respond').not.toBeNull();
    expect(response!.status(), 'root document should not 5xx').toBeLessThan(500);

    await page.waitForLoadState('networkidle');
    expect(pageErrors, `unexpected uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`).toHaveLength(0);
  });

  test('sign in page renders', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------

test.describe('Authentication flow', () => {
  test('register creates an account and login authenticates it', async ({ page }) => {
    const email = uniqueEmail('auth-flow');

    await registerAndLogin(page, { email, displayName: 'Auth Flow User' });

    // Confirm we actually landed in an authenticated area, not just the
    // sign-in page failing to redirect.
    await expect(page).not.toHaveURL(/\/sign-in/);

    // A fresh, unauthenticated context should be able to log back in with
    // the same credentials — proves the account was actually persisted.
    await page.context().clearCookies();
    await login(page, email, TEST_PASSWORD);
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test('rejects invalid credentials with an error message', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="email"], input[type="email"], #email', uniqueEmail('nonexistent'));
    await page.fill('input[name="password"], input[type="password"], #password', 'not-the-right-password');
    await page.click('button[type="submit"]');

    // Should remain on sign-in and surface a generic error (no account
    // enumeration per docs/security.md).
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(/invalid email or password|invalid credentials|incorrect/i)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------

test.describe('Dashboard and navigation', () => {
  test('dashboard renders after login', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // The dashboard should show some authenticated shell chrome (nav/layout)
    // rather than bouncing back to sign-in.
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigation to all primary pages works', async ({ page }) => {
    await registerAndLogin(page);

    const primaryRoutes = [
      '/dashboard',
      '/projects',
      '/runs',
      '/agents',
      '/evidence',
      '/findings',
      '/reports',
      '/workflows',
      '/approvals',
      '/audit',
      '/settings',
    ];

    for (const route of primaryRoutes) {
      const response = await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(response, `navigating to ${route} should get a response`).not.toBeNull();
      expect(response!.status(), `${route} should not error`).toBeLessThan(500);
      await expect(page, `${route} should not redirect to sign-in while authenticated`).not.toHaveURL(/\/sign-in/);
    }
  });
});

// ---------------------------------------------------------------------------

test.describe('Project lifecycle', () => {
  test('create a project', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/projects');

    const projectName = `E2E Project ${Date.now()}`;

    await page.getByRole('button', { name: /new project|create project|\+ project/i }).click();
    await page.fill('input[name="name"], #name', projectName);
    const descriptionField = page.locator('textarea[name="description"], #description');
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill('Created by Playwright critical-workflow test.');
    }
    await page.getByRole('button', { name: /^create$|save|submit/i }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
  });

  test('project persists after browser refresh', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/projects');

    const projectName = `E2E Persist ${Date.now()}`;
    await page.getByRole('button', { name: /new project|create project|\+ project/i }).click();
    await page.fill('input[name="name"], #name', projectName);
    await page.getByRole('button', { name: /^create$|save|submit/i }).click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------

test.describe('Run lifecycle', () => {
  test('create a run within a project', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/projects');

    const projectName = `E2E Run Project ${Date.now()}`;
    await page.getByRole('button', { name: /new project|create project|\+ project/i }).click();
    await page.fill('input[name="name"], #name', projectName);
    await page.getByRole('button', { name: /^create$|save|submit/i }).click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });

    await page.getByText(projectName).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new run|create run|\+ run/i }).click();
    const runNameField = page.locator('input[name="name"], #name, input[name="title"]');
    if (await runNameField.isVisible().catch(() => false)) {
      await runNameField.fill(`E2E Run ${Date.now()}`);
    }
    await page.getByRole('button', { name: /^create$|save|submit|start/i }).click();

    // A newly created run should default to the DRAFT state per the run
    // state machine in docs/architecture.md §6.
    await expect(page.getByText(/draft/i)).toBeVisible({ timeout: 10000 });
  });

  test('run state controls appear correctly', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/projects');

    const projectName = `E2E State Project ${Date.now()}`;
    await page.getByRole('button', { name: /new project|create project|\+ project/i }).click();
    await page.fill('input[name="name"], #name', projectName);
    await page.getByRole('button', { name: /^create$|save|submit/i }).click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
    await page.getByText(projectName).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new run|create run|\+ run/i }).click();
    await page.getByRole('button', { name: /^create$|save|submit|start/i }).click();
    await expect(page.getByText(/draft/i)).toBeVisible({ timeout: 10000 });

    // A DRAFT run should expose a cancel affordance (CANCELLABLE_STATES
    // includes every non-terminal state) but must not expose controls that
    // only make sense in later states, such as "approve" (only valid during
    // AWAITING_PLAN_APPROVAL / AWAITING_ACTION_APPROVAL).
    const cancelControl = page.getByRole('button', { name: /cancel/i });
    await expect(cancelControl).toBeVisible({ timeout: 10000 });

    const approveControl = page.getByRole('button', { name: /^approve$/i });
    await expect(approveControl).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------

test.describe('Routing edge cases', () => {
  test('navigating to an unknown URL shows 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await expect(
      page.getByText(/404|not found|page.*doesn.?t exist/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('protected routes redirect to sign-in when not authenticated', async ({ page }) => {
    // Fresh context, no login performed.
    const protectedRoutes = ['/dashboard', '/projects', '/runs', '/settings'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page, `${route} should redirect unauthenticated users to sign-in`).toHaveURL(/\/sign-in/);
    }
  });
});

// ---------------------------------------------------------------------------

test.describe('Logout', () => {
  test('logout works and redirects to sign-in', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const logoutButton = page.getByRole('button', { name: /log out|logout|sign out/i });
    await logoutButton.click();

    await page.waitForURL(/\/sign-in/, { timeout: 10000 });

    // After logout, a previously-protected route must bounce back to
    // sign-in rather than serving cached authenticated content.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ---------------------------------------------------------------------------

test.describe('Responsive layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile viewport has no horizontal overflow', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(
      scrollWidth,
      `document.scrollWidth (${scrollWidth}) should not exceed clientWidth (${clientWidth}) — indicates horizontal overflow on mobile`
    ).toBeLessThanOrEqual(clientWidth + 1); // +1px tolerance for sub-pixel rounding
  });
});

// ---------------------------------------------------------------------------

test.describe('Console hygiene', () => {
  test('no unexpected console errors during core flows', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await registerAndLogin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // Filter out benign, expected noise (e.g., third-party analytics
    // blocked in test environments, favicon 404s) so the assertion stays
    // meaningful rather than permanently red.
    const meaningfulErrors = consoleErrors.filter(
      (text) => !/favicon|analytics|extension:\/\//i.test(text)
    );

    expect(
      meaningfulErrors,
      `unexpected console errors: ${meaningfulErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
