import { defineConfig, devices } from "@playwright/test";

const defaultPort = process.env.QA_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;
const webServerPort = new URL(baseURL).port || defaultPort;

export default defineConfig({
  testDir: "./tests/e2e/phase-1a-1b",
  outputDir: "test-results/phase-1a-1b",
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/qa-server.mjs",
    url: `${baseURL}/api/health`,
    env: { QA_PORT: webServerPort },
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
