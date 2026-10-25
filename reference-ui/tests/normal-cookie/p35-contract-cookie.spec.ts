import { expect, test, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 1; controlPlaneOnly: true; apiUrl: string; database: string;
  tenantId: string; companyId: string; branchId: string; buyerPrincipalId: string; reviewerPrincipalId: string;
  supplierId: string; nativeContractId: string; policyId: string; syntheticCredentials: Credential[];
  challenge: string; completionPath: string; expiresAt: string; browserAuthenticationRequired: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
function protectedFile(name: string) {
  const file = process.env[name];
  if (!file || !path.isAbsolute(file) || realpathSync(file) !== file || !lstatSync(file).isFile()
    || (lstatSync(file).mode & 0o777) !== 0o600) throw new Error('Protected P35 input required');
  return file;
}
const fixtureBytes = readFileSync(protectedFile('P35_CONTRACT_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Bounded P35 fixture required');
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture;
const proxy = JSON.parse(readFileSync(protectedFile('P35_CONTRACT_COOKIE_PROXY_RECEIPT'), 'utf8'));
const output = process.env.P35_CONTRACT_COOKIE_BROWSER_RESULT;
if (fixture.schemaVersion !== 1 || fixture.controlPlaneOnly !== true || proxy.schemaVersion !== 1
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || fixture.database !== process.env.P35_CONTRACT_COOKIE_EXPECTED_DATABASE
  || !/^proc_p35_http_contract_review_[a-z0-9_]{1,24}$/.test(fixture.database)
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || !output || !path.isAbsolute(output) || existsSync(output)
  || (statSync(path.dirname(output)).mode & 0o777) !== 0o700
  || ![fixture.companyId, fixture.branchId, fixture.buyerPrincipalId, fixture.reviewerPrincipalId,
    fixture.supplierId, fixture.nativeContractId, fixture.policyId].every(guid)
  || !Array.isArray(fixture.syntheticCredentials) || fixture.syntheticCredentials.length !== 10
  || !/^[a-f0-9]{64}$/.test(fixture.challenge) || !path.isAbsolute(fixture.completionPath)
  || existsSync(fixture.completionPath) || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Date.parse(fixture.expiresAt) <= Date.now()) throw new Error('Fresh P35 cookie fixture required');
const account = (principalId: string) => {
  const matches = fixture.syntheticCredentials.filter(value => value.principalId === principalId);
  if (matches.length !== 1 || !matches[0].email || !matches[0].password) throw new Error('Exact synthetic account missing');
  return matches[0];
};
const buyer = account(fixture.buyerPrincipalId), reviewer = account(fixture.reviewerPrincipalId);
if (buyer.principalId === reviewer.principalId) throw new Error('Independent reviewer required');
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
const evidence: Record<string, unknown> = { schemaVersion: 1, status: 'RUNNING_NOT_ACCEPTANCE',
  fixtureSha256: proxy.fixtureSha256, database: fixture.database, challenge: fixture.challenge,
  buyerPrincipalId: fixture.buyerPrincipalId, reviewerPrincipalId: fixture.reviewerPrincipalId,
  contractReviewUiVerified: false, signaturesPerformed: false, contractsActivated: false,
  financePostingPerformed: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output!);
}
async function json(response: APIResponse): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new Error('Private API returned invalid JSON'); }
}
function capture(response: Response, allowed: readonly string[]) {
  const raw = response.request().postData();
  const key = response.request().headers()['idempotency-key'];
  if (!raw || raw.length > 65536 || !guid(key)) throw new Error('Bounded original review command required');
  const body = JSON.parse(raw) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(name => !allowed.includes(name))) throw new Error('Unexpected review command fields');
  return { key, raw, body };
}
async function login(context: BrowserContext, principal: Credential) {
  const response = await context.request.post('/api/hrm/auth/login',
    { data: { email: principal.email, password: principal.password }, failOnStatusCode: false });
  expect(response.status()).toBe(200);
  const me = await context.request.get('/api/hrm/auth/me');
  expect(me.status()).toBe(200); expect((await json(me)).user).toMatchObject({ id: principal.principalId });
  const scope = await context.request.get('/api/procurement/v1/context', { headers: selection });
  expect(scope.status()).toBe(200);
  expect(await json(scope)).toMatchObject({ tenantId: fixture.tenantId, principalId: principal.principalId,
    workerId: null, legalEntityId: fixture.companyId });
  const meta = await context.request.get('/api/procurement/v1/meta', { headers: selection });
  expect(meta.status()).toBe(200);
  expect((await json(meta)).capabilities).toMatchObject({ contractDraft: true, contractDraftRates: true,
    contractInternalReview: true });
}
async function logout(context: BrowserContext) {
  expect((await context.request.post('/api/hrm/auth/logout')).status()).toBe(200);
  expect((await json(await context.request.get('/api/hrm/auth/me'))).authenticated).toBe(false);
  expect((await context.request.get('/api/procurement/v1/context', { headers: selection })).status()).toBe(401);
}
async function readyPage(context: BrowserContext, route: string) {
  const page = await context.newPage();
  await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
    { entityId: fixture.companyId, branch: fixture.branchId });
  await page.goto('/procurement/workspace' + route, { waitUntil: 'domcontentloaded' });
  return page;
}
async function saved(page: Page, pathname: string, action: () => Promise<void>) {
  const waited = page.waitForResponse(response => new URL(response.url()).pathname === pathname
    && response.request().method() === 'POST', { timeout: 90_000 });
  await action(); const response = await waited;
  expect([200, 201]).toContain(response.status());
  return response;
}
async function original(context: BrowserContext, key: string, contractId: string, operation: string,
  posted: Response) {
  const response = await context.request.get(`/api/procurement/v1/contracts/internal-review/commands/${key}`,
    { headers: selection });
  expect(response.status()).toBe(posted.status());
  expect(await json(response)).toMatchObject({ ContractId: contractId, CommandKey: key, Operation: operation });
  expect(await response.text()).toBe(await posted.text());
}
async function contractState(context: BrowserContext, contractId: string, expected: string) {
  const response = await context.request.get(`/api/procurement/v1/contracts/${contractId}`, { headers: selection });
  expect(response.status()).toBe(200);
  const value = await json(response);
  expect(value).toMatchObject({ id: contractId, status: expected, supplierId: fixture.supplierId });
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 1) throw new Error('Current contract version required');
  return Number(value.version);
}

// Real browser sessions and persisted ERP commands only. The fixture's private subject setup is not used here.
test('buyer and independent reviewer complete an internal contract review with normal cookies', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe browser capture must be disabled');
  retain(); let step = 'login', failed = false, buyerIn = false, reviewerIn = false;
  const buyerContext = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  const reviewerContext = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  const progress = (value: string) => { step = value; evidence.step = value; retain(); };
  try {
    buyerIn = true; await login(buyerContext, buyer);
    reviewerIn = true; await login(reviewerContext, reviewer);
    progress('create-draft');
    const supplierResponse = await buyerContext.request.get(`/api/procurement/v1/vendors/${fixture.supplierId}`,
      { headers: selection });
    expect(supplierResponse.status()).toBe(200);
    const supplier = await json(supplierResponse);
    if (supplier.id !== fixture.supplierId || typeof supplier.displayName !== 'string'
      || !supplier.displayName.trim() || typeof supplier.status !== 'string'
      || !['Draft', 'Active', 'Approved'].includes(supplier.status)
      || supplier.status !== 'Draft' && supplier.isOrderable !== true)
      throw new Error('Retained eligible supplier label required');
    const buyerPage = await readyPage(buyerContext, '/contracts/new');
    await expect(buyerPage.getByRole('heading', { name: 'New contract' })).toBeVisible();
    await buyerPage.getByLabel('Search suppliers').fill(supplier.displayName);
    await buyerPage.getByRole('combobox', { name: 'Supplier' }).click();
    await buyerPage.getByRole('option',
      { name: `${supplier.displayName} (${supplier.status})`, exact: true }).click();
    await buyerPage.getByLabel('Contract title').fill('Private browser review agreement');
    await buyerPage.getByRole('combobox', { name: 'Contract type' }).click();
    await buyerPage.getByRole('option', { name: 'Framework agreement', exact: true }).click();
    await buyerPage.getByLabel('Spending limit').fill('100.0001');
    await buyerPage.getByLabel('Currency').fill('ZMW');
    const today = new Date();
    await buyerPage.getByLabel('Starts on').fill(today.toISOString().slice(0, 10));
    today.setUTCDate(today.getUTCDate() + 30);
    await buyerPage.getByLabel('Expires on').fill(today.toISOString().slice(0, 10));
    const createWait = buyerPage.waitForResponse(response => new URL(response.url()).pathname === '/api/procurement/v1/contracts'
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Save draft' }).click();
    const createdResponse = await createWait; expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as Record<string, unknown>;
    if (!guid(created.id) || created.id === fixture.nativeContractId || created.supplierId !== fixture.supplierId
      || created.status !== 'Draft' || !Number.isSafeInteger(created.version)) throw new Error('New owned draft mismatch');
    const contractId = created.id;
    evidence.contractId = contractId; evidence.createBody = createdResponse.request().postData(); retain();
    await expect(buyerPage).toHaveURL(new RegExp(`/contracts/${contractId}$`));
    progress('add-rate');
    await buyerPage.getByRole('button', { name: 'Add rate' }).click();
    await buyerPage.getByLabel('Description').fill('Browser review supply');
    await buyerPage.getByLabel('Unit').fill('unit');
    await buyerPage.getByLabel('Unit price').fill('5.1234');
    await buyerPage.getByLabel('Maximum quantity (optional)').fill('2.0001');
    const rateWait = buyerPage.waitForResponse(response => /\/contracts\/[^/]+\/rates$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await buyerPage.getByRole('button', { name: 'Save rate' }).click();
    const rateResponse = await rateWait; expect([200, 201]).toContain(rateResponse.status());
    expect(rateResponse.request().postDataJSON()).toMatchObject({ contractVersion: created.version,
      rate: { unitPrice: '5.1234', maximumQuantity: '2.0001' } });
    evidence.rateBody = rateResponse.request().postData(); retain();
    const beforeSubmit = await contractState(buyerContext, contractId, 'Draft');
    const submitPath = `/api/procurement/v1/contracts/${contractId}/internal-review/submit`;
    progress('submit');
    const submit = await saved(buyerPage, submitPath,
      () => buyerPage.getByRole('button', { name: 'Submit for internal review' }).click());
    const first = capture(submit, ['expectedContractVersion', 'reviewBranchId']);
    expect(first.body).toMatchObject({ expectedContractVersion: beforeSubmit, reviewBranchId: fixture.branchId });
    const firstAck = await submit.json() as Record<string, unknown>;
    expect(firstAck).toMatchObject({ ContractId: contractId, ActorPrincipalId: fixture.buyerPrincipalId,
      CommandKey: first.key, Operation: 'Submit', contractStatus: 'PendingReview' });
    evidence.firstSubmit = first; retain(); await original(buyerContext, first.key, contractId, 'Submit', submit);
    const pendingVersion = await contractState(buyerContext, contractId, 'PendingReview');
    progress('independent-return');
    const reviewerPage = await readyPage(reviewerContext, '/contracts/internal-review');
    const row = reviewerPage.getByRole('row').filter({ has: reviewerPage.locator(`a[href*="${contractId}"]`) });
    await expect(row.getByRole('link', { name: 'Open review' })).toBeVisible();
    await row.getByRole('link', { name: 'Open review' }).click();
    const assignmentUrl = new URL(reviewerPage.url());
    const assignmentId = assignmentUrl.pathname.split('/').at(-1);
    if (!guid(assignmentId) || !assignmentUrl.pathname.includes(contractId)) throw new Error('Wrong reviewer assignment');
    await expect(reviewerPage.getByRole('heading', { name: 'Private browser review agreement' })).toBeVisible();
    const assignment = await reviewerContext.request.get(
      `/api/procurement/v1/contracts/${contractId}/internal-review/assignments/${assignmentId}`, { headers: selection });
    expect(assignment.status()).toBe(200);
    const assigned = await json(assignment);
    expect(assigned).toMatchObject({ ContractId: contractId, assignmentId,
      contractVersion: pendingVersion, ReviewBranchId: fixture.branchId });
    await reviewerPage.getByLabel('Reason for Return or Reject').fill('Correct the private browser terms');
    const decidePath = `/api/procurement/v1/contracts/${contractId}/internal-review/assignments/${assignmentId}/decide`;
    const returned = await saved(reviewerPage, decidePath,
      () => reviewerPage.getByRole('button', { name: 'Return for correction' }).click());
    const returnCommand = capture(returned,
      ['expectedContractVersion', 'expectedCaseVersion', 'expectedAssignmentVersion', 'action', 'reason']);
    expect(returnCommand.body).toMatchObject({ action: 'Return', expectedContractVersion: pendingVersion,
      expectedCaseVersion: assigned.caseVersion, expectedAssignmentVersion: assigned.assignmentVersion });
    expect(await returned.json()).toMatchObject({ ContractId: contractId,
      ActorPrincipalId: fixture.reviewerPrincipalId, CommandKey: returnCommand.key, contractStatus: 'Returned' });
    evidence.returnDecision = returnCommand; retain(); await original(reviewerContext, returnCommand.key, contractId, 'Decide', returned);
    const returnedVersion = await contractState(buyerContext, contractId, 'Returned');
    progress('buyer-correction');
    await buyerPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(buyerPage.getByText('Returned', { exact: true }).first()).toBeVisible();
    await buyerPage.getByLabel('Correction reason').fill('Revised the private browser terms');
    const correctionPath = `/api/procurement/v1/contracts/${contractId}/internal-review/correct`;
    const correction = await saved(buyerPage, correctionPath,
      () => buyerPage.getByRole('button', { name: 'Return to draft for correction' }).click());
    const corrected = capture(correction, ['expectedContractVersion', 'reason']);
    expect(corrected.body.expectedContractVersion).toBe(returnedVersion);
    expect(await correction.json()).toMatchObject({ ContractId: contractId,
      ActorPrincipalId: fixture.buyerPrincipalId, CommandKey: corrected.key, contractStatus: 'Draft' });
    evidence.correction = corrected; retain(); await original(buyerContext, corrected.key, contractId, 'Correction', correction);
    await contractState(buyerContext, contractId, 'Draft');
    await buyerPage.reload({ waitUntil: 'domcontentloaded' });
    await buyerPage.getByRole('link', { name: 'Edit draft' }).click();
    await buyerPage.getByLabel('Contract title').fill('Private browser corrected agreement');
    const updateWait = buyerPage.waitForResponse(response => new URL(response.url()).pathname === `/api/procurement/v1/contracts/${contractId}`
      && response.request().method() === 'PUT');
    await buyerPage.getByRole('button', { name: 'Save draft' }).click();
    const updated = await updateWait; expect(updated.status()).toBe(200);
    expect(updated.request().postDataJSON()).toMatchObject({ draft: { supplierId: fixture.supplierId,
      title: 'Private browser corrected agreement', ceilingAmount: '100.0001' } });
    evidence.revisionBody = updated.request().postData(); retain();
    await expect(buyerPage).toHaveURL(new RegExp(`/contracts/${contractId}$`));
    const beforeResubmit = await contractState(buyerContext, contractId, 'Draft');
    progress('resubmit');
    const resubmitted = await saved(buyerPage, submitPath,
      () => buyerPage.getByRole('button', { name: 'Submit for internal review' }).click());
    const second = capture(resubmitted, ['expectedContractVersion', 'reviewBranchId']);
    if (second.key === first.key) throw new Error('New submission must use its own command key');
    expect(second.body).toMatchObject({ expectedContractVersion: beforeResubmit, reviewBranchId: fixture.branchId });
    const secondAck = await resubmitted.json() as Record<string, unknown>;
    expect(secondAck).toMatchObject({ ContractId: contractId, ActorPrincipalId: fixture.buyerPrincipalId,
      CommandKey: second.key, contractStatus: 'PendingReview' });
    if (!guid(secondAck.SubmissionId) || secondAck.SubmissionId === firstAck.SubmissionId)
      throw new Error('Resubmission must own a fresh submission');
    evidence.secondSubmit = second; retain(); await original(buyerContext, second.key, contractId, 'Submit', resubmitted);
    const secondPendingVersion = await contractState(buyerContext, contractId, 'PendingReview');
    progress('independent-approve');
    await reviewerPage.goto('/procurement/workspace/contracts/internal-review', { waitUntil: 'domcontentloaded' });
    const secondRow = reviewerPage.getByRole('row').filter({ has: reviewerPage.locator(`a[href*="${contractId}"]`) });
    await expect(secondRow.getByRole('link', { name: 'Open review' })).toBeVisible();
    await secondRow.getByRole('link', { name: 'Open review' }).click();
    const finalAssignmentId = new URL(reviewerPage.url()).pathname.split('/').at(-1);
    if (!guid(finalAssignmentId) || finalAssignmentId === assignmentId) throw new Error('Fresh review assignment required');
    const finalAssignment = await reviewerContext.request.get(
      `/api/procurement/v1/contracts/${contractId}/internal-review/assignments/${finalAssignmentId}`, { headers: selection });
    expect(finalAssignment.status()).toBe(200);
    const finalAssigned = await json(finalAssignment);
    expect(finalAssigned).toMatchObject({ ContractId: contractId, assignmentId: finalAssignmentId,
      contractVersion: secondPendingVersion, ReviewBranchId: fixture.branchId });
    const approved = await saved(reviewerPage,
      `/api/procurement/v1/contracts/${contractId}/internal-review/assignments/${finalAssignmentId}/decide`,
      () => reviewerPage.getByRole('button', { name: 'Approve internal review' }).click());
    const approveCommand = capture(approved,
      ['expectedContractVersion', 'expectedCaseVersion', 'expectedAssignmentVersion', 'action', 'reason']);
    expect(approveCommand.body).toMatchObject({ action: 'Approve', expectedContractVersion: secondPendingVersion,
      expectedCaseVersion: finalAssigned.caseVersion, expectedAssignmentVersion: finalAssigned.assignmentVersion });
    expect(await approved.json()).toMatchObject({ ContractId: contractId,
      ActorPrincipalId: fixture.reviewerPrincipalId, CommandKey: approveCommand.key, contractStatus: 'Approved' });
    evidence.approveDecision = approveCommand; retain(); await original(reviewerContext, approveCommand.key, contractId, 'Decide', approved);
    await contractState(buyerContext, contractId, 'Approved');
    evidence.contractReviewUiVerified = true; retain();
  } catch {
    failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; retain();
  } finally {
    for (const [name, context, signedIn] of [
      ['buyer', buyerContext, buyerIn], ['reviewer', reviewerContext, reviewerIn],
    ] as const) {
      if (!signedIn) continue;
      try { await logout(context); evidence[`${name}SessionRevoked`] = true; }
      catch { failed = true; evidence[`${name}SessionRevoked`] = false; }
      retain();
    }
    if (!failed && evidence.contractReviewUiVerified === true
      && evidence.buyerSessionRevoked === true && evidence.reviewerSessionRevoked === true)
      evidence.status = 'PASS_NORMAL_COOKIE_P35_INTERNAL_REVIEW_UI_ONLY';
    retain();
    await buyerContext.close().catch(() => undefined);
    await reviewerContext.close().catch(() => undefined);
    writeFileSync(fixture.completionPath,
      JSON.stringify({ schemaVersion: 1, challenge: fixture.challenge, status: 'BrowserFinished' }) + '\n',
      { mode: 0o600, flag: 'wx' });
    retain();
  }
  if (failed) throw new Error(`P35 normal-cookie browser proof failed at ${step}; inspect protected evidence`);
});
