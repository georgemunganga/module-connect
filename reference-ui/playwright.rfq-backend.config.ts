import { defineConfig } from "@playwright/test";
import rfq from "./playwright.rfq.config";

/** Actual private API only, using this worktree's dedicated reviewed RFQ assets. */
export default defineConfig({
  ...rfq,
  testDir: "./tests/backend-browser",
  testMatch: "rfq.spec.ts",
  outputDir: ".rfq-backend-results",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { ...rfq.use, baseURL: "http://127.0.0.1:3046" },
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3046 --strictPort --outDir .rfq-verification-dist",
    url: "http://127.0.0.1:3046/procurement/workspace/rfqs",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
