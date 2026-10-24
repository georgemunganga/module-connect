import { expect, test, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 3; controlPlaneOnly: true; browserAuthenticationRequired: string;
  apiUrl: string; database: string; tenantId: string; companyId: string; branchId: string;
  receiverPrincipalId: string; inspectorPrincipalId: string; acceptorPrincipalId: string;
  approvedRequestId: string; approvedRequestLineId: string; supplierId: string;
  issuedOrderId: string; issuedVersionId: string; issuedOrderLineId: string; nativeGoodsOrderId: string;
  syntheticCredentials: Credential[]; challenge: string; completionPath: string; expiresAt: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
const protectedFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P30 receiving input missing');
  return value;
};
const fixtureBytes = readFileSync(protectedFile('P30_RECEIVING_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected receiving fixture');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P30_RECEIVING_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P30_RECEIVING_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 3 || proxy.schemaVersion !== 3 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.database !== process.env.P30_RECEIVING_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || !output || !path.isAbsolute(output) || existsSync(output)
  || !/^proc_p30_http_po_[a-z0-9_]{1,40}$/.test(fixture.database)
  || ![fixture.companyId, fixture.branchId, fixture.receiverPrincipalId, fixture.inspectorPrincipalId,
    fixture.acceptorPrincipalId, fixture.approvedRequestId, fixture.approvedRequestLineId,
    fixture.supplierId, fixture.issuedOrderId, fixture.issuedVersionId, fixture.issuedOrderLineId,
    fixture.nativeGoodsOrderId].every(guid)
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Actual unexpired P30 receiving normal-cookie fixture required');
const account = (id: string) => {
  const matches = fixture.syntheticCredentials.filter(value => value.principalId === id);
  if (matches.length !== 1 || !matches[0].email || !matches[0].password) throw new Error('Exact synthetic receiving account missing');
  return matches[0];
};
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 3, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId, nativeGoodsOrderId: fixture.nativeGoodsOrderId,
  issuedOrderId: fixture.issuedOrderId, issuedOrderLineId: fixture.issuedOrderLineId,
  receiverPrincipalId: fixture.receiverPrincipalId, inspectorPrincipalId: fixture.inspectorPrincipalId,
  acceptorPrincipalId: fixture.acceptorPrincipalId, challenge: fixture.challenge,
  supplierSendPerformed: false, stockPostingPerformed: false, financePostingPerformed: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function api(action: () => Promise<APIResponse>): Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private receiving API transport failed'); }
}
async function body(response: APIResponse): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Private receiving API returned invalid JSON'); }
}
function command(response: Response, allowed: readonly string[]): { key: string; body: string } {
  const key = response.request().headers()['idempotency-key'];
  const raw = response.request().postData();
  if (!guid(key) || !raw || raw.length > 65536) throw new Error('Bounded receiving command missing');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some(field => !allowed.includes(field))) throw new Error('Unexpected receiving command body');
  return { key, body: raw };
}
async function login(context: BrowserContext, principalId: string) {
  const credential = account(principalId);
  const response = await api(() => context.request.post('/api/hrm/auth/login', {
    data: { email: credential.email, password: credential.password }, failOnStatusCode: false }));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect(me.status()).toBe(200);
  expect((await body(me)).user).toMatchObject({ id: principalId });
  const scoped = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
  expect(scoped.status()).toBe(200);
  expect(await body(scoped)).toMatchObject({ tenantId: fixture.tenantId, principalId,
    workerId: null, legalEntityId: fixture.companyId });
  const meta = await api(() => context.request.get('/api/procurement/v1/meta', { headers: selection }));
  expect(meta.status()).toBe(200);
  expect((await body(meta)).capabilities).toMatchObject({ principalReceiving: true });
}
async function logout(context: BrowserContext) {
  const response = await api(() => context.request.post('/api/hrm/auth/logout'));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect((await body(me)).authenticated).toBe(false);
  const denied = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
  expect(denied.status()).toBe(401);
}
async function pageFor(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
    { entityId: fixture.companyId, branch: fixture.branchId });
  return page;
}
async function confirm(page: Page, evidenceReference: string) {
  await page.getByLabel('Evidence reference', { exact: true }).fill(evidenceReference);
  await page.getByRole('switch', { name: 'I checked the delivery evidence' }).click();
  await page.getByRole('button', { name: 'Confirm delivery action' }).click();
}

// The browser uses the imported receiving editor/detail, real local sessions and
// the actual API. Setup authority is supplied only by the private HTTP probe.
test('workerless receiver, inspector and acceptor record one goods delivery', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'receiver-login', failed = false;
  const progress = (next: string) => { step = next; evidence.step = next; retain(); };
  const contexts: BrowserContext[] = [];
  const open = async (actor: string) => {
    const context = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
    contexts.push(context); await login(context, actor); return context;
  };
  try {
    const receiver = await open(fixture.receiverPrincipalId);
    const source = await api(() => receiver.request.get('/api/procurement/v1/receiving/principal-sources?offset=0&limit=25', { headers: selection }));
    expect(source.status()).toBe(200);
    const records = (await body(source)).records;
    expect(Array.isArray(records)).toBe(true);
    const candidate = (records as Record<string, unknown>[]).find(value => value.purchaseOrderLineId === fixture.issuedOrderLineId);
    expect(candidate).toMatchObject({ purchaseOrderId: fixture.issuedOrderId, issuedVersionId: fixture.issuedVersionId,
      supplierAcknowledgmentIsDelivery: false });
    const number = candidate?.purchaseOrderNumber;
    expect(typeof number === 'string' && number.length > 0).toBe(true);
    const page = await pageFor(receiver);
    progress('receiving-draft-editor');
    await page.goto('/procurement/workspace/purchase-receives/new?kind=goods', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add delivery' })).toBeVisible();
    await page.getByRole('switch', { name: new RegExp(`Select ${String(number)}`) }).click();
    await page.getByLabel('Received quantity 1').fill('1');
    await page.getByLabel('Delivery note reference').fill('PRIVATE_BROWSER_GOODS_NOTE');
    const createWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/receipts/principal-drafts')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save delivery draft' }).click();
    const createdResponse = await createWaiting; expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as Record<string, unknown>;
    expect(guid(created.id)).toBe(true); expect(created.status).toBe('Draft');
    const createCommand = command(createdResponse, ['purchaseOrderId', 'issuedVersionId', 'siteId', 'receivedAt', 'deliveryNoteRef', 'notes', 'lines']);
    evidence.receiptId = created.id; evidence.createCommandKey = createCommand.key;
    evidence.createRequestBody = createCommand.body; evidence.createdVersion = created.version; retain();
    await expect(page).toHaveURL(new RegExp(String(created.id)));
    progress('record-physical-arrival');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Record arrival' })).toBeVisible();
    await page.getByRole('button', { name: 'Record arrival' }).click();
    const recordWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${created.id}/principal-record`)
      && response.request().method() === 'POST');
    await confirm(page, 'PRIVATE-REC:browser-physical-observation');
    const recordedResponse = await recordWaiting; expect(recordedResponse.status()).toBe(200);
    const recordCommand = command(recordedResponse, ['version', 'evidenceReference']);
    evidence.recordCommandKey = recordCommand.key; evidence.recordRequestBody = recordCommand.body;
    evidence.recordedVersion = (await recordedResponse.json() as Record<string, unknown>).version; retain();
    await logout(receiver); await receiver.close();

    progress('independent-inspection');
    const inspector = await open(fixture.inspectorPrincipalId);
    const inspectionPage = await pageFor(inspector);
    await inspectionPage.goto(`/procurement/workspace/purchase-receives/${created.id}?kind=goods&purpose=inspection`, { waitUntil: 'domcontentloaded' });
    await expect(inspectionPage.getByRole('button', { name: 'Inspect delivery' })).toBeVisible();
    await inspectionPage.getByRole('button', { name: 'Inspect delivery' }).click();
    await inspectionPage.getByLabel('Qualified quantity').fill('1');
    const inspectWaiting = inspectionPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/principal-inspect')
      && response.request().method() === 'POST');
    await confirm(inspectionPage, 'PRIVATE-REC:browser-inspection');
    const inspectedResponse = await inspectWaiting; expect(inspectedResponse.status()).toBe(200);
    const inspectCommand = command(inspectedResponse, ['version', 'sourceVersion', 'quantity', 'evidenceReference']);
    evidence.inspectCommandKey = inspectCommand.key; evidence.inspectRequestBody = inspectCommand.body;
    evidence.inspectedVersion = (await inspectedResponse.json() as Record<string, unknown>).version; retain();
    await logout(inspector); await inspector.close();

    progress('independent-acceptance');
    const acceptor = await open(fixture.acceptorPrincipalId);
    const acceptancePage = await pageFor(acceptor);
    await acceptancePage.goto(`/procurement/workspace/purchase-receives/${created.id}?kind=goods&purpose=acceptance`, { waitUntil: 'domcontentloaded' });
    await expect(acceptancePage.getByRole('button', { name: 'Accept goods' })).toBeVisible();
    await acceptancePage.getByRole('button', { name: 'Accept goods' }).click();
    await acceptancePage.getByLabel('Quantity to accept').fill('1');
    const acceptWaiting = acceptancePage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/principal-accept')
      && response.request().method() === 'POST');
    await confirm(acceptancePage, 'PRIVATE-REC:browser-acceptance');
    const acceptedResponse = await acceptWaiting; expect(acceptedResponse.status()).toBe(200);
    const acceptCommand = command(acceptedResponse, ['version', 'sourceVersion', 'quantity', 'evidenceReference']);
    evidence.acceptCommandKey = acceptCommand.key; evidence.acceptRequestBody = acceptCommand.body;
    evidence.acceptedVersion = (await acceptedResponse.json() as Record<string, unknown>).version; retain();
    await acceptancePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(acceptancePage.getByText('1', { exact: true }).first()).toBeVisible();
    await logout(acceptor); await acceptor.close();
    evidence.allSessionsRevoked = true;
    evidence.receivingBrowserActionsVerified = true;
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain();
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    if (!failed && evidence.receivingBrowserActionsVerified === true && evidence.allSessionsRevoked === true)
      evidence.status = 'PASS_NORMAL_COOKIE_P30_RECEIVING_UI_ONLY';
    retain();
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 3, challenge: fixture.challenge, status: 'BrowserFinished' }) + '\n',
      { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`Normal-cookie P30 receiving proof failed at ${step}; inspect protected typed result and owning-store evidence`);
});
