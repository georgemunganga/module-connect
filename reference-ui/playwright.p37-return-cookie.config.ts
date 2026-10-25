import { defineConfig, devices } from '@playwright/test';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG)
  throw new Error('Debug logging forbidden for cookie proof');
const privateFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P37 input missing');
  return value;
};
const privateDirectory = '/p25-evidence';
const directory = lstatSync(privateDirectory);
if (!directory.isDirectory() || directory.isSymbolicLink() || realpathSync(privateDirectory) !== privateDirectory
  || (directory.mode & 0o777) !== 0o700) throw new Error('Exact private P37 evidence mount required');
const fresh = (value: string) => {
  try { lstatSync(value); return false; }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return true;
    throw error;
  }
};
const fixturePath = privateFile('P37_RETURN_COOKIE_FIXTURE');
if (fixturePath !== `${privateDirectory}/p37-return-local-cookie-fixture.private.json`)
  throw new Error('Exact P37 fixture path required');
const receipt = JSON.parse(readFileSync(privateFile('P37_RETURN_COOKIE_PROXY_RECEIPT'), 'utf8'));
const bytes = readFileSync(fixturePath);
const result = process.env.P37_RETURN_COOKIE_BROWSER_RESULT;
if (!result || !path.isAbsolute(result) || path.dirname(result) !== privateDirectory || !fresh(result)
  || receipt.fixtureSha256 !== createHash('sha256').update(bytes).digest('hex'))
  throw new Error('Exact new P37 fixture and protected result required');
const origin = new URL(receipt.origin);
if (receipt.schemaVersion !== 4 || receipt.transport !== 'normal-local-cookie-https-v1'
  || origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1'
  || !origin.port || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash
  || receipt.injectsIdentityHeaders !== false || receipt.mocksBusinessResponses !== false)
  throw new Error('Private normal-cookie HTTPS transport required');
export default defineConfig({
  testDir: './tests/normal-cookie', testMatch: 'p37-return-cookie.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, maxFailures: 1, timeout: 360_000,
  expect: { timeout: 20_000 }, reporter: 'list', outputDir: path.join(path.dirname(result), 'pw-artifacts'),
  use: { baseURL: origin.origin, ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 25_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
