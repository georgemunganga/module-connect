import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
export default defineConfig({ ...baseline, testMatch: ["live-request.spec.ts", "request-layout.spec.ts", "live-order.spec.ts", "live-sourcing.spec.ts"],
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: process.env.REQUESTS_REPORT || "test-results/requests/report.json" }]],
  outputDir: process.env.REQUESTS_ARTIFACTS || "test-results/requests/artifacts",
  webServer: { command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/requests", reuseExistingServer: false, timeout: 30000 },
});
