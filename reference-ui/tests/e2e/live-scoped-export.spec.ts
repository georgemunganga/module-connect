import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map(key => [key, ["vendorDraft", "itemDraft"].includes(key)]));

async function setup(page: Page, options: { exportAction?: boolean; kind?: "vendors" | "items";
  limit?: boolean; unavailableSelection?: boolean; hold?: (resume: () => void) => void } = {}) {
  const kind = options.kind ?? "vendors";
  const exports: string[] = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: principal, isActive: true,
      displayName: "Buyer", email: "buyer@example.test", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1, tenantId: "amizo", principalId: principal,
      organisationWide: false, companies: [{ id: company, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branch, code: "HQ", name: "Lusaka", legalEntityId: company, type: "Headquarters" }] });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Lusaka", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: principal, tenantId: "amizo", legalEntityId: company,
      workerId: "22222222-2222-4222-8222-222222222222",
      permissions: kind === "vendors" ? ["procurement-access", "procurement-vendor-read",
        ...(options.exportAction ? ["procurement-vendor-export"] : [])] : ["procurement-access", "procurement-item-manage",
        ...(options.exportAction ? ["procurement-item-export"] : [])],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" }, branch: { id: branch } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true, capabilities });
    if (path === `/api/procurement/v1/${kind}`) return json({ items: [{ id: "33333333-3333-4333-8333-333333333333",
      number: "VEN-001", code: "ITEM-001", displayName: "Steel", legalName: "Steel Ltd", name: "Steel",
      kind: "Goods", categoryCode: "METAL", unitCode: "each", countryCode: "ZM", status: "Active", isOrderable: true,
      isPurchasable: true, version: 1 }], total: 51, page: 1, pageSize: 25 });
    if (path === `/api/procurement/v1/${kind}/export`) {
      exports.push(`${request.method()} ${url.search} ${request.headers()["x-shell-entity"]}`);
      if (options.unavailableSelection && url.searchParams.has("ids"))
        return json({ code: "selected-records-unavailable" }, 404);
      if (options.limit) return json({ code: "export-limit-exceeded" }, 422);
      if (options.hold) await new Promise<void>(resolve => options.hold?.(resolve));
      return route.fulfill({ status: 200, headers: { "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}-20261025.csv"` }, body: "\ufeffnumber,displayName\r\n" });
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return exports;
}

async function openExport(page: Page) {
  await page.getByRole("button", { name: "More Actions" }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
}

test("vendor All, View and exact Selected exports use the existing server CSV menu", async ({ page }) => {
  const requests = await setup(page, { exportAction: true });
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  await page.getByLabel("Search vendors").fill("steel");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Filter vendors by status").click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await openExport(page);
  await expect(page.getByRole("menuitem", { name: "Export Selected", exact: true })).toBeDisabled();
  const all = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export Vendors" }).click();
  expect((await all).suggestedFilename()).toBe("vendors-20261025.csv");
  await openExport(page);
  const view = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Search results (default order)" }).click();
  await view;
  expect(requests).toEqual([`GET  ${company}`, `GET ?search=steel&status=Active ${company}`]);
  await page.getByLabel("Filter Vendors by field").click();
  const filter = page.getByRole("dialog", { name: "Filter Vendors" });
  await filter.getByLabel("Filter by field").click();
  await page.getByRole("option", { name: "Legal name", exact: true }).click();
  await filter.getByRole("textbox", { name: "Legal name" }).fill("Ltd");
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await openExport(page);
  await expect(page.getByRole("menuitem", { name: "Search results (default order)" })).toBeDisabled();
  await expect(page.getByText("Clear page-only filters to export search results.")).toBeVisible();
  expect(requests).toHaveLength(2);
  await page.getByRole("button", { name: "More Actions" }).click();
  await page.getByRole("checkbox", { name: "Select Open VEN-001" }).check();
  await openExport(page);
  const selected = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export Selected (1)" }).click();
  expect((await selected).suggestedFilename()).toBe("vendors-20261025.csv");
  expect(requests).toEqual([`GET  ${company}`, `GET ?search=steel&status=Active ${company}`,
    `GET ?ids=33333333-3333-4333-8333-333333333333 ${company}`]);
});

test("an unavailable selected member shows recovery and starts no partial download", async ({ page }) => {
  const requests = await setup(page, { exportAction: true, unavailableSelection: true });
  let downloads = 0; page.on("download", () => { downloads += 1; });
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("checkbox", { name: "Select Open VEN-001" }).check();
  await openExport(page);
  await page.getByRole("menuitem", { name: "Export Selected (1)" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh the list and select the records again");
  expect(requests).toEqual([`GET ?ids=33333333-3333-4333-8333-333333333333 ${company}`]);
  expect(downloads).toBe(0);
});

test("page changes clear the selection rather than exporting stale selected rows", async ({ page }) => {
  const requests = await setup(page, { exportAction: true });
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("checkbox", { name: "Select Open VEN-001" }).check();
  await expect(page.getByText("1 selected on this page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("1 selected on this page", { exact: true })).toHaveCount(0);
  await openExport(page);
  await expect(page.getByRole("menuitem", { name: "Export Selected", exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

test("missing export action and over-limit response never start a download", async ({ page }) => {
  const requests = await setup(page);
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("button", { name: "More Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Export", exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

test("managed items export uses item action and shows a server limit", async ({ page }) => {
  const requests = await setup(page, { kind: "items", exportAction: true, limit: true });
  await page.goto("/procurement/workspace/items");
  await openExport(page);
  await page.getByRole("menuitem", { name: "Export Items" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many records match" })).toBeVisible();
  expect(requests).toEqual([`GET  ${company}`]);
});

test("a late CSV response after branch scope change cannot start a download", async ({ page }) => {
  let resume: (() => void) | undefined;
  const requests = await setup(page, { exportAction: true, hold: next => { resume = next; } });
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await page.goto("/procurement/workspace/vendors");
  await openExport(page);
  await page.getByRole("menuitem", { name: "Export Vendors" }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate(id => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id, branchScope: "all" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" }));
  }, company);
  resume?.();
  await page.waitForTimeout(150);
  expect(downloads).toBe(0);
  await page.evaluate(([id, branchId]) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id, branch: branchId }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" }));
  }, [company, branch]);
  await page.getByRole("button", { name: "More Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Export", exact: true })).toBeEnabled();
});

test("the compact toolbar retains the same server export action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await setup(page, { kind: "items", exportAction: true });
  await page.goto("/procurement/workspace/items");
  await openExport(page);
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export Items" }).click();
  expect((await download).suggestedFilename()).toBe("items-20261025.csv");
  expect(requests).toEqual([`GET  ${company}`]);
  await page.getByRole("checkbox", { name: "Select Open ITEM-001" }).check();
  await openExport(page);
  const selected = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export Selected (1)" }).click();
  expect((await selected).suggestedFilename()).toBe("items-20261025.csv");
  expect(requests).toEqual([`GET  ${company}`, `GET ?ids=33333333-3333-4333-8333-333333333333 ${company}`]);
});
