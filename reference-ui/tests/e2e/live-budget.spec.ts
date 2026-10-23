import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);
const companyId = "11111111-1111-4111-8111-111111111111";
const principalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workerId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const checkId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "orderDraft", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff",
  "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "requestDraft"]));

async function mockErp(page: Page, canReview: boolean) {
  let saved: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
  }, companyId);
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { id: principalId, isActive: true, displayName: "Finance reviewer", email: "finance@example.test", roles: [] } });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1,
      tenantId: "amizo", principalId, organisationWide: true,
      companies: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branchId, code: "HQ", name: "Lusaka", legalEntityId: companyId }] });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId,
      code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId, tenantId: "amizo",
      workLocationId: branchId, branch: { id: branchId, code: "HQ", name: "Lusaka" },
      legalEntityId: companyId, workerId,
      permissions: canReview ? ["procurement-access", "procurement-budget-check"] : ["procurement-access"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/requests/budget-queue") return json({ records: [{
      id: requestId, number: "PR-001", purpose: "Office chairs", currencyCode: "ZMW",
      submittedAt: "2026-10-20T10:00:00Z", version: 3, approvalState: "PendingPolicyAndBudget",
      createdBy: "requester-1", estimatedAmount: 2500,
      estimatedAmountExact: "2500.00000000", minimumCheckedAmountExact: "2500.0000",
    }], count: 1, limit: 50, offset: 0 });
    if (path === `/api/procurement/v1/requests/${requestId}/budget-checks`) {
      if (request.method() === "GET") return json({ records: saved ? [saved] : [] });
      const body = request.postDataJSON();
      if (body.requestVersion !== 3) return json({ message: "Refresh this request before recording a budget decision." }, 409);
      saved = { ...body, id: checkId, checkedAmountExact: body.checkedAmount, checkedAt: "2026-10-20T11:00:00Z",
        checkedBySubjectId: workerId };
      return json(saved, 201);
    }
    return json({ message: `Unmocked API ${path}` }, 500);
  });
  return { saved: () => saved };
}

test("Finance records a confirmed check and sees its history", async ({ page }) => {
  const state = await mockErp(page, true);
  await page.goto("/procurement/workspace/budgets");
  await expect(page.getByText("Office chairs")).toBeVisible();
  await page.getByRole("button", { name: "Review funding" }).click();
  await page.getByLabel("Finance check reference").fill("FIN-2026-001");
  await page.getByLabel("Exact amount checked").fill("2500.0000");
  await page.getByLabel("Evidence reference").fill("finance/checks/001");
  await page.getByRole("button", { name: "Save Finance check" }).click();
  expect(state.saved()).toBeNull();
  await page.getByLabel("Confirmed Finance reservation reference").fill("RES-001");
  await page.getByRole("button", { name: "Save Finance check" }).click();
  await expect(page.getByText("Finance check saved for PR-001.", { exact: false })).toBeVisible();
  await expect(page.getByText("FIN-2026-001")).toBeVisible();
  expect(state.saved()).toMatchObject({ requestVersion: 3, status: "Available",
    checkedAmount: "2500.0000", currencyCode: "ZMW", reservationRef: "RES-001", reservationStatus: "Confirmed" });
});

test("budget queue stays closed without Finance permission", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/budgets");
  await expect(page.getByText("Finance budget review access is needed")).toBeVisible();
  await expect(page.getByText("Office chairs")).toHaveCount(0);
});
