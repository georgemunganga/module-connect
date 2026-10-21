import { defineConfig } from "@playwright/test";
import budget from "./playwright.budget.config";

/** Actual API only; operator supplies a fresh private fixture and the retained exact Budget bundle. */
export default defineConfig({
  ...budget,
  testDir: "./tests/backend-browser",
  testMatch: "budget.spec.ts",
  outputDir: ".budget-backend-results",
  timeout: 180_000,
  expect: { timeout: 30_000 },
});
