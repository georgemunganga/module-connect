import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal",
  "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft" || key === "invoiceIntake"]));

async function mockErp(page: Page, canCapture = true) {
  let invoice: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
  }, companyId);
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { isActive: true, displayName: "AP Processor", email: "ap@example.test", roles: ["ap_processor"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId,
      code: "AMIZO", registeredName: "Amizo Power" }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (url.pathname === "/api/procurement/v1/context") return json({ tenantId: "amizo",
      legalEntityId: companyId, workerId,
      permissions: canCapture ? ["procurement-access", "procurement-vendor-read",
        "procurement-invoice-read", "procurement-invoice-capture"]
        : ["procurement-access", "procurement-invoice-read"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities });
    if (url.pathname === "/api/procurement/v1/vendors") return json({ items: [{ id: vendorId,
      number: "VEN-001", displayName: "Office Supplier", legalName: "Office Supplier Ltd",
      countryCode: "ZM", status: "Active", isOrderable: true, version: 1,
      createdAt: "2026-10-20T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
    if (url.pathname === "/api/procurement/v1/invoices") {
      if (request.method() === "GET") return json({ items: invoice ? [invoice] : [],
        total: invoice ? 1 : 0, page: 1, pageSize: 25 });
      const input = request.postDataJSON();
      if (invoice && String(invoice.invoiceNumber).toUpperCase() === String(input.invoiceNumber).trim().toUpperCase())
        return json({ code: "duplicate-invoice", message: "This vendor invoice number is already recorded in this currency." }, 409);
      const netAmount = input.lines.reduce((sum: number, line: { quantity: number; unitPrice: number }) =>
        sum + line.quantity * line.unitPrice, 0);
      const taxAmount = input.lines.reduce((sum: number, line: { taxAmount: number }) => sum + line.taxAmount, 0);
      invoice = { ...input, id: invoiceId, supplierName: "Office Supplier", status: "Received",
        intakeChannel: "Manual", invoiceNumber: input.invoiceNumber.trim(),
        currencyCode: input.currencyCode.toUpperCase(), netAmount, taxAmount,
        grossAmount: netAmount + taxAmount, version: 1, createdAt: "2026-10-20T00:00:00Z",
        lines: input.lines.map((line: unknown, at: number) => ({ ...line as object, id: `${at + 1}`, lineNumber: at + 1 })) };
      return json({ id: invoiceId, invoiceNumber: invoice.invoiceNumber, status: "Received",
        grossAmount: invoice.grossAmount, currencyCode: invoice.currencyCode, version: 1 }, 201);
    }
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}` && invoice)
      return json({ ...invoice, nextStep: "Confirm source evidence and resolve duplicate or PO exceptions before matching." });
    return json({ title: `Unexpected route: ${url.pathname}` }, 404);
  });
}

test("AP records a supplier invoice as received and sees no payment action", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/bills");
  await expect(page.getByText("No invoices received yet")).toBeVisible();
  await page.getByRole("button", { name: "Record invoice" }).first().click();
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Invoice number").fill("INV-001");
  await page.getByLabel("Description 1").fill("Office supplies");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit price").fill("125");
  await page.getByLabel("Tax amount").fill("25");
  await page.getByRole("button", { name: "Record as received" }).click();
  await expect(page.getByRole("heading", { name: "Invoice INV-001" })).toBeVisible();
  await expect(page.getByText("ZMW 275.00")).toBeVisible();
  await expect(page.getByText("Confirm source evidence")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /pay|post|approve/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Invoice INV-001" })).toBeVisible();
});

test("read-only invoice user cannot start intake", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/bills");
  await expect(page.getByRole("button", { name: "Record invoice" })).toHaveCount(0);
  await page.goto("/procurement/workspace/bills/new");
  await expect(page.getByText("You do not have access to record invoices")).toBeVisible();
});
