import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222";
const person = "33333333-3333-4333-8333-333333333333", grant = "44444444-4444-4444-8444-444444444444";
const worker = "55555555-5555-4555-8555-555555555555", actor = "66666666-6666-4666-8666-666666666666";
const base = "/api/procurement/v1/configuration/spending-authorities", path = "/procurement/workspace/settings/modules/purchase-requests/approvals";
test.setTimeout(90_000);

async function mockSettings(page: Page, options: { readonly?: boolean; lost?: boolean; pending?: boolean; stale?: boolean } = {}) {
  const records: Array<Record<string, unknown>> = options.readonly || options.pending ? [{ id: grant, authorityReference: "MANAGER-LIMIT", authorityVersion: 1,
    principalId: person, principalDisplayName: "Named manager", configurationOwnerPrincipalId: actor, state: options.pending ? "PendingReview" : "Active", version: 1,
    currencyCode: "ZMW", amountBasis: "EstimatedLineBase", maximumAmount: "99999999999999.9999", effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveUntil: null,
    allBranches: false, branchRef: branch, allDepartments: true, departmentRef: null, allCategories: true, categoryCodes: [],
    allowedActions: options.readonly ? [] : ["Return", "Activate"], previousGrantId: null, previousVersion: null }] : [];
  const writes: Array<{ body: Record<string, unknown>; path: string }> = [], unexpected: string[] = [];
  let stale = options.stale;
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(company); expect(request.headers()["x-shell-location"]).toBe(branch);
    }
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Settings operator", roles: ["erp_admin"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (url.pathname === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker,
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
      permissions: ["procurement-access", "procurement-authority-read", ...(!options.readonly ? ["procurement-authority-configure", "procurement-authority-review"] : [])] });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map((key) => [key, key === "configurationDraft"])) });
    if (url.pathname.startsWith(base + "/lookups/")) {
      const kind = url.pathname.split("/").at(-1);
      return json({ items: kind === "people" ? [{ principalId: person, workerId: worker, displayName: "Named manager" }]
        : kind === "branches" ? [{ id: branch, name: "Main branch", code: "MAIN" }] : [], offset: 0, limit: 25, nextOffset: null });
    }
    if (url.pathname === base && request.method() === "GET") return json({ items: records, total: records.length, page: 1, pageSize: 25,
      currentActorPrincipalId: actor, canCreate: !options.readonly, scope: { branchId: branch, departmentId: null, confined: false } });
    if (url.pathname === base && request.method() === "POST") {
      const body = request.postDataJSON(); writes.push({ body, path: url.pathname });
      records.push({ ...body.draft, id: grant, authorityReference: body.authorityReference, principalId: body.principalId,
        authorityVersion: 1, principalDisplayName: "Named manager", configurationOwnerPrincipalId: actor,
        state: "Draft", version: 1, allowedActions: ["Edit"], previousGrantId: null, previousVersion: null });
      if (options.lost) return route.abort("failed");
      return json(records[0], 201);
    }
    if (url.pathname === `${base}/${grant}` && request.method() === "GET") return json(records[0]);
    if (url.pathname === `${base}/${grant}/activate`) {
      const body = request.postDataJSON(); writes.push({ body, path: url.pathname });
      if (stale) { stale = false; records[0] = { ...records[0], version: 2, state: "Active", allowedActions: [] }; return json({ code: "AuthorityConcurrentChange", title: "Refresh" }, 409); }
      records[0] = { ...records[0], version: 2, state: "Active", allowedActions: [] }; return json(records[0]);
    }
    unexpected.push(url.pathname); return json({ message: "No fixture for this endpoint" }, 404);
  });
  return { writes, unexpected };
}

async function newDraft(page: Page) {
  await page.goto(path);
  await page.getByRole("tab", { name: "Approval limits", exact: true }).click();
  await page.getByRole("button", { name: "Add approval limit", exact: true }).click();
  await page.getByLabel("Limit reference", { exact: true }).fill("MANAGER-LIMIT");
  await page.getByRole("combobox", { name: "Person", exact: true }).click();
  await page.getByRole("option", { name: "Named manager", exact: true }).click();
  await page.getByLabel("Maximum amount").fill("99999999999999.9999");
}

test("approval limit draft uses scoped named people and preserves the exact maximum decimal", async ({ page }) => {
  const evidence = await mockSettings(page); await newDraft(page);
  await page.getByRole("button", { name: "Save limit draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  expect(evidence.writes).toHaveLength(1);
  expect(evidence.writes[0].body.draft).toMatchObject({ maximumAmount: "99999999999999.9999", currencyCode: "ZMW", amountBasis: "EstimatedLineBase", branchRef: branch });
  await expect(page.getByRole("cell", { name: "ZMW 99999999999999.9999", exact: true })).toBeVisible();
  expect(evidence.unexpected).toEqual([]);
});

test("an interrupted create cannot be automatically retried and reconciles the real saved draft", async ({ page }) => {
  const evidence = await mockSettings(page, { lost: true }); await newDraft(page);
  await page.getByRole("button", { name: "Save limit draft", exact: true }).click();
  await expect(page.getByText("This form will not repeat the create or update.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add approval limit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save limit draft", exact: true })).toHaveCount(0);
  expect(evidence.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Refresh and check saved result", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Named manager", exact: true })).toBeVisible();
  expect(evidence.writes).toHaveLength(1);
});

test("a read-only operator sees names and exact amounts without edit or activation controls", async ({ page }) => {
  const evidence = await mockSettings(page, { readonly: true }); await page.goto(path);
  await page.getByRole("tab", { name: "Approval limits", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Named manager", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add approval limit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate limit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toHaveCount(0);
  expect(evidence.unexpected).toEqual([]);
});

test("independent activation requires a reason and stale review clears the obsolete action", async ({ page }) => {
  const evidence = await mockSettings(page, { pending: true, stale: true }); await page.goto(path);
  await page.getByRole("tab", { name: "Approval limits", exact: true }).click();
  await page.getByRole("button", { name: "Activate limit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Activate limit", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason", { exact: true }).fill("Independent verification completed");
  await dialog.getByRole("button", { name: "Activate limit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh and compare");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate limit", exact: true })).toHaveCount(0);
  expect(evidence.writes).toHaveLength(1);
});
