import { expect, test, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 3; controlPlaneOnly: true; browserAuthenticationRequired: string;
  apiUrl: string; database: string; tenantId: string; companyId: string; branchId: string;
  receiverPrincipalId: string; serviceOwnerPrincipalId: string; approvedRequestId: string; approvedRequestLineId: string;
  supplierId: string; issuedOrderId: string; issuedVersionId: string; issuedOrderLineId: string;
  nativeGoodsOrderId: string; nativeServiceOrderId: string; servicePeriodDate: string; syntheticCredentials: Credential[];
  challenge: string; completionPath: string; expiresAt: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
const protectedFile = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected P30 service input missing');
  return value;
};
const fixtureBytes = readFileSync(protectedFile('P30_SERVICE_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected service fixture');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P30_SERVICE_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P30_SERVICE_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 3 || proxy.schemaVersion !== 3 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.database !== process.env.P30_SERVICE_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || !output || !path.isAbsolute(output) || existsSync(output)
  || !/^proc_p30_http_po_[a-z0-9_]{1,40}$/.test(fixture.database)
  || ![fixture.companyId, fixture.branchId, fixture.receiverPrincipalId, fixture.serviceOwnerPrincipalId,
    fixture.approvedRequestId, fixture.approvedRequestLineId, fixture.supplierId,
    fixture.issuedOrderId, fixture.issuedVersionId, fixture.issuedOrderLineId,
    fixture.nativeGoodsOrderId, fixture.nativeServiceOrderId].every(guid)
  || fixture.nativeGoodsOrderId === fixture.issuedOrderId || fixture.nativeServiceOrderId === fixture.issuedOrderId
  || !/^\d{4}-\d{2}-\d{2}$/.test(fixture.servicePeriodDate)
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Actual unexpired P30 service normal-cookie fixture required');
const account = (id: string) => {
  const matches = fixture.syntheticCredentials.filter(value => value.principalId === id);
  if (matches.length !== 1 || !matches[0].email || !matches[0].password) throw new Error('Exact synthetic service account missing');
  return matches[0];
};
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 3, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId,
  issuedOrderId: fixture.issuedOrderId, issuedOrderLineId: fixture.issuedOrderLineId,
  nativeGoodsOrderId: fixture.nativeGoodsOrderId, nativeServiceOrderId: fixture.nativeServiceOrderId,
  receiverPrincipalId: fixture.receiverPrincipalId, serviceOwnerPrincipalId: fixture.serviceOwnerPrincipalId,
  challenge: fixture.challenge, supplierSendPerformed: false, stockPostingPerformed: false,
  financePostingPerformed: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function api(action: () => Promise<APIResponse>): Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private service API transport failed'); }
}
async function body(response: APIResponse): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Private service API returned invalid JSON'); }
}
function command(response: Response, allowed: readonly string[]): { key: string; body: string } {
  const key = response.request().headers()['idempotency-key'];
  const raw = response.request().postData();
  if (!guid(key) || !raw || raw.length > 65536) throw new Error('Bounded service command missing');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).some(field => !allowed.includes(field))) throw new Error('Unexpected service command body');
  return { key, body: raw };
}
async function login(context: BrowserContext, principalId: string) {
  const credential = account(principalId);
  const response = await api(() => context.request.post('/api/hrm/auth/login', {
    data: { email: credential.email, password: credential.password }, failOnStatusCode: false }));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect(me.status()).toBe(200); expect((await body(me)).user).toMatchObject({ id: principalId });
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

// Real restored editor and detail, real local sessions, no route mocks or test identity headers.
test('workerless receiver drafts service and independent owner certifies half', async ({ browser }) => {
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
      kind: 'Service', supplierAcknowledgmentIsDelivery: false });
    const number = candidate?.purchaseOrderNumber;
    expect(typeof number === 'string' && number.length > 0).toBe(true);
    const page = await pageFor(receiver);
    progress('service-draft-editor');
    await page.goto('/procurement/workspace/purchase-receives/new?kind=service', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add delivery' })).toBeVisible();
    await page.getByRole('switch', { name: new RegExp(`Select ${String(number)}`) }).click();
    await page.getByLabel('Deliverable reference').fill('PRIVATE_BROWSER_SERVICE_HALF');
    await page.getByLabel('Service quantity').fill('0.5');
    await page.getByLabel('Service period from').fill(fixture.servicePeriodDate);
    await page.getByLabel('Service period to').fill(fixture.servicePeriodDate);
    const createWaiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/service-acceptances/principal-drafts')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save delivery draft' }).click();
    const createdResponse = await createWaiting; expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as Record<string, unknown>;
    expect(guid(created.id)).toBe(true); expect(created.status).toBe('Draft');
    const createCommand = command(createdResponse, ['purchaseOrderId', 'issuedVersionId',
      'purchaseOrderLineId', 'deliverableReference', 'periodFrom', 'periodTo', 'quantity', 'notes']);
    evidence.serviceId = created.id; evidence.createCommandKey = createCommand.key;
    evidence.createRequestBody = createCommand.body; evidence.createdVersion = created.version; retain();
    await expect(page).toHaveURL(new RegExp(String(created.id)));

    progress('independent-service-certification');
    const serviceOwner = await open(fixture.serviceOwnerPrincipalId);
    const tasks = await api(() => serviceOwner.request.get('/api/procurement/v1/receiving/principal-service-tasks?offset=0&limit=25', { headers: selection }));
    expect(tasks.status()).toBe(200);
    const assigned = (await body(tasks)).records;
    expect(Array.isArray(assigned) && (assigned as Record<string, unknown>[]).some(value => value.id === created.id)).toBe(true);
    const taskPage = await pageFor(serviceOwner);
    await taskPage.goto(`/procurement/workspace/purchase-receives/${created.id}?kind=service&purpose=certification`, { waitUntil: 'domcontentloaded' });
    await expect(taskPage.getByRole('button', { name: 'Confirm service' })).toBeVisible();
    await taskPage.getByRole('button', { name: 'Confirm service' }).click();
    await taskPage.getByLabel('Evidence reference').fill('PRIVATE-REC:browser-service-half');
    await taskPage.getByRole('switch', { name: 'I checked the delivery evidence' }).click();
    const certifyWaiting = taskPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/principal-certify')
      && response.request().method() === 'POST');
    await taskPage.getByRole('button', { name: 'Confirm delivery action' }).click();
    const certifiedResponse = await certifyWaiting; expect(certifiedResponse.status()).toBe(200);
    const certifyCommand = command(certifiedResponse, ['version', 'sourceVersion', 'quantity', 'evidenceReference']);
    expect(JSON.parse(certifyCommand.body)).toMatchObject({ quantity: '0.5', evidenceReference: 'PRIVATE-REC:browser-service-half' });
    evidence.certifyCommandKey = certifyCommand.key; evidence.certifyRequestBody = certifyCommand.body;
    evidence.certifiedVersion = (await certifiedResponse.json() as Record<string, unknown>).version; retain();
    await expect(taskPage.getByText(/Saved: Certified/)).toBeVisible();
    await logout(serviceOwner); await serviceOwner.close();

    progress('receiver-reload');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Certified', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Accepted quantity: 0.5/)).toBeVisible();
    await logout(receiver); await receiver.close();
    evidence.allSessionsRevoked = true;
    evidence.serviceBrowserActionsVerified = true;
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain();
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    if (!failed && evidence.serviceBrowserActionsVerified === true && evidence.allSessionsRevoked === true)
      evidence.status = 'PASS_NORMAL_COOKIE_P30_SERVICE_UI_ONLY';
    retain();
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 3, challenge: fixture.challenge, status: 'BrowserFinished' }) + '\n',
      { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`Normal-cookie P30 service proof failed at ${step}; inspect protected typed result and owning-store evidence`);
});
