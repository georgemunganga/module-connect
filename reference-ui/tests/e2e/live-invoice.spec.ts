import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";
const lineId = "66666666-6666-4666-8666-666666666666";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal",
  "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft" || key === "invoiceIntake"]));

async function mockErp(page: Page, canCapture = true, options: { documents?: boolean; seed?: boolean; loseUploadResponse?: boolean; failedScan?: boolean; fileLimit?: number; comparison?: boolean; readinessDenied?: boolean; staleReview?: boolean } = {}) {
  let invoice: Record<string, unknown> | null = options.seed ? {
    id: invoiceId, supplierId: vendorId, supplierName: "Office Supplier", invoiceNumber: "INV-DOC-1",
    invoiceDate: "2026-10-20", currencyCode: "ZMW", status: "Received", intakeChannel: "Manual",
    grossAmount: 100, netAmount: 100, taxAmount: 0, version: 1,
    lines: [{ id: lineId, lineNumber: 1, description: "Supplies", quantity: 1, unitPrice: 100, taxAmount: 0 }],
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
      legalEntityId: companyId, schemaReady: true, capabilities: { ...capabilities, invoiceDocuments: options.documents === true, invoiceComparison: options.comparison === true } });
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
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}/finance-readiness` && invoice) {
      if (options.readinessDenied) return json({ message: "Denied" }, 403);
      return json({ invoiceId, invoiceVersion: options.staleReview ? 2 : invoice.version, invoiceStatus: "Received", state: "Blocked", canPrepareHandoff: false,
        evidence: { matchingSchemaAvailable: false, mappingState: "Unavailable", mappingVersionId: null, mappingRevision: null, mappingOriginalCurrent: null,
          comparisonId: null, comparisonInvoiceVersion: null, comparisonOriginalCurrent: null, recordedComparison: null, unresolvedExceptionCount: null, comparisonCurrentness: "NotRevalidated" },
        blockers: [{ code: "InvoiceValidationAuthorityUnavailable", message: "Invoice approval and accounting validation are not connected yet." },
          { code: "FinanceReceiverUnavailable", message: "A Finance receiver is not connected for supplier invoices." }],
        nextSteps: [{ code: "ReviewInvoiceDocuments", message: "Check the original invoice documents." }] });
    }
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}/matching` && invoice) return json({ invoiceId, version: invoice.version,
      canPostToFinance: false, isInvoiceApproval: false, matchingStateIsRecordedResult: true,
      original: { netAmount: "100", taxAmount: "0", grossAmount: "100", currencyCode: "ZMW", lines: [{ id: lineId, lineNumber: 1, description: "Supplies", quantity: "1", unitPrice: "100", taxAmount: "0" }] },
      mappings: [], exceptions: [], comparisons: [{ id: vendorId, outcome: "Blocked", matchedAt: "2026-10-20T12:00:00Z", invoiceVersion: 1,
        hasHeldCapacityClaim: false, recordedHistoricalResult: true, isCurrentApproval: false, canPostToFinance: false,
        comparison: { outcome: "Blocked", discrepancies: [{ invoiceLineId: lineId, code: "OwnerHistoryUnavailable" }],
          lines: [{ invoiceLineId: lineId, method: 1, quantity: "99999999999999.9999", netAmount: "0.00010001", taxAmount: "0", expectedUnitPrice: "100.00000001" }] } }] });
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

test("Bills detail explains missing invoice approval and Finance without creating a transaction", async ({ page }) => {
  await mockErp(page, true, { seed: true });
  const writes: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/procurement/v1/invoices") && request.method() !== "GET") writes.push(request.method()); });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Review and Finance" })).toBeVisible();
  await expect(page.getByText("Not ready for Finance", { exact: true })).toBeVisible();
  await expect(page.getByText("Invoice approval and accounting validation are not connected yet.")).toBeVisible();
  await expect(page.getByText("Check the original invoice documents.")).toBeVisible();
  await expect(page.getByRole("button", { name: /pay|post|approve|compare|send to finance/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh invoice", exact: true }).click();
  await expect(page.getByText("Not ready for Finance", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test("Recorded comparison keeps exact values and remains separate from approval and payment", async ({ page }) => {
  await mockErp(page, true, { seed: true, comparison: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Recorded review history" })).toBeVisible();
  await expect(page.getByText("99999999999999.9999", { exact: true })).toBeVisible();
  await expect(page.getByText("ZMW 0.00010001", { exact: true })).toBeVisible();
  await expect(page.getByText("ZMW 100.00000001", { exact: true })).toBeVisible();
  await expect(page.getByText("Finance history is not connected.", { exact: false })).toBeVisible();
  await expect(page.getByText("Saved results are history. They are not a current invoice approval or permission to pay.")).toBeVisible();
  await expect(page.getByRole("button", { name: /pay|post|approve|compare|send to finance/i })).toHaveCount(0);
});

for (const option of ["readinessDenied", "staleReview"] as const) test(`Invoice review clears history on ${option}`, async ({ page }) => {
  await mockErp(page, true, { seed: true, comparison: true, [option]: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("alert").filter({ hasText: option === "readinessDenied" ? "do not have access" : "invoice changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recorded review history" })).toHaveCount(0);
  await expect(page.getByText("99999999999999.9999", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toBeVisible();
});


test("Changing Core branch clears original invoice, documents and review before delayed replacement reads", async ({ page }) => {
  await mockErp(page, true, { seed: true, documents: true, comparison: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recorded review history" })).toBeVisible();
  let release: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/procurement/v1/invoices/${invoiceId}`, async (route) => {
    await delayed;
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Invoice unavailable in this branch." }) });
  });
  const replacementBranch = "77777777-7777-4777-8777-777777777777";
  await page.evaluate(({ company, branch }) => {
    const key = "erp.shell.state.v1", oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ entityId: company, branch }); localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue }));
  }, { company: companyId, branch: replacementBranch });
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recorded review history" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toHaveCount(0);
  release?.();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("99999999999999.9999", { exact: true })).toHaveCount(0);
});
