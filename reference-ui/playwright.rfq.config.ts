import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";

/** Dedicated RFQ candidate assets; preserve invoice/receiving bundles and evidence. */
export default defineConfig({
  ...release,
  testMatch: ["live-rfq-governed.spec.ts", "live-sourcing.spec.ts"],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  maxFailures: 1,
  outputDir: ".rfq-test-results",
  use: { ...release.use, baseURL: "http://127.0.0.1:3043" },
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3043 --strictPort --outDir .rfq-verification-dist",
    url: "http://127.0.0.1:3043/procurement/workspace/rfqs",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
