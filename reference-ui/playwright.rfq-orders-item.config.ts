import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
export default defineConfig({ ...baseline,
  testMatch: ["live-sourcing.spec.ts", "live-rfq-governed.spec.ts", "live-order.spec.ts", "live-order-execution.spec.ts", "live-order-sources.spec.ts", "live-order-approvals.spec.ts", "live-item.spec.ts", "live-item-write-safety.spec.ts", "catalog-price-edit.spec.ts"],
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: process.env.LAYOUT_REPORT || "test-results/rfq-orders-item/report.json" }]],
  outputDir: process.env.LAYOUT_ARTIFACTS || "test-results/rfq-orders-item/artifacts",
  webServer: { command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/vendors", reuseExistingServer: false, timeout: 30000 },
});
