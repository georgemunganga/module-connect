import { defineConfig, devices } from '@playwright/test';
import { readFileSync, lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG)
  throw new Error('Debug logging forbidden for cookie proof');
const receiptPath = process.env.P25_COOKIE_PROXY_RECEIPT;
const resultPath = process.env.P25_COOKIE_BROWSER_RESULT;
if (!receiptPath || !path.isAbsolute(receiptPath) || realpathSync(receiptPath) !== receiptPath
  || !lstatSync(receiptPath).isFile() || (lstatSync(receiptPath).mode & 0o777) !== 0o600
  || !resultPath || !path.isAbsolute(resultPath) || (statSync(path.dirname(resultPath)).mode & 0o777) !== 0o700)
  throw new Error('Protected actual proxy/result inputs required');
const proxy = JSON.parse(readFileSync(receiptPath, 'utf8'));
const origin = new URL(proxy.origin);
if (proxy.transport !== 'normal-local-cookie-https-v1' || origin.protocol !== 'https:'
  || origin.hostname !== '127.0.0.1' || !origin.port || origin.pathname !== '/'
  || origin.username || origin.password || origin.search || origin.hash
  || proxy.injectsIdentityHeaders !== false || proxy.mocksBusinessResponses !== false)
  throw new Error('Private normal-cookie HTTPS transport required');
export default defineConfig({
  testDir: './tests/normal-cookie', testMatch: 'p25-cookie-approval.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 180_000,
  expect: { timeout: 20_000 }, reporter: 'list',
  outputDir: path.join(path.dirname(resultPath), 'pw-artifacts'),
  use: { baseURL: origin.origin, ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 25_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
