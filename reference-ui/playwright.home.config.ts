import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
export default defineConfig({
  ...baseline,
  testMatch: ["home-layout.spec.ts", "live-overview-catalog.spec.ts"],
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: process.env.HOME_REPORT || "test-results/home/report.json" }]],
  outputDir: process.env.HOME_ARTIFACTS || "test-results/home/artifacts",
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/", reuseExistingServer: false, timeout: 30_000,
  },
});
