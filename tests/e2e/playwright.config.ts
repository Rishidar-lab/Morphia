import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs against a LIVE MORPHIA stack (docker compose up), not a
 * standalone dev server — the journey needs the API, Postgres, Redis, the
 * worker, and the demo target all running together.
 *
 *   ./scripts/demo.sh          # bring the stack up + seed
 *   cd tests/e2e && npm test   # run this suite
 *
 * Override the base URL with MORPHIA_WEB_URL if the web app is elsewhere.
 */
const WEB_URL = process.env.MORPHIA_WEB_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
