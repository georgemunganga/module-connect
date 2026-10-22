import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", unavailable = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const policy = "33333333-3333-4333-8333-333333333333", KEY = "INVOICE_UNIT_REVIEW";
const base = "/api/procurement/v1/configuration/policies", path = "/procurement/workspace/settings/modules/bills/preferences?rule=unit-review";
const rules = () => JSON.stringify({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages: [{ code: "ORIGINAL", mode: "One", principals: [reviewer] }] });
const saved = (state = "Draft") => ({ id: policy, policyKey: KEY, policyVersionNumber: 1, version: 1, state,
  effectiveFrom: "2026-11-01T00:00:00.000Z", effectiveTo: null, rulesJson: rules(), createdAt: "2026-10-22T00:00:00Z" });
async function fixture(page: Page, options: { edit?: boolean; approve?: boolean; schema?: boolean; state?: string; status?: number; malformed?: boolean; deniedPublish?: boolean } = {}) {
  let record = options.state ? saved(options.state) : null;
  const commands: string[] = [], bodies: Record<string, unknown>[] = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (endpoint === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: [], displayName: "Core system account" } });
    if (endpoint === "/api/hrm/branding") return json({ displayName: "Company" });
    if (endpoint === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Company" }] });
    if (endpoint === "/api/hrm/admin/locations") return json({ items: [] });
    if (endpoint === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (endpoint === "/api/procurement/v1/context") return json({ principalId: actor, tenantId: "test", legalEntityId: company, workerId: null,
      permissions: ["procurement-access", "procurement-configuration-read", ...(options.edit ? ["procurement-configuration-edit"] : []), ...(options.approve ? ["procurement-configuration-approve"] : [])],
      company: { id: company, code: "TEST", name: "Company", currencyCode: "ZMW" } });
    if (endpoint === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true,
      capabilities: { vendorDraft: false, itemDraft: false, requestDraft: false, approvals: false, sourcing: false, contracts: false, orders: false,
        receiving: false, invoiceValidation: false, financeHandoff: false, supplierPortal: false, planningDraft: false, configurationDraft: true, contractDraft: false, sourcingDraft: false } });
    if (endpoint === `${base}/effective`) return options.schema === false ? json({ message: "Review schema unavailable" }, 503)
      : json({ status: "MissingPolicy", isAuthority: false, policy: null });
    if (endpoint === `${base}/lookups/invoice-unit-reviewers`) return json({ items: [
      { principalId: reviewer, displayName: "Alice Core", canReviewOriginalUnits: true },
      { principalId: unavailable, displayName: "Bob Core", canReviewOriginalUnits: false },
    ], candidateTotal: 2, offset: 0, limit: 25, isAuthority: false });
    if (endpoint === base && request.method() === "GET") return json({ items: url.searchParams.get("key") === KEY && record ? [record] : [], total: record ? 1 : 0, page: 1, pageSize: 100 });
    if (endpoint === `${base}/${policy}` && request.method() === "GET") return json(record);
    if (endpoint === `${base}/validate`) {
      const definition = JSON.parse(request.postDataJSON().rulesJson);
      const complete = definition.stages.length > 0 && definition.stages.every((stage: { principals: string[] }) => stage.principals.length > 0);
      return json({ isValid: true, issues: [], reviewConfigurationComplete: complete, reviewIssues: complete ? [] : ["InvoiceUnitReviewNamedStagesRequired"], canPublish: false, isAuthority: false });
    }
    if (endpoint.startsWith(base) && request.method() !== "GET") {
      commands.push(`${request.method()} ${endpoint}`); bodies.push(request.postDataJSON());
      if (options.status) return json({ message: "Outcome not confirmed" }, options.status);
      if (endpoint === base) {
        record = { ...saved(), ...request.postDataJSON() };
        return json(options.malformed ? { ...record, policyKey: "INVOICE_MATCHING" } : record, 201);
      }
      if (endpoint === `${base}/${policy}`) { record = { ...record!, ...request.postDataJSON().draft, version: record!.version + 1 }; return json(record); }
      if (endpoint.endsWith("/publish") && options.deniedPublish) return json({ message: "The original author cannot publish their own rules." }, 403);
      if (endpoint.endsWith("/submit-review")) record = { ...record!, state: "PendingReview", version: record!.version + 1 };
      else if (endpoint.endsWith("/publish")) record = { ...record!, state: "Published", version: record!.version + 1 };
      else if (endpoint.endsWith("/return-for-changes")) record = { ...record!, state: "Draft", version: record!.version + 1 };
      else return json({ message: "Unexpected command" }, 404);
      return json(record);
    }
    return json({ message: `${request.method()} ${endpoint} unavailable in this presentation test` }, 404);
  });
  return { commands, bodies };
}
async function newDraft(page: Page) {
  await page.goto(path); await page.getByRole("button", { name: "Add review draft", exact: true }).click();
  await page.getByRole("button", { name: "Add review step", exact: true }).click();
  await page.getByLabel("Step code", { exact: true }).fill("ORIGINAL");
  await page.getByRole("combobox", { name: "Who must decide?", exact: true }).click();
  await page.getByRole("option", { name: "One of the named reviewers", exact: true }).click();
  await page.getByRole("button", { name: "Choose reviewers", exact: true }).click();
  const alice = page.getByRole("listitem").filter({ hasText: "Alice Core" });
  await alice.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bob Core" }).getByRole("button", { name: "Add reviewer", exact: true })).toBeDisabled();
}

test("system-only configuration reader sees separate bill tabs without write authority", async ({ page }) => {
  const state = await fixture(page); await page.goto(path);
  await expect(page.getByRole("tab", { name: "Bill review rules", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No bill review rules", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add review draft", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Invoice matching", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice matching rules", exact: true })).toBeVisible(); expect(state.commands).toEqual([]);
});
test("named Core reviewer draft creates, reloads, edits and submits without an employee", async ({ page }) => {
  const state = await fixture(page, { edit: true }); await newDraft(page);
  await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit review draft", exact: true })).toBeVisible(); await page.reload();
  await page.getByRole("button", { name: "Edit review draft", exact: true }).click(); await page.getByLabel("Step code", { exact: true }).fill("ORIGINAL_REVISED");
  await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await page.getByLabel("Reason for this rule decision", { exact: true }).fill("Review the named independent people");
  await page.getByRole("button", { name: "Confirm rule decision", exact: true }).click();
  await expect(page.getByText("PendingReview", { exact: true })).toBeVisible();
  expect(state.commands).toEqual([`POST ${base}`, `PUT ${base}/${policy}`, `POST ${base}/${policy}/submit-review`]);
  expect(JSON.parse(String(state.bodies[0].rulesJson))).toMatchObject({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages: [{ code: "ORIGINAL", mode: "One", principals: [reviewer] }] });
  expect(JSON.stringify(state.bodies)).not.toContain("worker");
});
for (const action of ["publish", "return"] as const) test(`authorized pending rule ${action} uses the owning versioned action`, async ({ page }) => {
  const state = await fixture(page, { approve: true, state: "PendingReview" }); await page.goto(path);
  await page.getByRole("button", { name: action === "publish" ? "Publish review rules" : "Return for changes", exact: true }).click();
  await page.getByLabel("Reason for this rule decision", { exact: true }).fill("Current authorized independent policy decision");
  await page.getByRole("button", { name: "Confirm rule decision", exact: true }).click();
  await expect(page.getByText(action === "publish" ? "Published" : "Draft", { exact: true })).toBeVisible();
  expect(state.commands).toEqual([`POST ${base}/${policy}/${action === "publish" ? "publish" : "return-for-changes"}`]);
  expect(state.bodies[0]).toMatchObject({ version: 1 });
});
test("missing retained schema leaves saved rules readable and all mutations unavailable", async ({ page }) => {
  const state = await fixture(page, { edit: true, approve: true, schema: false, state: "Draft" }); await page.goto(path);
  await expect(page.getByText("Bill review controls are not ready for changes.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add review draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit review draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "View review rule", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved review rules · version 1", exact: true })).toBeVisible(); expect(state.commands).toEqual([]);
});
for (const status of [408, 429, 499]) test(`HTTP ${status} after draft command retains its marker across reload`, async ({ page }) => {
  const state = await fixture(page, { edit: true, status }); await newDraft(page); await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A previous change is unconfirmed" })).toBeVisible();
  await expect(page.getByLabel("Step code", { exact: true })).toHaveValue("ORIGINAL"); await page.reload();
  await expect(page.getByRole("button", { name: "Add review draft", exact: true })).toBeDisabled(); expect(state.commands).toHaveLength(1);
});
test("mismatched persisted receipt keeps draft commands blocked", async ({ page }) => {
  const state = await fixture(page, { edit: true, malformed: true }); await newDraft(page); await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A previous change is unconfirmed" })).toBeVisible(); await page.reload();
  await expect(page.getByRole("button", { name: "Add review draft", exact: true })).toBeDisabled(); expect(state.commands).toHaveLength(1);
});
test("rejected journal storage aborts before the consequential POST", async ({ page }) => {
  const state = await fixture(page, { edit: true });
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith("procurement.policy.command.pending.v1:")) throw new Error("Synthetic denied journal"); return original.call(this, key, value);
  }; });
  await newDraft(page); await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "An earlier change is unconfirmed" })).toBeVisible(); expect(state.commands).toEqual([]);
});
test("unfinished empty draft stays draft and cannot submit a review command", async ({ page }) => {
  const state = await fixture(page, { edit: true }); await page.goto(path);
  await page.getByRole("button", { name: "Add review draft", exact: true }).click();
  await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await page.getByLabel("Reason for this rule decision", { exact: true }).fill("This is deliberately incomplete");
  await page.getByRole("button", { name: "Confirm rule decision", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose one to 16 review steps" })).toBeVisible();
  expect(state.commands).toEqual([`POST ${base}`]); expect(JSON.parse(String(state.bodies[0].rulesJson)).stages).toEqual([]);
});
test("server denial of self publication leaves the pending version and blocks repetition", async ({ page }) => {
  const state = await fixture(page, { approve: true, state: "PendingReview", deniedPublish: true }); await page.goto(path);
  await page.getByRole("button", { name: "Publish review rules", exact: true }).click();
  await page.getByLabel("Reason for this rule decision", { exact: true }).fill("Server must reject original author");
  await page.getByRole("button", { name: "Confirm rule decision", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You do not have access" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Publish review rules", exact: true })).toBeDisabled();
  await expect(page.getByText("PendingReview", { exact: true })).toBeVisible(); expect(state.commands).toHaveLength(1);
});
