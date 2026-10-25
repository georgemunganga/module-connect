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

async function mockErp(page: Page, canCapture = true, options: { documents?: boolean; seed?: boolean; loseUploadResponse?: boolean; failedScan?: boolean; fileLimit?: number; crud?: boolean; staleUpdate?: boolean; loseUpdate?: boolean; related?: boolean; paymentRead?: boolean } = {}) {
  let invoice: Record<string, unknown> | null = options.seed ? {
    id: invoiceId, supplierId: vendorId, supplierName: "Office Supplier", invoiceNumber: "INV-DOC-1",
    invoiceDate: "2026-10-20", currencyCode: "ZMW", status: "Received", intakeChannel: "Manual",
    grossAmount: 100, netAmount: 100, taxAmount: 0, version: 1,
    lines: [{ id: "line-1", lineNumber: 1, description: "Supplies", quantity: 1, unitPrice: 100, taxAmount: 0 }],
  } : null;
  const mutations: Array<{ method: string; body: unknown }> = [];
  const withCrud = () => invoice && options.crud ? { ...invoice, intakeCrudVersion: 1,
    allowedActions: invoice.status === "Received" && canCapture ? ["Edit", "Cancel"] : [],
    exactAmounts: { netAmount: String(invoice.netAmount), taxAmount: String(invoice.taxAmount), grossAmount: String(invoice.grossAmount) },
    lines: (invoice.lines as Array<Record<string, unknown>>).map(line => ({ ...line,
      exactAmounts: { quantity: String(line.quantity), unitPrice: String(line.unitPrice), taxAmount: String(line.taxAmount) } })) } : invoice;
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
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [{ id: branchId, code: "HQ", name: "Main site", legalEntityId: companyId }] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [branchId], confined: true });
    if (url.pathname === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo",
      legalEntityId: companyId, workerId,
      permissions: canCapture ? ["procurement-access", "procurement-vendor-read",
        "procurement-invoice-read", "procurement-invoice-capture", ...(options.paymentRead ? ["procurement-payment-read"] : [])]
        : ["procurement-access", "procurement-invoice-read"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities: { ...capabilities, vendorCreditDraft: options.related === true, manualPaymentWorkflow: options.related === true, invoiceDocuments: options.documents === true } });
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
      const taxAmount = input.lines.reduce((sum: number, line: { taxAmount: number }) => sum + Number(line.taxAmount), 0);
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
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}/cancel` && invoice) {
      const body = request.postDataJSON(); mutations.push({ method: "POST", body });
      if (!canCapture || !options.crud) return json({ message: "Access denied" }, 403);
      if (body.version !== invoice.version) return json({ message: "Refresh the saved invoice." }, 409);
      invoice = { ...invoice, status: "Cancelled", version: Number(invoice.version) + 1 };
      return json(withCrud());
    }
    if (url.pathname === `/api/procurement/v1/invoices/${invoiceId}` && invoice) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON(); mutations.push({ method: "PUT", body });
        if (!canCapture || !options.crud) return json({ message: "Access denied" }, 403);
        if (options.staleUpdate || body.version !== invoice.version) return json({ message: "Refresh the saved invoice." }, 409);
        const lines = body.draft.lines.map((line: object, index: number) => ({ ...line, id: `line-${index + 1}`, lineNumber: index + 1 }));
        const netAmount = lines.reduce((sum: number, line: { quantity: string; unitPrice: string }) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
        const taxAmount = lines.reduce((sum: number, line: { taxAmount: string }) => sum + Number(line.taxAmount), 0);
        invoice = { ...invoice, ...body.draft, lines, netAmount, taxAmount, grossAmount: netAmount + taxAmount, version: Number(invoice.version) + 1 };
        if (options.loseUpdate) return route.abort("failed");
      }
      return json({ ...withCrud(), nextStep: "Confirm source evidence and resolve duplicate or PO exceptions before matching." });
    }
    return json({ title: `Unexpected route: ${url.pathname}` }, 404);
  });
  return { mutations };
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
  await expect(page.getByRole("button", { name: "Record payment" })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("button", { name: /post|approve/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Invoice INV-001" })).toBeVisible();
});

test("read-only invoice user cannot start intake", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/bills");
  await expect(page.getByRole("button", { name: "Record invoice" })).toHaveCount(0);
  await page.goto("/procurement/workspace/bills/new");
  await expect(page.getByRole("alert")).toContainText("do not have permission");
});


test("invoice document upload recovers a lost response without duplicating evidence", async ({ page }) => {
  await mockErp(page, true, { documents: true, seed: true, loseUploadResponse: true, fileLimit: 1 });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByText("No documents added yet.")).toBeVisible();
  await page.getByLabel("Invoice document").setInputFiles({ name: "original invoice.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 synthetic evidence") });
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await page.getByRole("button", { name: "More invoice actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Refresh invoice", exact: true }).click();
  await expect(page.getByText("Refreshing invoice…", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Items (1)", exact: true }).click();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
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


// Mocked HTTP contract checks. Actual PostgreSQL/runtime acceptance is a separate gate.
test("bill edit saves through the scoped API and survives refresh, then cancellation preserves its details", async ({ page }) => {
  const setup = await mockErp(page, true, { seed: true, crud: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByRole("link", { name: "Edit invoice", exact: true }).click();
  await expect(page.getByLabel("Description 1")).toHaveValue("Supplies");
  await page.getByLabel("Description 1").fill("Corrected original supplies");
  await page.getByLabel("Unit price", { exact: true }).fill("125.1234");
  await page.getByLabel("Reason for change").fill("Correct original amount");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Items (1)", exact: true }).click();
  await expect(page.getByText("Corrected original supplies", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("ZMW 125.1234", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Cancellation reason").fill("Duplicate received document");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancel invoice", exact: true }).click();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Items (1)", exact: true }).click();
  await expect(page.getByText("Corrected original supplies", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit invoice", exact: true })).toHaveCount(0);
  expect(setup.mutations).toEqual([
    { method: "PUT", body: expect.objectContaining({ version: 1, reason: "Correct original amount", draft: expect.objectContaining({ lines: [expect.objectContaining({ unitPrice: "125.1234" })] }) }) },
    { method: "POST", body: { version: 2, reason: "Duplicate received document" } },
  ]);
});

test("stale edit keeps entered fields and requires an explicit reload without retrying", async ({ page }) => {
  const setup = await mockErp(page, true, { seed: true, crud: true, staleUpdate: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}/edit`);
  await page.getByLabel("Description 1").fill("Unsaved correction");
  await page.getByLabel("Reason for change").fill("Correct original");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("The saved invoice changed.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Description 1")).toHaveValue("Unsaved correction");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  expect(setup.mutations).toHaveLength(1);
});

test("lost edit response does not resend and GET refresh shows the actual saved invoice", async ({ page }) => {
  const setup = await mockErp(page, true, { seed: true, crud: true, loseUpdate: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}/edit`);
  await page.getByLabel("Description 1").fill("Saved despite lost response");
  await page.getByLabel("Reason for change").fill("Correct original");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("The response was not confirmed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Open bills", exact: true }).click();
  await page.getByRole("link", { name: "INV-DOC-1", exact: true }).click();
  await page.getByRole("tab", { name: "Items (1)", exact: true }).click();
  await expect(page.getByText("Saved despite lost response", { exact: true })).toBeVisible();
  expect(setup.mutations).toHaveLength(1);
});

test("read-only user never receives edit or cancellation actions", async ({ page }) => {
  const setup = await mockErp(page, false, { seed: true, crud: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit invoice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel invoice", exact: true })).toHaveCount(0);
  await page.goto(`/procurement/workspace/bills/${invoiceId}/edit`);
  await expect(page.getByRole("alert")).toContainText("do not have permission");
  expect(setup.mutations).toEqual([]);
});


test("an older backend without the CRUD marker keeps invoice mutations unavailable", async ({ page }) => {
  const setup = await mockErp(page, true, { seed: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit invoice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel invoice", exact: true })).toHaveCount(0);
  await page.goto(`/procurement/workspace/bills/${invoiceId}/edit`);
  await expect(page.getByText("This invoice cannot be edited.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  expect(setup.mutations).toEqual([]);
});

for (const status of [408, 429, 499]) {
  test(`invoice intake HTTP ${status} blocks another POST in the current form`, async ({ page }) => {
    await mockErp(page);
    let posts = 0;
    await page.route("**/api/procurement/v1/invoices", route => {
      if (route.request().method() !== "POST") return route.fallback();
      posts++;
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message: "The save outcome was not confirmed." }) });
    });
    await page.goto("/procurement/workspace/bills/new");
    await page.getByRole("combobox", { name: "Vendor", exact: true }).click();
    await page.getByRole("option", { name: "Office Supplier", exact: true }).click();
    await page.getByLabel("Invoice number").fill("INV-TIMEOUT");
    await page.getByLabel("Description 1").fill("Supplies");
    await page.getByLabel("Quantity", { exact: true }).fill("1");
    await page.getByLabel("Unit price", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Record as received", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The save outcome was not confirmed." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record as received", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Invoice number")).toHaveValue("INV-TIMEOUT");
    expect(posts).toBe(1);
  });
}

test("live Bills keeps the ERP-adapted list tools and current-page table without enabling unsupported actions", async ({ page }) => {
  await mockErp(page, true, { seed: true });
  await page.goto("/procurement/workspace/bills");
  await expect(page.getByRole("heading", { name: "Bills", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter Bills by field" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customize columns" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More Actions" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("link", { name: /INV-DOC-1/ })).toBeVisible();
  await expect(page.getByText("Search, filters and sorting apply to this page only.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "More Actions" }).click();
  await expect(page.getByText("Import unavailable")).toBeVisible();
  await expect(page.getByText("A separate invoice export permission is required.")).toBeVisible();
  await page.getByRole("button", { name: "More Actions" }).click();
  await page.getByRole("button", { name: "Customize columns" }).click();
  await expect(page.getByText("Customize Bills columns")).toBeVisible();
});

test("live Bills filter and selection stay on the loaded page while opening saved details", async ({ page }) => {
  await mockErp(page, true, { seed: true });
  await page.goto("/procurement/workspace/bills");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select all visible records" }).check();
  await expect(page.getByText("1 selected on this page")).toBeVisible();
  await page.getByLabel("Search bills on this page").fill("no such invoice");
  await expect(page.getByText("No matching bills on this page")).toBeVisible();
  await expect(page.getByText("1 selected on this page")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear page filters" }).click();
  await page.getByRole("button", { name: "Actions for INV-DOC-1" }).click();
  await expect(page.getByText("Edit and cancellation availability is checked on the saved invoice detail", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "View full details" }).click();
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toBeVisible();
});


test("live inbox preserves the imported upload layout without creating local files", async ({ page }) => {
  const { mutations } = await mockErp(page, true, { seed: true, crud: true });
  await page.goto("/procurement/workspace/inbox");
  await expect(page.getByRole("heading", { name: "Payables inbox", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload bills", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Received bills", exact: true })).toBeVisible();
  await expect(page.getByText("INV-DOC-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose file", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("File intake is not connected");
  expect(mutations).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("payables.inbox.v1"))).toBeNull();
  await page.getByRole("button", { name: "Open invoice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1", exact: true })).toBeVisible();
});

test("read-only live inbox retains layout without offering manual invoice capture", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/inbox");
  await expect(page.getByRole("heading", { name: "Payables inbox", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record invoice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload bill", exact: true })).toBeVisible();
  await expect(page.getByText("Your inbox is clear", { exact: true })).toBeVisible();
});

test("live bill detail keeps the ERP-adapted tabs while showing only saved invoice facts", async ({ page }) => {
  await mockErp(page, true, { seed: true, crud: true, documents: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Items (1)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Related" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Comments" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  await expect(page.getByText("ZMW 100.00").first()).toBeVisible();
  await expect(page.getByText("No documents added yet.")).toBeVisible();
  await page.getByLabel("Invoice document").setInputFiles({ name: "original invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 pending") });
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("button", { name: "Add document" })).toBeEnabled();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByRole("heading", { name: "Items / Line Details" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Supplies" })).toBeVisible();
  await page.getByRole("tab", { name: "Related" }).click();
  await expect(page.getByText("Credits and manual payment requests open in their own workspaces, filtered to this bill.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(page.getByText("Comments are not available for bills yet.")).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("A detailed activity log is not available here yet", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "More invoice actions" }).click();
  await expect(page.getByText("Saved bills cannot be deleted. Manual payments are recorded separately when your access allows it.")).toBeVisible();
});

test("read-only bill detail keeps tabs and documents without offering a write action", async ({ page }) => {
  await mockErp(page, false, { seed: true, documents: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Invoice INV-DOC-1" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Items (1)" })).toBeVisible();
  await expect(page.getByText("No documents added yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit invoice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel invoice" })).toHaveCount(0);
  await expect(page.getByLabel("Invoice document")).toHaveCount(0);
});


test("restored bill editor confirms discarded input and keeps the original form sections", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/bills/new");
  await expect(page.getByRole("heading", { name: "New Bill", exact: true })).toBeVisible();
  await expect(page.getByLabel("Payment Terms", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Notes", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Attach Files", exact: true })).toBeDisabled();
  await page.getByLabel("Invoice number", { exact: true }).fill("UNSAVED-ORIGINAL");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discard unsaved changes?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Invoice number", { exact: true })).toHaveValue("UNSAVED-ORIGINAL");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Discard and leave", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bills", exact: true })).toBeVisible();
});


test("restored Bills screens retain the ERP layout at desktop and phone widths", async ({ page }, testInfo) => {
  await mockErp(page, true, { seed: true, crud: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/procurement/workspace/bills");
    await expect(page.getByRole("heading", { name: "Bills", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "INV-DOC-1", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`bills-${width}.png`), fullPage: true });
    await page.goto("/procurement/workspace/bills/new");
    await expect(page.getByRole("heading", { name: "New Bill", exact: true })).toBeVisible();
    await expect(page.getByLabel("Invoice number", { exact: true })).toBeVisible();
    const editorLayout = await page.evaluate(() => ({
      width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll("main *")).filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 12).map(element => ({ tag: element.tagName, className: element.className })),
    }));
    await testInfo.attach(`editor-layout-${width}`, { body: JSON.stringify(editorLayout), contentType: "application/json" });
    expect(editorLayout.scrollWidth).toBeLessThanOrEqual(editorLayout.width + 1);
    await page.screenshot({ path: testInfo.outputPath(`bill-editor-${width}.png`), fullPage: true });
  }
});


test("bill related links retain invoice filters and do not imply payment execution", async ({ page }) => {
  await mockErp(page, true, { seed: true, related: true, paymentRead: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByRole("tab", { name: "Related", exact: true }).click();
  await expect(page.getByRole("link", { name: "View credits for this bill" })).toHaveAttribute("href", `/procurement/workspace/vendor-credits?invoiceId=${invoiceId}`);
  await expect(page.getByRole("link", { name: "View manual payments for this bill" })).toHaveAttribute("href", `/procurement/workspace/payments?invoiceId=${invoiceId}`);
  await expect(page.getByText("A recorded request does not mean Finance has posted or paid the bill.", { exact: false })).toBeVisible();
});

test("bill related links require each capability and payment read permission", async ({ page }) => {
  await mockErp(page, true, { seed: true, related: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByRole("tab", { name: "Related", exact: true }).click();
  await expect(page.getByRole("link", { name: "View credits for this bill" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View manual payments for this bill" })).toHaveCount(0);
});


test("bill related workspaces are hidden when their server capabilities are absent", async ({ page }) => {
  await mockErp(page, true, { seed: true, paymentRead: true });
  await page.goto(`/procurement/workspace/bills/${invoiceId}`);
  await page.getByRole("tab", { name: "Related", exact: true }).click();
  await expect(page.getByRole("link", { name: "View credits for this bill" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View manual payments for this bill" })).toHaveCount(0);
});
