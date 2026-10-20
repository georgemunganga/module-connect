import { defineConfig } from "@playwright/test";
import invoice from "./playwright.invoice.config";

/** Transport-only actual API coverage; coordinator must start a fresh private fixture. */
export default defineConfig({
  ...invoice,
  testDir: "./tests/backend-browser",
  testMatch: "invoice-matching.spec.ts",
  outputDir: ".invoice-backend-results",
  timeout: 180_000,
  expect: { timeout: 30_000 },
});
