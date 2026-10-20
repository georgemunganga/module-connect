import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const policyId = "99999999-9999-4999-8999-999999999999";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "configurationDraft"]));

async function mockErp(page: Page, options: { invalid?: boolean; denied?: boolean; detailed?: boolean; canApprove?: boolean; legacyOrder?: boolean } = {}) {
  let record: Record<string, unknown> | null = options.detailed ? {
    id: policyId, policyKey: "PURCHASE_REQUEST", policyVersionNumber: 1,
    effectiveFrom: "2026-10-19T00:00:00Z", effectiveTo: null, state: "Draft", version: 1,
    createdAt: "2026-10-19T00:00:00Z",
    rulesJson: JSON.stringify({ schemaVersion: 1, transactionType: "PurchaseRequest", currencyCode: "ZMW",
      amountBasis: "EstimatedLineBase", rules: [{ code: "BRANCH", priority: 0,
        when: { minimumAmountInclusive: null, maximumAmountExclusive: null, categoryCodes: [], purchaseTypes: [],
          branchIds: ["77777777-7777-4777-8777-777777777777"] },
        result: { budgetReservation: "Required", sourcingMethodCode: null, minimumQuoteCount: null,
          approvalStages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] } }] }),
  } : null;
  if (options.legacyOrder) record = {
    id: policyId, policyKey: "PURCHASE_ORDER", policyVersionNumber: 1,
    effectiveFrom: "2026-10-19T00:00:00Z", effectiveTo: null, state: "Draft", version: 1,
    createdAt: "2026-10-19T00:00:00Z",
    rulesJson: JSON.stringify({ schemaVersion: 1, transactionType: "PurchaseOrder", currencyCode: "ZMW",
      amountBasis: "ApprovedLineBase", rules: [{ code: "LEGACY_ORDER", priority: 0,
        when: { minimumAmountInclusive: null, maximumAmountExclusive: null, categoryCodes: [], purchaseTypes: [], branchIds: [] },
        result: { budgetReservation: "Required", sourcingMethodCode: null, minimumQuoteCount: null,
          approvalStages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] } }] }),
  };
  let savedRules: Record<string, unknown> | null = null;
  let reviewNote: string | null = null;
  let lastSample: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Manager", email: "manager@example.test", roles: ["procurement_manager"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: companyId,
      workerId: "22222222-2222-4222-8222-222222222222", permissions: options.canApprove
        ? ["procurement-configuration-read", "procurement-configuration-edit", "procurement-configuration-approve"]
        : ["procurement-configuration-read", "procurement-configuration-edit"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    const base = "/api/procurement/v1/configuration/policies";
    if (path === `${base}/validate`) {
      if (options.denied) return json({ message: "Forbidden" }, 403);
      const body = request.postDataJSON();
      savedRules = JSON.parse(body.rulesJson);
      return json(options.invalid ? { isValid: false, issues: [{ path: "$.rules[0].result.approvalStages", message: "Choose an approver." }] }
        : { isValid: true, issues: [] });
    }
    if (path === base) {
      if (request.method() === "GET") return json({ items: record ? [record] : [], total: record ? 1 : 0, page: 1, pageSize: 100 });
      if (request.method() === "POST") {
        const draft = request.postDataJSON();
        record = { ...draft, id: policyId, policyVersionNumber: 1, state: "Draft", version: 1,
          createdAt: "2026-10-19T00:00:00Z" };
        return json(record, 201);
      }
    }
    if (path === `${base}/${policyId}` && record) {
      if (request.method() === "GET") return json(record);
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        record = { ...record, ...body.draft, version: 2 };
        return json(record);
      }
    }
    if (path === `${base}/${policyId}/submit-review` && record) {
      const body = request.postDataJSON();
      if (body.version !== record.version || !body.reason) return json({ message: "Refresh and enter a reason." }, 409);
      reviewNote = body.reason;
      record = { ...record, state: "PendingReview", version: Number(record.version) + 1 };
      return json(record);
    }
    if (path === `${base}/${policyId}/preview` && record) {
      lastSample = request.postDataJSON();
      return json({ policyId, policyVersionNumber: 1, state: record.state,
        isAuthority: false, coverageIssues: [{ path: "$.rules", message: "Check fallback coverage." }],
        decision: { status: "Match", ruleCode: "DEFAULT", priority: 0,
          budgetReservation: "Required", sourcingMethodCode: null, minimumQuoteCount: null,
          approvalStages: [{ code: "NEED", assignee: "LineManager", mode: "One" }], issues: [] } });
    }
    if ((path === `${base}/${policyId}/publish` || path === `${base}/${policyId}/return-for-changes`) && record) {
      const body = request.postDataJSON();
      if (body.version !== record.version || !body.reason) return json({ message: "Refresh and enter a reason." }, 409);
      record = { ...record, state: path.endsWith("/publish") ? "Published" : "Draft",
        version: Number(record.version) + 1,
        lastReturnReason: path.endsWith("/publish") ? null : body.reason };
      return json(record);
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return { rules: () => savedRules, reviewNote: () => reviewNote, sample: () => lastSample };
}

test("buying rule draft checks and saves with company currency", async ({ page }) => {
  const state = await mockErp(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await expect(page.getByRole("heading", { name: "Buying rules", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByLabel("Amount from (ZMW)").fill("5000");
  await page.getByLabel("Quotes needed (optional)").fill("3");
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await expect(page.getByRole("cell", { name: "Purchase requests" })).toBeVisible();
  expect(state.rules()).toMatchObject({ currencyCode: "ZMW", amountBasis: "EstimatedLineBase",
    rules: [{ when: { minimumAmountInclusive: 5000 }, result: { minimumQuoteCount: 3 } }] });
  await page.reload();
  await expect(page.getByRole("cell", { name: "Purchase requests" })).toBeVisible();
  await page.getByRole("button", { name: "Edit draft" }).click();
  await expect(page.getByLabel("Amount from (ZMW)")).toHaveValue("5000");
});

test("approval step editor retains One and All decisions, custom codes and exact financial thresholds", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByLabel("Amount from (ZMW)").fill("99999999999999.9998");
  await page.getByLabel("Amount below (ZMW)").fill("99999999999999.9999");
  await page.getByRole("button", { name: "Add approval step", exact: true }).click();
  await page.getByLabel("Step 2 code", { exact: true }).fill("PROC");
  await page.getByRole("combobox", { name: "Step 2 decision rule", exact: true }).click();
  await page.getByRole("option", { name: "All eligible reviewers", exact: true }).click();
  // Capture the raw policy JSON string, not a parsed JS Number that would itself round it.
  const saved = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/policies"));
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  const payload = (await saved).postDataJSON();
  expect(payload.rulesJson).toContain('"minimumAmountInclusive":99999999999999.9998');
  expect(payload.rulesJson).toContain('"maximumAmountExclusive":99999999999999.9999');
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByLabel("Amount from (ZMW)")).toHaveValue("99999999999999.9998");
  await expect(page.getByLabel("Amount below (ZMW)")).toHaveValue("99999999999999.9999");
  await expect(page.getByLabel("Step 2 code", { exact: true })).toHaveValue("PROC");
  await expect(page.getByRole("combobox", { name: "Step 2 decision rule", exact: true })).toHaveText("All eligible reviewers");
});

test("invalid buying rule stays in the editor with a field issue", async ({ page }) => {
  await mockErp(page, { invalid: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose an approver.");
  await expect(page.getByRole("heading", { name: "New buying rule draft" })).toBeVisible();
});

test("denied policy edits show an access message", async ({ page }) => {
  await mockErp(page, { denied: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("do not have access");
});

test("a detailed policy draft cannot be simplified by the basic editor", async ({ page }) => {
  await mockErp(page, { detailed: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft" }).click();
  await expect(page.getByRole("alert")).toContainText("read-only");
  await expect(page.getByLabel("Saved rule definition")).toHaveAttribute("readonly", "");
  await expect(page.getByRole("heading", { name: "Edit purchase request draft" })).toHaveCount(0);
});

test("draft author can send a checked rule for review without approval", async ({ page }) => {
  const state = await mockErp(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).first().click();
  await page.getByLabel("What should the reviewer check?").fill("Confirm approvers and budget rules");
  await page.getByRole("button", { name: "Send for review" }).last().click();
  await expect(page.getByRole("cell", { name: "PendingReview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toHaveCount(0);
  expect(state.reviewNote()).toBe("Confirm approvers and budget rules");
});

test("sample preview explains controls without approving a purchase", async ({ page }) => {
  const state = await mockErp(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await page.getByLabel("Sample line amount before adjustments (ZMW)").fill("6000");
  await page.getByLabel("Sample category").fill("IT");
  await page.getByRole("button", { name: "Check sample" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Matched DEFAULT" })).toBeVisible();
  await expect(page.getByText("This is not a spending approval.")).toBeVisible();
  expect(state.sample()).toMatchObject({ currencyCode: "ZMW", lineBaseAmount: 6000, categoryCode: "IT" });
});

test("reviewer can publish a future policy after review", async ({ page }) => {
  await mockErp(page, { canApprove: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).first().click();
  await page.getByLabel("What should the reviewer check?").fill("Check limits");
  await page.getByRole("button", { name: "Send for review" }).last().click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByLabel("Publication reason").fill("Reviewed the rules and dates");
  await page.getByRole("button", { name: "Publish rules" }).click();
  await expect(page.getByRole("cell", { name: "Published" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toHaveCount(0);
});

test("reviewer can return rules for correction", async ({ page }) => {
  await mockErp(page, { canApprove: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("button", { name: "Check and save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).first().click();
  await page.getByLabel("What should the reviewer check?").fill("Check limits");
  await page.getByRole("button", { name: "Send for review" }).last().click();
  await page.getByRole("button", { name: "Return for changes" }).click();
  await page.getByLabel("What needs to change?").fill("Add an amount band");
  await page.getByRole("button", { name: "Return to author" }).click();
  await expect(page.getByRole("cell", { name: "Draft", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toBeVisible();
  await page.getByRole("button", { name: "Edit draft" }).click();
  await expect(page.getByText("Reviewer asked for changes: Add an amount band")).toBeVisible();
});


test("PO policy setup requires procurement reviewers and preserves approved line basis", async ({ page }) => {
  await mockErp(page); await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Add buying rule draft" }).first().click();
  await page.getByRole("combobox", { name: "Use these rules for", exact: true }).click();
  await page.getByRole("option", { name: "Purchase orders", exact: true }).click();
  await page.getByRole("combobox", { name: "Step 1 reviewers", exact: true }).click();
  await expect(page.getByRole("option", { name: "Line manager", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Procurement managers", exact: true }).click();
  await page.getByLabel("Step 1 code", { exact: true }).fill("ORDER_COMMITTEE");
  await page.getByRole("combobox", { name: "Step 1 decision rule", exact: true }).click();
  await page.getByRole("option", { name: "All eligible reviewers", exact: true }).click();
  await page.getByLabel("Amount below (ZMW)").fill("99999999999999.9999");
  const saved = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/policies"));
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  const payload = (await saved).postDataJSON();
  expect(payload.policyKey).toBe("PURCHASE_ORDER");
  expect(payload.rulesJson).toContain('"amountBasis":"ApprovedLineBase"');
  expect(payload.rulesJson).toContain('"maximumAmountExclusive":99999999999999.9999');
  expect(JSON.parse(payload.rulesJson).rules[0].result.approvalStages).toEqual([{ code: "ORDER_COMMITTEE", assignee: "ProcurementManager", mode: "All" }]);
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByLabel("Amount below (ZMW)")).toHaveValue("99999999999999.9999");
  await expect(page.getByRole("combobox", { name: "Use these rules for", exact: true })).toBeDisabled();
});


test("historical PO rules with request-only reviewers stay read-only and cannot be sent for review", async ({ page }) => {
  const evidence = await mockErp(page, { legacyOrder: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByLabel("Saved rule definition", { exact: true })).toHaveValue(/LineManager/);
  await expect(page.getByRole("button", { name: "Check and save draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await expect(page.getByLabel("Saved rule definition", { exact: true })).toBeVisible();
  await expect(page.getByLabel("What should the reviewer check?", { exact: true })).toHaveCount(0);
  expect(evidence.reviewNote()).toBe("");
  expect(evidence.rules()).toBeNull();
});


test("PO module approval settings reuse the editor with PO defaults without changing request settings", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/settings/modules/purchase-orders/approvals");
  await page.getByRole("button", { name: "Add buying rule draft", exact: true }).first().click();
  await expect(page.getByRole("combobox", { name: "Use these rules for", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Use these rules for", exact: true })).toHaveText("Purchase orders");
  await expect(page.getByRole("combobox", { name: "Step 1 reviewers", exact: true })).toHaveText("Procurement managers");
  const saved = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/policies"));
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  const body = (await saved).postDataJSON();
  expect(body.policyKey).toBe("PURCHASE_ORDER");
  expect(JSON.parse(body.rulesJson).amountBasis).toBe("ApprovedLineBase");
  await page.goto("/procurement/workspace/settings/modules/purchase-requests/approvals");
  await page.getByRole("button", { name: "Add buying rule draft", exact: true }).first().click();
  await expect(page.getByRole("combobox", { name: "Use these rules for", exact: true })).toHaveText("Purchase requests");
  await expect(page.getByRole("combobox", { name: "Step 1 reviewers", exact: true })).toHaveText("Line manager");
});
