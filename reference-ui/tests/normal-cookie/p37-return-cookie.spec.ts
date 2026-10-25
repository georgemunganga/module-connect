import { expect, test, type APIResponse, type BrowserContext, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 4; controlPlaneOnly: true; apiUrl: string; database: string;
  tenantId: string; companyId: string; branchId: string; receiverPrincipalId: string;
  acceptanceFactId: string; receiptId: string; nativeDraftId: string; acceptedFactQuantityExact: '0.9999';
  syntheticCredentials: Credential[]; challenge: string; completionPath: string; expiresAt: string;
  secureCookieRequiresHttpsProxy: true; apiSetupAuthentication: 'PRIVATE_SUBJECT_TEST_AUTH_ONLY';
  browserAuthenticationRequired: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE';
  localCookieLoginVerified: false; browserAcceptanceVerified: false; ownerCompletionVerified: false;
  productionTouched: false };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
const privateFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P37 input missing');
  return value;
};
const fixtureBytes = readFileSync(privateFile('P37_RETURN_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected P37 fixture');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(privateFile('P37_RETURN_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P37_RETURN_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 4 || proxy.schemaVersion !== 4 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.apiSetupAuthentication !== 'PRIVATE_SUBJECT_TEST_AUTH_ONLY'
  || fixture.secureCookieRequiresHttpsProxy !== true || fixture.localCookieLoginVerified !== false
  || fixture.browserAcceptanceVerified !== false || fixture.ownerCompletionVerified !== false
  || fixture.productionTouched !== false || fixture.acceptedFactQuantityExact !== '0.9999'
  || fixture.database !== process.env.P37_RETURN_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || proxy.database !== fixture.database
  || proxy.injectsIdentityHeaders !== false || proxy.mocksBusinessResponses !== false
  || !output || !path.isAbsolute(output) || existsSync(output)
  || !/^proc_p37_http_return_[a-z0-9_]{1,30}$/.test(fixture.database)
  || ![fixture.companyId, fixture.branchId, fixture.receiverPrincipalId, fixture.acceptanceFactId,
    fixture.receiptId, fixture.nativeDraftId].every(guid)
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Actual unexpired P37 normal-cookie fixture required');
if (!Array.isArray(fixture.syntheticCredentials) || fixture.syntheticCredentials.length !== 16)
  throw new Error('Original synthetic receiver cohort missing');
const account = fixture.syntheticCredentials.filter(value => value.principalId === fixture.receiverPrincipalId);
if (account.length !== 1 || !account[0].email || !account[0].password)
  throw new Error('Exact synthetic receiver missing');
const scope = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const root = '/api/procurement/v1/returns/principal-drafts';
const route = '/procurement/workspace/purchase-receives/returns';
const evidence: Record<string, unknown> = { schemaVersion: 4, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId, receiverPrincipalId: fixture.receiverPrincipalId,
  acceptanceFactId: fixture.acceptanceFactId, nativeDraftId: fixture.nativeDraftId,
  challenge: fixture.challenge, physicalReturnDispatched: false, stockPostingPerformed: false,
  financePostingPerformed: false, supplierNotified: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function api(action: () => Promise<APIResponse>) {
  try { return await action(); } catch { throw new Error('Private P37 API transport failed'); }
}
async function body(response: APIResponse): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Private P37 API returned invalid JSON'); }
}
function command(response: Response, allowed: readonly string[]): { key: string; body: Record<string, unknown> } {
  const key = response.request().headers()['idempotency-key'];
  const raw = response.request().postData();
  if (!guid(key) || !raw || raw.length > 65536) throw new Error('Bounded P37 command missing');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some(field => !allowed.includes(field))) throw new Error('Unexpected P37 command body');
  return { key, body: parsed as Record<string, unknown> };
}
async function login(context: BrowserContext) {
  const response = await api(() => context.request.post('/api/hrm/auth/login', {
    data: { email: account[0].email, password: account[0].password }, failOnStatusCode: false }));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect(me.status()).toBe(200);
  expect((await body(me)).user).toMatchObject({ id: fixture.receiverPrincipalId });
  const current = await api(() => context.request.get('/api/procurement/v1/context', { headers: scope }));
  expect(current.status()).toBe(200);
  const contextBody = await body(current);
  expect(contextBody).toMatchObject({ tenantId: fixture.tenantId, principalId: fixture.receiverPrincipalId,
    workerId: null, legalEntityId: fixture.companyId });
  expect(contextBody.permissions).toEqual(expect.arrayContaining([
    'procurement-return-read', 'procurement-return-create', 'procurement-return-edit']));
  const meta = await api(() => context.request.get('/api/procurement/v1/meta', { headers: scope }));
  expect(meta.status()).toBe(200);
  expect((await body(meta)).capabilities).toMatchObject({ principalGoodsReturnDrafts: true });
}
async function logout(context: BrowserContext) {
  const response = await api(() => context.request.post('/api/hrm/auth/logout'));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect((await body(me)).authenticated).toBe(false);
  const denied = await api(() => context.request.get('/api/procurement/v1/context', { headers: scope }));
  expect(denied.status()).toBe(401);
}

// Real local login and session cookie through a separately reviewed HTTPS proxy.
// No route.fulfill, private identity headers, demo state, or API response mocks.
test('workerless receiver creates, reloads, revises and cancels one goods return draft', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'receiver-login', failed = false, loggedIn = false;
  const progress = (next: string) => { step = next; evidence.step = next; retain(); };
  const context = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  try {
    await login(context); loggedIn = true;
    progress('accepted-goods-source');
    const source = await api(() => context.request.get(`${root}/eligible-goods?offset=0`, { headers: scope }));
    expect(source.status()).toBe(200);
    const items = (await body(source)).items;
    if (!Array.isArray(items)) throw new Error('P37 accepted goods page invalid');
    const selected = items.find((item: Record<string, unknown>) => item.acceptanceFactId === fixture.acceptanceFactId);
    expect(selected).toMatchObject({ receiptId: fixture.receiptId, branchId: fixture.branchId,
      acceptedFactQuantityExact: fixture.acceptedFactQuantityExact });
    const labels = selected.labels as Record<string, unknown>;
    expect(typeof labels.purchaseOrderNumber === 'string' && labels.purchaseOrderNumber.length > 0).toBe(true);
    expect(Number.isSafeInteger(labels.lineNumber)).toBe(true);
    const page = await context.newPage();
    await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
      { entityId: fixture.companyId, branch: fixture.branchId });
    await page.goto(`${route}/new`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add return draft' })).toBeVisible();
    // P30 retained two acceptance facts on the same PO line; the label alone is not unique.
    const acceptedRow = page.getByRole('row').filter({ hasText: fixture.acceptedFactQuantityExact });
    await expect(acceptedRow).toHaveCount(1);
    await acceptedRow.getByRole('radio', { name: `Select ${labels.purchaseOrderNumber} line ${labels.lineNumber}` }).check();
    await page.getByLabel('Proposed quantity').fill('0.5');
    await page.getByLabel('Evidence reference').fill('PRIVATE-RETURN:browser-original');
    await page.getByLabel('Reason').fill('Browser proposed goods return');
    progress('create-draft');
    const createWaiting = page.waitForResponse(response => new URL(response.url()).pathname === root
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save return draft' }).click();
    const createResponse = await createWaiting;
    expect(createResponse.status()).toBe(201);
    const create = await createResponse.json() as Record<string, unknown>;
    expect(guid(create.id) && create.id !== fixture.nativeDraftId).toBe(true);
    expect(create).toMatchObject({ status: 'Draft', version: 1, acceptanceFactId: fixture.acceptanceFactId,
      receiptId: fixture.receiptId, quantityExact: '0.5', draftOnly: true, stockChanged: false,
      financeChanged: false, supplierNotified: false });
    const created = command(createResponse, ['acceptanceFactId', 'quantity', 'reason', 'evidenceReference']);
    expect(created.body).toEqual({ acceptanceFactId: fixture.acceptanceFactId, quantity: '0.5',
      reason: 'Browser proposed goods return', evidenceReference: 'PRIVATE-RETURN:browser-original' });
    evidence.browserDraftId = create.id; evidence.createCommandKey = created.key; retain();
    await expect(page).toHaveURL(new RegExp(String(create.id)));
    await expect(page.getByText(/Draft only · Stock unchanged/)).toBeVisible();
    progress('reload-created-detail');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Proposed quantity: 0.5', { exact: false })).toBeVisible();
    await expect(page.getByText('Draft version 1', { exact: false })).toBeVisible();
    progress('revise-draft');
    await page.getByRole('link', { name: 'Edit return draft' }).click();
    await page.getByLabel('Proposed quantity').fill('0.75');
    await page.getByLabel('Evidence reference').fill('PRIVATE-RETURN:browser-revised');
    await page.getByLabel('Reason').fill('Revised browser proposal');
    const reviseWaiting = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/${create.id}`
      && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save return draft' }).click();
    const reviseResponse = await reviseWaiting;
    expect(reviseResponse.status()).toBe(200);
    const revised = await reviseResponse.json() as Record<string, unknown>;
    expect(revised).toMatchObject({ id: create.id, status: 'Draft', version: 2, quantityExact: '0.75',
      draftOnly: true, stockChanged: false, financeChanged: false, supplierNotified: false });
    const reviseCommand = command(reviseResponse, ['expectedRevision', 'quantity', 'reason', 'evidenceReference']);
    expect(reviseCommand.body).toEqual({ expectedRevision: 1, quantity: '0.75', reason: 'Revised browser proposal',
      evidenceReference: 'PRIVATE-RETURN:browser-revised' });
    evidence.reviseCommandKey = reviseCommand.key; retain();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Proposed quantity: 0.75', { exact: false })).toBeVisible();
    await expect(page.getByText('Draft version 2', { exact: false })).toBeVisible();
    progress('cancel-draft');
    await page.getByRole('button', { name: 'Cancel draft' }).click();
    await page.getByLabel('Cancellation reason').fill('Browser proposal abandoned');
    const cancelWaiting = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/${create.id}/cancel`
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Cancel draft' }).last().click();
    const cancelResponse = await cancelWaiting;
    expect(cancelResponse.status()).toBe(200);
    const cancelled = await cancelResponse.json() as Record<string, unknown>;
    expect(cancelled).toMatchObject({ id: create.id, status: 'Cancelled', version: 3, quantityExact: '0.75',
      evidenceReference: 'PRIVATE-RETURN:browser-revised', draftOnly: true, stockChanged: false,
      financeChanged: false, supplierNotified: false });
    const cancelCommand = command(cancelResponse, ['expectedRevision', 'reason']);
    expect(cancelCommand.body).toEqual({ expectedRevision: 2, reason: 'Browser proposal abandoned' });
    expect(new Set([created.key, reviseCommand.key, cancelCommand.key]).size).toBe(3);
    evidence.cancelCommandKey = cancelCommand.key; retain();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(page.getByText('Draft version 3', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit return draft' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel draft' })).toHaveCount(0);
    progress('logout-revocation');
    await logout(context); loggedIn = false;
    evidence.browserActionsVerified = true; evidence.sessionRevoked = true;
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain();
  } finally {
    if (loggedIn) {
      try { await logout(context); evidence.sessionRevoked = true; }
      catch { evidence.sessionRevoked = false; }
    }
    await context.close().catch(() => undefined);
    if (!failed && evidence.browserActionsVerified === true && evidence.sessionRevoked === true)
      evidence.status = 'PASS_NORMAL_COOKIE_P37_RETURN_UI_ONLY';
    retain();
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 4, challenge: fixture.challenge,
      status: 'BrowserFinished' }) + '\n', { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`Normal-cookie P37 UI proof failed at ${step}; inspect protected result and owning-store evidence`);
});
