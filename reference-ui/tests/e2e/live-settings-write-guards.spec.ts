import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, key === "configurationDraft"]));

async function fixture(page: Page, permissions: string[], options: { pendingValidation?: () => Promise<void>; lostCreate?: boolean } = {}) {
  let policyCreates = 0;
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: ["procurement_manager"], displayName: "Test user" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Test company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Test company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...permissions], company: { id: company, code: "TEST", name: "Test company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/configuration/categories" && method === "GET") return json({ items: [{ id: recordId, code: "IT", name: "Technology", status: "Draft", version: 1,
      createdAt: "2026-10-22T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/configuration/policies/validate" && method === "POST") {
      if (options.pendingValidation) await options.pendingValidation();
      return json({ isValid: true, issues: [] });
    }
    if (path === "/api/procurement/v1/configuration/policies" && method === "GET") return json({ items: [{ id: recordId,
      policyKey: "PURCHASE_REQUEST", policyVersionNumber: 1, state: "PendingReview", version: 1,
      effectiveFrom: "2026-12-01T00:00:00Z", effectiveTo: null, createdAt: "2026-10-22T00:00:00Z" }], total: 1, page: 1, pageSize: 100 });
    if (path === "/api/procurement/v1/configuration/policies" && method === "POST") {
      policyCreates++;
      if (options.lostCreate) return route.abort("failed");
      return json({ id: recordId, policyKey: "PURCHASE_REQUEST", policyVersionNumber: 2, state: "Draft", version: 1,
        effectiveFrom: "2026-12-01T00:00:00Z", effectiveTo: null, rulesJson: request.postDataJSON().rulesJson,
        createdAt: "2026-10-22T00:00:00Z" }, 201);
    }
    return json({ message: `Unexpected ${method} ${path}` }, 404);
  });
  return { policyCreates: () => policyCreates };
}

test("configuration and policy readers can inspect lists without write controls", async ({ page }) => {
  await fixture(page, ["procurement-configuration-read"]);
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByText("Technology")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add category" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review" })).toHaveCount(0);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await expect(page.getByRole("cell", { name: "Purchase requests" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add buying rule draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
});

test("approve-only reviewer sees review controls without draft editors", async ({ page }) => {
  await fixture(page, ["procurement-configuration-read", "procurement-configuration-approve"]);
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByRole("button", { name: "Review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add category" })).toHaveCount(0);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add buying rule draft" })).toHaveCount(0);
});

test("lost policy create response locks a second POST and retains the entered rule", async ({ page }) => {
  const state = await fixture(page, ["procurement-configuration-read", "procurement-configuration-edit"], { lostCreate: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByLabel("Rule code").fill("KEEP_ME");
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await expect(page.getByText("A change is unconfirmed or these rules changed.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Rule code")).toHaveValue("KEEP_ME");
  await expect(page.getByRole("button", { name: "Check and save draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Check saved rules (read only)" }).click();
  expect(state.policyCreates()).toBe(1);
});

test("validation finishing after leaving settings cannot start a policy create", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const state = await fixture(page, ["procurement-configuration-read", "procurement-configuration-edit"], { pendingValidation: () => pending });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await page.getByRole("link", { name: "Close Settings and return home" }).click();
  release();
  await page.waitForTimeout(100);
  expect(state.policyCreates()).toBe(0);
});
