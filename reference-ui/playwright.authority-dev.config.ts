import { defineConfig } from "@playwright/test";
import development from "./playwright.config";

/** Real React development StrictMode effect replay; cannot reuse a release server.
 * Existing successful-save and interrupted-save cases verify both gated callbacks.
 * Run only when a browser resource slot has been explicitly allocated. */
export default defineConfig({
  ...development,
  testMatch: "live-authority-settings.spec.ts",
  grep: /approval limit draft uses|interrupted create/,
  workers: 1,
  fullyParallel: false,
  webServer: { ...development.webServer!, reuseExistingServer: false },
});
