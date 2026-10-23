import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333";
const entry = "44444444-4444-4444-8444-444444444444";
const supplier = "55555555-5555-4555-8555-555555555555";
const capabilityKeys = ["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation",
  "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft",
  "sourcingDraft", "vendorCreditDraft"];

async function fixture(page: Page, options: { permissions: string[]; requestCount?: number; requestError?: boolean }) {
  const calls: string[] = [];
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), company);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Employee", roles: ["employee"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: company,
      workerId: worker, permissions: options.permissions,
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(capabilityKeys.map(key => [key, ["itemDraft", "requestDraft"].includes(key)])) });
    if (path === "/api/procurement/v1/catalog") return json({ items: [{ entryId: entry, itemId: item, code: "CHAIR",
      name: "Approved chair", kind: "Goods", categoryCode: "OFFICE", unitCode: "each",
      estimatedUnitPrice: 100, currencyCode: "ZMW", supplierId: supplier,
      supplierName: "Approved supplier", publishedVersion: 2 }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/requests") return options.requestError
      ? json({ message: "Unavailable" }, 503)
      : json({ records: [], count: options.requestCount ?? 0, limit: 50, offset: 0 });
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return calls;
}

test("employee sees published catalog without calling buyer item management", async ({ page }) => {
  const calls = await fixture(page, { permissions: ["procurement-access", "procurement-item-read", "procurement-request-read"] });
  await page.goto("/procurement/workspace/items");
  await expect(page.getByText("Approved chair")).toBeVisible();
  await expect(page.getByText("Approved supplier")).toBeVisible();
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByRole("link", { name: "New request" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request item" })).toHaveCount(0);
  expect(calls).toContain("/api/procurement/v1/catalog");
  expect(calls).not.toContain("/api/procurement/v1/items");
  await page.goto(`/procurement/workspace/items/${item}`);
  await expect(page.getByText("Item management details are unavailable")).toBeVisible();
  expect(calls).not.toContain(`/api/procurement/v1/items/${item}`);
});

test("approved catalog offers a general request only to employees allowed to create one", async ({ page }) => {
  const calls = await fixture(page, { permissions: ["procurement-access", "procurement-item-read", "procurement-request-create"] });
  await page.goto("/procurement/workspace/items");
  await expect(page.getByRole("link", { name: "New request" })).toBeVisible();
  await expect(page.getByText("Approved chair")).toBeVisible();
  expect(calls).not.toContain("/api/procurement/v1/items");
});

test("catalog access denial does not query buyer management or published catalog", async ({ page }) => {
  const calls = await fixture(page, { permissions: ["procurement-access", "procurement-request-read"] });
  await page.goto("/procurement/workspace/items");
  await expect(page.getByRole("alert")).toContainText("You do not have permission to open this Procurement page for the selected company.");
  expect(calls).not.toContain("/api/procurement/v1/items");
  expect(calls).not.toContain("/api/procurement/v1/catalog");
});

test("live home reports a true zero only when the scoped ERP confirms it", async ({ page }) => {
  const calls = await fixture(page, { permissions: ["procurement-access", "procurement-request-read"], requestCount: 0 });
  await page.goto("/procurement/workspace/");
  await expect(page.getByLabel("My purchase requests: 0")).toBeVisible();
  await expect(page.getByLabel("My purchase plans: unavailable")).toBeVisible();
  expect(calls).toContain("/api/procurement/v1/requests");
  expect(calls).not.toContain("/api/procurement/v1/plans");
});

test("live analytics shows an error instead of an invented zero", async ({ page }) => {
  await fixture(page, { permissions: ["procurement-access", "procurement-request-read"], requestError: true });
  await page.goto("/procurement/workspace/analytics");
  await expect(page.getByLabel("My purchase requests: error")).toBeVisible();
  await expect(page.getByText("Could not load. Refresh to try again.")).toBeVisible();
  await expect(page.getByText("Budget balances, supplier payments, savings and spend trends")).toBeVisible();
});

for (const price of ["100.1234", "99999999999999.9999", undefined]) {
  test(`employee catalog preserves explicit exact price or asks for confirmation ${price ?? "legacy"}`, async ({ page }) => {
    await fixture(page, { permissions: ["procurement-access", "procurement-item-read"] });
    let writes = 0;
    page.on("request", request => { if (request.url().includes("/api/procurement/") && request.method() !== "GET") writes++; });
    await page.route("**/api/procurement/v1/catalog**", route => {
      // Keep the actual legacy numeric wire shape. Only the owning explicit string is display authority.
      const record = { entryId: entry, itemId: item, code: "EXACT", name: "Exact published item", kind: "Goods",
        categoryCode: "OFFICE", unitCode: "each", estimatedUnitPrice: 100.1234, currencyCode: "ZMW",
        supplierId: supplier, supplierName: "Published supplier", publishedVersion: 2, exactEstimatedUnitPrice: price };
      return route.fulfill({ json: { items: [record], total: 1, page: 1, pageSize: 25 } });
    });
    await page.goto("/procurement/workspace/items");
    await expect(page.getByText("Exact published item", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: price === undefined ? "Confirm price" : `ZMW ${price} / each`, exact: true })).toBeVisible();
    if (price === undefined) await expect(page.getByText("ZMW 100.123 / each", { exact: true })).toHaveCount(0);
    expect(writes).toBe(0);
  });
}
