import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"]
  .map(key => [key, ["vendorDraft", "itemDraft", "requestDraft", "planningDraft", "contractDraft", "sourcingDraft"].includes(key)]));
async function systemUser(page: Page, permissions: string[], options: { admin?: boolean; principalId?: string } = {}) {
  const writes: string[] = [], reads: string[] = [];
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), company);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (method !== "GET") { writes.push(path); return json({ message: "Unexpected write in access test" }, 403); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "System user", roles: options.admin ? ["erp_admin"] : ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company,
      principalId: options.principalId ?? principal, workerId: null, adminViewOnly: false, permissions,
      company: { id: company, currencyCode: "ZMW", code: "AMIZO", name: "Amizo Power" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    reads.push(path);
    if (["vendors", "contracts", "plans", "requests", "items"].some(resource => path === `/api/procurement/v1/${resource}`))
      return json({ items: [], total: 0, page: 1, pageSize: 25 });
    return json({ message: "Not found" }, 404);
  });
  return { writes, reads };
}
for (const [path, permission, heading] of [
  ["/vendors/new", "procurement-vendor-create", "New vendor"],
  ["/contracts/new", "procurement-contract-create", "New contract"],
  ["/plans/new", "procurement-plan-create", "New purchase plan"],
] as const) {
  test(`permissioned system user opens ${path} without employee linkage`, async ({ page }) => {
    const state = await systemUser(page, ["procurement-access", permission]);
    await page.goto(`/procurement/workspace${path}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(/active employee account|Administrator view/)).toHaveCount(0);
    expect(state.writes).toEqual([]);
  });
  test(`administrator role alone cannot open ${path}`, async ({ page }) => {
    const state = await systemUser(page, ["procurement-access"], { admin: true });
    await page.goto(`/procurement/workspace${path}`);
    await expect(page.getByRole("alert")).toContainText("do not have permission");
    await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
    expect(state.writes).toEqual([]);
    expect(state.reads).toEqual([]);
  });
}
test("workerless read-only grants expose no vendor create action", async ({ page }) => {
  const state = await systemUser(page, ["procurement-access", "procurement-vendor-read"]);
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByText("Every purchase starts with a vendor")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add vendor" })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
