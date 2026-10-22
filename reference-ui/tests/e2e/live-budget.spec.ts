import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);
const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const checkId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "orderDraft", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff",
  "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "requestDraft"]));

async function mockErp(page: Page, canReview: boolean, options: { sourceAmount?: string; currentVersion?: number; businessVersion?: number; omitBusinessVersion?: boolean; loseSave?: boolean } = {}) {
  const amount = options.sourceAmount ?? "2500", currentVersion = options.currentVersion ?? 3, businessVersion = options.businessVersion ?? 3;
  const posts: unknown[] = []; let historyReads = 0, lost = false;
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
      user: { isActive: true, displayName: "Finance reviewer", email: "finance@example.test", roles: [] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId,
      code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo",
      legalEntityId: companyId, workerId,
      permissions: canReview ? ["procurement-access", "procurement-budget-check"] : ["procurement-access"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities });
    const rawSaved = () => saved ? JSON.stringify({ ...saved, checkedAmount: undefined }).slice(0, -1) + ',"checkedAmount":' + saved.checkedAmount + '}' : "null";
    if (path === "/api/procurement/v1/requests/budget-queue") {
      const record = { id: requestId, number: "PR-001", purpose: "Office chairs", currencyCode: "ZMW",
        submittedAt: "2026-10-20T10:00:00Z", version: currentVersion, ...(options.omitBusinessVersion ? {} : { businessVersion }),
        approvalState: "PendingPolicyAndBudget", createdBy: "requester-1" };
      // Explicit trusted fixture lexeme: preserve actual backend numeric wire; no JS financial Number.
      return route.fulfill({ contentType: "application/json", body: '{"records":[' + JSON.stringify(record).slice(0, -1)
        + ',"estimatedAmount":' + amount + '}],"count":1,"limit":50,"offset":0}' });
    }
    if (path === `/api/procurement/v1/requests/${requestId}/budget-checks`) {
      if (request.method() === "GET") { ++historyReads; return route.fulfill({ contentType: "application/json", body: '{"records":[' + (saved ? rawSaved() : "") + ']}' }); }
      const body = request.postDataJSON(); posts.push(body);
      if (body.requestVersion !== currentVersion) return json({ message: "Refresh this request before recording a budget decision." }, 409);
      saved = { ...body, id: checkId, requestVersion: businessVersion, checkedAt: "2026-10-20T11:00:00Z", checkedBySubjectId: workerId };
      if (options.loseSave && !lost) { lost = true; return route.abort("failed"); }
      return route.fulfill({ status: 201, contentType: "application/json", body: rawSaved() });
    }
    return json({ message: `Unmocked API ${path}` }, 500);
  });
  return { saved: () => saved, posts, historyReads: () => historyReads };
}

test("Finance records a confirmed check and sees its history", async ({ page }) => {
  const state = await mockErp(page, true);
  await page.goto("/procurement/workspace/budgets");
  await expect(page.getByText("Office chairs")).toBeVisible();
  await page.getByRole("button", { name: "Review funding" }).click();
  await page.getByRole("combobox", { name: "Funding outcome" }).click();
  await page.getByRole("option", { name: "Full amount available", exact: true }).click();
  await page.getByLabel("Finance check reference").fill("FIN-2026-001");
  await page.getByLabel("Evidence reference").fill("finance/checks/001");
  await page.getByRole("button", { name: "Save Finance check" }).click();
  expect(state.saved()).toBeNull();
  await page.getByLabel("Confirmed Finance reservation reference").fill("RES-001");
  await page.getByRole("button", { name: "Save Finance check" }).click();
  await expect(page.getByText("Finance check saved for PR-001.", { exact: false })).toBeVisible();
  await expect(page.getByText("FIN-2026-001")).toBeVisible();
  expect(state.saved()).toMatchObject({ requestVersion: 3, status: "Available",
    checkedAmount: "2500", currencyCode: "ZMW", reservationRef: "RES-001", reservationStatus: "Confirmed" });
});

test("budget queue stays closed without Finance permission", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/budgets");
  await expect(page.getByText("Finance budget review access is needed")).toBeVisible();
  await expect(page.getByText("Office chairs")).toHaveCount(0);
});

async function fillFinance(page: Page) {
  await page.getByRole("textbox", { name: "Finance check reference", exact: true }).fill("FIN-EXACT-1");
  await page.getByRole("textbox", { name: /Evidence reference/ }).fill("finance/checks/exact-1");
  await page.getByRole("combobox", { name: "Funding outcome", exact: true }).click();
  await page.getByRole("option", { name: "Full amount available", exact: true }).click();
  await page.getByRole("textbox", { name: "Confirmed Finance reservation reference", exact: true }).fill("RES-EXACT-1");
}
test("wide raw numeric request and checked amount preserve exact4dp with current CAS separate from business version", async ({ page }) => {
  const state = await mockErp(page, true, { sourceAmount: "12345678901234.5678", currentVersion: 5, businessVersion: 3 });
  await page.goto("/procurement/workspace/budgets"); await expect(page.getByText("ZMW 12,345,678,901,234.5678", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review funding", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /Amount checked/ })).toHaveValue("12345678901234.5678");
  await expect(page.getByRole("combobox", { name: "Funding outcome", exact: true })).toContainText("Choose funding outcome");
  await fillFinance(page); await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
  await expect(page.getByText("Finance check saved for PR-001.", { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0]).toMatchObject({ checkedAmount: "12345678901234.5678", requestVersion: 5 });
  expect(state.saved()).toMatchObject({ checkedAmount: "12345678901234.5678", requestVersion: 3 });
});
test("eight-place source requires explicit Finance reviewed amount without rounding or underfunding", async ({ page }) => {
  const state = await mockErp(page, true, { sourceAmount: "0.00010001" }); await page.goto("/procurement/workspace/budgets");
  await expect(page.getByText("ZMW 0.00010001", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Review funding", exact: true }).click();
  const amount = page.getByRole("textbox", { name: /Amount checked/ }); await expect(amount).toHaveValue("");
  await expect(page.getByText("This request has more precision", { exact: false })).toBeVisible();
  await fillFinance(page); await amount.fill("0.0001"); await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("full exact request amount"); expect(state.posts).toHaveLength(0);
  await amount.fill("0.00010001"); await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("four decimal"); expect(state.posts).toHaveLength(0);
  await amount.fill("0.0002"); await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
  await expect(page.getByText("Finance check saved for PR-001.", { exact: false })).toBeVisible(); expect(state.posts[0]).toMatchObject({ checkedAmount: "0.0002" });
});
test("interrupted Finance save reads recorded funding without automatic retry or recorder confirmation", async ({ page }) => {
  const state = await mockErp(page, true, { sourceAmount: "12345678901234.5678", loseSave: true });
  await page.goto("/procurement/workspace/budgets"); await page.getByRole("button", { name: "Review funding", exact: true }).click(); await fillFinance(page);
  await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review recorded funding", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Finance check", exact: true })).toHaveCount(0); expect(state.posts).toHaveLength(1);
  await page.getByRole("button", { name: "Check recorded funding", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("does not identify who recorded");
  await expect(page.getByRole("heading", { name: "Review recorded funding", exact: true })).toBeVisible();
  await expect(page.getByText("Finance check saved for PR-001.", { exact: false })).toHaveCount(0);
  expect(state.posts).toHaveLength(1); expect(state.historyReads()).toBe(2);
});
test("older queue without authoritative business version cannot open a Finance save", async ({ page }) => {
  const state = await mockErp(page, true, { omitBusinessVersion: true }); await page.goto("/procurement/workspace/budgets");
  await expect(page.getByRole("alert")).toContainText("business version"); await expect(page.getByRole("button", { name: "Review funding", exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});
