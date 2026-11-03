import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { nativePlanInput } from "./tests/normal-cookie/plan-review/input";
const input = nativePlanInput();
export default defineConfig({ testDir: "./tests/normal-cookie/plan-review", testMatch: "positive.spec.ts",
  workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 240000, expect: { timeout: 20000 }, reporter: "line",
  outputDir: path.join(path.dirname(input.output), "plan-native-browser-artifacts"),
  use: { baseURL: input.origin, ignoreHTTPSErrors: true, serviceWorkers: "block", trace: "off", screenshot: "off", video: "off", actionTimeout: 20000, timezoneId: "UTC" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
