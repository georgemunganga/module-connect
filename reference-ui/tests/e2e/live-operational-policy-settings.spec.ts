import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
// Readiness requires the existing capability contract even when only settings
// are under test. Explicit false values keep unrelated workflows disabled.
const capabilities = {
  vendorDraft: false, itemDraft: false, requestDraft: false, approvals: false,
  sourcing: false, contracts: false, orders: false, receiving: false,
  invoiceValidation: false, financeHandoff: false, supplierPortal: false,
  planningDraft: false, configurationDraft: true, contractDraft: false, sourcingDraft: false,
};
type Options = { key: "INVOICE_MATCHING" | "SOURCING" | "RECEIVING"; permissions: string[]; schema?: boolean; lostCreate?: boolean; categoryPages?: boolean };

async function fixture(page: Page, options: Options) {
  let creates = 0;
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("test", fixturePrincipal, [{ companyId: company, branchId: fixtureBranch, code: "TEST", name: "Synthetic company" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: fixturePrincipal, isActive: true, roles: ["procurement_manager"], displayName: "Manager" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...options.permissions], company: { id: company, code: "TEST", name: "Company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    const base = "/api/procurement/v1/configuration/policies";
    if (path.startsWith(`${base}/lookups/receiving/`)) {
      if (options.schema === false) return json({ code: "store-unavailable", message: "Current receiving names are unavailable." }, 503);
      const kind = path.split("/").at(-1), offset = Number(url.searchParams.get("offset") ?? "0");
      const firstPage = options.categoryPages && kind === "categories" && offset === 0;
      const laterPage = options.categoryPages && kind === "categories" && offset === 25;
      return json({ kind, companyId: company,
        items: firstPage ? Array.from({ length: 25 }, (_, index) => ({ id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
          displayName: `Category ${index + 1}`, code: `C${index + 1}`, principalId: null }))
          : laterPage ? [{ id: "99999999-9999-4999-8999-999999999999", displayName: "Extra category", code: "EXTRA", principalId: null }] : [],
        total: options.categoryPages && kind === "categories" ? 26 : 0, offset, limit: 25,
        nextOffset: firstPage ? 25 : null, isAuthority: false, canAcceptDelivery: false });
    }
    if (path === `${base}/lookups/sourcing-reviewers`) return options.schema === false
      ? json({ code: "store-unavailable", message: "Reviewer setup unavailable." }, 503)
      : json({ items: [], total: 0, offset: 0, limit: 25, nextOffset: null, isAuthority: false, configurationVersion: 1 });
    if (path === `${base}/effective`) return options.schema === false
      ? json({ code: "store-unavailable", message: "Invoice rule setup unavailable." }, 503)
      : json({ status: "MissingPolicy", isAuthority: false, policy: null, evaluatedAt: new Date().toISOString() });
    if (path === base && request.method() === "GET") {
      expect(url.searchParams.get("key")).toBe(options.key);
      return json({ items: [], total: 0, page: 1, pageSize: 100 });
    }
    if (path === `${base}/validate`) return json({ isValid: true, issues: [] });
    if (path === base && request.method() === "POST") {
      creates++;
      if (options.lostCreate) return route.abort("failed");
      const draft = request.postDataJSON();
      return json({ ...draft, id: "33333333-3333-4333-8333-333333333333", state: "Draft",
        policyVersionNumber: 1, version: 1, createdAt: new Date().toISOString() }, 201);
    }
    return json({ code: "unexpected", message: `${request.method()} ${path}` }, 404);
  });
  return { creates: () => creates };
}

test("invoice rule reader gets the real list without mutation controls", async ({ page }) => {
  await fixture(page, { key: "INVOICE_MATCHING", permissions: ["procurement-configuration-read"] });
  await page.goto("/procurement/workspace/settings/modules/bills/preferences");
  await expect(page.getByText("No invoice rules yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add draft" })).toHaveCount(0);
});

test("invoice rule editor blocks a second create after lost response and reload", async ({ page }) => {
  const state = await fixture(page, { key: "INVOICE_MATCHING", permissions: ["procurement-configuration-read", "procurement-configuration-edit"], lostCreate: true });
  await page.goto("/procurement/workspace/settings/modules/bills/preferences");
  await page.getByRole("button", { name: "Add draft" }).click();
  await page.getByLabel("Category code").fill("LAPTOPS");
  await page.getByRole("combobox", { name: "Money decimal places", exact: true }).click();
  await page.getByRole("option", { name: "2", exact: true }).click();
  await page.getByRole("combobox", { name: "Rounding", exact: true }).click();
  await page.getByRole("option", { name: "To nearest even", exact: true }).click();
  await page.getByRole("combobox", { name: "Check method", exact: true }).click();
  await page.getByRole("option", { name: "Order and invoice", exact: true }).click();
  for (const amount of await page.getByLabel("Allowed amount").all()) await amount.fill("0");
  for (const percent of await page.getByLabel("Allowed percent").all()) await percent.fill("0");
  const combinations = page.getByRole("combobox", { name: "How limits combine", exact: true });
  await expect(combinations).toHaveCount(4);
  for (const combine of await combinations.all()) {
    await combine.click();
    await page.getByRole("option", { name: "Both limits must pass", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("A previous change has no confirmed result.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Category code")).toHaveValue("LAPTOPS");
  await page.reload();
  await expect(page.getByRole("button", { name: "Add draft" })).toHaveCount(0);
  expect(state.creates()).toBe(1);
});

test("RFQ settings keep unavailable reviewer setup read-only", async ({ page }) => {
  await fixture(page, { key: "SOURCING", permissions: ["procurement-configuration-read", "procurement-configuration-edit"], schema: false });
  await page.goto("/procurement/workspace/settings/modules/request-for-quotes/approvals");
  await expect(page.getByText("Named reviewer setup is unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add draft" })).toHaveCount(0);
});

test("receiving settings keep unavailable canonical names read-only", async ({ page }) => {
  await fixture(page, { key: "RECEIVING", permissions: ["procurement-configuration-read", "procurement-configuration-edit"], schema: false });
  await page.goto("/procurement/workspace/settings/modules/purchase-receives/preferences");
  await expect(page.getByText("Receiving configuration is unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add draft" })).toHaveCount(0);
});

test("receiving category picker reaches categories after the first page", async ({ page }) => {
  await fixture(page, { key: "RECEIVING", permissions: ["procurement-configuration-read", "procurement-configuration-edit"], categoryPages: true });
  await page.goto("/procurement/workspace/settings/modules/purchase-receives/preferences");
  await page.getByRole("button", { name: "Add draft" }).click();
  await page.getByRole("button", { name: "More categories" }).click();
  await page.getByRole("combobox", { name: "Purchase category", exact: true }).click();
  await page.getByRole("option", { name: "Extra category · EXTRA", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Purchase category", exact: true })).toHaveText("Extra category · EXTRA");
});
