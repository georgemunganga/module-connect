/** Mock UI acceptance only. Every API request is intercepted and unmatched calls
 * fail the test; no production or private PostgreSQL connection is involved. */
import { expect, test, type Page } from "@playwright/test";
import { currentWorkspaceFixture, fixturePrincipal } from "./current-workspace-fixture";

test.setTimeout(45_000);
test.use({ serviceWorkers: "block" });
const journals = new WeakMap<Page, { unexpected: string[]; blockedExternal: string[];
  posts: Array<{ key: string; raw: string }>; reads: Array<{ key: string; all: boolean; branch?: string }>; previews: number }>();
test.afterEach(async ({ page }, info) => {
  const journal = journals.get(page);
  if (journal) {
    await info.attach("mock-only-api-journal", { body: JSON.stringify(journal, null, 2), contentType: "application/json" });
    expect(journal.unexpected, "Every API must be handled by the synthetic fixture; none may reach a server").toEqual([]);
  }
});
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222";
const otherBranch = "33333333-3333-4333-8333-333333333333", source = "44444444-4444-4444-8444-444444444444";
const vendor = "55555555-5555-4555-8555-555555555555", order = "66666666-6666-4666-8666-666666666666";
const successor = "77777777-7777-4777-8777-777777777777", precisionId = "88888888-8888-4888-8888-888888888888";
const link = "99999999-9999-4999-8999-999999999999", calculation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const intakeReceipt = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", line = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const base = "/api/procurement/v1/invoices", sourcePath = `/procurement/workspace/bills/${source}`;
const precision = { currencyCode: "ZMW", referenceId: precisionId, revision: 2, minorUnits: 2, rounding: "ToEven",
  payloadSha256: "a".repeat(64), publishedAtUtc: "2026-10-30T00:00:00Z", observedAtUtc: "2026-10-30T01:00:00Z" };
const amounts = { rawNet: "5.1234", net: "5.12", tax: "0", gross: "5.12", adjustment: "-0.0034",
  lines: [{ lineNumber: 1, quantity: "1", unitPrice: "5.1234", rawNet: "5.1234", net: "5.12", tax: "0", gross: "5.12", adjustment: "-0.0034" }] };
const sourceRecord = { id: source, branchRef: branch, supplierId: vendor, supplierName: "Office Supplier",
  purchaseOrderId: null, invoiceNumber: "ORIGINAL-01", invoiceDate: "2026-10-30", dueDate: "2026-11-30", currencyCode: "ZMW",
  grossAmount: "5.1234", netAmount: "5.1234", taxAmount: "0", status: "Received", intakeChannel: "Manual", version: 4,
  createdAt: "2026-10-30T00:00:00Z", nextStep: "Review the original comparison", intakeCrudVersion: 1,
  lines: [{ id: line, lineNumber: 1, description: "Supplies", quantity: "1", unitPrice: "5.1234", taxAmount: "0",
    exactAmounts: { quantity: "1", unitPrice: "5.1234", taxAmount: "0" } }] };
async function fixture(page: Page, options: { loseFirst?: boolean; rejectFirst?: boolean; denyCorrection?: boolean; delayFirst?: boolean; delayFirstValidation?: boolean; readOrder?: boolean } = {}) {
  const state = { writesEnabled: true, replaced: false, posts: [] as Array<{ key: string; body: Record<string, any>; raw: string }>,
    reads: [] as Array<{ key: string; all: boolean; branch?: string }>, previews: 0, unexpected: [] as string[],
    blockedExternal: [] as string[], releasePost: (() => {}) as () => void };
  const receipts = new Map<string, Record<string, unknown>>(); let correctedNumber = "";
  await page.addInitScript(({ company, branch }) => {
    if (!localStorage.getItem("erp.shell.state.v1")) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch }));
  }, { company, branch });
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      state.blockedExternal.push(url.origin + url.pathname); return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      state.unexpected.push(`${method} ${url.origin}${path}`); return route.abort("blockedbyclient");
    }
    if (path === "/api/hrm/auth/me" && method === "GET") return json({ authenticated: true,
      user: { id: fixturePrincipal, isActive: true, displayName: "Core system buyer", email: "buyer@example.test", roles: [] } });
    if (path === "/api/hrm/branding" && method === "GET") return json({ displayName: "Synthetic ERP" });
    if (path === "/api/core/v1/workspace-context" && method === "GET") {
      const current = currentWorkspaceFixture("test", fixturePrincipal, [{ companyId: company, branchId: branch, name: "Test Company", branchName: "HQ" }], true);
      current.companies[0].currency = "USD";
      current.branches.push({ ...current.branches[0], id: otherBranch, name: "Other branch", code: "OTHER" });
      return json(current);
    }
    if (path === "/api/hrm/admin/legal-entities" && method === "GET") return json({ items: [{ id: company, code: "TEST", registeredName: "Test Company" }] });
    if (path === "/api/hrm/admin/locations" && method === "GET") return json({ items: [] });
    if (path === "/api/hrm/shell/" && method === "GET") return json({ assignedLocationIds: [], confined: false });
    const all = req.headers()["x-shell-branch-scope"] === "all", location = req.headers()["x-shell-location"];
    if (path.startsWith("/api/procurement/v1/") && req.headers()["x-shell-entity"] !== company)
      return json({ message: "Company scope was not sent" }, 403);
    if (path === "/api/procurement/v1/context" && method === "GET") return json({ tenantId: "test", legalEntityId: company,
      principalId: fixturePrincipal, workerId: null, branch: all ? null : { id: location || branch },
      permissions: ["procurement-access", "procurement-invoice-read", "procurement-invoice-capture", "procurement-vendor-read", ...(options.readOrder ? ["procurement-po-read"] : [])],
      company: { id: company, code: "TEST", name: "Test Company", currencyCode: "USD" } });
    if (path === "/api/procurement/v1/meta" && method === "GET") return json({ tenantId: "test", legalEntityId: company, schemaReady: true,
      capabilities: { vendorDraft: true, itemDraft: false, requestDraft: false, approvals: false, sourcing: false, contracts: false,
        orders: false, receiving: false, invoiceValidation: false, financeHandoff: false, supplierPortal: false,
        planningDraft: false, configurationDraft: false, contractDraft: false, sourcingDraft: false,
        invoiceIntake: state.writesEnabled, invoiceReplacementRead: true, principalOrderGovernanceRead: options.readOrder === true,
        invoiceCurrencyCalculationRead: true, invoiceCurrencyCalculationV2: state.writesEnabled } });
    if (path === "/api/procurement/v1/vendors" && method === "GET") return json({ items: [{ id: vendor,
      number: "VEN-001", displayName: "Office Supplier", legalName: "Office Supplier Ltd", countryCode: "ZM",
      status: "Active", isOrderable: true, version: 1, createdAt: "2026-10-30T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
    if (path === `${base}/calculation-preview` && method === "POST") {
      state.previews++;
      const body = req.postDataJSON();
      expect(body).toMatchObject({ supplierId: vendor, purchaseOrderId: order, currencyCode: "ZMW",
        lines: [{ quantity: "1", unitPrice: "5.1234", taxAmount: "0" }] });
      return json({ schemaVersion: 2, precision, amounts, previewSha256: "b".repeat(64) });
    }
    if (path === `${base}/${source}` && method === "GET") {
      if (location && location !== branch) return json({ message: "Source invoice is outside this branch." }, 403);
      const allowed = state.writesEnabled && !state.replaced && !all && !options.denyCorrection;
      return json({ ...sourceRecord, allowedActions: allowed ? ["Replace"] : options.denyCorrection ? ["Edit", "Cancel"] : [],
        ...(allowed ? { replacementContext: { sourceInvoiceId: source, sourceVersion: 4, purchaseOrderId: order, purchaseOrderNumber: "PO-2026-014" } } : {}) });
    }
    if (path === `${base}/${source}/replacement` && method === "POST") {
      expect(all).toBe(false); expect(location).toBe(branch);
      const key = req.headers()["idempotency-key"];
      expect(key).toMatch(/^[0-9a-f-]{36}$/i);
      const body = req.postDataJSON(); state.posts.push({ key, body, raw: req.postData()! });
      expect(body).toMatchObject({ sourceVersion: 4, reason: "Supplier issued a corrected bill", correctedInvoice: {
        supplierId: vendor, purchaseOrderId: order, currencyCode: "ZMW", intakeSchemaVersion: 2,
        expectedCurrencyReferenceId: precisionId, expectedCurrencyRevision: 2, expectedCalculationSha256: "b".repeat(64),
        lines: [{ quantity: "1", unitPrice: "5.1234", taxAmount: "0" }] } });
      if (options.delayFirstValidation && state.posts.length === 1)
        await new Promise<void>(resolve => { state.releasePost = resolve; });
      if (options.rejectFirst && state.posts.length === 1)
        return json({ code: "validation-failed", message: "Review the corrected invoice reference with the supplier." }, 422);
      correctedNumber = body.correctedInvoice.invoiceNumber; state.replaced = true;
      const saved = { schemaVersion: 1, sourceInvoiceId: source, successorInvoiceId: successor, linkId: link,
        calculationId: calculation, captureReceiptId: intakeReceipt, commandKey: key, invoiceNumber: correctedNumber,
        version: 1, status: "Received", canPostToFinance: false };
      receipts.set(key, saved);
      if (options.loseFirst && state.posts.length === 1) return route.abort("failed");
      if (options.delayFirst && state.posts.length === 1) await new Promise<void>(resolve => { state.releasePost = resolve; });
      return json(saved, 201);
    }
    const recovery = new RegExp(`^${base}/${source}/replacement/commands/([0-9a-f-]+)$`, "i").exec(path);
    if (recovery && method === "GET") {
      state.reads.push({ key: recovery[1], all, branch: location });
      if (location && location !== branch) return json({ message: "Source invoice is outside this branch." }, 403);
      return json(receipts.get(recovery[1]) ?? { code: "not-found" }, receipts.has(recovery[1]) ? 201 : 404);
    }
    if ([`${base}/${source}/replacement`, `${base}/${successor}/replacement`].includes(path) && method === "GET") {
      if (!state.replaced) return json({ code: "not-found" }, 404);
      const key = state.posts.at(-1)!.key;
      return json({ schemaVersion: 1, sourceInvoiceId: source, successorInvoiceId: successor, linkId: link,
        sourceInvoiceNumber: "ORIGINAL-01", successorInvoiceNumber: correctedNumber, sourceDisplayState: "SupersededByCorrection",
        successorStatus: "Received", commandKey: key, recordedAtUtc: "2026-10-30T01:00:00Z",
        originalResponseSha256: "c".repeat(64), canPostToFinance: false });
    }
    if (path === `${base}/${source}/amount-calculation` && method === "GET") return json({ code: "legacy-invoice-calculation" }, 404);
    if (path === `${base}/${successor}/amount-calculation` && method === "GET") return json({ schemaVersion: 2, invoiceId: successor,
      calculationId: calculation, calculationSha256: "d".repeat(64), precision, amounts });
    if (path === `${base}/${successor}` && method === "GET") return json({ ...sourceRecord, id: successor,
      invoiceNumber: correctedNumber, version: 1, purchaseOrderId: order, netAmount: "5.12", grossAmount: "5.12",
      intakeCrudVersion: 2, allowedActions: [] });
    state.unexpected.push(`${method} ${path}`);
    return json({ code: "unexpected-mock-request", message: `${method} ${path} is not an approved mocked request.` }, 599);
  });
  journals.set(page, state);
  return state;
}
async function openCorrection(page: Page) {
  await page.goto(sourcePath);
  await expect(page.getByRole("heading", { name: "Invoice ORIGINAL-01", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Correct bill", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct Bill", exact: true })).toBeVisible();
  // This checks the hydrated shared Radix control, separately from SSR tests.
  await expect(page.getByRole("combobox", { name: "Vendor", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Vendor", exact: true })).toContainText("Office Supplier");
  await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("ZMW");
  await expect(page.getByLabel("Currency", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Original purchase order", { exact: true })).toHaveValue("PO-2026-014");
  await expect(page.getByLabel("Original purchase order", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Invoice number", { exact: true })).toHaveValue("");
}
async function enterCorrection(page: Page, number = "SUPPLIER-CORRECTED-01") {
  await page.getByLabel("Invoice number", { exact: true }).fill(number);
  await page.getByLabel("Reason for correction *", { exact: true }).fill("Supplier issued a corrected bill");
  await page.getByRole("button", { name: "Review currency calculation", exact: true }).click();
  await expect(page.getByText("ZMW 5.12", { exact: true }).first()).toBeVisible();
}
async function changeScope(page: Page, to: "all" | "other" | "hq") {
  await page.evaluate(({ company, branch, otherBranch, to }) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company,
      ...(to === "all" ? { branchScope: "all" } : { branch: to === "other" ? otherBranch : branch }) }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" }));
  }, { company, branch, otherBranch, to });
}

test("mock correction reuses the full Bill editor, retains source currency and shows verified links", async ({ page }, info) => {
  const state = await fixture(page, { readOrder: true }); await openCorrection(page); await enterCorrection(page);
  await expect(page.getByRole("link", { name: "View original purchase order", exact: true })).toHaveAttribute("href", `/procurement/workspace/purchase-orders/${order}?workflow=principal`);
  await expect(page.getByRole("heading", { name: "Item Table" })).toBeVisible();
  await expect(page.getByLabel("Notes", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Terms and Conditions", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Attach Files", exact: true })).toBeDisabled();
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: info.outputPath("correction-editor-viewport.png") });
  await page.screenshot({ path: info.outputPath("correction-editor-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toBeVisible();
  await expect(page.getByText("This bill corrects", { exact: false })).toBeVisible();
  await page.goto(sourcePath); await expect(page.getByText("A corrected bill is recorded", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct bill", exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(1); expect(state.unexpected).toEqual([]);
});
test("mock lost correction response survives reload and recovers by original-key GET with writes off", async ({ page }) => {
  const state = await fixture(page, { loseFirst: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check original saved result", exact: true })).toBeVisible();
  state.writesEnabled = false; await page.reload();
  await page.getByRole("button", { name: "Check original saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.reads).toHaveLength(1); expect(state.reads[0].key).toBe(state.posts[0].key);
  expect(state.unexpected).toEqual([]);
});
test("mock original POST422 needs explicit Review entries and fresh preview before a new submission", async ({ page }) => {
  const state = await fixture(page, { rejectFirst: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review entries", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("This browser remembers a reported validation issue", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Review entries", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Review the reported validation issue?" });
  await modal.getByRole("button", { name: "Review entries", exact: true }).click();
  await expect(page.getByLabel("Invoice number", { exact: true })).toHaveValue("SUPPLIER-CORRECTED-01");
  await expect(page.getByRole("button", { name: "Record corrected bill", exact: true })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
  await page.getByLabel("Invoice number", { exact: true }).fill("SUPPLIER-CORRECTED-02");
  await page.getByRole("button", { name: "Review currency calculation", exact: true }).click();
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-02", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(2); expect(state.posts[1].key).not.toBe(state.posts[0].key);
  expect(state.previews).toBe(2); expect(state.unexpected).toEqual([]);
});
test("mock All context can read the original HQ recovery key but cannot create another correction", async ({ page }) => {
  const state = await fixture(page, { loseFirst: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check original saved result", exact: true })).toBeVisible();
  state.writesEnabled = false; await changeScope(page, "all"); await page.reload();
  await expect(page.getByRole("button", { name: "Record corrected bill", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check original saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.reads).toEqual([{ key: state.posts[0].key, all: true, branch: undefined }]);
  expect(state.unexpected).toEqual([]);
});
test("mock another explicit branch cannot reveal or release HQ's pending correction", async ({ page }) => {
  const state = await fixture(page, { loseFirst: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check original saved result", exact: true })).toBeVisible();
  await changeScope(page, "other"); await page.reload();
  await expect(page.getByText("You do not have invoice access for this company.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check original saved result", exact: true })).toHaveCount(0);
  expect(state.reads).toHaveLength(0); expect(state.posts).toHaveLength(1);
  await changeScope(page, "hq"); await page.reload();
  await page.getByRole("button", { name: "Check original saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.unexpected).toEqual([]);
});
test("mock direct correction route never falls back to ordinary editing without Replace context", async ({ page }) => {
  const state = await fixture(page, { denyCorrection: true }); await page.goto(sourcePath + "/replace");
  await expect(page.getByText("A correction is not available for this bill in the selected branch.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record as received", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record corrected bill", exact: true })).toHaveCount(0);
  expect(state.posts).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("mock late correction response after a branch change preserves HQ recovery without stale navigation", async ({ page }) => {
  const state = await fixture(page, { delayFirst: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  await changeScope(page, "other");
  await expect(page.getByText("You do not have invoice access for this company.", { exact: true })).toBeVisible();
  state.releasePost();
  await expect(page).toHaveURL(new RegExp(`/bills/${source}/replace$`));
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toHaveCount(0);
  await changeScope(page, "hq");
  await page.getByRole("button", { name: "Check original saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice SUPPLIER-CORRECTED-01", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.unexpected).toEqual([]);
});

test("mock late POST422 reports only the original journal and needs acknowledgement after returning to HQ", async ({ page }) => {
  const state = await fixture(page, { rejectFirst: true, delayFirstValidation: true }); await openCorrection(page); await enterCorrection(page);
  await page.getByRole("button", { name: "Record corrected bill", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  await changeScope(page, "other");
  await expect(page.getByText("You do not have invoice access for this company.", { exact: true })).toBeVisible();
  state.releasePost();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith("erp.procurement.invoice-replacement.v1:"))
    .map(key => JSON.parse(localStorage.getItem(key)!)).some(row => row.rejection?.kind === "OriginalPostValidationRejected"))).toBe(true);
  await expect(page.getByRole("button", { name: "Review entries", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/bills/${source}/replace$`));
  await changeScope(page, "hq");
  await page.getByRole("button", { name: "Review entries", exact: true }).click();
  await page.getByRole("dialog", { name: "Review the reported validation issue?" }).getByRole("button", { name: "Review entries", exact: true }).click();
  await expect(page.getByLabel("Invoice number", { exact: true })).toHaveValue("SUPPLIER-CORRECTED-01");
  await expect(page.getByRole("button", { name: "Record corrected bill", exact: true })).toBeDisabled();
  expect(state.posts).toHaveLength(1); expect(state.reads).toHaveLength(0); expect(state.unexpected).toEqual([]);
});
