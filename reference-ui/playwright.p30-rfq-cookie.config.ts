import { defineConfig, devices } from '@playwright/test';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG)
  throw new Error('Debug logging forbidden for cookie proof');
const privateFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected input missing');
  return value;
};
const receipt = JSON.parse(readFileSync(privateFile('P30_RFQ_COOKIE_PROXY_RECEIPT'), 'utf8'));
const bytes = readFileSync(privateFile('P30_RFQ_COOKIE_FIXTURE'));
const result = process.env.P30_RFQ_COOKIE_BROWSER_RESULT;
if (!result || !path.isAbsolute(result) || (statSync(path.dirname(result)).mode & 0o777) !== 0o700
  || receipt.fixtureSha256 !== createHash('sha256').update(bytes).digest('hex'))
  throw new Error('Exact new P30 RFQ fixture and protected result required');
const origin = new URL(receipt.origin);
if (receipt.schemaVersion !== 3 || receipt.transport !== 'normal-local-cookie-https-v1'
  || origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1'
  || !origin.port || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash
  || receipt.injectsIdentityHeaders !== false || receipt.mocksBusinessResponses !== false)
  throw new Error('Private normal-cookie HTTPS transport required');
export default defineConfig({
  testDir: './tests/normal-cookie', testMatch: 'p30-rfq-cookie.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 720_000,
  expect: { timeout: 20_000 }, reporter: 'list', outputDir: path.join(path.dirname(result), 'pw-artifacts'),
  use: { baseURL: origin.origin, ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 25_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
