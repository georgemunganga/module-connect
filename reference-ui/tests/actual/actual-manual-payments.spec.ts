import { expect, test, type Page, type Response } from '@playwright/test';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const enabled = !!process.env.PAYMENT_BROWSER_FIXTURE && !!process.env.PAYMENT_BROWSER_SOCKET;
test.skip(!enabled, 'A private payment browser fixture and actual local API socket are required.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Person = { role: string; principalId: string; Email: string; Password: string };
type Fixture = { fixtureTenant: string; companyId: string; branchId: string;
  otherBranchId: string; invoiceId: string; people: Person[] };
const roles = ['maker', 'approver', 'recorder', 'confirmer', 'policy_author', 'policy_publisher', 'outsider'];
function privateFixture(): Fixture {
  const file = process.env.PAYMENT_BROWSER_FIXTURE;
  if (!file || !path.isAbsolute(file) || realpathSync(file) !== file || !statSync(file).isFile()
    || (statSync(file).mode & 0o077)) throw new Error('An owner-private payment fixture is required');
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid payment fixture');
  const f = data as Fixture;
  if (!/^payment-http-[0-9a-f]{16}$/.test(f.fixtureTenant)
    || ![f.companyId, f.branchId, f.otherBranchId, f.invoiceId].every(value => uuid.test(value))
    || f.branchId === f.otherBranchId || !Array.isArray(f.people) || f.people.length !== roles.length
    || new Set(f.people.map(person => person.role)).size !== roles.length
    || !roles.every(role => f.people.some(person => person.role === role))
    || !f.people.every(person => uuid.test(person.principalId)
      && person.Email === `${person.role}.${f.fixtureTenant}@example.invalid`
      && typeof person.Password === 'string' && person.Password.length >= 20))
    throw new Error('Invalid synthetic payment fixture');
  return f;
}
const fixture = enabled ? privateFixture() : null;
function f(): Fixture { if (!fixture) throw new Error('Private payment fixture unavailable'); return fixture; }
function person(role: string): Person {
  const result = f().people.find(value => value.role === role);
  if (!result) throw new Error('Private payment role unavailable');
  return result;
}
async function login(page: Page, role: string, record = '/payments') {
  const account = person(role);
  const response = await page.request.post('/api/hrm/auth/login', {
    data: { email: account.Email, password: account.Password }, failOnStatusCode: false,
  });
  expect(response.status(), `real Core login for ${role}`).toBe(200);
  const context = await page.request.get('/api/procurement/v1/context', {
    headers: { 'X-Shell-Entity': f().companyId }, failOnStatusCode: false,
  });
  expect(context.status(), `real Procurement context for ${role}`).toBe(200);
  const scope = await context.json() as { principalId?: string; legalEntityId?: string; workerId?: string | null };
  expect(scope).toMatchObject({ principalId: account.principalId, legalEntityId: f().companyId, workerId: null });
  await page.goto(`/procurement/workspace${record}`);
}
async function mutation(page: Page, method: string, suffix: string, action: () => Promise<unknown>): Promise<Response> {
  const waiting = page.waitForResponse(response => response.request().method() === method
    && new URL(response.url()).pathname.endsWith(suffix), { timeout: 45_000 });
  await action();
  const result = await waiting;
  expect(result.status(), `real ${method} ${suffix}`).toBeGreaterThanOrEqual(200);
  expect(result.status()).toBeLessThan(300);
  return result;
}

// No route interception, synthetic identity headers, fixture storage injection or
// browser-side transaction stores: each step goes through the actual local host.
test('real cookie roles complete one independently reviewed manual payment', async ({ page }) => {
  await login(page, 'maker');
  await expect(page.getByRole('heading', { name: 'Payments Made' })).toBeVisible();
  await page.getByRole('link', { name: 'New manual payment request' }).click();
  await expect(page.getByRole('heading', { name: 'New Manual Payment Request' })).toBeVisible();
  // The shell stays at company/all-branches. The owning request chooses a branch.
  await page.getByRole('combobox', { name: 'Transaction branch *' }).click();
  await page.getByRole('option', { name: 'Synthetic purchase branch (PAY-A)' }).click();
  await page.getByRole('combobox', { name: 'Bill to Pay *' }).click();
  await page.getByRole('option', { name: /PAY-HTTP-001.*Synthetic payment supplier/ }).click();
  await page.getByLabel('Request title').fill('Private browser manual payment');
  await page.getByLabel('Exact amount *').fill('1.0001');
  await page.getByLabel('Purpose / notes').fill('Actual browser acceptance against a synthetic supplier bill');
  for (const [role, label] of [
    ['approve', 'Approver *'], ['record', 'Recorder *'], ['confirm', 'Confirmer *'],
  ] as const) {
    await page.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: `Synthetic ${role === 'approve' ? 'approver' : role === 'record' ? 'recorder' : 'confirmer'}` }).click();
  }
  const created = await mutation(page, 'POST', '/manual-payments', () =>
    page.getByRole('button', { name: 'Save as Draft' }).click());
  const createBody = created.request().postDataJSON() as Record<string, unknown>;
  expect(createBody.branchId).toBe(f().branchId);
  expect(createBody.invoiceId).toBe(f().invoiceId);
  expect(createBody.amount).toBe('1.0001');
  expect(created.request().headers()['x-shell-location']).toBeUndefined();
  const receipt = await created.json() as { id?: string; status?: string };
  expect(uuid.test(String(receipt.id))).toBe(true);
  expect(receipt.status).toBe('Draft');
  const id = String(receipt.id);
  await expect(page.getByRole('heading', { name: 'Private browser manual payment' })).toBeVisible();
  await page.getByRole('link', { name: 'Payments Made' }).click();
  const listed = page.getByRole('row').filter({ hasText: 'Private browser manual payment' });
  await expect(listed).toBeVisible();
  await listed.getByRole('link').first().click();
  await page.reload();
  await expect(page.getByText('ZMW 1.0001', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Edit draft' }).click();
  await page.getByLabel('Exact amount *').fill('2.0001');
  const revised = await mutation(page, 'PUT', `/manual-payments/${id}`, () =>
    page.getByRole('button', { name: 'Save as Draft' }).click());
  expect((await revised.json() as { version: number }).version).toBe(2);
  await page.reload();
  await expect(page.getByText('ZMW 2.0001', { exact: true }).first()).toBeVisible();
  const submitted = await mutation(page, 'POST', `/manual-payments/${id}/submit`, () =>
    page.getByRole('button', { name: 'Submit for review' }).click().then(() =>
      page.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click()));
  expect((await submitted.json() as { status: string }).status).toBe('PendingApproval');

  await login(page, 'approver', `/payments/${id}`);
  const approved = await mutation(page, 'POST', `/manual-payments/${id}/approve`, () =>
    page.getByRole('button', { name: 'Approve', exact: true }).first().click().then(() =>
      page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click()));
  expect((await approved.json() as { status: string }).status).toBe('Approved');

  await login(page, 'recorder', `/payments/${id}`);
  await page.getByRole('button', { name: 'Record external payment' }).click();
  const paidOn = await page.getByLabel('External payment date *').inputValue();
  expect(paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByLabel('External method *').fill('Synthetic external transfer');
  await page.getByLabel('External reference *').fill('PRIVATE-BROWSER-REF');
  const recorded = await mutation(page, 'POST', `/manual-payments/${id}/record`, () =>
    page.getByRole('button', { name: 'Record evidence' }).click());
  expect((await recorded.json() as { status: string }).status).toBe('PaymentRecorded');
  expect((recorded.request().postDataJSON() as { amount?: string }).amount).toBe('2.0001');

  await login(page, 'confirmer', `/payments/${id}`);
  const confirmed = await mutation(page, 'POST', `/manual-payments/${id}/confirm`, () =>
    page.getByRole('button', { name: 'Confirm manually' }).click().then(() =>
      page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()));
  expect((await confirmed.json() as { status: string }).status).toBe('ConfirmedManually');
  await expect(page.getByText('Manually confirmed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Paid', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Core review history')).toBeVisible();
  const detail = await page.request.get(`/api/procurement/v1/manual-payments/${id}`, {
    headers: { 'X-Shell-Entity': f().companyId }, failOnStatusCode: false });
  expect(detail.status()).toBe(200);
  expect((await detail.json() as { request: { status: string } }).request.status).toBe('ConfirmedManually');
});

test('real policy author and publisher return, revise and publish explicit future payment limits', async ({ page }) => {
  const settings = '/settings/modules/payments-made/approvals';
  // Two UTC days ahead leaves publication time to complete even near midnight.
  const effectiveDay = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await login(page, 'policy_author', settings);
  await expect(page.getByRole('heading', { name: 'Payments Made settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Add draft' }).click();
  await page.getByLabel('Effective from (UTC)').fill(effectiveDay);
  await page.getByLabel('Currency 1').fill('ZMW');
  await page.getByLabel('Maximum bill amount 1').fill('100.0000');
  const created = await mutation(page, 'POST', '/configuration/policies', () =>
    page.getByRole('button', { name: 'Save draft' }).click());
  const input = created.request().postDataJSON() as { policyKey: string; rulesJson: string };
  expect(input.policyKey).toBe('MANUAL_PAYMENT_REVIEW');
  expect(JSON.parse(input.rulesJson)).toMatchObject({ schemaVersion: 1, identitySchemaVersion: 2,
    approvalType: 'SingleApprover', independentCreatorApprover: true,
    independentRecorderConfirmer: true, maximumByCurrency: { ZMW: '100.0000' } });
  const draft = await created.json() as { id: string; version: number; state: string };
  expect(uuid.test(draft.id)).toBe(true);
  expect(draft.state).toBe('Draft');
  const policyId = draft.id;
  const row = () => page.getByRole('row').filter({ hasText: effectiveDay });
  await expect(row()).toBeVisible();
  await row().getByRole('button', { name: 'Send for review' }).click();
  await page.getByLabel('Reason').fill('Private review of an explicit future limit');
  const submitted = await mutation(page, 'POST', `/configuration/policies/${policyId}/submit-review`, () =>
    page.getByRole('button', { name: 'Confirm review' }).click());
  expect((await submitted.json() as { state: string }).state).toBe('PendingReview');

  await login(page, 'policy_publisher', settings);
  await expect(row().getByRole('button', { name: 'Return' })).toBeVisible();
  await row().getByRole('button', { name: 'Return' }).click();
  await page.getByLabel('Reason').fill('Confirm the final exact amount before publication');
  const returned = await mutation(page, 'POST', `/configuration/policies/${policyId}/return-for-changes`, () =>
    page.getByRole('button', { name: 'Confirm return' }).click());
  expect((await returned.json() as { state: string }).state).toBe('Draft');

  await login(page, 'policy_author', settings);
  await row().getByRole('button', { name: 'Edit draft' }).click();
  await expect(page.getByLabel('Maximum bill amount 1')).toHaveValue('100.0000');
  await page.getByLabel('Maximum bill amount 1').fill('1000.0000');
  const revised = await mutation(page, 'PUT', `/configuration/policies/${policyId}`, () =>
    page.getByRole('button', { name: 'Save draft' }).click());
  expect((await revised.json() as { rulesJson: string }).rulesJson).toContain('"ZMW":"1000.0000"');
  await row().getByRole('button', { name: 'Send for review' }).click();
  await page.getByLabel('Reason').fill('Final exact future limit for independent review');
  const resubmitted = await mutation(page, 'POST', `/configuration/policies/${policyId}/submit-review`, () =>
    page.getByRole('button', { name: 'Confirm review' }).click());
  expect((await resubmitted.json() as { state: string }).state).toBe('PendingReview');

  await login(page, 'policy_publisher', settings);
  await row().getByRole('button', { name: 'Publish' }).click();
  await page.getByLabel('Reason').fill('Independent publication of explicit future ZMW ceiling');
  const published = await mutation(page, 'POST', `/configuration/policies/${policyId}/publish`, () =>
    page.getByRole('button', { name: 'Confirm publish' }).click());
  expect((await published.json() as { state: string; effectiveFrom: string }).state).toBe('Published');
  await expect(row().getByText('Published')).toBeVisible();
  const effective = await page.request.get('/api/procurement/v1/configuration/policies/effective?key=MANUAL_PAYMENT_REVIEW', {
    headers: { 'X-Shell-Entity': f().companyId }, failOnStatusCode: false });
  expect(effective.status()).toBe(200);
  // The policy begins in the future; it is not today's payment authority.
  expect((await effective.json() as { policy: { id: string } | null }).policy?.id).not.toBe(policyId);
});
