import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const vendor = "33333333-3333-4333-8333-333333333333";
const item = "44444444-4444-4444-8444-444444444444";
const capabilityKeys = ["vendorDraft", "itemDraft", "requestDraft", "approvals", "principalApprovals", "sourcing",
  "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation",
  "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft",
  "recurringPurchaseDraft", "sourcingDraft", "sourcingSourceDrafts", "vendorCreditDraft", "receivingDrafts",
  "receivingGoods", "receivingInspection", "receivingServices", "invoiceComparison", "invoiceOriginalUnitReview"];

async function catalogFixture(page: Page, kind: "vendors" | "items", failList = false) {
  const calls: Array<{ path: string; search: string; status: string; page: string; method: string }> = [];
  await page.addInitScript(entity => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: entity })), company);
  await page.route("**/api/**", route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: kind === "vendors" ? ["procurement-access", "procurement-vendor-read", "procurement-vendor-create"]
        : ["procurement-access", "procurement-item-manage"],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(capabilityKeys.map(key => [key, key === (kind === "vendors" ? "vendorDraft" : "itemDraft")])) });
    if (path === `/api/procurement/v1/${kind}`) {
      calls.push({ path, search: url.searchParams.get("search") ?? "", status: url.searchParams.get("status") ?? "",
        page: url.searchParams.get("page") ?? "", method: request.method() });
      if (failList) return json({ message: "Scoped list unavailable" }, 503);
      if (kind === "vendors") {
        const label = url.searchParams.get("page") === "2" ? "Second vendor" : "Copper Supply";
        return json({ items: [{ id: vendor, number: "SUP-001", displayName: label, legalName: `${label} Ltd`,
          countryCode: "ZM", status: "Active", isOrderable: true, version: 1, createdAt: "2026-10-20T00:00:00Z" }],
          total: 26, page: Number(url.searchParams.get("page") ?? 1), pageSize: 25 });
      }
      return json({ items: [{ id: item, code: "LAPTOP", name: "Business laptop", kind: "Goods", categoryCode: "IT",
        unitCode: "each", status: "Active", isPurchasable: true, version: 1 }], total: 1, page: 1, pageSize: 25 });
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return calls;
}

test("vendor directory keeps ERP layout and sends search, status and paging to the server", async ({ page }) => {
  const calls = await catalogFixture(page, "vendors");
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add vendor" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Second vendor", { exact: true })).toBeVisible();
  await page.getByLabel("Search vendors", { exact: true }).fill("Copper");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter vendors by status" }).click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await expect.poll(() => calls.at(-1)).toMatchObject({ search: "Copper", status: "Active", page: "1", method: "GET" });
  expect(calls.every(call => call.method === "GET")).toBe(true);
  await expect(page.getByText("Column filters, sorting and selection apply to the loaded page only.")).toBeVisible();
});

test("buyer item directory keeps read-only list tools and detail navigation", async ({ page }) => {
  const calls = await catalogFixture(page, "items");
  await page.goto("/procurement/workspace/items");
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add item" })).toBeVisible();
  await expect(page.getByRole("link", { name: /LAPTOP.*Business laptop/s })).toHaveAttribute("href", `/procurement/workspace/items/${item}`);
  await page.getByLabel("Search items", { exact: true }).fill("LAPTOP");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => calls.at(-1)?.search).toBe("LAPTOP");
  expect(calls.every(call => call.method === "GET")).toBe(true);
});

test("directory list failure displays the server error without a stale row or invented zero", async ({ page }) => {
  await catalogFixture(page, "vendors", true);
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("alert")).toContainText("Scoped list unavailable");
  await expect(page.getByTestId("erp-record-table")).toHaveCount(0);
  await expect(page.getByText("Record totals are unavailable.")).toBeVisible();
});
