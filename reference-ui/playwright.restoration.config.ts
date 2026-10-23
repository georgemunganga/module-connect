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
  webServer: { ...baseline.webServer, reuseExistingServer: false },
});
