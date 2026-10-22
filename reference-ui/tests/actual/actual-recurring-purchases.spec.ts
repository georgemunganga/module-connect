import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { actualCrudEnabled, actualFixture, actualId, actualMutation, actualShell, approvedSupplier } from "./actual-crud-helpers";

const api = "/api/procurement/v1/recurring-purchases";
const workspace = "/procurement/workspace/recurring-bills";
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
test.use({ trace: "on", screenshot: "only-on-failure" });
test.skip(!actualCrudEnabled, "Explicit private actual API fixture/socket required; never production");
function fixture() {
  const f = actualFixture(), planner = f.actors?.recurringPlanner, denied = f.actors?.systemReviewer;
  if (f.fixtureKind !== "recurring-purchases-v1" || f.browserActorSwitch !== "manifest-alias-v1"
    || !planner || !denied || !guid.test(planner.principalId) || planner.workerId !== null
    || !guid.test(denied.principalId) || denied.workerId !== null || !f.otherBranchId || !guid.test(f.otherBranchId)
    || f.otherBranchId === f.branchId || !f.defaultCurrencyCode || !/^[A-Z]{3}$/.test(f.defaultCurrencyCode)
    || new Set([f.actorId, planner.principalId, denied.principalId]).size !== 3)
    throw new Error("Actual Core-only recurring planner, denied actor and branch proof manifest required");
  return { ...f, planner, denied, otherBranchId: f.otherBranchId, currencyCode: f.defaultCurrencyCode };
}
async function plannerPage(browser: Browser) {
  const context = await browser.newContext({ acceptDownloads: true,
    extraHTTPHeaders: { "X-Crud-Browser-Actor": "recurringPlanner" } });
  const page = await context.newPage(); await actualShell(page);
  const f = fixture(), response = await page.request.get("/api/procurement/v1/context", { headers: headers() });
  expect(response.status()).toBe(200);
  const current = await response.json();
  expect(current).toMatchObject({ principalId: f.planner.principalId, workerId: null, legalEntityId: f.companyId });
  for (const action of ["procurement-access", "procurement-recurring-read", "procurement-recurring-create", "procurement-recurring-edit"])
    expect(current.permissions).toContain(action);
  return { context, page };
}
function headers(branch = fixture().branchId) { return { "X-Shell-Entity": fixture().companyId, "X-Shell-Location": branch }; }
function sql(query: string): Record<string, unknown> {
  const f = fixture();
  const raw = execFileSync("docker", ["exec", "procurement-approval-rehearsal-postgres", "psql", "-U", "postgres", "-d", f.database,
    "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 }).trim();
  if (!raw || raw.includes("\n")) throw new Error("Exactly one independent private owning proof required");
  return JSON.parse(raw) as Record<string, unknown>;
}
/** Fixed-table, validated synthetic UUID/title SELECT only. No API or fixture database writes. */
function proof(id: string) {
  const f = fixture(); if (!guid.test(id)) throw new Error("Actual recurring UUID required");
  const value = sql(`SELECT jsonb_build_object('row',to_jsonb(r),'exact',r.expected_amount::text,'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM procurement.audit_events a WHERE a.record_id=r.id AND a.tenant_id=r.tenant_id AND a.legal_entity_id=r.legal_entity_id),'[]'::jsonb),'outbox',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM procurement.outbox_events e WHERE e.aggregate_id=r.id AND e.tenant_id=r.tenant_id AND e.legal_entity_id=r.legal_entity_id),'[]'::jsonb))::text FROM procurement.recurring_purchase_commitments r WHERE r.id='${id}'::uuid;`);
  expect(value.row).toMatchObject({ tenant_id: f.tenantId, legal_entity_id: f.companyId,
    owner_principal_id: f.planner.principalId, owner_worker_id: null, work_location_id: f.branchId });
  return value;
}
function financeFootprint() {
  return sql("SELECT jsonb_build_object('invoices',(SELECT count(*) FROM procurement.supplier_invoices),'orders',(SELECT count(*) FROM procurement.purchase_orders),'handoffs',(SELECT count(*) FROM procurement.finance_invoice_handoffs),'payments',(SELECT count(*) FROM procurement.finance_payment_status_refs),'budgets',(SELECT count(*) FROM procurement.budget_check_snapshots))::text;");
}
async function fill(page: Page, title: string) {
  const supplier = await approvedSupplier(page);
  await page.goto(workspace + "/new");
  await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: `${supplier.displayName} (${supplier.status})`, exact: true }).click();
  await page.getByLabel("Purchase name", { exact: true }).fill(title);
  await page.getByLabel("Expected each time", { exact: true }).fill("12345678901234.5678");
  await page.getByLabel("First expected date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Next expected date", { exact: true }).fill("2026-11-01");
}
function draft(row: Record<string, unknown>) {
  return { supplierId: row.supplierId, supplierContractId: row.supplierContractId, title: row.title,
    frequency: row.frequency, firstCycleOn: row.firstCycleOn, lastCycleOn: row.lastCycleOn,
    nextCycleOn: row.nextCycleOn, currencyCode: row.currencyCode, expectedAmount: row.exactExpectedAmount };
}

test("actual Core-only recurring planner creates, reloads, edits, consumes a no-op revision and closes with independent scope denials", async ({ page: maker, browser }, info) => {
  test.setTimeout(240_000);
  const f = fixture(), beforeFinance = financeFootprint(), { context, page } = await plannerPage(browser);
  const requests: string[] = []; page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/procurement/")) requests.push(request.url()); });
  try {
    const title = `RECURRING-BROWSER-${randomUUID().toUpperCase()}`;
    await fill(page, title);
    const created = await actualMutation(page, "POST", "/recurring-purchases", () => page.getByRole("button", { name: "Save recurring purchase", exact: true }).click());
    const id = actualId(created);
    expect(created).toMatchObject({ title, ownerPrincipalId: f.planner.principalId, ownerWorkerId: null,
      workLocationId: f.branchId, currencyCode: f.defaultCurrencyCode, exactExpectedAmount: "12345678901234.5678", status: "Draft", version: 1 });
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText(`${f.currencyCode} 12345678901234.5678`, { exact: true })).toBeVisible();
    expect(proof(id).exact).toBe("12345678901234.5678");
    const beforeDenials = proof(id);
    // Default actor has separately proven actual read/edit grants; 404 is ownership, not missing permission.
    const makerContext = await maker.request.get("/api/procurement/v1/context", { headers: headers() });
    expect(makerContext.status()).toBe(200);
    const makerFacts = await makerContext.json();
    expect(makerFacts.principalId).toBe(f.actorId);
    for (const permission of ["procurement-recurring-read", "procurement-recurring-edit"]) expect(makerFacts.permissions).toContain(permission);
    expect((await maker.request.get(`${api}/${id}`, { headers: headers() })).status()).toBe(404);
    expect((await maker.request.put(`${api}/${id}`, { headers: headers(), data: { version: 1, draft: draft(created) } })).status()).toBe(404);
    expect([403, 404]).toContain((await page.request.get(`${api}/${id}`, { headers: headers(f.otherBranchId) })).status());
    const deniedContext = await browser.newContext({ extraHTTPHeaders: { "X-Crud-Browser-Actor": "systemReviewer" } });
    try {
      const denied = await deniedContext.request.get("/api/procurement/v1/context", { headers: headers() });
      expect(denied.status()).toBe(200); const facts = await denied.json();
      expect(facts.principalId).toBe(f.denied.principalId); expect(facts.permissions).not.toContain("procurement-recurring-read");
      expect((await deniedContext.request.get(api, { headers: headers() })).status()).toBe(403);
      expect((await deniedContext.request.post(api, { headers: headers(), data: draft(created) })).status()).toBe(403);
    } finally { await deniedContext.close(); }
    expect(proof(id)).toEqual(beforeDenials);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.getByLabel("Expected each time", { exact: true }).fill("5.1234");
    const edited = await actualMutation(page, "PUT", `/recurring-purchases/${id}`, () => page.getByRole("button", { name: "Save recurring purchase", exact: true }).click());
    expect(edited).toMatchObject({ id, exactExpectedAmount: "5.1234", version: 2, ownerPrincipalId: f.planner.principalId });
    await expect(page.getByText(`${f.currencyCode} 5.1234`, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    const noOp = await actualMutation(page, "PUT", `/recurring-purchases/${id}`, () => page.getByRole("button", { name: "Save recurring purchase", exact: true }).click());
    expect(noOp).toMatchObject({ id, exactExpectedAmount: "5.1234", version: 3 });
    await page.getByLabel("Reason", { exact: true }).fill("Actual browser repeat purchase ended");
    const closed = await actualMutation(page, "POST", `/recurring-purchases/${id}/close`, () => page.getByRole("button", { name: "Close schedule", exact: true }).click());
    expect(closed).toMatchObject({ id, version: 4, status: "Closed", closedReason: "Actual browser repeat purchase ended" });
    await page.reload(); await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close schedule", exact: true })).toHaveCount(0);
    const retained = proof(id); expect(retained.row).toMatchObject({ status: "Closed", version: 4 });
    expect(retained.exact).toBe("5.1234");
    expect((retained.audit as Array<Record<string, unknown>>).filter(row => ["PlanCreated", "PlanUpdated", "PlanClosed"].includes(String(row.action))).map(row => row.action)).toEqual(["PlanCreated", "PlanUpdated", "PlanUpdated", "PlanClosed"]);
    const beforeClosedDenial = proof(id);
    expect((await page.request.put(`${api}/${id}`, { headers: headers(), data: { version: 4, draft: draft(noOp) } })).status()).toBe(409);
    expect(proof(id)).toEqual(beforeClosedDenial);
    expect(financeFootprint()).toEqual(beforeFinance);
    expect(requests.some(url => /\/handoff|\/payments|post-to-finance/.test(url))).toBe(false);
    writeFileSync(info.outputPath("recurring-retained-proof.json"), JSON.stringify({ id, created, edited, noOp, closed, retained, financeUnchanged: true }, null, 2) + "\n", { mode: 0o600 });
  } finally { await context.close(); }
});

test("actual persisted201 lost only at browser delivery remains blocked after reload with no second POST", async ({ browser }, info) => {
  test.setTimeout(180_000);
  const f = fixture(), beforeFinance = financeFootprint(), { context, page } = await plannerPage(browser);
  const title = `RECURRING-LOST-${randomUUID().toUpperCase()}`;
  let postCount = 0, acknowledged: Record<string, unknown> | null = null;
  try {
    // This is transport fault injection AFTER the actual private API committed and returned201.
    // No generated business response, idempotency key, retry or mutation is supplied by the test.
    await page.route(`**${api}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      postCount += 1;
      const real = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 60_000 });
      expect(real.status()).toBe(201); acknowledged = await real.json();
      await route.abort("failed");
    });
    await fill(page, title);
    await page.getByRole("button", { name: "Save recurring purchase", exact: true }).click();
    await expect(page.getByText("The save result was not confirmed.", { exact: false })).toBeVisible();
    expect(acknowledged).not.toBeNull();
    const saved = acknowledged as unknown as Record<string, unknown>, id = actualId(saved);
    expect(saved).toMatchObject({ ownerPrincipalId: f.planner.principalId, ownerWorkerId: null, title, version: 1 });
    await page.reload();
    await expect(page.getByText("The save result was not confirmed.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save recurring purchase", exact: true })).toBeDisabled();
    expect(postCount).toBe(1);
    const observed = await page.request.get(`${api}/${id}`, { headers: headers() });
    expect(observed.status()).toBe(200); expect(await observed.json()).toMatchObject({ id, title, version: 1 });
    // Read-only manual reconciliation does not clear the new-write session marker.
    await page.reload(); await expect(page.getByRole("button", { name: "Save recurring purchase", exact: true })).toBeDisabled();
    expect(postCount).toBe(1);
    const retained = proof(id);
    const count = sql(`SELECT jsonb_build_object('count',count(*))::text FROM procurement.recurring_purchase_commitments WHERE title='${title}' AND owner_principal_id='${f.planner.principalId}'::uuid;`);
    expect(count.count).toBe(1); expect(retained.exact).toBe("12345678901234.5678");
    expect(financeFootprint()).toEqual(beforeFinance);
    writeFileSync(info.outputPath("recurring-lost-delivery-proof.json"), JSON.stringify({ actualAcknowledgement: saved, retained,
      postCount, sameTitleRowCount: count.count, serverIdempotencyClaim: false, manualReadDoesNotUnlock: true }, null, 2) + "\n", { mode: 0o600 });
  } finally { await context.close(); }
});
