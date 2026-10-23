import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
export default defineConfig({ ...baseline,
  testMatch: ["catalog-directory-layout.spec.ts", "analytics-layout.spec.ts", "live-recurring-purchase.spec.ts", "live-vendor.spec.ts", "live-item.spec.ts", "live-overview-catalog.spec.ts", "home-layout.spec.ts", "request-layout.spec.ts"],
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: process.env.LAYOUT_REPORT || "test-results/catalog-analytics/report.json" }]],
  outputDir: process.env.LAYOUT_ARTIFACTS || "test-results/catalog-analytics/artifacts",
  webServer: { command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/vendors", reuseExistingServer: false, timeout: 30000 },
});
