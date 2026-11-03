import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { nativeInput } from "./tests/normal-cookie/m7b1/input";
const mode = process.env.M7B1_NATIVE_MODE;
if (mode !== "fresh" && mode !== "retained") throw new Error("A reviewed M7B1 phase is required");
const input = nativeInput(mode);
export default defineConfig({ testDir: "./tests/normal-cookie/m7b1", testMatch: mode === "fresh" ? "fresh.spec.ts" : "retained.spec.ts",
  workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 300000, expect: { timeout: 20000 }, reporter: "line",
  outputDir: path.join(path.dirname(input.output), `m7b1-${mode}-browser-artifacts`),
  use: { baseURL: input.origin, ignoreHTTPSErrors: true, trace: "off", screenshot: "off", video: "off", actionTimeout: 20000, timezoneId: "UTC" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
