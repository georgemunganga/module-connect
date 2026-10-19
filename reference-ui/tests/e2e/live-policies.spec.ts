import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const policyId = "99999999-9999-4999-8999-999999999999";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "configurationDraft"]));

async function mockErp(page: Page, options: { invalid?: boolean; denied?: boolean; detailed?: boolean } = {}) {
  let record: Record<string, unknown> | null = options.detailed ? {
    id: policyId, policyKey: "PURCHASE_REQUEST", policyVersionNumber: 1,
    effectiveFrom: "2026-10-19T00:00:00Z", effectiveTo: null, state: "Draft", version: 1,
    createdAt: "2026-10-19T00:00:00Z",
    rulesJson: JSON.stringify({ schemaVersion: 1, transactionType: "PurchaseRequest", currencyCode: "ZMW",
      amountBasis: "EstimatedGross", rules: [{ code: "BRANCH", priority: 0,
        when: { minimumAmountInclusive: null, maximumAmountExclusive: null, categoryCodes: [], purchaseTypes: [],
          branchIds: ["77777777-7777-4777-8777-777777777777"] },
        result: { budgetReservation: "Required", sourcingMethodCode: null, minimumQuoteCount: null,
          approvalStages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] } }] }),
  } : null;
  let savedRules: Record<string, unknown> | null = null;
  let reviewNote: string | null = null;
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
      workerId: "22222222-2222-4222-8222-222222222222", permissions: ["procurement-configuration-edit"],
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
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return { rules: () => savedRules, reviewNote: () => reviewNote };
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
  expect(state.rules()).toMatchObject({ currencyCode: "ZMW", amountBasis: "EstimatedGross",
    rules: [{ when: { minimumAmountInclusive: 5000 }, result: { minimumQuoteCount: 3 } }] });
  await page.reload();
  await expect(page.getByRole("cell", { name: "Purchase requests" })).toBeVisible();
  await page.getByRole("button", { name: "Edit draft" }).click();
  await expect(page.getByLabel("Amount from (ZMW)")).toHaveValue("5000");
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
  await expect(page.getByRole("alert")).toContainText("fuller editor");
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
