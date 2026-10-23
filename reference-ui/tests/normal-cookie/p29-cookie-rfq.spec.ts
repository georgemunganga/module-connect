import { expect, test, type APIResponse } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 2; controlPlaneOnly: true; browserAuthenticationRequired: string;
  apiUrl: string; database: string; tenantId: string; companyId: string; branchId: string;
  buyerPrincipalId: string; approvedRequestId: string; approvedRequestLineId: string; cancelledDraftEventId: string;
  syntheticCredentials: Credential[]; challenge: string; completionPath: string; expiresAt: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
const protectedFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P29 input missing');
  return value;
};
const fixtureBytes = readFileSync(protectedFile('P29_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected fixture');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P29_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P29_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 2 || proxy.schemaVersion !== 2 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.database !== process.env.P29_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || !output || !path.isAbsolute(output) || existsSync(output)
  || ![fixture.companyId, fixture.branchId, fixture.buyerPrincipalId, fixture.approvedRequestId,
    fixture.approvedRequestLineId, fixture.cancelledDraftEventId].every(guid)
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Actual unexpired P29 normal-cookie fixture required');
const account = fixture.syntheticCredentials.filter(value => value.principalId === fixture.buyerPrincipalId);
if (account.length !== 1 || !account[0].email || !account[0].password) throw new Error('Exact synthetic buyer missing');
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 2, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId, buyerPrincipalId: fixture.buyerPrincipalId,
  challenge: fixture.challenge,
  principalRfqDraftVerified: false, supplierDispatchVerified: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function api(action: () => Promise<APIResponse>): Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private API transport failed'); }
}
async function body(response: APIResponse): Promise<Record<string, any>> {
  try { return await response.json(); } catch { throw new Error('Private API returned invalid JSON'); }
}

// Real local login and normal session cookies only. No browser route mocks,
// private subject headers, demo transactions or seeded UI state are used.
test('workerless buyer creates, reloads and cancels an internal RFQ from approved demand', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'buyer-login', failed = false;
  const network: Array<{ path: string; method: string; status: number; elapsedMs: number }> = [];
  const requests = new Map<import('@playwright/test').Request, number>();
  const progress = (next: string) => { step = next; evidence.step = next; retain(); };
  let inspectedPage: import('@playwright/test').Page | undefined;
  const context = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  try {
    const login = await api(() => context.request.post('/api/hrm/auth/login', {
      data: { email: account[0].email, password: account[0].password }, failOnStatusCode: false }));
    expect(login.status()).toBe(200);
    const me = await api(() => context.request.get('/api/hrm/auth/me'));
    expect(me.status()).toBe(200); expect((await body(me)).user?.id).toBe(fixture.buyerPrincipalId);
    const scope = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
    expect(scope.status()).toBe(200);
    expect(await body(scope)).toMatchObject({ tenantId: fixture.tenantId, principalId: fixture.buyerPrincipalId,
      workerId: null, legalEntityId: fixture.companyId });
    const meta = await api(() => context.request.get('/api/procurement/v1/meta', { headers: selection }));
    expect(meta.status()).toBe(200); expect((await body(meta)).capabilities?.principalSourcingSourceDrafts).toBe(true);

    progress('approved-source-preview');
    // A buyer need not have generic request-read: use the dedicated scoped
    // sourcing picker and find the exact approved fixture line across pages.
    let candidate: Record<string, any> | undefined;
    for (let page = 1; page <= 10 && !candidate; page++) {
      const sources = await api(() => context.request.get(
        `/api/procurement/v1/sourcing/approved-principal-sources?page=${page}&pageSize=25`, { headers: selection }));
      expect(sources.status()).toBe(200);
      const result = await body(sources);
      candidate = result.items?.find((item: Record<string, unknown>) =>
        item.purchaseRequestId === fixture.approvedRequestId && item.purchaseRequestLineId === fixture.approvedRequestLineId);
      if (page * 25 >= result.candidateTotal) break;
    }
    expect(candidate?.canSelect).toBe(true);
    const requestNumber = candidate!.requestNumber as string;
    expect(typeof requestNumber === 'string' && requestNumber.length > 0).toBe(true);

    progress('create-principal-draft');
    const page = await context.newPage(); inspectedPage = page;
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.set(request, Date.now()); });
    page.on('requestfailed', request => { requests.delete(request); });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/') && network.length < 100) network.push({
        path: url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id'),
        method: response.request().method(), status: response.status(), elapsedMs: Date.now() - (requests.get(response.request()) ?? Date.now()),
      });
      requests.delete(response.request());
    });
    const reloadReady = async () => {
      const meta = page.waitForResponse(response => new URL(response.url()).pathname === '/api/procurement/v1/meta', { timeout: 90_000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect((await meta).status()).toBe(200);
    };
    // Candidate shell selection is checked by Core before each business call.
    await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
      { entityId: fixture.companyId, branch: fixture.branchId });
    await page.goto('/procurement/workspace/rfqs/new?source=principal-approved', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Use approved purchase requests', exact: true })).toBeVisible();
    await page.getByLabel('Find request or item').fill(requestNumber);
    const row = page.getByRole('row').filter({ hasText: requestNumber });
    await expect(row).toBeVisible(); await row.getByRole('button', { name: 'Add line' }).click();
    const title = `GW-P29-COOKIE-${randomUUID()}`;
    await page.getByLabel('What are you buying?').fill(title);
    const createdWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/from-approved-principal-sources')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create internal draft', exact: true }).click();
    const createdResponse = await createdWaiting; expect(createdResponse.status()).toBe(201);
    const createCommandKey = createdResponse.request().headers()['idempotency-key'];
    expect(guid(createCommandKey)).toBe(true);
    const created = await createdResponse.json() as Record<string, any>;
    expect(guid(created.eventId)).toBe(true); expect(created.status).toBe('Draft');
    expect(created.recordedHistoricalResult).toBe(true); expect(created.canPublish).toBe(false);
    evidence.eventId = created.eventId; evidence.createdVersion = created.version;
    evidence.createCommandKey = createCommandKey; retain();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

    progress('reload-draft-detail');
    await reloadReady(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Items (1)' }).click();
    await expect(page.getByRole('cell', { name: candidate!.description })).toBeVisible();
    await page.getByRole('tab', { name: 'Overview' }).click();
    progress('cancel-draft');
    await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('Private principal RFQ draft cancellation');
    const cancelledWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${created.eventId}/principal-source-cancel`)
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Cancel draft and release its quantities' }).click();
    const cancelledResponse = await cancelledWaiting; expect(cancelledResponse.status()).toBe(200);
    const cancelCommandKey = cancelledResponse.request().headers()['idempotency-key'];
    expect(guid(cancelCommandKey)).toBe(true); expect(cancelCommandKey).not.toBe(createCommandKey);
    const cancelled = await cancelledResponse.json() as Record<string, any>;
    expect(cancelled.status).toBe('Cancelled'); expect(cancelled.version).toBe(created.version + 1);
    evidence.cancelledVersion = cancelled.version; evidence.cancelCommandKey = cancelCommandKey;
    progress('cancelled-ui-readback');
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    progress('reload-cancelled-detail');
    await reloadReady(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    evidence.principalRfqDraftVerified = true;
    evidence.apiResponses = network;
    evidence.status = 'PASS_NORMAL_COOKIE_P29_INTERNAL_DRAFT_UI_ONLY'; retain();
  } catch (error) {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step;
    // Typed diagnostics only: never error messages, cookies, headers or request bodies.
    const matcher = (error as { matcherResult?: { name?: unknown } })?.matcherResult?.name;
    evidence.assertion = typeof matcher === 'string' && /^[A-Za-z]+$/.test(matcher) ? matcher : 'Unclassified';
    evidence.apiResponses = network;
    evidence.pendingRequests = [...requests.entries()].map(([request, started]) => ({
      path: new URL(request.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id'),
      method: request.method(), elapsedMs: Date.now() - started,
    }));
    if (inspectedPage && !inspectedPage.isClosed()) {
      evidence.cancelledTextMatches = await inspectedPage.getByText('Cancelled', { exact: true }).count().catch(() => -1);
      evidence.alertCount = await inspectedPage.getByRole('alert').count().catch(() => -1);
      evidence.headingCount = await inspectedPage.getByRole('heading').count().catch(() => -1);
      evidence.headingLabels = await inspectedPage.getByRole('heading').allTextContents().then(values => values.map(value => value.slice(0, 200))).catch(() => []);
      evidence.currentPath = new URL(inspectedPage.url()).pathname;
    }
  }
  finally {
    await context.close().catch(() => undefined);
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 2, challenge: fixture.challenge, status: 'BrowserFinished' }) + '\n',
      { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`Normal-cookie P29 proof failed at ${step}; inspect protected typed result and owning-store evidence`);
});
