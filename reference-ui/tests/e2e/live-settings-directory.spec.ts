import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, key === "configurationDraft"]));

async function fixture(page: Page, options: { coreAdmin?: boolean; configurationRead?: boolean } = {}) {
  const writes: string[] = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true,
      roles: options.coreAdmin ? ["erp_admin"] : ["employee"], displayName: "Settings user" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Test company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Test company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...(options.configurationRead ? ["procurement-configuration-read"] : [])],
      company: { id: company, code: "TEST", name: "Test company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/configuration/categories") return json({ items: [], total: 0, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/configuration/methods") return json({ items: [], total: 0, page: 1, pageSize: 25 });
    return json({ message: `Unexpected ${request.method()} ${path}` }, 404);
  });
  return { writes };
}

test("employee gets the Procurement settings directory without duplicate Core cards", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Procurement settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buying rules" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open ERP Core settings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Organization" })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("authorized Core administrator gets one link to the Core directory", async ({ page }) => {
  await fixture(page, { coreAdmin: true });
  await page.goto("/procurement/workspace/settings");
  await expect(page.getByRole("link", { name: "Open ERP Core settings" })).toHaveAttribute("href", "/core/workspace/settings");
  await expect(page.getByRole("heading", { name: "Users & access" })).toHaveCount(0);
});

test("unsupported Procurement preference remains visible without a local save or API write", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/settings/modules/vendors/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Vendors settings" })).toBeVisible();
  await expect(page.getByText("This setting does not have a live editor yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("an account without configuration read access sees no live editor", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByRole("heading", { level: 1, name: "Buying settings unavailable" })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("configuration reader opens live references", async ({ page }) => {
  await fixture(page, { configurationRead: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByRole("heading", { level: 1, name: "Buying categories & methods" })).toBeVisible();
});

test("settings rail collapses on desktop and mobile navigation opens", async ({ page }) => {
  await fixture(page);
  await page.goto("/procurement/workspace/settings");
  await page.locator("aside button").first().click();
  await expect(page.locator("aside")).toHaveClass(/lg:w-16/);
  expect(await page.evaluate(() => localStorage.getItem("erp.sidebar.collapsed.v1"))).toBe("true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open settings navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Procurement settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click({ position: { x: 350, y: 400 } });
});
