import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";
export default defineConfig({ ...release, testMatch: ["live-rfq-governed.spec.ts", "live-quotation-drafts.spec.ts", "live-sourcing.spec.ts"], workers: 1, fullyParallel: false, retries: 0, forbidOnly: true, reporter: [["line"], ["json", { outputFile: "test-results/quotation/report.json" }]], outputDir: "test-results/quotation/artifacts" });
