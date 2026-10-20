import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal",
  "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft" || key === "invoiceIntake"]));

async function mockErp(page: Page, canCapture = true, options: { documents?: boolean; seed?: boolean; loseUploadResponse?: boolean; failedScan?: boolean; fileLimit?: number } = {}) {
  let invoice: Record<string, unknown> | null = options.seed ? {
    id: invoiceId, supplierId: vendorId, supplierName: "Office Supplier", invoiceNumber: "INV-DOC-1",
    invoiceDate: "2026-10-20", currencyCode: "ZMW", status: "Received", intakeChannel: "Manual",
    grossAmount: 100, netAmount: 100, taxAmount: 0, version: 1,
    lines: [{ id: "line-1", lineNumber: 1, description: "Supplies", quantity: 1, unitPrice: 100, taxAmount: 0 }],
  } : null;
  const documents: Record<string, unknown>[] = [];
  const uploadKeys = new Map<string, Record<string, unknown>>();
  let lostResponse = false;
  await page.addInitScript(({ entityId, branch }) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch }));
  }, { entityId: companyId, branch: branchId });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/procurement/v1/")
      && (request.headers()["x-shell-entity"] !== companyId || request.headers()["x-shell-location"] !== branchId))
      return json({ message: "The selected branch was not sent." }, 403);
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
      legalEntityId: companyId, schemaReady: true, capabilities: { ...capabilities, invoiceDocuments: options.documents === true } });
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
      invoice = { ...input, id: invoiceId, branchRef: branchId, supplierName: "Office Supplier", status: "Received",
        intakeChannel: "Manual", invoiceNumber: input.invoiceNumber.trim(),
        currencyCode: input.currencyCode.toUpperCase(), netAmount, taxAmount,
        grossAmount: netAmount + taxAmount, version: 1, createdAt: "2026-10-20T00:00:00Z",
        lines: input.lines.map((line: unknown, at: number) => ({ ...line as object, id: `${at + 1}`, lineNumber: at + 1 })) };
      return json({ id: invoiceId, invoiceNumber: invoice.invoiceNumber, status: "Received",
        grossAmount: invoice.grossAmount, currencyCode: invoice.currencyCode, version: 1 }, 201);
    }
    const documentPath = `/api/procurement/v1/invoices/${invoiceId}/documents`;
    if (url.pathname === documentPath) {
      if (request.method() === "GET") return json({ items: documents, limits: { maxFileBytes: 10 * 1024 * 1024, maxOwnerFiles: options.fileLimit ?? 10 } });
      if (!canCapture) return json({ message: "Invoice document access denied." }, 403);
      const key = request.headers()["idempotency-key"];
      if (!key || request.headers()["content-type"] !== "application/octet-stream")
        return json({ message: "The upload key or file content type was missing." }, 400);
      let document = uploadKeys.get(key);
      if (!document) {
        document = { documentId: "66666666-6666-4666-8666-666666666666", versionId: "77777777-7777-4777-8777-777777777777",
          versionNumber: 1, fileName: decodeURIComponent(request.headers()["x-document-name"]),
          mediaType: "application/pdf", sizeBytes: request.postDataBuffer()?.length || 0, sha256: "a".repeat(64),
          scanState: options.failedScan ? "ScanFailed" : "Available", canDownload: !options.failedScan };
        documents.push(document); uploadKeys.set(key, document);
      }
      if (options.loseUploadResponse && !lostResponse) { lostResponse = true; return route.abort("failed"); }
      return json(document);
    }
    if (url.pathname.startsWith(documentPath + "/") && url.pathname.endsWith("/retry-scan")) {
      documents[0].scanState = "Available"; documents[0].canDownload = true;
      return json(documents[0]);
    }
    if (url.pathname.startsWith(documentPath + "/") && url.pathname.endsWith("/download")) {
      if (!documents[0]?.canDownload) return json({ message: "This file has not passed its security check." }, 409);
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.7 synthetic evidence" });
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


test("invoice document upload recovers a lost response without duplicating evidence", async ({ page }) => {
  await mockErp(page, true, { documents: true, seed: true, loseUploadResponse: true, fileLimit: 1 });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByText("No documents added yet.")).toBeVisible();
  await page.getByLabel("Invoice document").setInputFiles({ name: "original invoice.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 synthetic evidence") });
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("cell", { name: "original invoice.pdf", exact: true })).toHaveCount(1);
  await expect(page.getByText("File limit reached.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add document", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("File saved and checked.");
  await expect(page.getByRole("cell", { name: "original invoice.pdf", exact: true })).toHaveCount(1);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await pending).suggestedFilename()).toBe("original invoice.pdf");
  await page.reload();
  await expect(page.getByRole("cell", { name: "original invoice.pdf", exact: true })).toHaveCount(1);
});

test("invoice document stays unavailable until a failed security check succeeds", async ({ page }) => {
  await mockErp(page, true, { documents: true, seed: true, failedScan: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByLabel("Invoice document").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 synthetic evidence") });
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByText("Check needs retry", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry security check", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
});

test("read-only invoice access does not grant document upload", async ({ page }) => {
  await mockErp(page, false, { documents: true, seed: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByText("No documents added yet.")).toBeVisible();
  await expect(page.getByLabel("Invoice document")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add document", exact: true })).toHaveCount(0);
});

for (const status of [403, 404]) {
  test(`invoice navigation clears previous details and document actions after ${status}`, async ({ page }) => {
    await mockErp(page, true, { documents: true, seed: true });
    const missingId = "88888888-8888-4888-8888-888888888888";
    await page.route(`**/api/procurement/v1/invoices/${missingId}`, (route) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify({ message: "Invoice not found." }),
    }));
    await page.goto(`/procurement/workspace/bills/${invoiceId}`);
    await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toBeVisible();
    await expect(page.getByLabel("Invoice document")).toBeVisible();
    await page.evaluate((path) => {
      history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/procurement/workspace/bills/${missingId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      status === 403 ? "You do not have invoice access" : "Invoice not found.");
    await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Invoice document")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add document", exact: true })).toHaveCount(0);
  });
}
