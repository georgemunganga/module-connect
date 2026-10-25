import { expect, test, type APIResponse, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 4; controlPlaneOnly: true; browserAuthenticationRequired: string;
  apiUrl: string; database: string; tenantId: string; companyId: string; branchId: string;
  buyerPrincipalId: string; approvedRequestId: string; approvedRequestLineId: string;
  supplierId: string; issuedOrderId: string; cancelledNativeEditOrderId: string; syntheticCredentials: Credential[];
  challenge: string; completionPath: string; expiresAt: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
const protectedFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P33 PO input missing');
  return value;
};
const fixtureBytes = readFileSync(protectedFile('P33_PO_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected PO fixture');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P33_PO_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P33_PO_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 4 || proxy.schemaVersion !== 4 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.database !== process.env.P33_PO_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || !output || !path.isAbsolute(output) || existsSync(output)
  || !/^proc_p33_http_po_cookie_[a-z0-9_]{1,32}$/.test(fixture.database)
  || ![fixture.companyId, fixture.branchId, fixture.buyerPrincipalId, fixture.approvedRequestId,
    fixture.approvedRequestLineId, fixture.supplierId, fixture.issuedOrderId, fixture.cancelledNativeEditOrderId].every(guid)
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Actual unexpired P33 PO normal-cookie fixture required');
const account = fixture.syntheticCredentials.filter(value => value.principalId === fixture.buyerPrincipalId);
if (account.length !== 1 || !account[0].email || !account[0].password) throw new Error('Exact synthetic buyer missing');
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 4, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId, buyerPrincipalId: fixture.buyerPrincipalId,
  approvedRequestId: fixture.approvedRequestId, approvedRequestLineId: fixture.approvedRequestLineId,
  supplierId: fixture.supplierId, cancelledNativeEditOrderId: fixture.cancelledNativeEditOrderId,
  challenge: fixture.challenge,
  principalPoDraftEditVerified: false, supplierSendPerformed: false,
  financePostingPerformed: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function api(action: () => Promise<APIResponse>): Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private PO API transport failed'); }
}
async function body(response: APIResponse): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Private PO API returned invalid JSON'); }
}
function commandBody(response: Response, allowed: readonly string[]): string {
  const raw = response.request().postData();
  if (!raw || raw.length > 65536) throw new Error('Bounded PO command body missing');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some(key => !allowed.includes(key)))
    throw new Error('Unexpected PO command body');
  return raw;
}

// Browser actions use real local login and session cookies. No route mocks,
// private subject headers, demo transaction state or supplier dispatch occur.
test('workerless buyer creates, revises, reloads and cancels an internal purchase order', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'buyer-login', failed = false, loggedIn = false;
  const network: Array<{ path: string; method: string; status: number }> = [];
  const progress = (next: string) => { step = next; evidence.step = next; retain(); };
  const context = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  try {
    const login = await api(() => context.request.post('/api/hrm/auth/login', {
      data: { email: account[0].email, password: account[0].password }, failOnStatusCode: false }));
    expect(login.status()).toBe(200);
    loggedIn = true;
    const me = await api(() => context.request.get('/api/hrm/auth/me'));
    expect(me.status()).toBe(200); expect((await body(me)).user).toMatchObject({ id: fixture.buyerPrincipalId });
    const scope = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
    expect(scope.status()).toBe(200);
    expect(await body(scope)).toMatchObject({ tenantId: fixture.tenantId, principalId: fixture.buyerPrincipalId,
      workerId: null, legalEntityId: fixture.companyId });
    const meta = await api(() => context.request.get('/api/procurement/v1/meta', { headers: selection }));
    expect(meta.status()).toBe(200);
    expect((await body(meta)).capabilities).toMatchObject({ principalDirectOrderDrafts: true, principalOrderDraftRevision: true });

    progress('approved-direct-source-preview');
    let candidate: Record<string, unknown> | undefined;
    for (let number = 1; number <= 10 && !candidate; number++) {
      const source = await api(() => context.request.get(
        `/api/procurement/v1/orders/approved-principal-direct-sources?page=${number}&pageSize=25`, { headers: selection }));
      expect(source.status()).toBe(200); const result = await body(source);
      if (!Array.isArray(result.items)) throw new Error('Private source page invalid');
      candidate = result.items.find((item: Record<string, unknown>) =>
        item.purchaseRequestId === fixture.approvedRequestId && item.purchaseRequestLineId === fixture.approvedRequestLineId);
      if (number * 25 >= Number(result.candidateTotal)) break;
    }
    expect(candidate?.canSelect).toBe(true);
    expect(candidate?.availableQuantity).toBe('1');
    const requestNumber = candidate!.requestNumber;
    expect(typeof requestNumber === 'string' && requestNumber.length > 0).toBe(true);

    progress('create-internal-order');
    const page = await context.newPage();
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith('/api/') && network.length < 100) network.push({
        path: pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id'),
        method: response.request().method(), status: response.status() });
    });
    const reloadReady = async () => {
      const ready = page.waitForResponse(response => new URL(response.url()).pathname === '/api/procurement/v1/meta', { timeout: 90_000 });
      await page.reload({ waitUntil: 'domcontentloaded' }); expect((await ready).status()).toBe(200);
    };
    await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
      { entityId: fixture.companyId, branch: fixture.branchId });
    await page.goto('/procurement/workspace/purchase-orders/new?workflow=principal', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'New purchase order' })).toBeVisible();
    // The exact approved source is identified by its stable request number and shown quantity.
    const candidateSection = page.getByRole('region', { name: 'Approved requests' }).getByText(String(requestNumber), { exact: false });
    await expect(candidateSection).toBeVisible();
    await candidateSection.locator('xpath=../..').getByRole('button', { name: 'Add line' }).click();
    const supplierPage = await api(() => context.request.get(
      '/api/procurement/v1/orders/principal-direct-suppliers?page=1&pageSize=25', { headers: selection }));
    expect(supplierPage.status()).toBe(200);
    const supplierChoices = await body(supplierPage);
    if (!Array.isArray(supplierChoices.items)) throw new Error('Private supplier choices invalid');
    const supplierChoice = supplierChoices.items.find((item: Record<string, unknown>) => item.id === fixture.supplierId);
    if (typeof supplierChoice?.displayName !== 'string' || !supplierChoice.displayName)
      throw new Error('Exact approved supplier label missing');
    await page.getByRole('combobox', { name: /Vendor Name/ }).click();
    await page.getByRole('option', { name: supplierChoice.displayName, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Order lines' }).getByRole('table')).toBeVisible();
    const createdWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/from-approved-principal-direct-sources')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save internal draft' }).click();
    const createdResponse = await createdWaiting; expect(createdResponse.status()).toBe(201);
    const createCommandKey = createdResponse.request().headers()['idempotency-key'];
    expect(guid(createCommandKey)).toBe(true);
    const created = await createdResponse.json() as Record<string, unknown>;
    expect(guid(created.orderId)).toBe(true); expect(created.status).toBe('Draft');
    evidence.orderId = created.orderId; evidence.createdVersion = created.version;
    evidence.createCommandKey = createCommandKey;
    evidence.createRequestBody = commandBody(createdResponse, ['draft', 'sources']); retain();
    await expect(page.getByRole('heading', { name: String(created.number), exact: true })).toBeVisible();
    for (const tab of ['Overview', 'Items (1)', 'Related', 'Comments', 'History'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    progress('reload-internal-order');
    await reloadReady(); await expect(page.getByRole('heading', { name: String(created.number), exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Items (1)' }).click();
    await expect(page.getByRole('heading', { name: 'Items / Line Details' })).toBeVisible();
    await page.getByRole('tab', { name: 'Overview' }).click();

    progress('edit-unfunded-draft');
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await expect(page.getByRole('heading', { name: `Edit ${String(created.number)}` })).toBeVisible();
    await page.getByRole('textbox', { name: 'Reason for revision' }).fill('Reduce uncommitted quantity');
    await page.getByRole('textbox', { name: 'Line 1 quantity' }).fill('0.5');
    const editedWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${created.orderId}/principal-direct-edit`)
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save draft revision' }).click();
    const editedResponse = await editedWaiting; expect(editedResponse.status()).toBe(200);
    const editCommandKey = editedResponse.request().headers()['idempotency-key'];
    expect(guid(editCommandKey)).toBe(true); expect(editCommandKey).not.toBe(createCommandKey);
    const edited = await editedResponse.json() as Record<string, unknown>;
    expect(edited.orderId).toBe(created.orderId);
    expect(edited.version).toBe(Number(created.version) + 1);
    evidence.editedVersion = edited.version; evidence.editCommandKey = editCommandKey;
    evidence.editRequestBody = commandBody(editedResponse,
      ['expectedOrderVersion', 'originalDirectSourceSha256', 'reason', 'draft']); retain();
    await expect(page.getByRole('heading', { name: String(created.number), exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText(`Draft revision 1 · version ${String(edited.version)}`)).toBeVisible();
    progress('reload-revised-draft');
    await reloadReady();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText(`Draft revision 1 · version ${String(edited.version)}`)).toBeVisible();
    const revisedDetail = await api(() => context.request.get(
      `/api/procurement/v1/orders/${created.orderId}/principal-direct-draft`, { headers: selection }));
    expect(revisedDetail.status()).toBe(200);
    const revised = await body(revisedDetail);
    expect(revised.version).toBe(edited.version);
    expect((revised.lines as Array<Record<string, unknown>>)[0].quantity).toBe('0.5');

    progress('cancel-internal-draft');
    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByRole('button', { name: 'Cancel internal draft' }).click();
    await page.getByRole('textbox', { name: 'Reason' }).fill('Private PO draft cancellation');
    const cancelledWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${created.orderId}/principal-direct-cancel`)
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm action' }).click();
    const cancelledResponse = await cancelledWaiting; expect(cancelledResponse.status()).toBe(200);
    const cancelCommandKey = cancelledResponse.request().headers()['idempotency-key'];
    expect(guid(cancelCommandKey)).toBe(true); expect(cancelCommandKey).not.toBe(createCommandKey);
    expect(cancelCommandKey).not.toBe(editCommandKey);
    const cancelled = await cancelledResponse.json() as Record<string, unknown>;
    expect(cancelled.status).toBe('Cancelled');
    evidence.cancelledVersion = cancelled.version; evidence.cancelCommandKey = cancelCommandKey;
    evidence.cancelRequestBody = commandBody(cancelledResponse,
      ['expectedOrderVersion', 'originalDirectSourceSha256', 'reason']);
    progress('reload-cancelled-order');
    await reloadReady(); await expect(page.getByRole('heading', { name: String(created.number), exact: true })).toBeVisible();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    evidence.principalPoDraftEditVerified = true; evidence.apiResponses = network; retain();
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step;
    evidence.apiResponses = network; retain();
  } finally {
    if (loggedIn) {
      step = 'normal-session-logout-revocation';
      try {
        const logout = await api(() => context.request.post('/api/hrm/auth/logout'));
        evidence.logoutStatus = logout.status(); retain();
        expect(logout.status()).toBe(200);
        const signedOut = await api(() => context.request.get('/api/hrm/auth/me'));
        expect(signedOut.status()).toBe(200);
        expect((await body(signedOut)).authenticated).toBe(false);
        const revoked = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
        expect(revoked.status()).toBe(401);
        evidence.localSessionRevoked = true;
      } catch {
        if (!failed) evidence.failedStep = step;
        failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE';
        evidence.localSessionRevoked = false; retain();
      }
    }
    if (!failed && evidence.principalPoDraftEditVerified === true
      && evidence.localSessionRevoked === true)
      evidence.status = 'PASS_NORMAL_COOKIE_P33_PO_UNFUNDED_DRAFT_EDIT_UI_ONLY';
    retain();
    await context.close().catch(() => undefined);
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 4, challenge: fixture.challenge, status: 'BrowserFinished' }) + '\n',
      { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`Normal-cookie P33 PO proof failed at ${String(evidence.failedStep ?? step)}; inspect protected typed result and owning-store evidence`);
});
