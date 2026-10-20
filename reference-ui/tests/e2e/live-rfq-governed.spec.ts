import { expect, test, type Page } from "@playwright/test";

// Transport mocks only: not a live Core/Finance/PG authorization proof.
test.setTimeout(90_000);
const company = "11111111-1111-4111-8111-111111111111", worker = "22222222-2222-4222-8222-222222222222";
const branch = "33333333-3333-4333-8333-333333333333", otherBranch = "44444444-4444-4444-8444-444444444444";
const event = "55555555-5555-4555-8555-555555555555", lineA = "66666666-6666-4666-8666-666666666666", lineB = "77777777-7777-4777-8777-777777777777";
const prA = "88888888-8888-4888-8888-888888888888", prB = "99999999-9999-4999-8999-999999999999";
async function mock(page: Page, options: { absent?: boolean; deny?: boolean; loseCreate?: boolean; seed?: boolean } = {}) {
  const calls: { method: string; path: string; body: any; key?: string }[] = []; const receipts = new Map<string, unknown>();
  let lost = false, status = "Draft", version = 1, selected: any[] = [], exists = Boolean(options.seed);
  const sources = [lineA, lineB].map((id, at) => ({ purchaseRequestId: at ? prB : prA, purchaseRequestLineId: id, requestNumber: `PR-${at + 1}`,
    state: "Available", canSelect: true, branchRef: branch, description: at ? "Printer paper" : "Office notebooks", unitCode: "EACH", categoryCode: "OFFICE",
    expectedRequestVersion: 4, sourceLineVersion: 1, availableQuantity: "99999999999999.9999", approvedUnitEstimate: "0.0001", currencyCode: "ZMW",
    minimumQuoteCount: 3, sourceSubmissionId: id, sourceCaseId: id, methodId: id, methodRevision: 1, canPublish: false }));
  const record = () => ({ id: event, number: "RF-1", title: "Office supplies", method: "RFQ", currencyCode: "ZMW", status, version,
    originalDraftFingerprint: "a".repeat(64), cancellationReason: status === "Cancelled" ? "No longer required" : null,
    canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false,
    lines: (selected.length ? selected : [{ purchaseRequestId: prA, purchaseRequestLineId: lineA, quantity: "1" }]).map((value, index) => ({
      id: index ? lineB : lineA, purchaseRequestId: value.purchaseRequestId, purchaseRequestLineId: value.purchaseRequestLineId,
      description: index ? "Printer paper" : "Office notebooks", unitCode: "EACH", categoryCode: "OFFICE", quantity: value.quantity,
      approvedUnitEstimate: "0.0001", estimatedValue: "0.0001", allocationState: status === "Draft" ? "Reserved" : "Released" })) });
  await page.addInitScript(({ company, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })), { company, branch });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Buyer", email: "buyer@example.test", roles: ["procurement_officer"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (url.pathname === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...(options.deny ? [] : ["procurement-sourcing-convert", "procurement-sourcing-cancel"])],
      company: { id: company, name: "Amizo Power", code: "AMIZO", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: { vendorDraft: true, itemDraft: true, requestDraft: true, approvals: false, sourcing: false, contracts: false, orders: false,
        receiving: false, invoiceIntake: false, invoiceValidation: false, financeHandoff: false, supplierPortal: false, planningDraft: true,
        configurationDraft: true, contractDraft: true, sourcingDraft: true, ...(options.absent ? {} : { sourcingSourceDrafts: true }) } });
    if (url.pathname.startsWith("/api/procurement/v1/sourcing")) {
      calls.push({ method, path: url.pathname, body: method === "POST" ? request.postDataJSON() : null, key: request.headers()["idempotency-key"] });
      if (request.headers()["x-shell-location"] === otherBranch) return json({ message: "Unavailable in this branch" }, 404);
      if (url.pathname.endsWith("/approved-sources")) return json({ items: sources, candidateTotal: 2, page: 1, pageSize: 25, eligibilityMeaning: "CurrentPreviewOnly", canPublish: false });
      if (url.pathname.endsWith("/source-drafts")) return json({ items: exists ? [{ ...record(), state: "VerifiedRetainedDraft" }] : [], total: exists ? 1 : 0, page: 1, pageSize: 25, canPublish: false });
      if (url.pathname.endsWith("/from-approved-sources")) {
        const body = request.postDataJSON(); selected = body.sources; exists = true;
        const saved = { eventId: event, number: "RF-1", status, version, originalDraftFingerprint: "a".repeat(64), commandKey: request.headers()["idempotency-key"],
          recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false };
        receipts.set(`Create/${saved.commandKey}`, saved);
        if (options.loseCreate && !lost) { lost = true; return route.abort("failed"); } return json(saved, 201);
      }
      if (url.pathname.includes("/command-receipts/")) { const operationKey = url.pathname.split("/command-receipts/")[1]; const saved = receipts.get(operationKey);
        return saved ? json({ operation: operationKey.split("/")[0], commandKey: operationKey.split("/")[1], originalStatusCode: 201,
          responseJson: JSON.stringify(saved), recordedHistoricalResult: true, canPublish: false }) : json({}, 404); }
      if (url.pathname.endsWith("/source-cancel")) { status = "Cancelled"; version++;
        return json({ eventId: event, number: "RF-1", status, version, originalDraftFingerprint: "a".repeat(64), commandKey: request.headers()["idempotency-key"],
          recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false }); }
      if (url.pathname.endsWith("/source-draft")) return exists ? json(record()) : json({}, 404);
      if (url.pathname === "/api/procurement/v1/sourcing") return json({ items: [], total: 0, page: 1, pageSize: 25 });
    }
    return json({}, 404);
  });
  return calls;
}
async function selectTwo(page: Page) {
  await page.getByLabel("What are you buying?").fill("Office supplies");
  await page.getByRole("button", { name: "Add line", exact: true }).first().click();
  await page.getByRole("button", { name: "Add line", exact: true }).nth(1).click();
  await page.getByLabel("Quantity for PR-1", { exact: true }).fill("12345678901234.5678");
  await page.getByLabel("Quantity for PR-2", { exact: true }).fill("2.0001");
}
test("approved requests support exact partial consolidation and controlled cancellation without publishing", async ({ page }) => {
  const calls = await mock(page); await page.goto("/procurement/workspace/rfqs/new?source=approved"); await selectTwo(page);
  expect(calls.filter(x => x.method === "POST")).toHaveLength(0); await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  const creation = calls.find(x => x.path.endsWith("/from-approved-sources"))!;
  expect(creation.body.sources.map((x: any) => x.quantity)).toEqual(["12345678901234.5678", "2.0001"]); expect(creation.key).toMatch(/^[0-9a-f-]{36}$/i);
  await page.getByLabel("Reason", { exact: true }).fill("No longer required"); await page.getByRole("button", { name: "Cancel draft and release its quantities" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible(); expect(calls.filter(x => x.method === "POST")).toHaveLength(2);
  await expect(page.getByRole("button", { name: /publish|send to vendor|award/i })).toHaveCount(0);
});
test("interrupted creation checks original operation by GET without repeating POST", async ({ page }) => {
  const calls = await mock(page, { loseCreate: true }); await page.goto("/procurement/workspace/rfqs/new?source=approved"); await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click(); await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  await page.getByRole("button", { name: "Check saved result", exact: true }).click(); await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  expect(calls.filter(x => x.method === "POST")).toHaveLength(1); expect(calls.filter(x => x.path.includes("/command-receipts/") && x.method === "GET")).toHaveLength(1);
});
test("absent governed capability preserves ad hoc drafts and performs no source reads", async ({ page }) => {
  const calls = await mock(page, { absent: true }); await page.goto("/procurement/workspace/rfqs"); await expect(page.getByRole("heading", { name: "Request for Quotes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "From approved requests" })).toHaveCount(0);
  await page.goto("/procurement/workspace/rfqs/new?source=approved"); await expect(page.getByRole("alert")).toContainText("not available");
  expect(calls.some(x => x.path.endsWith("/approved-sources") || x.method === "POST")).toBe(false);
});
test("branch change clears old governed detail immediately and reloads under current scope", async ({ page }) => {
  await mock(page, { seed: true }); await page.goto(`/procurement/workspace/rfqs/${event}?source=approved`);
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  await page.evaluate(({ company, branch }) => { const key = "erp.shell.state.v1", oldValue = localStorage.getItem(key), newValue = JSON.stringify({ entityId: company, branch });
    localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue })); }, { company, branch: otherBranch });
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toHaveCount(0); await expect(page.getByRole("alert")).toContainText("not available");
});
test("governed capability does not substitute for explicit conversion permission", async ({ page }) => {
  const calls = await mock(page, { deny: true }); await page.goto("/procurement/workspace/rfqs/new?source=approved");
  await expect(page.getByRole("alert")).toContainText("not available"); expect(calls.some(x => x.path.endsWith("/approved-sources") || x.method === "POST")).toBe(false);
});
