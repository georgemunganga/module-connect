import { expect, test, type Page } from '@playwright/test';

const company = '11111111-1111-4111-8111-111111111111';
const branch = '22222222-2222-4222-8222-222222222222';
const author = '33333333-3333-4333-8333-333333333333';
const publisher = '44444444-4444-4444-8444-444444444444';
const policy = '55555555-5555-4555-8555-555555555555';
const effectiveDay = '2026-11-01';
const settings = '/procurement/workspace/settings/modules/payments-made/approvals';
const baseCapabilities = ['vendorDraft', 'itemDraft', 'requestDraft', 'approvals', 'sourcing',
  'contracts', 'orders', 'receiving', 'invoiceValidation', 'financeHandoff',
  'supplierPortal', 'planningDraft', 'configurationDraft', 'contractDraft', 'sourcingDraft'];

async function fixture(page: Page, failCreate = false) {
  let actor = author, record: Record<string, unknown> | null = null;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(({ company, branch }) => localStorage.setItem('erp.shell.state.v1',
    JSON.stringify({ entityId: company, branch })), { company, branch });
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/hrm/auth/me') return json({ authenticated: true, user: { isActive: true, roles: [] } });
    if (path === '/api/hrm/branding') return json({ displayName: 'Synthetic company' });
    if (path === '/api/hrm/admin/legal-entities') return json({ items: [{ id: company, registeredName: 'Synthetic company' }] });
    if (path === '/api/hrm/admin/locations') return json({ items: [{ id: branch, name: 'Synthetic branch', legalEntityId: company }] });
    if (path === '/api/hrm/shell/') return json({ assignedLocationIds: [branch], confined: true });
    if (path === '/api/procurement/v1/context') return json({ tenantId: 'synthetic', legalEntityId: company,
      principalId: actor, workerId: null, company: { id: company, currencyCode: 'ZMW' },
      permissions: ['procurement-access', 'procurement-configuration-read',
        actor === author ? 'procurement-configuration-edit' : 'procurement-configuration-approve'] });
    if (path === '/api/procurement/v1/meta') return json({ tenantId: 'synthetic', legalEntityId: company,
      schemaReady: true, capabilities: Object.fromEntries([...baseCapabilities, 'manualPaymentWorkflow']
        .map(key => [key, true])) });
    if (path === '/api/procurement/v1/configuration/policies/effective')
      return json({ status: 'Missing', isAuthority: false, policy: null });
    if (path === '/api/procurement/v1/configuration/policies/validate') {
      const rules = JSON.parse(String((request.postDataJSON() as { rulesJson: string }).rulesJson));
      const ready = rules.maximumByCurrency?.ZMW === '100.0000' || rules.maximumByCurrency?.ZMW === '1000.0000';
      return json({ isValid: ready, issues: ready ? [] : [{ path: '$', message: 'Set an exact limit.' }],
        reviewReady: ready, reviewIssues: ready ? [] : [{ path: '$', message: 'Set an exact limit.' }] });
    }
    if (path === '/api/procurement/v1/configuration/policies' && request.method() === 'GET') {
      const current = record as Record<string, unknown> | null;
      return json({ items: current ? [{ id: current.id, policyKey: current.policyKey,
        policyVersionNumber: current.policyVersionNumber, state: current.state,
        effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo,
        version: current.version, createdAt: current.createdAt }] : [],
        total: current ? 1 : 0, page: 1, pageSize: 100 });
    }
    if (path === `/api/procurement/v1/configuration/policies/${policy}` && request.method() === 'GET')
      return json(record ?? { code: 'not-found' }, record ? 200 : 404);
    if (path.startsWith('/api/procurement/v1/configuration/policies') && request.method() !== 'GET') {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, body });
      if (failCreate && request.method() === 'POST' && path.endsWith('/policies')) return route.abort('failed');
      if (path.endsWith('/policies')) {
        record = { ...body, id: policy, policyVersionNumber: 2, state: 'Draft',
          version: 1, createdAt: '2026-10-23T12:00:00Z' };
        return json(record, 201);
      }
      if (!record) return json({ code: 'not-found' }, 404);
      const current = record as Record<string, unknown>;
      if (request.method() === 'PUT') record = { ...current, ...(body.draft as object), version: Number(current.version) + 1 };
      else record = { ...current, version: Number(current.version) + 1,
        state: path.endsWith('/submit-review') ? 'PendingReview'
          : path.endsWith('/publish') ? 'Published' : 'Draft' };
      return json(record);
    }
    return json({ code: 'not-found' }, 404);
  });
  return { writes, as: async (next: 'author' | 'publisher') => {
    actor = next === 'author' ? author : publisher;
    await page.goto(settings);
  } };
}

test('payment review settings require exact limits and separate author/publisher decisions', async ({ page }) => {
  const scope = await fixture(page);
  await scope.as('author');
  await expect(page.getByRole('heading', { name: 'Payments Made settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Add draft' }).click();
  await page.getByLabel('Effective from (UTC)').fill(effectiveDay);
  await page.getByLabel('Currency 1').fill('ZMW');
  await page.getByLabel('Maximum bill amount 1').fill('100.0000');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Send for review' })).toBeVisible();
  const rules = JSON.parse(String(scope.writes.find(write => write.path.endsWith('/policies'))?.body.rulesJson));
  expect(rules).toMatchObject({ approvalType: 'SingleApprover', identitySchemaVersion: 2,
    independentCreatorApprover: true, independentRecorderConfirmer: true,
    maximumByCurrency: { ZMW: '100.0000' } });
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByLabel('Reason').fill('Independent review required');
  await page.getByRole('button', { name: 'Confirm review' }).click();
  await expect(page.getByRole('button', { name: 'Send for review' })).toHaveCount(0);
  await scope.as('publisher');
  await page.getByRole('button', { name: 'Return' }).click();
  await page.getByLabel('Reason').fill('Raise the explicit ceiling');
  await page.getByRole('button', { name: 'Confirm return' }).click();
  await scope.as('author');
  await page.getByRole('button', { name: 'Edit draft' }).click();
  await page.getByLabel('Maximum bill amount 1').fill('1000.0000');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByLabel('Reason').fill('Final exact ceiling');
  await page.getByRole('button', { name: 'Confirm review' }).click();
  await scope.as('publisher');
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByLabel('Reason').fill('Independent publication');
  await page.getByRole('button', { name: 'Confirm publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  expect(scope.writes.map(write => write.path.split('/').at(-1))).toEqual([
    'validate', 'policies', 'submit-review', 'return-for-changes', 'validate', policy,
    'submit-review', 'publish']);
});

test('an interrupted policy create stays blocked and is not retried with a new command', async ({ page }) => {
  const scope = await fixture(page, true);
  await scope.as('author');
  await page.getByRole('button', { name: 'Add draft' }).click();
  await page.getByLabel('Effective from (UTC)').fill(effectiveDay);
  await page.getByLabel('Currency 1').fill('ZMW');
  await page.getByLabel('Maximum bill amount 1').fill('100.0000');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('A policy change has no confirmed result', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  expect(scope.writes.filter(write => write.path.endsWith('/policies'))).toHaveLength(1);
});
