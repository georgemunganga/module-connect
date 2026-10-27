import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function fixture(page: Page, options: { readOnly?: boolean; requestError?: boolean; approvals?: boolean } = {}) {
  const calls: string[] = [], writes: string[] = [];
  let denied = false, requestCount = 7;
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    calls.push(path); if (request.method() !== "GET") writes.push(path);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("amizo", fixturePrincipal, [{ companyId: company, branchId: fixtureBranch, code: "AMIZO", name: "Amizo Power" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: !denied, user: denied ? null : { id: fixturePrincipal, isActive: true, displayName: "Home reviewer", roles: ["erp_admin"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power", fontFamily: "Inter" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: actor, tenantId: "amizo", legalEntityId: company, workerId: null,
      permissions: ["procurement-access", "procurement-request-read", ...options.readOnly ? [] : ["procurement-request-create", "procurement-po-read", "procurement-plan-read", "procurement-contract-read", "procurement-invoice-read", "procurement-item-read", "procurement-vendor-read"], ...options.approvals ? ["procurement-approval-read"] : []],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "principalApprovals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, ["vendorDraft", "itemDraft", "requestDraft", "orderDraft", "invoiceIntake", "planningDraft", "contractDraft"].includes(key) || key === "principalApprovals" && options.approvals === true])) });
    if (path === "/api/procurement/v1/requests") return options.requestError ? json({ message: "Unavailable" }, 503) : json({ records: [{ id, number: "PR-REAL-001", purpose: "Saved office equipment", status: "Draft", currencyCode: "ZMW", createdAt: "2026-10-23T00:00:00Z", version: 1, lineCount: 1 }], count: requestCount, offset: 0, limit: 50 });
    if (path === "/api/procurement/v1/orders") return json({ items: [], total: 4, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/plans") return json({ items: [], total: 3, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/contracts") return json({ items: [], total: 2, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/invoices") return json({ items: [], total: 9, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/catalog") return json({ items: [], total: 5, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/vendors") return json({ items: [], total: 6, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/approvals") return json({ records: [{ caseId: id, requestId: id, requestNumber: "PR-APPROVAL-1", purpose: "Review saved request", amount: 100, amountBasis: "EstimatedLineBase", currencyCode: "ZMW", state: "Open", openedAt: "2026-10-23T00:00:00Z", stage: { id, code: "Manager", state: "Open" }, assignments: [] }], count: 1, offset: 0, limit: 50 });
    return json({ message: `Unexpected route ${path}` }, 404);
  });
  return { calls, writes, deny: () => { denied = true; }, update: () => { requestCount = 8; } };
}
test("original Home sections coexist with scoped live counts and saved request links", async ({ page }) => {
  const state = await fixture(page); await page.goto("/procurement/workspace/");
  await expect(page.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible();
  for (const title of ["Spend Summary", "Attention Required", "Payables Summary", "Recent Activity"]) await expect(page.getByText(title, { exact: true })).toBeVisible();
  for (const label of ["Purchase orders: 4", "Supplier bills: 9", "Catalog entries: 5", "Vendors: 6", "My purchase requests: 7", "My purchase plans: 3", "My contracts: 2"]) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Saved office equipment/ })).toHaveAttribute("href", `/procurement/workspace/requests/${id}`);
  await expect(page.getByRole("link", { name: "Create a purchase request" })).toBeVisible();
  await expect(page.getByLabel("Dashboard date range")).toBeDisabled();
  await expect(page.getByText("Your spending overview will appear here")).toBeVisible();
  await expect(page.getByText(/Hello, Alex|Meridian Procurement Demo|Local demo records/)).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
test("read-only Home preserves the layout without querying ungranted metrics or showing write shortcuts", async ({ page }) => {
  const state = await fixture(page, { readOnly: true }); await page.goto("/procurement/workspace/");
  await expect(page.getByLabel("My purchase requests: 7")).toBeVisible();
  await expect(page.getByLabel("Vendors: unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a purchase request" })).toHaveCount(0);
  await expect(page.getByLabel("Vendors: unavailable")).toHaveAttribute("aria-disabled", "true");
  for (const resource of ["vendors", "invoices", "catalog", "orders", "plans", "contracts", "approvals"]) expect(state.calls).not.toContain(`/api/procurement/v1/${resource}`);
  expect(state.writes).toEqual([]);
});
test("failed request read does not become zero or demo activity; Refresh reconciles server counts", async ({ page }) => {
  const state = await fixture(page, { requestError: true }); await page.goto("/procurement/workspace/");
  await expect(page.getByLabel("My purchase requests: error")).toBeVisible();
  await expect(page.getByText("Saved office equipment")).toHaveCount(0);
  await expect(page.getByText("Spend Summary", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});
test("Refresh performs reads only and updates existing scoped totals", async ({ page }) => {
  const state = await fixture(page); await page.goto("/procurement/workspace/");
  await expect(page.getByLabel("My purchase requests: 7")).toBeVisible();state.update();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("My purchase requests: 8")).toBeVisible();expect(state.writes).toEqual([]);
});
test("principal-only approval availability populates Attention Required without enabling Finance", async ({ page }) => {
  const state = await fixture(page, { approvals: true }); await page.goto("/procurement/workspace/");
  await expect(page.getByText("1 requests waiting for your decision")).toBeVisible();
  await expect(page.getByRole("link", { name: /Review saved request/ })).toBeVisible();
  expect(state.calls).toContain("/api/procurement/v1/approvals");expect(state.calls.some(p => /finance|payments/.test(p))).toBe(false);
});
test("auth invalidation removes prior actor Home data", async ({ page }) => {
  const state = await fixture(page);await page.goto("/procurement/workspace/");
  await expect(page.getByText("Saved office equipment")).toBeVisible();state.deny();
  await page.evaluate(() => window.dispatchEvent(new Event("erp:auth-context-changed")));
  await expect(page.getByRole("alert")).toContainText("Sign in");
  await expect(page.getByText("Saved office equipment")).toHaveCount(0);expect(state.writes).toEqual([]);
});
for (const width of [1440, 390]) test(`original Home arrangement fits viewport ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });await fixture(page);await page.goto("/procurement/workspace/");
  await expect(page.getByLabel("Vendors: 6")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
});
