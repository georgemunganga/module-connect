import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222", worker = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444", requestId = "55555555-5555-4555-8555-555555555555", source1 = "66666666-6666-4666-8666-666666666666", source2 = "77777777-7777-4777-8777-777777777777", vendor = "88888888-8888-4888-8888-888888888888";
const api = "/api/procurement/v1/orders", root = "/procurement/workspace/purchase-orders";
test.setTimeout(120_000);
async function mock(page: Page, options: { lost?: boolean; fail?: number; edit?: boolean; mixed?: boolean } = {}) {
  const writes: Array<{ path: string; key: string; raw: string; method: string }> = [], reads: string[] = [], unexpected: string[] = [];
  let saved = false;
  const sources = [source1, source2].map((lineId, at) => ({ requestId, requestNumber: "PR-APPROVED", lineId, requestVersion: 9,
    description: `Approved item ${at + 1}`, unitCode: "EA", categoryCode: "IT", branchRef: options.mixed && at ? vendor : branch,
    availableQuantityExact: at ? "4" : "10.1250", approvedUnitPriceExact: "100.1234", currencyCode: "ZMW", eligibility: "Available", blocker: null }));
  const detail = () => ({ order: { id, number: "PO-LINKED", supplierId: vendor, supplierName: "Active vendor", branchRef: branch, status: "Draft", currencyCode: "ZMW", version: saved ? 2 : 1, currentRevision: 0, total: "100.1234", expectedDeliveryOn: null,
    shipToRef: "Receiving desk", billToRef: "Accounts", paymentTermRef: "NET30", lines: [{ id: source2, lineNumber: 1, description: "Approved item 1", unitCode: "EA", quantity: "1", unitPrice: "100.1234", taxAmount: "0", acceptedQuantity: "0", invoicedQuantity: "0", sourcePurchaseRequestLineId: source1,
      costCenterRef: "CC-1", projectRef: "PROJECT-1", expectedDeliveryOn: "2026-12-01" }] }, totals: { lineBaseAmount: "100.1234", grossAmount: "100.1234" }, nextCommercialRevision: 1,
    financeStatus: "NoConfirmedCommitmentHeld", sourceReservationReferences: [], financeEvidence: [], financeResolutions: [], submissions: [], cases: [], decisions: [], issued: [], deliveries: [],
    actionCandidates: options.edit ? [{ code: "SourceEdit", permission: "procurement-po-edit", canStart: true, blockers: [], requiresCommandValidation: true }] : [],
    configuredDeliveryChannels: [], commandValidationRequired: true });
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/")) { expect(request.headers()["x-shell-entity"]).toBe(company); expect(request.headers()["x-shell-location"]).toBe(branch); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Source buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", "procurement-po-read", ...(options.edit ? ["procurement-po-edit"] : ["procurement-po-convert", "procurement-vendor-read"])],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map((key) => [key, key === "orders"])) });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: vendor, number: "VEN-1", displayName: "Active vendor", legalName: "Active vendor", status: "Active", isOrderable: true, version: 1, countryCode: "ZM", createdAt: new Date().toISOString() }], total: 1, page: 1, pageSize: 100 });
    if (path === api + "/approved-sources") { reads.push(path); return json({ items: sources, total: sources.length, page: 1, pageSize: 25 }); }
    if (path === `${api}/${id}/execution-detail`) { reads.push(path); return json(detail()); }
    if (path.startsWith(api + "/command-receipts/")) {
      reads.push(url.pathname + url.search); const command = writes[0]; expect(path).toContain(command.key);
      if (!options.edit) expect(url.searchParams.has("orderId")).toBe(false);
      return json({ state: "RecordedHistoricalOutcome", purchaseOrderId: id, operation: options.edit ? "SourceEdit" : "Convert", commandKey: command.key, recordedResult: { id, status: "Draft" }, currentOrderVersion: 2, currentOrderStatus: "Draft", replayAuthorized: false });
    }
    if (path === api + "/from-approved-sources" || path === `${api}/${id}/source-draft`) {
      writes.push({ path, raw: request.postData()!, key: request.headers()["idempotency-key"], method: request.method() });
      if (options.fail) return json({ message: "Current source controls reject this save" }, options.fail);
      saved = true; if (options.lost) return route.abort("failed");
      return json({ id, status: "Draft", version: 2, nextStep: "Finance confirmation required" }, options.edit ? 200 : 201);
    }
    unexpected.push(path); return json({ message: "Unexpected fixture endpoint" }, 404);
  });
  return { writes, reads, unexpected };
}
async function selectVendor(page: Page) { await page.getByRole("combobox", { name: "Vendor", exact: true }).click(); await page.getByRole("option", { name: "Active vendor", exact: true }).click(); }
async function prepare(page: Page, multiple = false) {
  await page.goto(root + "/new"); await page.getByRole("switch", { name: "Select PR-APPROVED Approved item 1", exact: true }).click();
  if (multiple) await page.getByRole("switch", { name: "Select PR-APPROVED Approved item 2", exact: true }).click();
  await selectVendor(page);
}
test("create one linked order with a partial exact quantity and pinned approved request version", async ({ page }) => {
  const evidence = await mock(page); await prepare(page);
  await page.getByLabel("Quantity 1", { exact: true }).fill("2.1250"); await page.getByLabel("Unit price 1", { exact: true }).fill("99.1234");
  await page.getByRole("button", { name: "Create linked order", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PO-LINKED", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  const write = evidence.writes[0]; expect(write.key).toMatch(/^[0-9a-f-]{36}$/i); expect(write.raw).toContain('"quantity":2.1250'); expect(write.raw).toContain('"unitPrice":99.1234');
  const body = JSON.parse(write.raw); expect(body.sources).toEqual([{ draftLineIndex: 0, purchaseRequestId: requestId, purchaseRequestLineId: source1, expectedRequestVersion: 9 }]);
  expect(body.draft.lines[0].id).toBeUndefined(); expect(body.draft.supplierId).toBe(vendor); expect(evidence.unexpected).toEqual([]);
});
test("multiple selected sources retain one-to-one draft line indexes and cannot add an unlinked line", async ({ page }) => {
  const evidence = await mock(page); await prepare(page, true);
  await expect(page.getByRole("button", { name: "Add line", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create linked order", exact: true }).click(); await expect(page.getByRole("heading", { name: "PO-LINKED", exact: true })).toBeVisible();
  const body = JSON.parse(evidence.writes[0].raw); expect(body.draft.lines).toHaveLength(2);
  expect(body.sources.map((source: { draftLineIndex: number; purchaseRequestLineId: string }) => [source.draftLineIndex, source.purchaseRequestLineId])).toEqual([[0, source1], [1, source2]]);
});
test("mixed-branch source cannot be selected into the existing group", async ({ page }) => {
  const evidence = await mock(page, { mixed: true }); await prepare(page);
  await expect(page.getByRole("switch", { name: "Select PR-APPROVED Approved item 2", exact: true })).toBeDisabled(); expect(evidence.writes).toHaveLength(0);
});
for (const status of [409, 403]) test(`known conversion ${status} preserves entered fields and never repeats the POST`, async ({ page }) => {
  const evidence = await mock(page, { fail: status }); await prepare(page); await page.getByLabel("Quantity 1", { exact: true }).fill("3.1250");
  await page.getByRole("button", { name: "Create linked order", exact: true }).click(); await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("3.1250"); expect(evidence.writes).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Check saved order", exact: true })).toHaveCount(0);
  if (status === 403) await expect(page.getByRole("button", { name: "Create linked order", exact: true })).toBeDisabled();
});
test("unconfirmed conversion recovers its unknown order ID by original key without a second POST", async ({ page }) => {
  const evidence = await mock(page, { lost: true }); await prepare(page); await page.getByRole("button", { name: "Create linked order", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check saved order", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  await expect(page.getByText(evidence.writes[0].key, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create linked order", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Check saved order", exact: true }).click(); await expect(page.getByRole("heading", { name: "PO-LINKED", exact: true })).toBeVisible();
  expect(evidence.writes).toHaveLength(1); expect(evidence.reads.some((path) => path.includes("command-receipts/Convert/"))).toBe(true);
});
test("edit-only owner keeps all linked line IDs, unit/currency and metadata without requesting Convert permission", async ({ page }) => {
  const evidence = await mock(page, { edit: true }); await page.goto(`${root}/${id}/edit`);
  await expect(page.getByText("Available quantities and approved prices are checked when you save.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Unit 1", { exact: true })).toHaveAttribute("readonly", ""); await expect(page.getByRole("button", { name: "Add line", exact: true })).toHaveCount(0);
  await page.getByLabel("Quantity 1", { exact: true }).fill("0.5000"); await page.getByLabel("Reason for changing this linked draft", { exact: true }).fill("Reduce this linked demand");
  await page.getByRole("button", { name: "Save linked draft", exact: true }).click(); await expect(page.getByRole("heading", { name: "PO-LINKED", exact: true })).toBeVisible();
  expect(evidence.writes).toHaveLength(1); expect(evidence.writes[0].method).toBe("PUT"); expect(evidence.writes[0].raw).toContain('"quantity":0.5000');
  const body = JSON.parse(evidence.writes[0].raw); expect(body).toMatchObject({ expectedOrderVersion: 1, reason: "Reduce this linked demand" });
  expect(body.draft.lines).toHaveLength(1); expect(body.draft.lines[0]).toMatchObject({ id: source2, unitCode: "EA", costCenterRef: "CC-1", projectRef: "PROJECT-1", expectedDeliveryOn: "2026-12-01" });
  expect(evidence.reads).not.toContain(api + "/approved-sources"); expect(evidence.unexpected).toEqual([]);
});
for (const status of [409, 403]) test(`linked edit ${status} requires review and never blindly retries`, async ({ page }) => {
  const evidence = await mock(page, { edit: true, fail: status }); await page.goto(`${root}/${id}/edit`);
  await page.getByLabel("Reason for changing this linked draft", { exact: true }).fill("Explicit linked correction");
  await page.getByRole("button", { name: "Save linked draft", exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save linked draft", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(1);
});
test("unconfirmed source edit preserves key/body and reconciles the recorded update", async ({ page }) => {
  const evidence = await mock(page, { edit: true, lost: true }); await page.goto(`${root}/${id}/edit`);
  await page.getByLabel("Reason for changing this linked draft", { exact: true }).fill("Independently reviewed correction");
  await page.getByRole("button", { name: "Save linked draft", exact: true }).click(); await expect(page.getByRole("button", { name: "Check saved order", exact: true })).toBeVisible();
  await expect(page.getByText(evidence.writes[0].key, { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Check saved order", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PO-LINKED", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
});
