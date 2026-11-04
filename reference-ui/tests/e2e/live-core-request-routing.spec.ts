import { expect, test, type Page } from "@playwright/test";
import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
const company = "11111111-1111-4111-8111-111111111111";
const department = "44444444-4444-4444-8444-444444444444";
const approver = "22222222-2222-4222-8222-222222222222";
const base = "/api/procurement/v1/configuration/policies";
const path = "/procurement/workspace/settings/buying-rules";
async function fixture(page: Page, options: { reader?: boolean; unavailable?: boolean; lost?: boolean } = {}) {
  const creates: any[] = []; const validates: any[] = []; const records: any[] = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("test", fixturePrincipal, [{ companyId: company, branchId: fixtureBranch, code: "TEST", name: "Fixture company" }]));
    if (p === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: fixturePrincipal, isActive: true, roles: ["procurement_manager"], displayName: "Core manager" } });
    if (p === "/api/hrm/branding") return json({ displayName: "Fixture company" });
    if (p === "/api/procurement/v1/context") return json({ principalId: fixturePrincipal, tenantId: "test", legalEntityId: company, workerId: null,
      permissions: ["procurement-access", "procurement-configuration-read", ...(options.reader ? [] : ["procurement-configuration-edit"])], company: { id: company, code: "TEST", name: "Fixture company", currencyCode: "ZMW" } });
    if (p === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities: {
      vendorDraft: false, itemDraft: false, requestDraft: false, approvals: false, sourcing: false, contracts: false, orders: false,
      receiving: false, invoiceValidation: false, financeHandoff: false, supplierPortal: false, configurationDraft: true, planningDraft: false, contractDraft: false, sourcingDraft: false,
    } });
    if (p === base && req.method() === "GET") return json({ items: records, total: records.length, page: 1, pageSize: 100 });
    if (p === `${base}/lookups/request-departments`) return json({ isAuthority: false, items: [{ id: department, label: "Engineering" }] });
    if (p === `${base}/lookups/request-roles`) return options.unavailable ? json({}, 503) : json({ isAuthority: false, items: [{ key: "supervisor", label: "Supervisor" }, { key: "executive", label: "Executive" }] });
    if (p === `${base}/lookups/request-approvers`) return options.unavailable ? json({}, 503) : json({ isAuthority: false, items: [{ principalId: approver, displayName: "Named supervisor" }], total: 1, nextOffset: null });
    if (p === `${base}/validate`) { validates.push(JSON.parse(req.postDataJSON().rulesJson)); return json({ isValid: true, issues: [] }); }
    if (p === base && req.method() === "POST") {
      const body = req.postDataJSON(); creates.push(body);
      if (options.lost) return route.abort("failed");
      const record = { ...body, id: "33333333-3333-4333-8333-333333333333", state: "Draft", policyVersionNumber: 1, version: 1 };
      records.push(record); return json(record, 201);
    }
    return json({ code: "Unexpected", message: p }, 404);
  });
  return { creates, validates };
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click();
}
async function start(page: Page) { await page.goto(path); await page.getByRole("button", { name: "Add buying rule draft", exact: true }).first().click(); }

test("workerless Core user configures supervisor then executive with the existing form and named picker", async ({ page }) => {
  const api = await fixture(page); await start(page);
  await choose(page, "For departments (optional)", "Engineering");
  await choose(page, "For branches (optional)", "Synthetic branch");
  await page.getByLabel("Step name", { exact: true }).fill("SUPERVISOR");
  await choose(page, "Approver for step 1", "Named supervisor");
  await page.getByRole("button", { name: "Add approval step", exact: true }).click();
  const second = page.getByRole("region", { name: "Approval step 2", exact: true });
  await second.getByLabel("Step name", { exact: true }).fill("EXECUTIVE");
  await second.getByRole("combobox", { name: "Who approves", exact: true }).click();
  await page.getByRole("option", { name: "Someone with a Core role", exact: true }).click();
  await choose(page, "Role for step 2", "Executive");
  await second.getByRole("button", { name: "Move up", exact: true }).click();
  const first = page.getByRole("region", { name: "Approval step 1", exact: true });
  await expect(first.getByLabel("Step name", { exact: true })).toHaveValue("EXECUTIVE");
  await first.getByRole("button", { name: "Move down", exact: true }).click();
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect.poll(() => api.creates.length).toBe(1);
  const rule = JSON.parse(api.creates[0].rulesJson);
  expect(rule.schemaVersion).toBe(2);
  expect(rule.rules[0].result.approvalStages.map((x: any) => x.binding)).toEqual([{ kind: "CoreUser", key: approver }, { kind: "CoreRole", key: "executive" }]);
  expect(rule.rules[0].when.requesterRoleKeys).toEqual([]);
  expect(rule.rules[0].when.departmentIds).toEqual([department]);
  expect(rule.rules[0].when.branchIds).toEqual([fixtureBranch]);
});

test("requester role condition survives validation without live approval", async ({ page }) => {
  const api = await fixture(page); await start(page);
  await choose(page, "Use this rule when the requester has a role (optional)", "Supervisor");
  await choose(page, "Who approves", "Someone with a Core role"); await choose(page, "Role for step 1", "Executive");
  await page.getByLabel("Step name", { exact: true }).fill("EXECUTIVE");
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect.poll(() => api.validates.length).toBe(1);
  expect(api.validates[0].rules[0].when.requesterRoleKeys).toEqual(["supervisor"]);
  expect(api.creates[0].state).toBeUndefined(); // Only a draft create was requested; no publish/approval mutation.
});

test("unavailable names preserve the form and cannot create an unbound approval policy", async ({ page }) => {
  const api = await fixture(page, { unavailable: true }); await start(page);
  await expect(page.getByText("Core roles could not be loaded.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect(page.getByText("Choose a Core approver or role for each step, and check the step names.")).toBeVisible();
  expect(api.creates).toHaveLength(0); expect(api.validates).toHaveLength(0);
});

test("reader sees buying rules without draft controls", async ({ page }) => {
  await fixture(page, { reader: true }); await page.goto(path);
  await expect(page.getByRole("heading", { name: "Buying rules", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add buying rule draft", exact: true })).toHaveCount(0);
});
