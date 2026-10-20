import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";

/** Uses the already verified staged assets and an operator-started disposable API. */
export default defineConfig({
  ...release,
  testDir: "./tests/backend-browser",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
});
