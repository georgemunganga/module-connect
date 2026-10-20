import { defineConfig } from "@playwright/test";
import development from "./playwright.config";

/** Verify the staged release assets before they replace the public dist directory. */
export default defineConfig({
  ...development,
  webServer: {
    command: "./node_modules/.bin/vite preview --host 127.0.0.1 --port 3011 --strictPort --outDir .verification-dist",
    url: "http://127.0.0.1:3011/procurement/workspace/vendors",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
