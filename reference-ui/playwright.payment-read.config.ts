import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";
export default defineConfig({ ...release,
  testMatch: ["live-manual-payment.spec.ts", "live-manual-payment-policy.spec.ts"],
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: "test-results/payment-read/report.json" }]],
  outputDir: "test-results/payment-read/artifacts",
});
