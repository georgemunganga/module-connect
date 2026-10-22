import { expect, test, type Page } from "@playwright/test";
import { invoiceTotals } from "../../../src/platform/procurement-invoice-exact";

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

async function mockErp(page: Page, canCapture = true, options: { documents?: boolean; seed?: boolean; loseUploadResponse?: boolean; failedScan?: boolean; fileLimit?: number; comparison?: boolean; readinessDenied?: boolean; staleReview?: boolean; matching?: boolean; loseMappingResponse?: boolean; unknownAcceptance?: boolean } = {}) {
  let invoice: Record<string, unknown> | null = options.seed ? {
    id: invoiceId, supplierId: vendorId, supplierName: "Office Supplier", invoiceNumber: "INV-DOC-1",
    invoiceDate: "2026-10-20", currencyCode: "ZMW", status: "Received", intakeChannel: "Manual",
    grossAmount: 100, netAmount: 100, taxAmount: 0, version: 1,
    lines: [{ id: lineId, lineNumber: 1, description: "Supplies", quantity: 1, unitPrice: 100, taxAmount: 0 }],
  } : null;
  const sourceOrder = "77777777-7777-4777-8777-777777777777", issued = "88888888-8888-4888-8888-888888888888";
  const poLine = "99999999-9999-4999-8999-999999999999", policy = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const accepted = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", mapping = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const documentVersion = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  let currentMapping: string | null = null, mappingResponseLost = false;
  const saved = new Map<string, Record<string, unknown>>();
  const documents: Record<string, unknown>[] = options.matching ? [{ documentId: vendorId, versionId: documentVersion, versionNumber: 1,
    fileName: "Original invoice.pdf", mediaType: "application/pdf", sizeBytes: 100, sha256: "a".repeat(64), scanState: "Available", canDownload: true }] : [];
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
        "procurement-invoice-read", "procurement-invoice-capture", ...(options.matching ? ["procurement-invoice-match"] : [])]
        : ["procurement-access", "procurement-invoice-read"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities: { ...capabilities, invoiceDocuments: options.documents === true, invoiceComparison: options.comparison === true || options.matching === true } });
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
      const { netAmount, taxAmount, grossAmount } = invoiceTotals(input.lines);
      invoice = { ...input, id: invoiceId, branchRef: branchId, supplierName: "Office Supplier", status: "Received",
        intakeChannel: "Manual", invoiceNumber: input.invoiceNumber.trim(),
        currencyCode: input.currencyCode.toUpperCase(), netAmount, taxAmount,
        grossAmount, version: 1, createdAt: "2026-10-20T00:00:00Z",
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
        evidence: { matchingSchemaAvailable: options.matching === true, mappingState: currentMapping ? "ReviewRequired" : options.matching ? "NotMapped" : "Unavailable", mappingVersionId: currentMapping, mappingRevision: currentMapping ? 1 : null, mappingOriginalCurrent: currentMapping ? true : null,
          comparisonId: null, comparisonInvoiceVersion: null, comparisonOriginalCurrent: null, recordedComparison: null, unresolvedExceptionCount: options.matching ? 0 : null, comparisonCurrentness: "NotRevalidated" },
        blockers: [{ code: "InvoiceValidationAuthorityUnavailable", message: "Invoice approval and accounting validation are not connected yet." },
          { code: "FinanceReceiverUnavailable", message: "A Finance receiver is not connected for supplier invoices." }],
        nextSteps: [{ code: "ReviewInvoiceDocuments", message: "Check the original invoice documents." }] });
    }
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}/matching/sources` && invoice) return json({ invoiceId, invoiceVersion: invoice.version, policyVersionId: policy,
      items: [{ orderId: sourceOrder, orderNumber: "PO-1", issuedVersionId: issued, purchaseOrderLineId: poLine, description: "Supplies", unitCode: "EACH", quantity: "1", unitPrice: "100", taxAmount: "0", categoryCode: "OFFICE",
        method: "ThreeWay", acceptanceKind: "Goods", sourceState: "VerifiedIssued", blocker: null, canAllocate: false, canPostToFinance: false }], total: 1, page: 1, pageSize: 25, isAuthority: false, canPostToFinance: false });
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}/matching/sources/${sourceOrder}/lines/${poLine}/acceptances` && invoice) return json({ invoiceId, invoiceVersion: invoice.version,
      orderId: sourceOrder, issuedVersionId: issued, purchaseOrderLineId: poLine, policyVersionId: policy, method: "ThreeWay", state: options.unknownAcceptance ? "Unavailable" : "VerifiedHistorical",
      blocker: options.unknownAcceptance ? "AcceptanceHistoryUnavailable" : null,
      items: options.unknownAcceptance ? [] : [{ id: accepted, reference: "GRN-1", kind: "Goods", sourceVersion: 1, goodsReceiptLineId: accepted, serviceAcceptanceId: null,
        acceptedQuantity: "1", returnedQuantity: "0", historicalNetQuantity: "1", acceptedNetAmount: "100", returnedNetAmount: "0", historicalNetAmount: "100", acceptedAt: "2026-10-20T10:00:00Z", canAllocate: false, canPostToFinance: false }],
      total: options.unknownAcceptance ? null : 1, page: 1, pageSize: 25, availabilityMeaning: "HistoricalPhysicalFactsOnly", isAuthority: false, canAllocate: false, canPostToFinance: false });
    if ([`/api/procurement/v1/invoices/${invoiceId}/matching/mappings`, `/api/procurement/v1/invoices/${invoiceId}/matching/compare`].includes(url.pathname) && request.method() === "POST" && invoice) {
      const mappingOperation = url.pathname.endsWith("/mappings"), key = request.headers()["idempotency-key"];
      const input = request.postDataJSON(); expect(input.version).toBe(invoice.version);
      if (mappingOperation) { expect(input.purchaseOrderId).toBe(sourceOrder); expect(input.issuedVersionId).toBe(issued);
        expect(input.lines).toEqual([{ invoiceLineId: lineId, purchaseOrderLineId: poLine, goodsReceiptLineId: accepted, serviceAcceptanceId: null,
          invoiceUnitCode: "EACH", documentVersionId: documentVersion, documentLineReference: "Page 1 line 1" }]); currentMapping = mapping;
      } else expect(input.mappingVersionId).toBe(currentMapping);
      invoice.version = Number(invoice.version) + 1;
      const body = { invoiceId, commandKey: key, commandPermission: mappingOperation ? "procurement-invoice-capture" : "procurement-invoice-match", commandSchemaVersion: 1,
        recordedHistoricalResult: true, isCurrentApproval: false, canPostToFinance: false,
        result: mappingOperation ? { id: mapping, version: invoice.version, mappingRevision: 1, mappingSha256: "a".repeat(64), verificationState: "Unverified" }
          : { id: accepted, version: invoice.version, outcome: "Blocked", matchingState: "ComparisonBlocked", hasCapacityClaim: false, canPostToFinance: false, discrepancies: [{ invoiceLineId: lineId, code: "OwnerHistoryUnavailable" }] } };
      saved.set(key, body);
      if (mappingOperation && options.loseMappingResponse && !mappingResponseLost) { mappingResponseLost = true; return route.abort("failed"); }
      return json(body);
    }
    if (url.pathname.startsWith(`/api/procurement/v1/invoices/${invoiceId}/matching/commands/`) && invoice) {
      const key = url.pathname.split("/").at(-1)!; const body = saved.get(key);
      return body ? json({ operation: url.searchParams.get("operation"), commandKey: key, recordedHistoricalResult: true, isCurrentReplayAuthorization: false,
        currentInvoiceVersion: invoice.version, canPostToFinance: false, recordedResult: body }) : json({ message: "Not found" }, 404);
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
  await expect(page.getByRole("main").getByRole("button", { name: /pay|post|approve|compare|send to finance/i })).toHaveCount(0);
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
  await expect(page.getByRole("main").getByRole("button", { name: /pay|post|approve|compare|send to finance/i })).toHaveCount(0);
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


async function enterInvoiceLinks(page: Page) {
  await page.getByRole("button", { name: "Link invoice lines", exact: true }).click();
  await page.getByRole("button", { name: "Choose source", exact: true }).click();
  await page.getByRole("combobox", { name: "Receipt or service confirmation" }).click();
  await page.getByRole("option", { name: "GRN-1 · 1 · Goods receipt", exact: true }).click();
  await page.getByLabel("Unit on original invoice").fill("EACH");
  await page.getByRole("combobox", { name: "Original invoice document" }).click();
  await page.getByRole("option", { name: "Original invoice.pdf · Version 1", exact: true }).click();
  await page.getByLabel("Line or page reference in document").fill("Page 1 line 1");
}

test("Invoice links and explicit comparison use the current version without implying approval", async ({ page }) => {
  await mockErp(page, true, { seed: true, documents: true, matching: true });
  const writes: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/matching/") && request.method() === "POST") writes.push(request.url()); });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("button", { name: "Link invoice lines", exact: true })).toBeVisible(); expect(writes).toEqual([]);
  await enterInvoiceLinks(page);
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Save line links", exact: true }).click();
  await expect(page.getByText("Line links saved. Original units and documents still need verified review.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Run invoice comparison", exact: true }).click();
  await expect(page.getByText("Comparison recorded. Review the saved issues before continuing.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  await expect(page.getByRole("main").getByRole("button", { name: /pay|post|approve|send to finance/i })).toHaveCount(0);
});

test("Lost mapping response offers only original-key GET recovery, never another POST", async ({ page }) => {
  await mockErp(page, true, { seed: true, documents: true, matching: true, loseMappingResponse: true });
  const writes: { key: string; body: string | null }[] = [], recoveries: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/matching/mappings") && request.method() === "POST") writes.push({ key: request.headers()["idempotency-key"], body: request.postData() });
    if (request.url().includes("/matching/commands/") && request.method() === "GET") recoveries.push(request.url());
  });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`); await enterInvoiceLinks(page);
  await page.getByRole("button", { name: "Save line links", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check saved invoice action", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Save line links", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run invoice comparison", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved invoice action", exact: true }).click();
  await expect(page.getByText("Saved result found. Line links saved. Original units and documents still need verified review.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(recoveries).toHaveLength(1);
  expect(recoveries[0]).toContain(`/commands/${writes[0].key}?operation=InvoiceMapping`);
});

test("Unknown acceptance history is unavailable and cannot be saved as zero capacity", async ({ page }) => {
  await mockErp(page, true, { seed: true, documents: true, matching: true, unknownAcceptance: true });
  let writes = 0; page.on("request", (request) => { if (request.url().includes("/matching/") && request.method() === "POST") writes++; });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByRole("button", { name: "Link invoice lines", exact: true }).click();
  await page.getByRole("button", { name: "Choose source", exact: true }).click();
  await expect(page.getByText("Receipt history needs review. It cannot be treated as zero.", { exact: true })).toBeVisible();
  await expect(page.getByText("No accepted receipt evidence is recorded for this line.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save line links", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "every invoice line" })).toBeVisible(); expect(writes).toBe(0);
});

test("invoice capture and numeric original response preserve wide4dp digits without changing the page layout", async ({ page }) => {
  await mockErp(page);
  const description = 'Original "quantity":99999999999999.9999 \\ document';
  let captures = 0;
  await page.route("**/api/procurement/v1/invoices**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body: string, status = 200) => route.fulfill({ status, contentType: "application/json", body });
    if (url.pathname === "/api/procurement/v1/invoices" && request.method() === "POST") {
      captures++;
      expect(request.postDataJSON().lines).toEqual([{ description, quantity: "1", unitPrice: "12345678901234.5678", taxAmount: "0" }]);
      expect(request.postData()).toContain('"unitPrice":"12345678901234.5678"');
      return json(`{"id":"${invoiceId}","status":"Received","grossAmount":12345678901234.5678}`, 201);
    }
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}`)
      return json(`{"id":"${invoiceId}","supplierId":"${vendorId}","supplierName":"Office Supplier","invoiceNumber":"INV-EXACT-4DP","invoiceDate":"2026-10-20","currencyCode":"ZMW","status":"Received","intakeChannel":"Manual","version":1,"nextStep":"Review the original invoice.","netAmount":12345678901234.5678,"taxAmount":0,"grossAmount":12345678901234.5678,"lines":[{"id":"${lineId}","lineNumber":1,"description":${JSON.stringify(description)},"quantity":1,"unitPrice":12345678901234.5678,"taxAmount":0}]}`);
    return route.fallback();
  });
  await page.goto("/procurement/workspace/bills/new");
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Invoice number").fill("INV-EXACT-4DP");
  await page.getByLabel("Description 1").fill(description);
  await page.getByLabel("Quantity", { exact: true }).fill("1");
  await page.getByLabel("Unit price", { exact: true }).fill("12345678901234.5678");
  await page.getByLabel("Tax amount", { exact: true }).fill("0");
  await expect(page.getByLabel("Unit price", { exact: true })).toHaveValue("12345678901234.5678");
  await expect(page.getByText("Total ZMW 12,345,678,901,234.5678", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record as received" }).click();
  await expect(page.getByRole("heading", { name: "Invoice INV-EXACT-4DP" })).toBeVisible();
  await expect(page.getByText("ZMW 12,345,678,901,234.5678", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  expect(captures).toBe(1);
});
