import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3011", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "./node_modules/.bin/vite --host 127.0.0.1 --port 3011 --strictPort",
    env: { VITE_PROCUREMENT_LIVE_MODE: "1" },
    url: "http://127.0.0.1:3011/procurement/workspace/vendors",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
