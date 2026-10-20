import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";

/** Invoice candidate assets only. Never serves or overwrites receiving's staged bundle. */
export default defineConfig({
  ...release,
  testMatch: "live-invoice.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: ".invoice-test-results",
  use: { ...release.use, baseURL: "http://127.0.0.1:3041" },
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3041 --strictPort --outDir .invoice-verification-dist",
    url: "http://127.0.0.1:3041/procurement/workspace/bills",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
