import { defineConfig, devices } from "@playwright/test";

// Separate preview contract: the regular e2e config intentionally runs live mode.
export default defineConfig({
  testDir: "./tests/nonlive",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3012", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "./node_modules/.bin/vite --host 127.0.0.1 --port 3012 --strictPort",
    env: { VITE_PROCUREMENT_LIVE_MODE: "0" },
    url: "http://127.0.0.1:3012/procurement/workspace/purchase-receives/returns",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
