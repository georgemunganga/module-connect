import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { continuationInput } from "./tests/normal-cookie/m7b1/continuation-input";
const input = continuationInput();
export default defineConfig({ testDir: "./tests/normal-cookie/m7b1", testMatch: "continuation.spec.ts", workers: 1, fullyParallel: false,
  retries: 0, maxFailures: 1, timeout: 300000, expect: { timeout: 20000 }, reporter: "line",
  outputDir: path.join(path.dirname(input.output), "m7b1-continuation-browser-artifacts"),
  use: { baseURL: input.origin, ignoreHTTPSErrors: true, trace: "off", screenshot: "off", video: "off", actionTimeout: 20000, timezoneId: "UTC" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
