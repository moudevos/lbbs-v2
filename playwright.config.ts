import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const visualMode = process.env.QA_VISUAL === "true";
const configuredSlowMo = Number(process.env.QA_SLOW_MO ?? "800");
const slowMo = Number.isFinite(configuredSlowMo) && configuredSlowMo >= 0
  ? configuredSlowMo
  : 800;

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  outputDir: "test-results/qa-sprint-9/artifacts",
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/qa-sprint-9/e2e-results.json" }], ["./tests/e2e/qa-run-reporter.ts"]],
  use: {
    baseURL,
    headless: !visualMode,
    launchOptions: visualMode ? { slowMo } : undefined,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: visualMode ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "node scripts/qa-server.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
