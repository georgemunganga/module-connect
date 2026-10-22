import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const branch = "33333333-3333-4333-8333-333333333333", second = "44444444-4444-4444-8444-444444444444";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", vendor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const name = "Lusaka (Main)";
async function fixture(page: Page, options: { saved?: unknown; ambiguous?: boolean; foreign?: boolean; storageDenied?: boolean } = {}) {
  const calls: { path: string; method: string; location?: string }[] = [];
  let chosen = branch, created = false, release!: () => void;
  const lookup = new Promise<void>(resolve => { release = resolve; });
  await page.addInitScript(({ entityId, saved, denied }) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch: saved, retainedPreference: "keep" }));
    if (denied) { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
      if (key === "erp.shell.state.v1") throw new Error("Synthetic storage denied"); return original.call(this, key, value);
    }; }
  }, { entityId: company, saved: options.saved ?? name, denied: options.storageDenied });
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: [] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }, { id: other, code: "OTHER", registeredName: "Other company" }] });
    if (path === "/api/hrm/admin/locations") {
      await lookup;
      return json({ items: [{ id: branch, name, legalEntityId: options.foreign ? other : company },
        ...(options.ambiguous ? [{ id: second, name, legalEntityId: company }] : [{ id: second, name: "Ndola", legalEntityId: company }])] });
    }
    if (path === "/api/hrm/shell/") return json({ confined: false, assignedLocationIds: [] });
    if (path.startsWith("/api/procurement/v1/")) {
      const selected = request.headers()["x-shell-location"];
      calls.push({ path, method: request.method(), location: selected });
      expect(request.headers()["x-shell-entity"]).toBe(company); expect(selected).toBe(chosen);
    }
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company, principalId: principal, workerId: null,
      permissions: ["procurement-access", "procurement-vendor-read", "procurement-vendor-create", "procurement-request-read"],
      company: { id: company, currencyCode: "ZMW", name: "Amizo Power", code: "AMIZO" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, ["vendorDraft", "requestDraft"].includes(key)])) });
    if (path === "/api/procurement/v1/vendors" && request.method() === "POST") { created = true; return json({ id: vendor, number: "VEN-HOTFIX", version: 1, possibleDuplicate: false }, 201); }
    if (path === `/api/procurement/v1/vendors/${vendor}`) return json({ id: vendor, number: "VEN-HOTFIX", version: 1, status: "Draft", isOrderable: false,
      legalName: "Branch proof supplier", displayName: "Branch proof supplier", countryCode: "ZM", createdAt: "2026-10-22T00:00:00Z", contacts: [], sites: [], qualifications: [], attributes: [], categories: [] });
    if (path === "/api/procurement/v1/vendors" || path === "/api/procurement/v1/requests") return json({ items: [], total: 0, page: 1, pageSize: 25 });
    return json({ message: "Not configured" }, 404);
  });
  return { calls, release, choose: (id: string) => { chosen = id; }, created: () => created };
}
test("legacy HRM label is persisted as its same-company authorized ID before all Procurement reads and create/reload", async ({ page }) => {
  // Includes a cold application load and multiple full navigations plus a save/reload.
  test.setTimeout(90_000);
  const state = await fixture(page);
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("heading", { name: "Checking your branch" })).toBeVisible();
  expect(state.calls).toEqual([]);
  state.release();
  await expect(page.getByText("Every purchase starts with a vendor")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!).branch)).toBe(branch);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!).retainedPreference)).toBe("keep");
  await page.goto("/procurement/workspace/requests");
  await expect.poll(() => state.calls.some(c => c.path === "/api/procurement/v1/requests")).toBe(true);
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name", { exact: true }).fill("Branch proof supplier");
  await page.getByLabel("Display name", { exact: true }).fill("Branch proof supplier");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Branch proof supplier", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Branch proof supplier", exact: true })).toBeVisible();
  expect(state.created()).toBe(true);
  expect(state.calls.every(c => c.location === branch)).toBe(true);
});
for (const [label, options] of [["unknown", { saved: "Missing branch" }], ["ambiguous", { ambiguous: true }], ["other company", { foreign: true }], ["invalid", { saved: { name } }]] as [string, { saved?: unknown; ambiguous?: boolean; foreign?: boolean }][]) {
  test(`${label} legacy branch keeps scope closed and existing header permits an explicit authorized selection`, async ({ page }) => {
    const state = await fixture(page, options); state.release();
    await page.goto("/procurement/workspace/vendors");
    await expect(page.getByRole("heading", { name: "Choose your branch" })).toBeVisible();
    expect(state.calls).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!).branch)).toEqual(options.saved ?? name);
    await page.getByRole("button", { name: "Organisation context", exact: true }).click();
    const target = label === "ambiguous" ? branch : second;
    state.choose(target);
    await page.getByRole("button", { name: label === "ambiguous" ? name : "Ndola", exact: true }).first().click();
    await expect(page.getByText("Every purchase starts with a vendor")).toBeVisible();
    expect(state.calls.every(c => c.location === target)).toBe(true);
  });
}
test("failed canonical storage keeps the original label and prevents all Procurement requests", async ({ page }) => {
  const state = await fixture(page, { storageDenied: true }); state.release();
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("alert").filter({ hasText: "could not be saved" })).toBeVisible();
  expect(state.calls).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!).branch)).toBe(name);
});
