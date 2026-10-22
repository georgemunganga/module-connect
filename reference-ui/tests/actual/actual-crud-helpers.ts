import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
export const actualCrudEnabled = !!process.env.CRUD_BROWSER_FIXTURE && !!process.env.CRUD_BROWSER_SOCKET;
type Fixture = { tenantId: string; companyId: string; branchId: string; actorId: string; workerId: string | null; approvedSupplierId: string; database: string; production: false; cliProofComplete: true };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function actualFixture(): Fixture {
  if (!actualCrudEnabled) throw new Error("Explicit private actual API fixture required");
  const value = JSON.parse(readFileSync(process.env.CRUD_BROWSER_FIXTURE!, "utf8")) as Fixture;
  if (value.production !== false || value.cliProofComplete !== true || !/^procurement_crud_http_[A-Za-z0-9_]+$/.test(value.database) || value.database.length > 63
    || ![value.companyId,value.branchId,value.actorId,value.approvedSupplierId].every(id => guid.test(id))
    || value.workerId !== null && !guid.test(value.workerId)) throw new Error("Actual private fixture invalid");
  return value;
}
export async function actualShell(page: Page) {
  const f = actualFixture(); await page.addInitScript(value => localStorage.setItem("erp.shell.state.v1", JSON.stringify(value)), { entityId: f.companyId, branch: f.branchId });
}
export async function actualMutation(page: Page, method: string, suffix: string, action: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(suffix) && response.request().method() === method, { timeout: 45000 });
  await action(); const response = await waiting; expect(response.status(), `actual ${method} ${suffix}`).toBeGreaterThanOrEqual(200); expect(response.status()).toBeLessThan(300); return response.json();
}
export function actualId(row: Record<string, unknown>): string { if (!guid.test(String(row.id))) throw new Error("Actual response UUID required"); return String(row.id); }
const tables = { credit: "supplier_credit_note_refs", invoice: "supplier_invoices", rfq: "sourcing_events", order: "purchase_orders" } as const;
/** Independent observer. Fixed allowlisted table + validated UUID; SELECT only, no credentials. */
export function actualOwner(kind: keyof typeof tables, id: string): Record<string, unknown> {
  const f = actualFixture(); if (!guid.test(id)) throw new Error("Actual owned UUID required");
  const raw = execFileSync("docker", ["exec","procurement-approval-rehearsal-postgres","psql","-U","postgres","-d",f.database,"-X","-A","-t","-v","ON_ERROR_STOP=1","-c",`SELECT to_jsonb(t)::text FROM procurement.${tables[kind]} t WHERE id='${id}'::uuid;`], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 }).trim();
  if (!raw || raw.includes("\n")) throw new Error("Exactly one retained owning row required");
  const row = JSON.parse(raw) as Record<string, unknown>; expect(row.tenant_id).toBe(f.tenantId); expect(row.legal_entity_id).toBe(f.companyId); return row;
}
export async function approvedSupplier(page: Page): Promise<{ displayName: string; status: string }> {
  const f = actualFixture(); const response = await page.request.get(`/api/procurement/v1/vendors/${f.approvedSupplierId}`, { headers: { "X-Shell-Entity": f.companyId, "X-Shell-Location": f.branchId } });
  expect(response.ok()).toBe(true); return response.json();
}

export function actualOrderTotalIsTwelve(id: string): void {
  const f = actualFixture(); if (!guid.test(id)) throw new Error("Actual order UUID required");
  const raw = execFileSync("docker", ["exec","procurement-approval-rehearsal-postgres","psql","-U","postgres","-d",f.database,"-X","-A","-t","-v","ON_ERROR_STOP=1","-c",
    `SELECT sum(quantity*unit_price+tax_amount)=12 FROM procurement.purchase_order_lines WHERE purchase_order_id='${id}'::uuid AND is_active;`], { encoding: "utf8", timeout: 15000 }).trim();
  expect(raw).toBe("t");
}
