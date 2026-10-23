import { defineConfig, devices } from '@playwright/test';

const enabled = !!process.env.PAYMENT_BROWSER_FIXTURE && !!process.env.PAYMENT_BROWSER_SOCKET;
export default defineConfig({
  testDir: './tests/actual', testMatch: 'actual-manual-payments.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, timeout: 180_000,
  expect: { timeout: 30_000 }, reporter: 'list',
  use: { baseURL: 'https://127.0.0.1:3031', ignoreHTTPSErrors: true,
    trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 30_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: enabled ? { command: 'node scripts/payment-browser-proxy.mjs',
    url: 'https://127.0.0.1:3031/__payment_proxy_health', ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 30_000 } : undefined,
});
