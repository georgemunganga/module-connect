import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const otherCompany = "33333333-3333-4333-8333-333333333333";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"]
  .map(key => [key, key === "vendorDraft"]));
async function fixture(page: Page, options: { admin?: boolean; wrongCompany?: boolean; denyContext?: boolean } = {}) {
  const writes: string[] = [], contexts: Array<Record<string, string>> = [];
  await page.addInitScript(value => localStorage.setItem("erp.shell.state.v1", JSON.stringify(value)), { entityId: company, branch });
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() !== "GET") { writes.push(path); return json({ message: "No writes are part of organisation display" }, 403); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true,
      displayName: "Procurement user", roles: options.admin ? ["erp_admin"] : ["custom_procurement"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Tenant branding" });
    if (path === "/api/hrm/admin/legal-entities") return options.admin
      ? json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }, { id: otherCompany, code: "OTHER", registeredName: "Other company" }] })
      : json({ message: "Core organisation administration is not granted" }, 403);
    if (path === "/api/hrm/admin/locations") return options.admin
      ? json({ items: [{ id: branch, name: "Lusaka (Main)", legalEntityId: company }] })
      : json({ message: "Core organisation administration is not granted" }, 403);
    if (path === "/api/hrm/shell/") return options.admin
      ? json({ assignedLocationIds: [], confined: false }) : json({ message: "No HRM role" }, 403);
    if (path === "/api/procurement/v1/context") {
      contexts.push(request.headers());
      if (options.denyContext) return json({ message: "No Procurement access" }, 403);
      const id = options.wrongCompany ? otherCompany : company;
      return json({ tenantId: "test", principalId: principal, legalEntityId: id, workerId: null,
        permissions: ["procurement-access", "procurement-vendor-read"],
        company: { id, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
        branch: { id: branch, code: "MAIN", name: "Lusaka (Main)" },
        allowedCompanies: [{ id: otherCompany, code: "OTHER", name: "Other company" }] });
    }
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [], total: 0, page: 1, pageSize: 25 });
    return json({ message: "Not found" }, 404);
  });
  return { writes, contexts };
}
test("Procurement-only user sees verified selected names without invented switch choices", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/vendors");
  const button = page.getByRole("button", { name: "Organisation context", exact: true });
  await expect(button).toContainText("Amizo Power · Lusaka (Main)");
  await button.click();
  const current = page.getByLabel("Verified current organisation", { exact: true });
  await expect(current).toContainText("Amizo Power");
  await expect(current).toContainText("Lusaka (Main)");
  await expect(current.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Other company", exact: true })).toHaveCount(0);
  await expect(page.getByText("Sign in to the ERP to see your permitted entities and branches.")).toHaveCount(0);
  expect(state.contexts.every(headers => headers["x-shell-entity"] === company && headers["x-shell-location"] === branch)).toBe(true);
  expect(state.writes).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!))).toEqual({ entityId: company, branch });
});
for (const options of [{ wrongCompany: true }, { denyContext: true }]) {
  test(`unverified selected context never becomes a switch choice ${JSON.stringify(options)}`, async ({ page }) => {
    const state = await fixture(page, options);
    await page.goto("/procurement/workspace/vendors");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Organisation context", exact: true }).click();
    await expect(page.getByLabel("Verified current organisation", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Organisation choices are not available for this account.")).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}
test("Core-authorized user retains the full existing company choices", async ({ page }) => {
  await fixture(page, { admin: true });
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("button", { name: "Organisation context", exact: true }).click();
  await expect(page.getByRole("button", { name: "Other company", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lusaka (Main)", exact: true })).toBeVisible();
  await expect(page.getByLabel("Verified current organisation", { exact: true })).toHaveCount(0);
});

test("late pre-sign-out context cannot restore the previous organisation display", async ({ page }) => {
  await fixture(page);
  let reads = 0, revoked = false;
  let release!: () => void, entered!: () => void, firstContextSeen!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { entered = resolve; });
  const initialContext = new Promise<void>(resolve => { firstContextSeen = resolve; });
  // Make the first context the page readiness read, then deny Core lookups so
  // the held second response is specifically the shell's fallback read.
  await page.route(/\/api\/hrm\/(?:admin\/legal-entities|admin\/locations|shell\/)$/, async route => {
    await initialContext;
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "No Core list access" }) });
  });
  await page.route("**/api/procurement/v1/context", async route => {
    reads++;
    if (reads === 1) firstContextSeen();
    const saved = { tenantId: "test", principalId: principal, legalEntityId: company, workerId: null,
      permissions: ["procurement-access", "procurement-vendor-read"],
      company: { id: company, code: "AMIZO", name: "Previous account company", currencyCode: "ZMW" },
      branch: { id: branch, code: "MAIN", name: "Previous account branch" } };
    if (reads === 2) { entered(); await held; }
    else if (revoked) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Account context changed" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) }).catch(() => {});
  });
  await page.goto("/procurement/workspace/vendors");
  await pending;
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("erp:auth-context-changed")));
  await expect(page.getByRole("alert")).toBeVisible();
  release();
  await expect(page.getByRole("button", { name: "Organisation context", exact: true })).not.toContainText("Previous account");
  await page.getByRole("button", { name: "Organisation context", exact: true }).click();
  await expect(page.getByLabel("Verified current organisation", { exact: true })).toHaveCount(0);
});
