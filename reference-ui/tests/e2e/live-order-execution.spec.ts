import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222", worker = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444", other = "55555555-5555-4555-8555-555555555555", line = "66666666-6666-4666-8666-666666666666";
const issuedId = "77777777-7777-4777-8777-777777777777", financeId = "88888888-8888-4888-8888-888888888888";
const root = "/procurement/workspace/purchase-orders", api = "/api/procurement/v1/orders", gross = "99999999999999.99990001";
const permissions = { Finance: "procurement-po-finance-confirm", DraftFinanceRelease: "procurement-po-finance-confirm", FinanceRelease: "procurement-po-finance-confirm", Submit: "procurement-po-submit", Issue: "procurement-po-issue", Delivery: "procurement-po-dispatch-confirm" };
test.setTimeout(120_000);
function detail(action: keyof typeof permissions = "Finance", canStart = true) {
  return { order: { id, number: "PO-REAL-1", supplierId: other, supplierName: "Approved vendor", branchRef: branch, status: action === "Delivery" ? "IssuePending" : action === "Issue" ? "Approved" : action === "FinanceRelease" ? "Returned" : "Draft",
    currencyCode: "ZMW", version: 1, currentRevision: 1, expectedDeliveryOn: null, total: gross, shipToRef: "Main site", billToRef: "Accounts", paymentTermRef: "NET30",
    lines: [{ id: line, lineNumber: 1, description: "Approved request line", unitCode: "EA", quantity: "1", unitPrice: "99999999999999.9999", taxAmount: "0.00000001", acceptedQuantity: "0", invoicedQuantity: "0", sourcePurchaseRequestLineId: other }] },
    totals: { lineBaseAmount: "99999999999999.9999", grossAmount: gross }, nextCommercialRevision: 2, financeStatus: action === "FinanceRelease" || action === "DraftFinanceRelease" ? "CommitmentHeld" : "NoConfirmedCommitmentHeld",
    sourceReservationReferences: ["RES-PR-1"], financeEvidence: action === "FinanceRelease" || action === "DraftFinanceRelease" ? [{ id: financeId, commitmentReference: "FIN-HELD-1", evidenceReference: "FIN-ORIGINAL", confirmedGrossAmount: gross, currencyCode: "ZMW", commercialRevision: 1, confirmedAt: new Date().toISOString(), releaseConfirmed: false, evidenceMode: "ApprovedManualEvidence" }] : [],
    financeResolutions: [], submissions: [], cases: [], decisions: [], issued: action === "Delivery" ? [{ id: issuedId, revisionNumber: 1, authorizedAt: new Date(Date.now() - 60_000).toISOString() }] : [], deliveries: [],
    commercialEvidenceSelectionVersion: 1, latestFinanceEvidenceId: action === "FinanceRelease" || action === "DraftFinanceRelease" ? financeId : null,
    latestIssuedVersionId: action === "Delivery" ? issuedId : null,
    actionCandidates: [{ code: action, permission: permissions[action], canStart, blockers: canStart ? [] : ["PolicyNotReady"], requiresCommandValidation: true }], configuredDeliveryChannels: ["Portal"], commandValidationRequired: true };
}
async function mock(page: Page, options: { action?: keyof typeof permissions; lost?: boolean; stale?: boolean; deniedId?: number; enabled?: boolean; draftEnabled?: boolean; hintBlocked?: boolean; invalidMoney?: boolean; buyerBoth?: boolean; missingEvidenceMarker?: boolean; wrongEvidencePointer?: boolean } = {}) {
  let current = detail(options.action, !options.hintBlocked), recovered = false;
  if (options.missingEvidenceMarker) current = { ...current, commercialEvidenceSelectionVersion: undefined };
  if (options.wrongEvidencePointer) current = { ...current, latestFinanceEvidenceId: other };
  const writes: Array<{ path: string; body: string; key: string }> = [], reads: string[] = [], unexpected: string[] = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/")) { expect(request.headers()["x-shell-entity"]).toBe(company); expect(request.headers()["x-shell-location"]).toBe(branch); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Order operator", roles: ["procurement_manager"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...(options.enabled === false ? ["procurement-po-read", "procurement-po-create"] : [permissions[options.action ?? "Finance"]]), ...(options.buyerBoth ? ["procurement-po-read", "procurement-po-submit", "procurement-po-issue"] : [])],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map((key) => [key, key === "orders" ? options.enabled !== false : key === "orderDraft" && options.draftEnabled !== false])) });
    if (path === api && request.method() === "GET") { reads.push(url.pathname); return json({ items: [], total: 0, page: 1, pageSize: 25 }); }
    if (path === api + "/execution-worklist") { reads.push(url.search); return json({ items: [current.order, ...(options.deniedId ? [{ ...current.order, id: other, number: "PO-DENIED" }] : [])], total: 1, page: 1, pageSize: 25, view: url.searchParams.get("view") }); }
    if (path === `${api}/${other}/execution-detail`) return json({ message: "Unavailable" }, options.deniedId ?? 404);
    if (path === `${api}/${id}/execution-detail`) {
      if (options.invalidMoney) return json({ ...current, totals: { ...current.totals, grossAmount: 99999999999999.99 } });
      return json(current);
    }
    if (path.startsWith(api + "/command-receipts/")) {
      expect(url.searchParams.get("orderId")).toBe(id); recovered = true;
      const command = writes[0]; expect(path).toContain(command.key);
      return json({ state: "RecordedHistoricalOutcome", purchaseOrderId: id, operation: options.action ?? "Finance", commandKey: command.key,
        recordedResult: { id, status: "Draft" }, currentOrderVersion: 2, currentOrderStatus: "Draft", replayAuthorized: false });
    }
    if (path.startsWith(`${api}/${id}/`) && request.method() === "POST") {
      writes.push({ path, body: request.postData()!, key: request.headers()["idempotency-key"] });
      expect(writes.at(-1)!.key).toMatch(/^[0-9a-f-]{36}$/i);
      if (options.stale) { current = { ...current, order: { ...current.order, version: 2 }, actionCandidates: [] }; return json({ message: "The source changed" }, 409); }
      if (options.buyerBoth && path.endsWith("/submit")) current = { ...detail("Issue"), order: { ...detail("Issue").order, version: 2 } };
      else current = { ...current, order: { ...current.order, version: 2 }, actionCandidates: [] };
      if (options.lost) return route.abort("failed");
      return json({ id, status: options.action === "Delivery" ? "Issued" : "Approved", version: 2, nextStep: "Current checks completed" });
    }
    unexpected.push(path); return json({ message: "Unexpected fixture route" }, 404);
  });
  return { writes, reads, unexpected, recovered: () => recovered };
}
async function confirm(page: Page, name: string, options: { reference?: string; reason?: string; delivery?: boolean; simple?: boolean } = {}) {
  await page.getByRole("button", { name, exact: true }).click(); const dialog = page.getByRole("dialog");
  if (!options.simple) {
    if (options.reference) await dialog.getByLabel(options.delivery ? "Sending reference" : "Finance commitment reference", { exact: true }).fill(options.reference);
    await dialog.getByLabel("Evidence reference", { exact: true }).fill("INDEPENDENT-EVIDENCE-1");
    if (options.reason) await dialog.getByLabel("Reason for releasing funds", { exact: true }).fill(options.reason);
    if (options.delivery) { await dialog.getByRole("combobox", { name: "Sending channel", exact: true }).click(); await page.getByRole("option", { name: "Portal", exact: true }).click(); }
  }
  await expect(dialog.getByRole("button", { name: "Confirm action", exact: true })).toBeDisabled();
  await dialog.getByRole("switch").click(); await dialog.getByRole("button", { name: "Confirm action", exact: true }).click();
}
test("Finance-only operator discovers scoped orders and reviews exact amounts without general PO read", async ({ page }) => {
  const evidence = await mock(page); await page.goto(root);
  await expect(page.getByRole("tab", { name: "Finance review", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "My buying work", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Review order", exact: true }).click();
  await expect(page.getByText(`Total: ZMW ${gross}`, { exact: true })).toBeVisible();
  expect(evidence.reads.some((query) => query.includes("view=finance"))).toBe(true); expect(evidence.writes).toHaveLength(0); expect(evidence.unexpected).toEqual([]);
});
test("Finance interrupted write preserves exact payload/key and reconciles instead of posting twice", async ({ page }) => {
  const evidence = await mock(page, { lost: true }); await page.goto(`${root}/${id}`);
  await confirm(page, "Record Finance confirmation", { reference: "FIN-COMMIT-1" });
  await expect(page.getByRole("button", { name: "Check saved result", exact: true })).toBeVisible();
  expect(evidence.writes).toHaveLength(1); expect(evidence.writes[0].body).toContain(`"confirmedGrossAmount":${gross}`);
  expect(evidence.writes[0].body).toContain('"sourceReservationReferences":["RES-PR-1"]');
  await expect(page.getByText(evidence.writes[0].key, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved result found");
  expect(evidence.writes).toHaveLength(1); expect(evidence.recovered()).toBe(true);
});
test("dispatch operator sees only its worklist and records issued revision via configured channel", async ({ page }) => {
  const evidence = await mock(page, { action: "Delivery" }); await page.goto(root);
  await expect(page.getByRole("tab", { name: "Sending orders", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Review order", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toHaveCount(0);
  await confirm(page, "Record sending outcome", { reference: "SENT-1", delivery: true });
  await expect(page.getByRole("status")).toContainText("Saved: Issued");
  const body = JSON.parse(evidence.writes[0].body); expect(body).toMatchObject({ expectedOrderVersion: 1, issuedVersionId: issuedId, channel: "Portal", outcome: "Delivered", evidenceReference: "INDEPENDENT-EVIDENCE-1" });
  expect(body.observedAt).toMatch(/\.\d{3}Z$/); expect(evidence.reads.some((query) => query.includes("view=dispatch"))).toBe(true);
});
test("stale command refreshes details and removes obsolete action candidates", async ({ page }) => {
  const evidence = await mock(page, { stale: true }); await page.goto(`${root}/${id}`);
  await confirm(page, "Record Finance confirmation", { reference: "STALE-1" });
  await expect(page.getByRole("status")).toContainText("changed");
  await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(evidence.writes).toHaveLength(1);
});
for (const status of [403, 404]) test(`detail navigation clears prior order actions when new ID returns ${status}`, async ({ page }) => {
  await mock(page, { deniedId: status }); await page.goto(`${root}/${id}`);
  await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to purchase orders", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "PO-DENIED" }).getByRole("link", { name: "Review order", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toHaveCount(0);
  await expect(page.getByText(`Total: ZMW ${gross}`, { exact: true })).toHaveCount(0);
});
test("blocked server hints cannot start a Finance action", async ({ page }) => {
  const evidence = await mock(page, { hintBlocked: true }); await page.goto(`${root}/${id}`);
  await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toBeDisabled(); expect(evidence.writes).toHaveLength(0);
});
test("older order detail keeps history readable but blocks Finance evidence writes", async ({ page }) => {
  const evidence = await mock(page, { missingEvidenceMarker: true }); await page.goto(`${root}/${id}`);
  await expect(page.getByRole("heading", { name: "PO-REAL-1" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Current Finance and sending evidence is unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toBeDisabled();
  expect(evidence.writes).toHaveLength(0);
});
test("a Finance pointer outside retained evidence cannot authorize a release", async ({ page }) => {
  const evidence = await mock(page, { action: "FinanceRelease", wrongEvidencePointer: true }); await page.goto(`${root}/${id}`);
  await expect(page.getByRole("heading", { name: "PO-REAL-1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record funds release", exact: true })).toBeDisabled();
  expect(evidence.writes).toHaveLength(0);
});
test("execution capability false preserves legacy draft buying without probing execution APIs", async ({ page }) => {
  const evidence = await mock(page, { enabled: false }); await page.goto(root);
  await expect(page.getByRole("button", { name: "New order draft", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Finance review", exact: true })).toHaveCount(0); expect(evidence.reads).toEqual([api]);
});
test("unready order capabilities do not expose demo or live execution records", async ({ page }) => {
  const evidence = await mock(page, { enabled: false, draftEnabled: false }); await page.goto(root);
  await expect(page.getByText("This workflow is being connected to your ERP.", { exact: false })).toBeVisible();
  await expect(page.getByText("no sample transactions are shown here.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review order", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New order draft", exact: true })).toHaveCount(0);
  expect(evidence.reads).toEqual([]); expect(evidence.writes).toHaveLength(0);
});
test("execution enabled blocks standalone legacy draft creation and edits", async ({ page }) => {
  const evidence = await mock(page, { buyerBoth: true }); await page.goto(`${root}/new`);
  await expect(page.getByRole("alert")).toContainText("do not have access to create orders from approved requests");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(0);
});
test("numeric money in execution detail is rejected instead of rounded for a financial action", async ({ page }) => {
  await mock(page, { invalidMoney: true }); await page.goto(`${root}/${id}`);
  await expect(page.getByRole("alert")).toContainText("incomplete"); await expect(page.getByRole("button", { name: "Record Finance confirmation", exact: true })).toHaveCount(0);
});
test("buyer submit and issue use separate version-pinned keyed commands", async ({ page }) => {
  const evidence = await mock(page, { action: "Submit", buyerBoth: true }); await page.goto(`${root}/${id}`);
  await confirm(page, "Send order for approval", { simple: true });
  await expect(page.getByRole("button", { name: "Authorise sending", exact: true })).toBeVisible();
  await confirm(page, "Authorise sending", { simple: true });
  await expect(page.getByRole("status")).toContainText("Saved:"); expect(evidence.writes).toHaveLength(2);
  expect(evidence.writes.map((entry) => entry.path.split("/").at(-1))).toEqual(["submit", "issue"]);
  expect(evidence.writes[0].key).not.toBe(evidence.writes[1].key);
  expect(JSON.parse(evidence.writes[0].body)).toEqual({ expectedOrderVersion: 1 }); expect(JSON.parse(evidence.writes[1].body)).toEqual({ expectedOrderVersion: 2 });
});
for (const action of ["FinanceRelease", "DraftFinanceRelease"] as const) test(`${action} sends the held exact amount and restored reservation references`, async ({ page }) => {
  const evidence = await mock(page, { action }); await page.goto(`${root}/${id}`);
  await confirm(page, action === "FinanceRelease" ? "Record funds release" : "Record draft funds release", { reason: "Independently verified restored funds" });
  await expect(page.getByRole("status").filter({ hasText: /^Saved:/ })).toContainText("Saved:");
  expect(evidence.writes[0].body).toContain(`"releasedGrossAmount":${gross}`); expect(evidence.writes[0].body).toContain('"restoredReservationReferences":["RES-PR-1"]');
});
