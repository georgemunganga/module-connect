import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222", worker = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444", denied = "55555555-5555-4555-8555-555555555555", line = "66666666-6666-4666-8666-666666666666", order = "77777777-7777-4777-8777-777777777777", issued = "88888888-8888-4888-8888-888888888888";
const root = "/procurement/workspace/purchase-receives", api = "/api/procurement/v1";
test.setTimeout(120_000);
type Options = { enabled?: boolean; role?: "receiver" | "inspector" | "owner"; action?: "Record" | "Inspect" | "Accept" | "Certify"; unknown?: boolean; stale?: boolean; legacy?: boolean; lost?: boolean; createLost?: boolean; denied?: number; cancelledService?: boolean; partialSourceVersion?: number };
async function mock(page: Page, options: Options = {}) {
  const role = options.role ?? "receiver", action = options.action ?? "Record";
  const writes: { path: string; body: string; key: string }[] = [], reads: string[] = [], unexpected: string[] = [];
  let changed = false;
  const permissions = role === "inspector" ? ["procurement-receipt-inspect"] : role === "owner" ? ["procurement-service-certify"]
    : ["procurement-receipt-view", "procurement-receipt-create", "procurement-receipt-edit", "procurement-receipt-record", "procurement-receipt-accept", "procurement-service-certify"];
  const labels = { orderNumber: "PO-ISSUED", supplierDisplayName: "Retained vendor", description: "Issued delivery line", unitCode: "EA", currencyCode: "ZMW", branchRef: branch, issuedVersionId: issued };
  const capacity = { verified: !options.unknown && !options.legacy, orderRemainingQuantity: options.unknown ? null : "2", physicalRemainingQuantity: null, acceptableQuantity: action === "Accept" && !options.unknown ? "2" : null, blocker: options.unknown ? "ReceivingLegacyAcceptanceReconciliationRequired" : null };
  const candidate = () => [{ action, candidate: !options.unknown && !options.legacy && !changed, blocker: options.unknown ? "ReceivingLegacyAcceptanceReconciliationRequired" : null }];
  function receipt(task = false) { return { id, number: "GRN-LIVE", version: changed ? 3 : 2, executionVersion: options.legacy ? 0 : 1, status: changed ? "Recorded" : action === "Record" ? "Draft" : "Held", purchaseOrderId: order, issuedVersionId: issued, siteRef: branch, receivedAt: "2026-10-20T12:00:00.123Z", recordedAt: action === "Record" && !changed ? null : "2026-10-20T12:30:00Z", physicalEvidenceRecorded: action !== "Record" || changed, matchingAuthorityAvailable: false,
    ...(task ? {} : { notes: "Internal delivery notes", deliveryNoteRef: "DEL-1" }), readPurpose: task ? "AssignedInspection" : "Receipt", draftActionCandidates: [],
    lines: [{ id: line, version: 7, purchaseOrderLineId: line, sourceVersion: 9, receivedQuantity: "3.1250", initiallyRejectedQuantity: "0.1250", rejectedQuantity: "0.1250", acceptedQuantity: "0", unacceptedHeldQuantity: options.legacy ? null : "3.0000", status: "Held", inspection: null }],
    lineReadiness: [{ lineId: line, sourceVersion: 9, labels, capacity, actionCandidates: candidate(), effects: [] }] }; }
  function service(task = false) { return { id, version: 4, status: options.cancelledService ? "Cancelled" : "PendingCertification", executionVersion: 1, purchaseOrderLineId: line, sourcePurchaseOrderId: order, issuedBindingId: issued, sourceVersion: options.partialSourceVersion ?? 9, periodFrom: "2026-10-01", periodTo: "2026-10-20", deliverableRef: "MILESTONE-1", intendedQuantity: "0.5000", acceptedQuantity: "0", acceptedNetAmount: "0", currentAcceptedQuantity: "0", currentAcceptedNetAmount: "0", isCertifiedRecord: false, matchingAuthorityAvailable: false,
    ...(task ? {} : { notes: "n".repeat(1500), cancellationReason: options.cancelledService ? "Service no longer required" : null }), labels, capacity, actionCandidates: options.cancelledService ? [] : candidate(), draftActionCandidates: [], effects: [], readPurpose: task ? "AssignedServiceCertification" : "Receipt" }; }
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/")) { expect(request.headers()["x-shell-entity"]).toBe(company); expect(request.headers()["x-shell-location"]).toBe(branch); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: role, roles: ["procurement_receiver"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === api + "/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker, permissions, company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === api + "/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true, capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "receivingDrafts", "receivingGoods", "receivingInspection", "receivingServices", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map((key) => [key, key.startsWith("receiving") && key !== "receiving" && options.enabled !== false])) });
    if (request.method() === "GET") {
      reads.push(path + url.search);
      if (path === api + "/receiving/sources") return json({ items: [{ orderId: order, orderNumber: "PO-ISSUED", issuedVersionId: issued, purchaseOrderLineId: line, description: "Issued delivery line", unitCode: "EA", currencyCode: "ZMW", branchRef: branch, orderedQuantity: "2", netUnitPrice: "100.1234", kind: "Goods", acceptanceHistory: "RequiresCommandVerification", blocker: null }], total: 1, page: 1, pageSize: 25 });
      if (path.startsWith(api + "/orders/command-receipts/")) { expect(path).toContain(writes[0].key); return json({ state: "RecordedHistoricalOutcome", purchaseOrderId: order, operation: options.createLost ? "ReceivingDraft" : "ReceivingRecord", commandKey: writes[0].key, recordedResult: { id, status: "Recorded" }, currentTargetVersion: 3, currentTargetStatus: "Recorded", replayAuthorized: false }); }
      if (path === api + "/receiving/worklist" || path === api + "/receiving/inspection-tasks" || path === api + "/receiving/service-tasks") return json({ items: [{ id, receiptId: role === "inspector" ? id : undefined, lineId: line, number: "GRN-LIVE", status: "Held", version: 2, orderId: order, orderNumber: "PO-ISSUED" }, ...(options.denied ? [{ id: denied, number: "GRN-DENIED", status: "Held", version: 1, orderId: order, orderNumber: "PO-OTHER" }] : [])], total: options.denied ? 2 : 1, page: 1, pageSize: 25 });
      if (path === `${api}/receipts/${denied}`) return json({ message: "Not available" }, options.denied);
      if (path === `${api}/receipts/${id}` || path === `${api}/receipts/${id}/inspection-task`) return json(receipt(path.endsWith("inspection-task")));
      if (path === `${api}/service-acceptances/${id}` || path === `${api}/service-acceptances/${id}/certification-task`) return json(service(path.endsWith("certification-task")));
    }
    if (request.method() === "POST" && (path.startsWith(api + "/receipts/") || path.startsWith(api + "/service-acceptances/"))) {
      writes.push({ path, body: request.postData()!, key: request.headers()["idempotency-key"] });
      // Saving a draft is not arrival or certification. Only a final command changes retained evidence.
      changed = path !== api + "/receipts/drafts" && path !== api + "/service-acceptances/drafts";
      if (options.stale) return json({ message: "Current evidence changed" }, 409);
      if (options.lost || options.createLost) return route.abort("failed");
      return json({ id, version: 3, status: changed ? "Recorded" : "Draft" });
    }
    unexpected.push(path); return json({ message: "Unexpected receiving fixture endpoint" }, 404);
  });
  return { writes, reads, unexpected };
}
async function confirm(page: Page, name: string, quantity?: string) {
  await page.getByRole("button", { name, exact: true }).click(); const dialog = page.getByRole("dialog");
  if (quantity) await dialog.getByRole("textbox", { name: "Qualified quantity", exact: true }).fill(quantity);
  await dialog.getByRole("textbox", { name: "Evidence reference", exact: true }).fill("INDEPENDENT-EVIDENCE");
  await expect(dialog.getByRole("button", { name: "Confirm delivery action", exact: true })).toBeDisabled();
  await dialog.getByRole("switch").click(); await dialog.getByRole("button", { name: "Confirm delivery action", exact: true }).click();
}
test("capability false keeps receiving live routes closed without demo or receiving API reads", async ({ page }) => {
  const evidence = await mock(page, { enabled: false }); await page.goto(root);
  await expect(page.getByText("no sample transactions are shown here.", { exact: false })).toBeVisible(); expect(evidence.reads).toEqual([]); expect(evidence.writes).toHaveLength(0);
});
test("goods draft preserves physical overdelivery and exact rejection without an inferred acceptance maximum", async ({ page }) => {
  const evidence = await mock(page); await page.goto(root + "/new");
  await page.getByRole("switch", { name: "Select PO-ISSUED Issued delivery line", exact: true }).click();
  await page.getByRole("textbox", { name: "Received quantity 1", exact: true }).fill("3.1250"); await page.getByRole("textbox", { name: "Initially rejected quantity 1", exact: true }).fill("0.1250");
  await page.getByRole("button", { name: "Save delivery draft", exact: true }).click(); await expect(page.getByRole("heading", { name: "GRN-LIVE", exact: true })).toBeVisible();
  expect(evidence.writes).toHaveLength(1); const body = JSON.parse(evidence.writes[0].body);
  expect(body).toMatchObject({ purchaseOrderId: order, issuedVersionId: issued, siteId: branch, lines: [{ purchaseOrderLineId: line, receivedQuantity: "3.1250", rejectedQuantity: "0.1250" }] });
  expect(evidence.writes[0].key).toMatch(/^[0-9a-f-]{36}$/i); await expect(page.getByRole("button", { name: "Record arrival", exact: true })).toBeVisible();
  expect(evidence.unexpected).toEqual([]);
});
test("recording arrival preserves observed held goods and does not imply acceptance", async ({ page }) => {
  const evidence = await mock(page); await page.goto(`${root}/${id}`); await confirm(page, "Record arrival");
  await expect(page.getByRole("status").filter({ hasText: /^Saved:/ })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  expect(JSON.parse(evidence.writes[0].body)).toEqual({ version: 2, evidenceReference: "INDEPENDENT-EVIDENCE" });
  await expect(page.getByRole("cell", { name: "3.0000", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Accept goods", exact: true })).toHaveCount(0);
});
test("named inspector uses purpose-only queue/detail and exact line plus source versions", async ({ page }) => {
  const evidence = await mock(page, { role: "inspector", action: "Inspect" }); await page.goto(root);
  await expect(page.getByRole("tab", { name: "Goods deliveries", exact: true })).toHaveCount(0); await page.getByRole("link", { name: "Review delivery", exact: true }).click();
  await confirm(page, "Inspect delivery", "2.0000"); await expect(page.getByRole("status").filter({ hasText: /^Saved:/ })).toBeVisible();
  expect(JSON.parse(evidence.writes[0].body)).toEqual({ version: 7, sourceVersion: 9, quantity: "2.0000", evidenceReference: "INDEPENDENT-EVIDENCE" });
  expect(evidence.reads.some((path) => path.endsWith("/inspection-task"))).toBe(true); expect(evidence.reads.some((path) => path.startsWith(api + "/receiving/worklist") || path === `${api}/receipts/${id}`)).toBe(false);
  await expect(page.getByText("Internal delivery notes", { exact: false })).toHaveCount(0);
});
for (const legacy of [false, true]) test(`${legacy ? "legacy" : "unknown"} history never invents zero acceptance capacity`, async ({ page }) => {
  const evidence = await mock(page, { action: "Accept", unknown: !legacy, legacy }); await page.goto(`${root}/${id}`);
  await expect(page.getByText("Acceptance capacity needs verification.", { exact: false })).toBeVisible(); await expect(page.getByRole("button", { name: "Accept goods", exact: true })).toBeDisabled(); expect(evidence.writes).toHaveLength(0);
});
test("service owner confirms a pending partial service using current nonzero source revision without receipt-view", async ({ page }) => {
  const evidence = await mock(page, { role: "owner", action: "Certify", partialSourceVersion: 12 }); await page.goto(root);
  await page.getByRole("link", { name: "Review delivery", exact: true }).click(); await confirm(page, "Confirm service");
  await expect(page.getByRole("status").filter({ hasText: /^Saved:/ })).toBeVisible(); expect(JSON.parse(evidence.writes[0].body)).toEqual({ version: 4, sourceVersion: 12, quantity: "0.5000", evidenceReference: "INDEPENDENT-EVIDENCE" });
  expect(evidence.reads.some((path) => path.endsWith("/certification-task"))).toBe(true); expect(evidence.reads.some((path) => path === `${api}/service-acceptances/${id}` || path.startsWith(api + "/receiving/worklist"))).toBe(false);
});
test("cancelled service shows retained notes and separate read-only cancellation reason", async ({ page }) => {
  const evidence = await mock(page, { cancelledService: true }); await page.goto(`${root}/${id}?kind=service`);
  await expect(page.getByText("Cancellation reason: Service no longer required", { exact: true })).toBeVisible(); await expect(page.getByText(`Notes: ${"n".repeat(1500)}`, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Confirm service", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(0);
});
test("unknown arrival outcome retains its key and reconciles without repeating the physical command", async ({ page }) => {
  const evidence = await mock(page, { lost: true }); await page.goto(`${root}/${id}`); await confirm(page, "Record arrival");
  await expect(page.getByRole("button", { name: "Check saved delivery", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1); await expect(page.getByText(evidence.writes[0].key, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record arrival", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "Check saved delivery", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved result found" })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
});
test("stale arrival refreshes authoritative candidates but keeps the conflict explanation", async ({ page }) => {
  const evidence = await mock(page, { stale: true }); await page.goto(`${root}/${id}`); await confirm(page, "Record arrival");
  await expect(page.getByRole("alert")).toContainText("changed"); await expect(page.getByRole("button", { name: "Record arrival", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(1);
});
for (const status of [403, 404]) test(`navigation clears old delivery/actions when next detail is denied ${status}`, async ({ page }) => {
  await mock(page, { denied: status }); await page.goto(`${root}/${id}`); await expect(page.getByRole("button", { name: "Record arrival", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to deliveries", exact: true }).click(); await page.getByRole("row").filter({ hasText: "GRN-DENIED" }).getByRole("link", { name: "Review delivery", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByRole("button", { name: "Record arrival", exact: true })).toHaveCount(0); await expect(page.getByRole("cell", { name: "3.1250", exact: true })).toHaveCount(0);
});
test("unconfirmed goods draft creation recovers unknown target ID by original key", async ({ page }) => {
  const evidence = await mock(page, { createLost: true }); await page.goto(root + "/new"); await page.getByRole("switch", { name: "Select PO-ISSUED Issued delivery line", exact: true }).click();
  await page.getByRole("button", { name: "Save delivery draft", exact: true }).click(); await expect(page.getByRole("button", { name: "Check saved draft", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Save delivery draft", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "Check saved draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GRN-LIVE", exact: true })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
});

test("receiving list reuses column tools and selection while export remains an explained unavailable action", async ({ page }) => {
  const evidence = await mock(page); await page.goto(root);
  await expect(page.getByTestId("erp-record-table")).toBeVisible(); await page.getByRole("checkbox", { name: "Select GRN-LIVE", exact: true }).check();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Export selected", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Secure receiving exports are not connected yet" })).toBeVisible();
  await page.getByRole("button", { name: "Customize columns", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible(); expect(evidence.writes).toHaveLength(0);
});
test("detail keeps related comments documents and history sections without local demo mutations", async ({ page }) => {
  const evidence = await mock(page); await page.goto(`${root}/${id}`);
  for (const name of ["Overview", "Items (1)", "Related", "Comments", "Documents", "History"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Comments", exact: true }).click(); await page.getByRole("button", { name: "Add Comment", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Delivery comments are not connected yet"); await page.getByRole("button", { name: "Close explanation", exact: true }).click();
  await page.getByRole("tab", { name: "Documents", exact: true }).click(); await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Secure document upload is not connected"); expect(evidence.writes).toHaveLength(0);
});
test("draft preserves attachment help sticky actions and discard confirmation", async ({ page }) => {
  const evidence = await mock(page); await page.goto(root + "/new"); await page.getByRole("switch", { name: "Select PO-ISSUED Issued delivery line", exact: true }).click();
  await page.getByRole("textbox", { name: "Received quantity 1", exact: true }).fill("3.1250");
  await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveAttribute("readonly", ""); await expect(page.getByRole("textbox", { name: "Transaction title", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click(); await expect(page.getByRole("textbox", { name: "Received quantity 1", exact: true })).toHaveValue("3.1250"); expect(evidence.writes).toHaveLength(0);
});
