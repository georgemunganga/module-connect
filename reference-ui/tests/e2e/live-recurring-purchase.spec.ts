import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const supplier = "33333333-3333-4333-8333-333333333333";
const recordId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "recurringPurchaseDraft", "sourcingDraft"].map(key => [key, key === "recurringPurchaseDraft"]));
const permissions = ["procurement-access", "procurement-recurring-read", "procurement-recurring-create", "procurement-recurring-edit"];
type RecordValue = Record<string, unknown> & { id: string; version: number; status: string };

async function fixture(page: Page, opts: { permissions?: string[]; failedGet?: boolean; unknownCreate?: boolean; closed?: boolean } = {}) {
  const writes: string[] = [];
  let record: RecordValue | null = opts.closed ? { id: recordId, number: "RPC-1", title: "Past service", supplierId: supplier,
    supplierContractId: null, ownerWorkerId: worker, workLocationId: null, frequency: "Monthly",
    firstCycleOn: "2026-01-01", nextCycleOn: "2026-09-01", lastCycleOn: null,
    expectedAmount: 20, exactExpectedAmount: "20", currencyCode: "ZMW",
    status: "Closed", version: 2, createdAt: "2026-01-01T00:00:00Z", closedAt: "2026-10-01T00:00:00Z",
    closedReason: "Completed" } : null;
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: opts.permissions ?? permissions, company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: supplier, number: "VEN-1", displayName: "Copper Services", legalName: "Copper Services", countryCode: "ZM", status: "Active", isOrderable: true, version: 1, createdAt: "2026-10-22T00:00:00Z" }], total: 1, page: 1, pageSize: 100 });
    if (path === "/api/procurement/v1/recurring-purchases") {
      if (method === "GET") return json({ items: record ? [record] : [], total: record ? 1 : 0, page: 1, pageSize: 25 });
      writes.push(path);
      if (opts.unknownCreate) return route.abort("failed");
      const input = route.request().postDataJSON();
      record = { ...input, id: recordId, number: "RPC-1", ownerWorkerId: worker, workLocationId: null,
        exactExpectedAmount: input.expectedAmount, status: "Draft", version: 1,
        createdAt: "2026-10-22T00:00:00Z", closedAt: null, closedReason: null };
      return json(record, 201);
    }
    if (path === `/api/procurement/v1/recurring-purchases/${recordId}`) {
      if (method === "GET") return opts.failedGet ? json({ message: "Unavailable" }, 503) : record ? json(record) : json({ message: "Not found" }, 404);
      writes.push(path);
      const input = route.request().postDataJSON();
      record = { ...record!, ...input.draft, exactExpectedAmount: input.draft.expectedAmount, version: record!.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/recurring-purchases/${recordId}/close`) {
      writes.push(path); record = { ...record!, status: "Closed", version: record!.version + 1, closedReason: route.request().postDataJSON().reason };
      return json(record);
    }
    return json({ message: `Unexpected: ${path}` }, 404);
  });
  return { writes };
}

test("recurring purchase can be created, edited and closed without a Finance request", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/recurring-bills");
  await expect(page.getByText("No recurring purchases yet")).toBeVisible();
  await page.getByRole("link", { name: "New recurring purchase" }).first().click();
  await page.getByRole("combobox", { name: "Supplier" }).selectOption(supplier);
  await page.getByLabel("Purchase name").fill("Monthly cleaning");
  await page.getByLabel("Expected each time").fill("12345678901234.5678");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByRole("heading", { name: "Monthly cleaning" })).toBeVisible();
  await expect(page.getByText("ZMW 12345678901234.5678")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Expected each time").fill("5.1234");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByText("ZMW 5.1234")).toBeVisible();
  await page.getByLabel("Reason").fill("Service ended");
  await page.getByRole("button", { name: "Close schedule" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(3);
  expect(state.writes.every(path => path.startsWith("/api/procurement/v1/recurring-purchases"))).toBe(true);
});

test("failed edit GET never becomes create", async ({ page }) => {
  const state = await fixture(page, { failedGet: true });
  await page.goto(`/procurement/workspace/recurring-bills/${recordId}/edit`);
  await expect(page.getByRole("alert")).toContainText("Unavailable");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("read-only user cannot open a write action", async ({ page }) => {
  const state = await fixture(page, { permissions: ["procurement-access", "procurement-recurring-read"] });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await expect(page.getByRole("alert")).toContainText("cannot create");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("direct edit URL for a closed purchase shows saved history, without a write form", async ({ page }) => {
  const state = await fixture(page, { closed: true });
  await page.goto(`/procurement/workspace/recurring-bills/${recordId}/edit`);
  await expect(page.getByText("This recurring purchase is closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("unconfirmed create locks repeat submission and retains entered values", async ({ page }) => {
  const state = await fixture(page, { unknownCreate: true });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await page.getByRole("combobox", { name: "Supplier" }).selectOption(supplier);
  await page.getByLabel("Purchase name").fill("Cloud subscription");
  await page.getByLabel("Expected each time").fill("10.0001");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByText("The save result was not confirmed.")).toBeVisible();
  await expect(page.getByLabel("Purchase name")).toHaveValue("Cloud subscription");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});
