import { defineConfig, devices } from "@playwright/test";
const enabled = !!process.env.CRUD_BROWSER_FIXTURE && !!process.env.CRUD_BROWSER_SOCKET;
export default defineConfig({
  testDir: "./tests/actual", testMatch: "actual-crud-api.spec.ts", workers: 1, fullyParallel: false,
  retries: 0, timeout: 120_000, expect: { timeout: 30_000 }, reporter: "list",
  use: { baseURL: "http://127.0.0.1:3027", trace: "on", screenshot: "only-on-failure", actionTimeout: 30_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: enabled ? { command: "node scripts/crud-browser-proxy.mjs", url: "http://127.0.0.1:3027/__crud_proxy_health", reuseExistingServer: false, timeout: 30_000 } : undefined,
});
