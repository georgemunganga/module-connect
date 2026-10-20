import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);
const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const firstLineId = "55555555-5555-4555-8555-555555555555";
const secondLineId = "66666666-6666-4666-8666-666666666666";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "orderDraft", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff",
  "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft" || key === "orderDraft"]));

async function mockErp(page: Page, canEdit = true) {
  let order: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
  }, companyId);
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { isActive: true, displayName: "Buyer", email: "buyer@example.test",
        roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId,
      code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo",
      legalEntityId: companyId, workerId,
      permissions: canEdit ? ["procurement-access", "procurement-vendor-read",
        "procurement-po-read", "procurement-po-create", "procurement-po-edit"]
        : ["procurement-access", "procurement-po-read"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: vendorId,
      number: "VEN-001", displayName: "Office Supplier", legalName: "Office Supplier Ltd",
      countryCode: "ZM", status: "Active", isOrderable: true, version: 1,
      createdAt: "2026-10-20T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/orders") {
      if (request.method() === "GET") return json({ items: order ? [order] : [],
        total: order ? 1 : 0, page: 1, pageSize: 25 });
      const draft = request.postDataJSON();
      order = { ...draft, id: orderId, number: "PO-001", supplierName: "Office Supplier",
        buyerSubjectId: workerId, status: "Draft", currencyCode: draft.currencyCode || "ZMW",
        version: 1, createdAt: "2026-10-20T00:00:00Z", closureReason: null,
        lines: draft.lines.map((line: Record<string, unknown>, at: number) => ({
          ...line, id: at === 0 ? firstLineId : secondLineId, lineNumber: at + 1,
        })), nextStep: "Approval and issue require an approved source, Finance commitment and delegated authority." };
      order.total = draft.lines.reduce((sum: number, line: { quantity: number; unitPrice: number; taxAmount: number }) =>
        sum + line.quantity * line.unitPrice + line.taxAmount, 0);
      return json(order, 201);
    }
    if (path === `/api/procurement/v1/orders/${orderId}` && order) {
      if (request.method() === "GET") return json(order);
      const { version, reason, draft } = request.postDataJSON();
      if (version !== order.version) return json({ message: "Refresh this order before saving." }, 409);
      if (draft.lines.some((line: { id?: string }) => line.id !== firstLineId) && !reason)
        return json({ message: "Give a reason for removing a saved line." }, 422);
      order = { ...order, ...draft, supplierName: "Office Supplier", version: Number(version) + 1,
        lines: draft.lines.map((line: Record<string, unknown>, at: number) => ({
          ...line, id: line.id || secondLineId, lineNumber: at + 2,
        })) };
      order.total = draft.lines.reduce((sum: number, line: { quantity: number; unitPrice: number; taxAmount: number }) =>
        sum + line.quantity * line.unitPrice + line.taxAmount, 0);
      return json(order);
    }
    if (path === `/api/procurement/v1/orders/${orderId}/cancel` && order) {
      const input = request.postDataJSON();
      order = { ...order, status: "Cancelled", closureReason: input.reason,
        version: Number(order.version) + 1 };
      return json(order);
    }
    return json({ title: `Unexpected route: ${path}` }, 404);
  });
}

test("buyer creates, revises and cancels an internal order draft", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/purchase-orders");
  await expect(page.getByText("No purchase orders yet")).toBeVisible();
  await page.getByRole("button", { name: "New order draft" }).first().click();
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Description 1").fill("Laptop");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit price").fill("500");
  await page.getByLabel("Tax amount").fill("100");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-001" })).toBeVisible();
  await expect(page.getByText("Estimated total ZMW 1,100.00")).toBeVisible();
  await expect(page.getByText("Approval and issue require an approved source")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /issue|approve|send/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit draft" }).click();
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description 2").fill("Monitor");
  await page.getByLabel("Unit price").last().fill("250");
  await page.getByRole("button", { name: "Remove line" }).first().click();
  await page.getByLabel("Reason for removing a saved line").fill("Need changed");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Estimated total ZMW 250.00")).toBeVisible();
  await expect(page.getByText("Monitor")).toBeVisible();
  await expect(page.getByText("Laptop")).toHaveCount(0);
  await page.getByLabel("Cancellation reason").fill("Request withdrawn");
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByText("Request withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "PO-001" })).toBeVisible();
});

test("read-only buyer cannot start or edit an order draft", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/purchase-orders");
  await expect(page.getByRole("button", { name: "New order draft" })).toHaveCount(0);
  await page.goto("/procurement/workspace/purchase-orders/new");
  await expect(page.getByText("You do not have access to edit purchase orders")).toBeVisible();
});
