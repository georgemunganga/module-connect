import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";

/** Budget candidate only; preserve RFQ/invoice/receiving staged assets and evidence. */
export default defineConfig({
  ...release,
  testMatch: "live-budget.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  maxFailures: 1,
  outputDir: ".budget-test-results",
  use: { ...release.use, baseURL: "http://127.0.0.1:3045" },
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3045 --strictPort --outDir .budget-verification-dist",
    url: "http://127.0.0.1:3045/procurement/workspace/budgets",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
