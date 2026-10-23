import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "tests/e2e/**", "tests/backend-browser/**", "tests/actual/**", "tests/normal-cookie/**", "scripts/crud-browser-actors.test.mjs"] },
});
