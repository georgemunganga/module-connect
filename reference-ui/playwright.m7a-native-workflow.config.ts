import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { nativeReadInput } from "./tests/normal-cookie/m7a-native-read-input";
const input = nativeReadInput("M7A_NATIVE_WORKFLOW_RESULT");
export default defineConfig({ testDir: "./tests/normal-cookie", testMatch: "m7a-native-quotation-workflow.spec.ts", workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 300_000,
  expect: { timeout: 20_000 }, reporter: "line", outputDir: path.join(path.dirname(input.output), "native-workflow-browser-artifacts"),
  use: { baseURL: input.origin, ignoreHTTPSErrors: true, trace: "off", screenshot: "off", video: "off", actionTimeout: 20_000, timezoneId: "UTC" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
