import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

type Fixture = { tenantId: string; companyId: string; branchId: string; actorId: string; workerId: string; approvedSupplierId: string; database: string; production: false; cliProofComplete: true };
const enabled = !!process.env.CRUD_BROWSER_FIXTURE && !!process.env.CRUD_BROWSER_SOCKET;
test.skip(!enabled, "Opt-in private actual CRUD API fixture and socket are required.");
const fixture: Fixture | null = enabled ? JSON.parse(readFileSync(process.env.CRUD_BROWSER_FIXTURE!, "utf8")) : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefix = `BROWSER-${Date.now()}`;
const tables = { vendor: "suppliers", item: "catalog_items", request: "purchase_requests", invoice: "supplier_invoices", category: "procurement_categories", contract: "supplier_contracts", plan: "procurement_plans" } as const;
function active(): Fixture {
  if (!fixture || fixture.production !== false || fixture.cliProofComplete !== true || !/^procurement_crud_http_[A-Za-z0-9_]+$/.test(fixture.database) || fixture.database.length > 63
    || ![fixture.companyId, fixture.branchId, fixture.actorId, fixture.workerId, fixture.approvedSupplierId].every(id => uuid.test(id))) throw new Error("Validated private fixture required");
  return fixture;
}
/** Independent owning-store observation; fixed allowlisted tables, validated UUID, SELECT only. */
function owner(kind: keyof typeof tables, id: string): Record<string, unknown> {
  const f = active(); if (!uuid.test(id)) throw new Error("Actual response UUID required for owner proof");
  const sql = `SELECT to_jsonb(t)::text FROM procurement.${tables[kind]} t WHERE t.id='${id}'::uuid;`;
  const raw = execFileSync("docker", ["exec", "procurement-approval-rehearsal-postgres", "psql", "-U", "postgres", "-d", f.database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 }).trim();
  if (!raw || raw.includes("\n")) throw new Error("Expected exactly one owned synthetic row");
  const row = JSON.parse(raw) as Record<string, unknown>;
  expect(row.tenant_id).toBe(f.tenantId); expect(row.legal_entity_id).toBe(f.companyId); return row;
}
async function mutation(page: Page, method: string, suffix: string, action: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(suffix) && response.request().method() === method, { timeout: 45000 });
  await action(); const response = await waiting;
  expect(response.status(), `actual ${method} ${suffix}`).toBeGreaterThanOrEqual(200); expect(response.status()).toBeLessThan(300);
  return response.json();
}
function idOf(row: Record<string, unknown>) { expect(typeof row.id).toBe("string"); expect(uuid.test(String(row.id))).toBe(true); return String(row.id); }
async function chooseSupplier(page: Page, label: string) {
  const f = active(); const response = await page.request.get(`/api/procurement/v1/vendors/${f.approvedSupplierId}`, { headers: { "X-Shell-Entity": f.companyId, "X-Shell-Location": f.branchId } });
  expect(response.ok()).toBe(true); const supplier = await response.json() as { displayName: string; status: string };
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: label === "Supplier" ? `${supplier.displayName} (${supplier.status})` : supplier.displayName, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  const f = active(); await page.addInitScript(value => localStorage.setItem("erp.shell.state.v1", JSON.stringify(value)), { entityId: f.companyId, branch: f.branchId });
});

test("actual vendor create, reload, edit and withdrawal retain the owning record", async ({ page }) => {
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name", { exact: true }).fill(`${prefix} Legal`); await page.getByLabel("Display name", { exact: true }).fill(`${prefix} Vendor`);
  const created = await mutation(page, "POST", "/vendors", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `${prefix} Vendor`, exact: true })).toBeVisible(); await page.reload();
  await page.getByRole("link", { name: "Edit vendor", exact: true }).click(); await page.getByLabel("Display name", { exact: true }).fill(`${prefix} Vendor Revised`);
  await mutation(page, "PUT", `/vendors/${id}`, () => page.getByRole("button", { name: "Save vendor details", exact: true }).click());
  await expect(page.getByRole("status").filter({hasText:"Vendor details saved"})).toBeVisible();
  await page.getByRole("link",{name:"Cancel",exact:true}).click();
  await expect(page.getByRole("heading", { name: `${prefix} Vendor Revised`, exact: true })).toBeVisible(); await page.reload();
  expect(owner("vendor", id).display_name).toBe(`${prefix} Vendor Revised`);
  page.once("dialog", dialog => dialog.accept("Browser retained withdrawal"));
  await mutation(page, "POST", `/vendors/${id}/withdraw`, () => page.getByRole("button", { name: "Withdraw draft", exact: true }).click());
  expect(owner("vendor", id).status).toBe("Withdrawn");
});

test("actual inactive catalog draft create and edit retain values without fabricated activation", async ({ page }) => {
  await page.goto("/procurement/workspace/items/new"); await page.getByLabel("Item name", { exact: true }).fill(`${prefix} Item`); await page.getByLabel("Item code", { exact: true }).fill(`${prefix}-ITEM`); await page.getByLabel("Category code", { exact: true }).fill("SYNTHETIC");
  const created = await mutation(page, "POST", "/items", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `${prefix} Item`, exact: true })).toBeVisible(); await page.reload();
  await page.getByRole("link", { name: "Edit item", exact: true }).click(); await page.getByLabel("Item name", { exact: true }).fill(`${prefix} Item Revised`);
  await mutation(page, "PUT", `/items/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click());
  await expect(page.getByRole("heading", { name: `${prefix} Item Revised`, exact: true })).toBeVisible(); await page.reload();
  const row = owner("item", id); expect(row.name).toBe(`${prefix} Item Revised`); expect(row.status).toBe("Inactive");
});

test("actual request draft create, edit and withdrawal preserve source rows", async ({ page }) => {
  await page.goto("/procurement/workspace/requests/new"); await page.getByLabel("What do you need?", { exact: true }).fill(`${prefix} Request`); await page.getByLabel("Item or service 1", { exact: true }).fill("Actual draft supplies"); await page.getByLabel("Quantity", { exact: true }).fill("2"); await page.getByLabel("Estimated unit price", { exact: true }).fill("10");
  const created = await mutation(page, "POST", "/requests", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `${prefix} Request`, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("link", { name: "Edit request", exact: true }).click(); await page.getByLabel("Quantity", { exact: true }).fill("3");
  await mutation(page, "PUT", `/requests/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click());
  await expect(page.getByRole("heading", { name: `${prefix} Request`, exact: true })).toBeVisible(); await expect(page.getByRole("cell", { name: "3", exact: true })).toBeVisible(); await page.reload();
  // P19 stores amounts on lines, not an estimated_amount header column.
  const requestLines = JSON.parse(execFileSync("docker", ["exec", "procurement-approval-rehearsal-postgres", "psql", "-U", "postgres", "-d", active().database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
    `SELECT jsonb_agg(jsonb_build_object('quantity',requested_quantity,'price',estimated_unit_price))::text FROM procurement.purchase_request_lines WHERE purchase_request_id='${id}'::uuid;`], { encoding: "utf8", timeout: 15000 }).trim());
  expect(requestLines).toEqual([{ quantity: 3, price: 10 }]);
  await page.getByRole("textbox", { name: /^Reason(?:\s|$)/ }).fill("Browser draft withdrawn"); await mutation(page, "POST", `/requests/${id}/withdraw`, () => page.getByRole("button", { name: "Withdraw request", exact: true }).click());
  expect(owner("request", id).status).toBe("Withdrawn");
});

test("actual invoice create, exact edit and cancellation survive refresh and owner inspection", async ({ page }) => {
  await page.goto("/procurement/workspace/bills/new"); await chooseSupplier(page, "Vendor"); await page.getByLabel("Invoice number", { exact: true }).fill(`${prefix}-INV`); await page.getByLabel("Description 1", { exact: true }).fill("Actual invoice supplies"); await page.getByLabel("Unit price", { exact: true }).fill("10.1234");
  const created = await mutation(page, "POST", "/invoices", () => page.getByRole("button", { name: "Record as received", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `Invoice ${prefix}-INV`, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("link", { name: "Edit invoice", exact: true }).click(); await page.getByLabel("Unit price", { exact: true }).fill("12.3456"); await page.getByLabel("Reason for change", { exact: true }).fill("Correct received original");
  await mutation(page, "PUT", `/invoices/${id}`, () => page.getByRole("button", { name: "Save changes", exact: true }).click());
  await expect(page.getByRole("heading", { name: `Invoice ${prefix}-INV`, exact: true })).toBeVisible(); await page.reload(); expect(owner("invoice", id).gross_amount).toBe(12.3456);
  await page.getByLabel("Cancellation reason", { exact: true }).fill("Browser invoice cancellation"); page.once("dialog", dialog => dialog.accept()); await mutation(page, "POST", `/invoices/${id}/cancel`, () => page.getByRole("button", { name: "Cancel invoice", exact: true }).click());
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible(); await page.reload(); const row = owner("invoice", id); expect(row.status).toBe("Cancelled"); expect(row.gross_amount).toBe(12.3456); expect(row.branch_ref).toBe(active().branchId);
});

test("actual category create, edit and draft retirement are persisted", async ({ page }) => {
  await page.goto("/procurement/workspace/settings/reference-data"); await page.getByRole("button", { name: "Add category", exact: true }).first().click(); await page.getByRole("textbox", { name: "Code", exact: true }).fill(`${prefix}-CAT`); await page.getByLabel("Name", { exact: true }).fill(`${prefix} Category`);
  const created = await mutation(page, "POST", "/configuration/categories", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await page.reload(); const row = page.getByRole("row").filter({ hasText: `${prefix} Category` }); await row.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByLabel("Name", { exact: true }).fill(`${prefix} Category Revised`);
  await mutation(page, "PUT", `/configuration/categories/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click()); await page.reload();
  await page.getByRole("row").filter({ hasText: `${prefix} Category Revised` }).getByRole("button", { name: "Remove", exact: true }).click(); await page.getByLabel("Removal reason", { exact: true }).fill("Browser unused draft retirement");
  await mutation(page, "POST", `/configuration/categories/${id}/retire`, () => page.getByRole("button", { name: "Remove category", exact: true }).click()); const retained = owner("category", id); expect(retained.status).toBe("Retired"); expect(retained.name).toBe(`${prefix} Category Revised`);
});

test("actual plan draft create, edit and cancel retain planned needs", async ({ page }) => {
  await page.goto("/procurement/workspace/plans/new"); await page.getByLabel("Financial period", { exact: true }).fill(`${prefix} Plan`); await page.getByLabel("Need 1", { exact: true }).fill("Browser planned desks"); await page.getByLabel("Estimated amount", { exact: true }).fill("100");
  const created = await mutation(page, "POST", "/plans", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `${prefix} Plan`, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("link", { name: "Edit draft", exact: true }).click(); await page.getByLabel("Estimated amount", { exact: true }).fill("125");
  await mutation(page, "PUT", `/plans/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click()); await expect(page.getByRole("heading", { name: `${prefix} Plan`, exact: true })).toBeVisible(); await expect(page.getByRole("cell", { name: "ZMW 125.00", exact: true })).toBeVisible(); await page.reload(); await page.getByRole("textbox", { name: /^Reason(?:\s|$)/ }).fill("Browser planned need cancelled");
  await mutation(page, "POST", `/plans/${id}/cancel`, () => page.getByRole("button", { name: "Cancel draft", exact: true }).click()); expect(owner("plan", id).status).toBe("Cancelled");
});

test("actual contract draft create, edit and cancel retain commercial values", async ({ page }) => {
  await page.goto("/procurement/workspace/contracts/new"); await chooseSupplier(page, "Supplier"); await page.getByLabel("Contract title", { exact: true }).fill(`${prefix} Contract`); await page.getByLabel("Spending limit", { exact: true }).fill("100");
  const created = await mutation(page, "POST", "/contracts", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = idOf(created);
  await expect(page.getByRole("heading", { name: `${prefix} Contract`, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("link", { name: "Edit draft", exact: true }).click(); await page.getByLabel("Spending limit", { exact: true }).fill("125");
  await mutation(page, "PUT", `/contracts/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click()); await expect(page.getByRole("heading", { name: `${prefix} Contract`, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("textbox", { name: /^Reason(?:\s|$)/ }).fill("Browser commercial draft cancelled");
  await mutation(page, "POST", `/contracts/${id}/cancel`, () => page.getByRole("button", { name: "Cancel draft", exact: true }).click()); const row = owner("contract", id); expect(row.status).toBe("Cancelled"); expect(row.ceiling_amount).toBe(125);
});
