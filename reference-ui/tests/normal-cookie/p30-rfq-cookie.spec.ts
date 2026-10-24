import { expect, test, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 3; controlPlaneOnly: true; browserAuthenticationRequired: string;
  apiUrl: string; database: string; tenantId: string; companyId: string; branchId: string;
  buyerPrincipalId: string; reviewerPrincipalId: string; approvedRequestId: string; approvedRequestLineId: string;
  nativeEventId: string; nativePolicyId: string; nativeCaseId: string; nativeSupplierIds: string[];
  syntheticCredentials: Credential[]; challenge: string; completionPath: string; expiresAt: string };
const guid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
  && v !== '00000000-0000-0000-0000-000000000000';
const protectedFile = (name: string) => { const file = process.env[name];
  if (!file || !path.isAbsolute(file) || realpathSync(file) !== file || !lstatSync(file).isFile()
    || (lstatSync(file).mode & 0o777) !== 0o600) throw new Error('Protected RFQ input missing');
  return file;
};
const fixtureBytes = readFileSync(protectedFile('P30_RFQ_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('RFQ fixture exceeds bound');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P30_RFQ_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P30_RFQ_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 3 || fixture.controlPlaneOnly !== true || proxy.schemaVersion !== 3
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || !/^proc_p30_http_rfq_[a-z0-9_]{1,40}$/.test(fixture.database)
  || fixture.database !== process.env.P30_RFQ_COOKIE_EXPECTED_DATABASE
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || proxy.transport !== 'normal-local-cookie-https-v1'
  || proxy.injectsIdentityHeaders !== false || proxy.mocksBusinessResponses !== false
  || !output || !path.isAbsolute(output) || existsSync(output)
  || ![fixture.companyId, fixture.branchId, fixture.buyerPrincipalId, fixture.reviewerPrincipalId,
    fixture.approvedRequestId, fixture.approvedRequestLineId, fixture.nativeEventId,
    fixture.nativePolicyId, fixture.nativeCaseId].every(guid)
  || !Array.isArray(fixture.nativeSupplierIds) || fixture.nativeSupplierIds.length !== 2
  || !fixture.nativeSupplierIds.every(guid) || fixture.nativeSupplierIds[0] === fixture.nativeSupplierIds[1]
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now())
  throw new Error('Current protected RFQ normal-cookie fixture required');
const actor = (id: string) => { const matched = fixture.syntheticCredentials.filter(x => x.principalId === id);
  if (matched.length !== 1 || !matched[0].email || !matched[0].password) throw new Error('Exact synthetic actor missing');
  return matched[0];
};
const buyer = actor(fixture.buyerPrincipalId), reviewer = actor(fixture.reviewerPrincipalId);
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 3, status: 'RUNNING_NOT_ACCEPTANCE',
  transport: 'normal-local-cookie-https-v1', authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, tenantId: fixture.tenantId,
  companyId: fixture.companyId, branchId: fixture.branchId, buyerPrincipalId: fixture.buyerPrincipalId,
  reviewerPrincipalId: fixture.reviewerPrincipalId, approvedRequestId: fixture.approvedRequestId,
  approvedRequestLineId: fixture.approvedRequestLineId, nativeEventId: fixture.nativeEventId,
  nativePolicyId: fixture.nativePolicyId, nativeCaseId: fixture.nativeCaseId,
  nativeSupplierIds: fixture.nativeSupplierIds, challenge: fixture.challenge,
  supplierSendPerformed: false, quoteSubmitted: false, awardCreated: false, orderCreated: false,
  financePostingPerformed: false, productionTouched: false };
let sequence = 0;
function retain() { const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function json(response: APIResponse): Promise<Record<string, unknown>> { try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Expected JSON response from private API'); } }
function captured(response: Response): { key: string; body: string } {
  const key = response.request().headers()['idempotency-key']; const body = response.request().postData();
  if (!guid(key) || !body || body.length > 65536) throw new Error('Bounded RFQ command key/body missing');
  JSON.parse(body); return { key, body };
}
async function login(context: BrowserContext, credential: Credential, id: string) {
  const response = await context.request.post('/api/hrm/auth/login', { data: { email: credential.email, password: credential.password }, failOnStatusCode: false });
  expect(response.status()).toBe(200);
  const me = await context.request.get('/api/hrm/auth/me'); expect(me.status()).toBe(200);
  expect((await json(me)).user).toMatchObject({ id });
  const scope = await context.request.get('/api/procurement/v1/context', { headers: selection });
  expect(scope.status()).toBe(200); expect(await json(scope)).toMatchObject({ tenantId: fixture.tenantId,
    principalId: id, workerId: null, legalEntityId: fixture.companyId });
}
async function logout(context: BrowserContext) {
  const response = await context.request.post('/api/hrm/auth/logout'); expect(response.status()).toBe(200);
  const me = await context.request.get('/api/hrm/auth/me'); expect((await json(me)).authenticated).toBe(false);
  const denied = await context.request.get('/api/procurement/v1/context', { headers: selection });
  expect(denied.status()).toBe(401);
}
async function pageFor(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
    { entityId: fixture.companyId, branch: fixture.branchId });
  return page;
}
async function reload(page: Page) {
  const ready = page.waitForResponse(response => new URL(response.url()).pathname === '/api/procurement/v1/meta', { timeout: 90_000 });
  await page.reload({ waitUntil: 'domcontentloaded' }); expect((await ready).status()).toBe(200);
}

test('buyer and independent Core reviewer publish an RFQ, then record outside contact and quotation Draft', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'login', failed = false, buyerLogged = false, reviewerLogged = false;
  const buyerContext = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  const reviewerContext = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  const progress = (next: string) => { step = next; evidence.step = next; retain(); };
  try {
    await login(buyerContext, buyer, fixture.buyerPrincipalId); buyerLogged = true;
    const meta = await buyerContext.request.get('/api/procurement/v1/meta', { headers: selection });
    expect(meta.status()).toBe(200); expect((await json(meta)).capabilities).toMatchObject({ principalSourcingSourceDrafts: true, principalSourcingPublication: true });
    progress('approved-source');
    const source = await buyerContext.request.get('/api/procurement/v1/sourcing/approved-principal-sources?page=1&pageSize=25', { headers: selection });
    expect(source.status()).toBe(200); const sourceBody = await json(source);
    if (!Array.isArray(sourceBody.items)) throw new Error('Scoped source list missing');
    const candidate = sourceBody.items.find((item: Record<string, unknown>) => item.purchaseRequestId === fixture.approvedRequestId
      && item.purchaseRequestLineId === fixture.approvedRequestLineId) as Record<string, unknown> | undefined;
    expect(candidate?.canSelect).toBe(true);
    const requestNumber = String(candidate!.requestNumber);
    const buyerPage = await pageFor(buyerContext);
    await buyerPage.goto('/procurement/workspace/rfqs/new?source=principal-approved', { waitUntil: 'domcontentloaded' });
    await expect(buyerPage.getByRole('heading', { name: 'Use approved purchase requests', exact: true })).toBeVisible();
    await buyerPage.getByLabel('Find request or item').fill(requestNumber);
    const row = buyerPage.getByRole('row').filter({ hasText: requestNumber });
    await expect(row).toBeVisible(); await row.getByRole('button', { name: 'Add line' }).click();
    const title = `GW-P30-RFQ-COOKIE-${randomUUID()}`; await buyerPage.getByLabel('What are you buying?').fill(title);
    progress('create-draft');
    const createWait = buyerPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/from-approved-principal-sources')
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Create internal draft', exact: true }).click();
    const createdResponse = await createWait; expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as Record<string, unknown>;
    expect(guid(created.eventId)).toBe(true); evidence.browserEventId = created.eventId;
    evidence.create = captured(createdResponse); retain();
    await expect(buyerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await reload(buyerPage); await expect(buyerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    progress('request-publication-review');
    for (const ordinal of [1, 2]) {
      const name = `Private RFQ Supplier ${ordinal}`;
      await buyerPage.getByLabel('Find an approved supplier').fill(name);
      await buyerPage.getByRole('button', { name: 'Search suppliers' }).click();
      const supplierRow = buyerPage.getByRole('row').filter({ hasText: name });
      await expect(supplierRow).toBeVisible(); await supplierRow.getByRole('button', { name: 'Add', exact: true }).click();
    }
    const openWait = buyerPage.waitForResponse(response => /\/principal-publication-reviews$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Request publication review' }).click();
    const opened = await openWait; expect(opened.status()).toBe(201); evidence.open = captured(opened); retain();
    await expect(buyerPage.getByText('Waiting for the assigned independent reviewer.')).toBeVisible();
    progress('independent-review');
    await login(reviewerContext, reviewer, fixture.reviewerPrincipalId); reviewerLogged = true;
    const reviewerPage = await pageFor(reviewerContext);
    await reviewerPage.goto('/procurement/workspace/rfqs?source=principal-approved', { waitUntil: 'domcontentloaded' });
    await expect(reviewerPage.getByText('Publication reviews assigned to me')).toBeVisible();
    await reviewerPage.getByRole('link', { name: 'Review RFQ' }).click();
    await expect(reviewerPage.getByText('Independent publication review')).toBeVisible();
    const decideWait = reviewerPage.waitForResponse(response => /\/decisions$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await reviewerPage.getByRole('button', { name: 'Approve', exact: true }).click();
    const decided = await decideWait; expect(decided.status()).toBe(200); evidence.decide = captured(decided);
    await expect(reviewerPage.getByText('Approved for internal RFQ publication.', { exact: false })).toBeVisible();
    progress('buyer-reload-published');
    await reload(buyerPage); await expect(buyerPage.getByText('Approved for internal RFQ publication.', { exact: false })).toBeVisible();
    await buyerPage.getByRole('tab', { name: 'Related' }).click();
    await buyerPage.getByRole('button', { name: 'Record manual contact' }).first().click();
    await buyerPage.getByRole('combobox', { name: 'Channel' }).click();
    await buyerPage.getByRole('option', { name: 'Email outside ERP' }).click();
    await buyerPage.getByLabel('External reference').fill(`outside-${randomUUID()}`);
    await buyerPage.getByLabel('When contact occurred (your local time)').fill('2026-10-23T12:00');
    progress('manual-contact');
    const contactWait = buyerPage.waitForResponse(response => /\/manual-contact$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Record contact', exact: true }).click();
    const contacted = await contactWait; expect(contacted.status()).toBe(201); evidence.contact = captured(contacted);
    await expect(buyerPage.getByRole('tab', { name: 'Related' })).toHaveAttribute('aria-selected', 'true');
    await buyerPage.getByRole('button', { name: 'Enter quotation Draft' }).first().click();
    await buyerPage.getByLabel('Unit price').fill('0.0001');
    progress('quotation-draft');
    const quoteWait = buyerPage.waitForResponse(response => /\/principal-manual-quotes$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Create quotation Draft' }).click();
    const quoted = await quoteWait; expect(quoted.status()).toBe(201); evidence.quote = captured(quoted);
    const quoteBody = await quoted.json() as Record<string, unknown>; expect(guid(quoteBody.bidId)).toBe(true);
    evidence.browserBidId = quoteBody.bidId;
    await expect(buyerPage.getByRole('button', { name: 'Open Draft' })).toBeVisible();
    await reload(buyerPage); await buyerPage.getByRole('tab', { name: 'Related' }).click();
    await expect(buyerPage.getByRole('button', { name: 'Open Draft' })).toBeVisible();
    evidence.browserJourneyVerified = true; retain();
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain();
  } finally {
    progress('normal-session-logout');
    try { if (buyerLogged) { await logout(buyerContext); evidence.buyerSessionRevoked = true; }
      if (reviewerLogged) { await logout(reviewerContext); evidence.reviewerSessionRevoked = true; } }
    catch { failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain(); }
    if (!failed && evidence.browserJourneyVerified === true && evidence.buyerSessionRevoked === true
      && evidence.reviewerSessionRevoked === true) evidence.status = 'PASS_NORMAL_COOKIE_P30_RFQ_INTERNAL_UI_ONLY';
    retain(); await buyerContext.close().catch(() => undefined); await reviewerContext.close().catch(() => undefined);
    writeFileSync(fixture.completionPath, JSON.stringify({ schemaVersion: 3, challenge: fixture.challenge,
      status: 'BrowserFinished' }) + '\n', { mode: 0o600, flag: 'wx' }); retain();
  }
  if (failed) throw new Error(`Normal-cookie P30 RFQ proof failed at ${step}; inspect protected evidence`);
});
