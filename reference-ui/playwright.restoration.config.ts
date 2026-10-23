import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";

/** Focused imported-layout regression checks; HTTP fixtures are mocked, not persistence proof. */
export default defineConfig({
  ...baseline,
  testMatch: "live-invoice.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["line"],
    ["json", { outputFile: process.env.RESTORATION_REPORT || "test-results/restoration/report.json" }],
  ],
  outputDir: process.env.RESTORATION_ARTIFACTS || "test-results/restoration/artifacts",
  webServer: process.env.RESTORATION_STAGED === "1" ? {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/bills",
    reuseExistingServer: false,
    timeout: 30_000,
  } : { ...baseline.webServer, reuseExistingServer: false },
});
