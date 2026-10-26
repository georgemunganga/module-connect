import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const requestLine = "55555555-5555-4555-8555-555555555555";
const supplier = "66666666-6666-4666-8666-666666666666";
const order = "77777777-7777-4777-8777-777777777777";
const orderLine = "88888888-8888-4888-8888-888888888888";
const digest = "a".repeat(64);
const root = "/procurement/workspace/purchase-orders";
const api = "/api/procurement/v1/orders";

async function setup(page: Page, options: { capability?: boolean; convert?: boolean; all?: boolean;
  lost?: boolean; wrongDetail?: boolean } = {}) {
  const requests: string[] = [], writes: { body: string; key: string }[] = [];
  let saved = false;
  let convertAllowed = options.convert !== false;
  await page.addInitScript(() => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: actor, isActive: true,
      displayName: "Buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1, tenantId: "amizo", principalId: actor,
      organisationWide: !!options.all, companies: [{ id: company, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branch, code: "HQ", name: "Lusaka", legalEntityId: company, type: "Headquarters" }] });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Lusaka", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [branch], confined: true });
    if (path === "/api/procurement/v1/context") return json({ principalId: actor, tenantId: "amizo", legalEntityId: company,
      workerId: null, permissions: ["procurement-access", "procurement-po-read", ...(convertAllowed ? ["procurement-po-convert"] : [])],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
      branch: request.headers()["x-shell-branch-scope"] === "all" ? null : { id: branch } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: { ...Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
        "orders", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal",
        "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, false])),
        principalDirectOrderDrafts: options.capability !== false } });
    if (path === `${api}/approved-principal-direct-sources`) return json({ items: [{ purchaseRequestId: requestId,
      purchaseRequestLineId: requestLine, requestNumber: "PR-APPROVED", branchRef: branch, expectedRequestVersion: 3,
      description: "Supplies", unitCode: "each", categoryCode: "SUP", availableQuantity: "2", approvedUnitEstimate: "3.1250",
      currencyCode: "ZMW", canSelect: true }], candidateTotal: 1, page: 1, pageSize: 25,
      eligibilityMeaning: "CurrentPreviewOnly", canSubmit: false });
    if (path === `${api}/principal-direct-suppliers`) return json({ items: [{ id: supplier, number: "SUP-1", displayName: "Approved supplier" }],
      total: 1, page: 1, pageSize: 25 });
    if (path === `${api}/principal-direct-drafts`) return json({ items: [], total: 0, page: 1, pageSize: 25, canSubmit: false, canIssue: false });
    const ack = { orderId: order, number: "PO-DRAFT-1", status: "Draft", version: 1, originalDirectSourceSha256: digest,
      commandKey: writes[0]?.key, recordedHistoricalResult: true, canSubmit: false, canIssue: false, financeReservationChanged: false };
    if (path === `${api}/from-approved-principal-direct-sources`) {
      writes.push({ body: request.postData() ?? "", key: request.headers()["idempotency-key"] }); saved = true;
      if (options.lost) return route.abort("failed");
      return json({ ...ack, commandKey: writes[0].key }, 201);
    }
    if (path.startsWith(`${api}/principal-direct-command-receipts/Create/`)) {
      expect(path.endsWith(writes[0]?.key)).toBe(true); return saved ? json(ack, 201) : json({ code: "missing" }, 404);
    }
    if (path === `${api}/${order}/principal-direct-draft`) return json({ id: order, number: "PO-DRAFT-1", supplierId: supplier,
      supplierDisplayName: "Approved supplier", branchRef: branch, branchDisplayName: "Lusaka", currencyCode: "ZMW",
      status: "Draft", version: 1, createdAt: "2026-10-26T00:00:00Z", originalDirectSourceSha256: digest,
      shipToRef: null, billToRef: null, paymentTermRef: null, expectedDeliveryOn: null, closureReason: null,
      canSubmit: false, canIssue: false, financeReservationChanged: false,
      lines: [{ id: orderLine, lineNumber: 1, description: "Supplies", unitCode: "EACH",
        quantity: options.wrongDetail ? "1.0001" : "2", unitPrice: "3.1250", taxAmount: "0",
        purchaseRequestId: requestId, purchaseRequestLineId: requestLine, allocationStatus: "Reserved" }] });
    return json({ message: `Unexpected fixture route ${path}` }, 404);
  });
  return { requests, writes, revokeConvert: () => { convertAllowed = false; } };
}

async function chooseSupplier(page: Page) {
  await page.getByRole("combobox", { name: /Supplier/ }).click();
  const option = page.getByRole("option", { name: "Approved supplier", exact: true });
  await option.click();
}
test("creates one internal draft with exact numeric values and shared editor layout", async ({ page }) => {
  const evidence = await setup(page); await page.goto(`${root}/new?workflow=principal`);
  await expect(page.getByRole("button", { name: "Close editor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved requests" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and send" })).toBeDisabled();
  await page.getByRole("button", { name: "Add line" }).click(); await chooseSupplier(page);
  await page.getByRole("button", { name: "Save internal draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-DRAFT-1" })).toBeVisible();
  expect(evidence.writes).toHaveLength(1);
  expect(evidence.writes[0].body).toContain('"unitPrice":3.1250');
  expect(evidence.writes[0].body).toContain(`"purchaseRequestLineId":"${requestLine}"`);
  expect(evidence.requests.filter(value => value.includes("principal-direct-command-receipts/Create"))).toHaveLength(1);
});
test("lost acknowledgement survives hard reload and recovers by original key without another POST", async ({ page }) => {
  const evidence = await setup(page, { lost: true }); await page.goto(`${root}/new?workflow=principal`);
  await page.getByRole("button", { name: "Add line" }).click(); await chooseSupplier(page);
  await page.getByRole("button", { name: "Save internal draft" }).click();
  await expect(page.getByRole("button", { name: "Check saved result" })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Check saved result" }).click();
  await expect(page.getByRole("heading", { name: "PO-DRAFT-1" })).toBeVisible();
  expect(evidence.writes).toHaveLength(1);
});
test("wrong durable detail retains the command for review", async ({ page }) => {
  const evidence = await setup(page, { wrongDetail: true }); await page.goto(`${root}/new?workflow=principal`);
  await page.getByRole("button", { name: "Add line" }).click(); await chooseSupplier(page);
  await page.getByRole("button", { name: "Save internal draft" }).click();
  await expect(page.getByRole("button", { name: "Check saved result" })).toBeVisible();
  expect(evidence.writes).toHaveLength(1);
});
test("missing capability or convert grant makes new work unavailable without source requests", async ({ page }) => {
  const evidence = await setup(page, { capability: false }); await page.goto(`${root}/new?workflow=principal`);
  await expect(page.getByText("This workflow is being connected to your ERP.", { exact: false })).toBeVisible();
  expect(evidence.requests.some(value => value.includes("approved-principal-direct-sources"))).toBe(false);
});
test("current permission revocation closes the editor before any save", async ({ page }) => {
  const evidence = await setup(page); await page.goto(`${root}/new?workflow=principal`);
  await expect(page.getByRole("button", { name: "Add line" })).toBeVisible();
  evidence.revokeConvert(); await page.reload();
  await expect(page.getByText("Creating an order from approved requests is unavailable for this account.")).toBeVisible();
  expect(evidence.writes).toHaveLength(0);
});
test("mobile editor retains the shared controls without a save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const evidence = await setup(page); await page.goto(`${root}/new?workflow=principal`);
  await expect(page.getByRole("button", { name: "Close editor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved requests" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and send" })).toBeDisabled();
  expect(evidence.writes).toHaveLength(0);
});
test("company All remains a read scope and blocks branch-owned creation", async ({ page }) => {
  const evidence = await setup(page, { all: true }); await page.goto(`${root}?workflow=principal`);
  await expect(page.getByRole("heading", { name: "Purchase Orders" })).toBeVisible();
  await page.evaluate(entityId => { localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branchScope: "all" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" })); }, company);
  await page.evaluate(path => { history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }, `${root}/new?workflow=principal`);
  await expect(page.getByText("Choose a permitted branch in Organisation context", { exact: false })).toBeVisible();
  expect(evidence.writes).toHaveLength(0);
});
