import { test, expect, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Credential = { principalId: string; email: string; password: string };
type Fixture = { schemaVersion: 1; controlPlaneOnly: true; apiUrl: string; database: string; tenantId: string;
  companyId: string; branchId: string; makerPrincipalId: string; checkerPrincipalId: string;
  approverPrincipalId: string; configurationMakerPrincipalId: string; syntheticCredentials: Credential[];
  expiresAt: string; browserAuthenticationRequired: string };
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
function privateFile(name: string): string {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected input missing');
  return value;
}
const fixtureBytes = readFileSync(privateFile('P25_COOKIE_FIXTURE'));
if (fixtureBytes.length > 65536) throw new Error('Invalid protected fixture');
let fixture: Fixture;
try { fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture; }
catch { throw new Error('Malformed protected fixture'); }
const proxy = JSON.parse(readFileSync(privateFile('P25_COOKIE_PROXY_RECEIPT'), 'utf8'));
if (fixture.schemaVersion !== 1 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || proxy.database !== fixture.database
  || fixture.database !== process.env.P25_COOKIE_EXPECTED_DATABASE
  || ![fixture.companyId, fixture.branchId, fixture.makerPrincipalId, fixture.checkerPrincipalId,
    fixture.approverPrincipalId, fixture.configurationMakerPrincipalId].every(guid)
  || !Number.isFinite(Date.parse(fixture.expiresAt)) || Date.parse(fixture.expiresAt) <= Date.now())
  throw new Error('Actual unexpired normal-cookie fixture required');
const credential = (id: string): Credential => {
  const found = fixture.syntheticCredentials.filter(value => value.principalId === id);
  if (found.length !== 1 || !found[0].email || !found[0].password)
    throw new Error('Exact synthetic account missing');
  return found[0];
};
const output = process.env.P25_COOKIE_BROWSER_RESULT!;
if (!output || !path.isAbsolute(output) || existsSync(output)) throw new Error('New protected browser result required');
const evidence: Record<string, unknown> = { schemaVersion: 1, status: 'RUNNING_NOT_ACCEPTANCE',
  authentication: 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE', apiSetupAuthentication: 'PRIVATE_SUBJECT_TEST_AUTH_ONLY',
  transport: 'normal-local-cookie-https-v1', fixtureSha256: proxy.fixtureSha256, proxyIndexSha256: proxy.indexSha256,
  database: fixture.database, tenantId: fixture.tenantId, companyId: fixture.companyId,
  branchId: fixture.branchId, fullApprovalFlowVerified: false, externalFinanceAuthority: false,
  nativeIdentityProviderVerified: false, ownerCompletionVerified: false, productionTouched: false };
let sequence = 0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output);
}
async function api(action: () => Promise<APIResponse>): Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private API transport failed'); }
}
async function json(response: APIResponse): Promise<Record<string, any>> {
  try { return await response.json(); } catch { throw new Error('Private API returned invalid JSON'); }
}
const selection = { 'X-Shell-Entity': fixture.companyId, 'X-Shell-Location': fixture.branchId };
async function login(context: BrowserContext, principal: string) {
  const account = credential(principal);
  const response = await api(() => context.request.post('/api/hrm/auth/login', {
    data: { email: account.email, password: account.password }, failOnStatusCode: false,
  }));
  expect(response.status()).toBe(200);
  const me = await api(() => context.request.get('/api/hrm/auth/me'));
  expect(me.status()).toBe(200);
  expect((await json(me)).user?.id).toBe(principal);
  const current = await api(() => context.request.get('/api/procurement/v1/context', { headers: selection }));
  expect(current.status()).toBe(200);
  const scope = await json(current);
  expect(scope).toMatchObject({ tenantId: fixture.tenantId, principalId: principal,
    workerId: null, legalEntityId: fixture.companyId });
  expect(scope.branch?.id).toBe(fixture.branchId);
  return scope;
}
async function pageFor(context: BrowserContext, route: string, heading: string): Promise<Page> {
  const page = await context.newPage();
  // The selected company/branch has already been checked against the current
  // cookie by /context; this stores only a candidate shell selection.
  await page.addInitScript(value => localStorage.setItem('erp.shell.state.v1', JSON.stringify(value)),
    { entityId: fixture.companyId, branch: fixture.branchId });
  await page.goto(`/procurement/workspace${route}`);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.getElementById('erp-global-preloader');
    return !overlay || getComputedStyle(overlay).display === 'none'
      || getComputedStyle(overlay).pointerEvents === 'none';
  })).toBe(true);
  return page;
}
async function mutation(page: Page, method: string, suffix: string, action: () => Promise<unknown>) {
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(suffix)
    && response.request().method() === method);
  await action();
  const response = await waiting;
  expect(response.status()).toBe(method === 'POST' && (suffix === '/requests' || suffix.endsWith('/approval-cases') || suffix.endsWith('/budget-checks')) ? 201 : 200);
  return { response, body: await json(response) };
}

// No route interception, private subject headers, fixture cookies, business
// responses, browser transaction store, or Finance authority is introduced.
test('normal cookie users complete a real Core-only purchase request approval', async ({ browser }) => {
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off'
    || test.info().project.use.video !== 'off') throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step = 'published-policy'; let failed = false;
  const contexts: BrowserContext[] = [];
  try {
    const configuration = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true }); contexts.push(configuration);
    const configurationScope = await login(configuration, fixture.configurationMakerPrincipalId);
    expect(configurationScope.permissions).toEqual(expect.arrayContaining([
      'procurement-configuration-read', 'procurement-request-read', 'procurement-policy-evaluate',
    ]));
    const effective = await api(() => configuration.request.get(
      '/api/procurement/v1/configuration/policies/effective?key=PURCHASE_REQUEST', { headers: selection }));
    expect(effective.status()).toBe(200);
    const policy = await json(effective);
    expect(policy.status).toBe('Valid'); expect(guid(policy.policy?.id)).toBe(true);
    evidence.publishedPolicyId = policy.policy.id; evidence.publishedPolicyVersion = policy.policy.policyVersionNumber;
    retain();

    step = 'maker-create-submit';
    const maker = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true }); contexts.push(maker);
    const makerScope = await login(maker, fixture.makerPrincipalId);
    expect(makerScope.permissions).toEqual(expect.arrayContaining(['procurement-request-create', 'procurement-request-submit', 'procurement-approval-open']));
    const makerPage = await pageFor(maker, '/requests', 'My Requests');
    await makerPage.getByRole('link', { name: 'New request', exact: true }).first().click();
    await expect(makerPage.getByRole('heading', { name: 'New request', exact: true })).toBeVisible();
    const purpose = `GW-P25-APPROVAL-${randomUUID()}`;
    const needed = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await makerPage.getByLabel('What do you need?', { exact: true }).fill(purpose);
    await makerPage.getByLabel('Needed by').first().fill(needed);
    await makerPage.getByLabel('Item or service 1', { exact: true }).fill('Private P25 approval supplies');
    await makerPage.getByLabel('Quantity', { exact: true }).fill('2');
    await makerPage.getByLabel('Estimated unit price', { exact: true }).fill('5.1234');
    await makerPage.getByLabel('Category', { exact: true }).fill('PRIVATE_P25');
    const created = await mutation(makerPage, 'POST', '/requests', () => makerPage.getByRole('button', { name: 'Save draft', exact: true }).click());
    expect(guid(created.body.id)).toBe(true);
    expect(created.body.requesterPrincipalId).toBe(fixture.makerPrincipalId);
    expect(created.body.requesterWorkerId).toBeNull();
    expect(created.body.lines?.[0]?.exactAmounts).toMatchObject({ requestedQuantity: '2', estimatedUnitPrice: '5.1234' });
    const requestId = created.body.id as string;
    evidence.requestId = requestId; evidence.createdVersion = created.body.version; retain();
    await expect(makerPage.getByRole('heading', { name: purpose, exact: true })).toBeVisible();
    const submitted = await mutation(makerPage, 'POST', `/requests/${requestId}/submit`, () =>
      makerPage.getByRole('button', { name: 'Send for review', exact: true }).click());
    expect(submitted.body.status).toBe('Submitted');
    evidence.submittedVersion = submitted.body.version; retain();

    step = 'independent-buying-rule-check';
    const policyPage = await pageFor(configuration, '/procurement-requests', 'Purchase Requests');
    const policyRow = policyPage.getByRole('row').filter({ hasText: purpose });
    await expect(policyRow).toBeVisible();
    const evaluated = await mutation(policyPage, 'POST', `/requests/${requestId}/policy-evaluations`, () =>
      policyRow.getByRole('button', { name: 'Check buying rules' }).click());
    expect(evaluated.body.requestId).toBe(requestId);
    expect(evaluated.body.requestVersion).toBe(submitted.body.version);
    expect(evaluated.body.status).toBe('Matched');
    expect(guid(evaluated.body.evaluation?.id)).toBe(true);
    evidence.policyEvaluationId = evaluated.body.evaluation.id; retain();

    step = 'independent-finance-check';
    const checker = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true }); contexts.push(checker);
    const checkerScope = await login(checker, fixture.checkerPrincipalId);
    expect(checkerScope.permissions).toContain('procurement-budget-check');
    const financePage = await pageFor(checker, '/budgets', 'Budget checks');
    const row = financePage.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await expect(row).toContainText('10.2468');
    await row.getByRole('button', { name: 'Review funding' }).click();
    await expect(financePage.getByText('Minimum Finance amount:', { exact: false })).toContainText('10.2468');
    await financePage.getByLabel('Exact amount checked').fill('10.2468');
    const financeRef = `PRIVATE-P25-BROWSER-CHECK-${randomUUID()}`;
    await financePage.getByLabel('Finance check reference').fill(financeRef);
    await financePage.getByLabel('Evidence reference').fill('private-fixture:human-recorded-manual-evidence-only');
    await financePage.getByLabel('Confirmed Finance reservation reference').fill(`PRIVATE-P25-BROWSER-RESERVE-${randomUUID()}`);
    const checked = await mutation(financePage, 'POST', `/requests/${requestId}/budget-checks`, () =>
      financePage.getByRole('button', { name: 'Save Finance check' }).click());
    expect(checked.response.request().postDataJSON().checkedAmount).toBe('10.2468');
    expect(checked.body.checkedAmountExact).toBe('10.2468');
    expect(checked.body.checkedBySubjectId).toBe(fixture.checkerPrincipalId);
    expect(checked.body.checkedByWorkerId).toBeNull();
    evidence.financeCheckId = checked.body.id; evidence.checkedAmountExact = checked.body.checkedAmountExact; retain();

    step = 'maker-open-approval';
    await makerPage.reload();
    await expect(makerPage.getByText('Finance confirmed funds for this request')).toBeVisible();
    const ready = await api(() => maker.request.get(`/api/procurement/v1/requests/${requestId}/approval-readiness`, { headers: selection }));
    expect(ready.status()).toBe(200);
    const readiness = await json(ready);
    expect(readiness.canOpenCase).toBe(true);
    expect(readiness.blockers).toEqual([]);
    const opened = await mutation(makerPage, 'POST', `/requests/${requestId}/approval-cases`, () =>
      makerPage.getByRole('button', { name: 'Start approvals', exact: true }).click());
    expect(guid(opened.body.caseId)).toBe(true);
    expect(opened.body.requestId).toBe(requestId);
    expect(opened.body.state).toBe('Pending');
    const caseId = opened.body.caseId as string;
    evidence.caseId = caseId; evidence.openedVersion = opened.body.requestVersion; retain();

    step = 'independent-approver';
    const approver = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true }); contexts.push(approver);
    const approverScope = await login(approver, fixture.approverPrincipalId);
    expect(approverScope.permissions).toEqual(expect.arrayContaining(['procurement-approval-read', 'procurement-approval-decide']));
    const approvalPage = await pageFor(approver, '/approvals', 'Approvals');
    const assigned = approvalPage.getByRole('row').filter({ hasText: purpose });
    await expect(assigned).toBeVisible();
    await assigned.getByRole('link', { name: 'Review request' }).click();
    await expect(approvalPage.getByRole('heading', { name: created.body.number, exact: true })).toBeVisible();
    await approvalPage.getByRole('button', { name: 'Approve', exact: true }).click();
    const approved = await mutation(approvalPage, 'POST', '/decisions', () =>
      approvalPage.getByRole('dialog').getByRole('button', { name: 'Confirm decision' }).click());
    expect(approved.body.caseId).toBe(caseId);
    expect(approved.body.requestId).toBe(requestId);
    expect(approved.body.state).toBe('Approved');
    expect(approved.body.requestState).toBe('Approved');
    evidence.decisionId = approved.body.decisionId; evidence.approvedVersion = approved.body.requestVersion; retain();

    step = 'reload-approved-source';
    await makerPage.reload();
    await expect(makerPage.getByRole('heading', { name: purpose, exact: true })).toBeVisible();
    await expect(makerPage.getByText('Approved', { exact: true }).first()).toBeVisible();
    const reloaded = await api(() => maker.request.get(`/api/procurement/v1/requests/${requestId}`, { headers: selection }));
    expect(reloaded.status()).toBe(200);
    const source = await json(reloaded);
    expect(source.status).toBe('Approved');
    expect(source.requesterPrincipalId).toBe(fixture.makerPrincipalId);
    expect(source.requesterWorkerId).toBeNull();
    evidence.status = 'PASS_NORMAL_COOKIE_APPROVAL_UI_ONLY'; evidence.browserApprovalJourneyVerified = true;
    retain();
  } catch { failed = true; evidence.status = 'FAILED_RETAIN_FIXTURE'; evidence.failedStep = step; }
  finally {
    for (const context of contexts.reverse()) await context.close().catch(() => undefined);
    retain();
  }
  if (failed) throw new Error(`Normal-cookie approval proof failed at ${step}; inspect protected typed result and owning-store evidence`);
});
