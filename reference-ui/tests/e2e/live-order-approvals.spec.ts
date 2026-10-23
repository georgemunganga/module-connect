import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222", worker = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444", caseId = "55555555-5555-4555-8555-555555555555", assignmentId = "66666666-6666-4666-8666-666666666666", stageId = "77777777-7777-4777-8777-777777777777", lineId = "88888888-8888-4888-8888-888888888888";
const api = "/api/procurement/v1/orders", root = "/procurement/workspace";
test.setTimeout(120_000);
async function fixture(page: Page, options: { lost?: boolean; stale?: boolean; inactive?: boolean; malformed?: boolean; enabled?: boolean; pageable?: boolean } = {}) {
  let status = "PendingApproval";
  const writes: Array<{ path: string; raw: string; key: string }> = [], reads: string[] = [], unexpected: string[] = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/")) { expect(request.headers()["x-shell-entity"]).toBe(company); expect(request.headers()["x-shell-location"]).toBe(branch); }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Order approver", roles: ["procurement_manager"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", "procurement-po-approve", "procurement-po-edit"], company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"].map((key) => [key, key === "orders" && options.enabled !== false])) });
    if (path === api + "/assigned-approvals") {
      reads.push(path + url.search); return json({ items: [{ assignmentId, caseId, orderId: id, assignmentVersion: 3, caseVersion: 7, code: "PROC", openedAt: "2026-10-20T00:00:00Z", number: options.pageable && url.searchParams.get("page") === "2" ? "PO-TASK-2" : "PO-TASK-1", orderVersion: 4, status, currencyCode: "ZMW" }], total: options.pageable ? 26 : 1, page: Number(url.searchParams.get("page")), pageSize: 25 });
    }
    if (path === `${api}/${id}/execution-detail`) {
      reads.push(path); const pending = status === "PendingApproval" && !options.inactive;
      return json({ order: { id, number: "PO-TASK-1", supplierId: lineId, supplierName: "Approved vendor", status, branchRef: branch, currencyCode: "ZMW", version: status === "PendingApproval" ? 4 : 5, currentRevision: 2, expectedDeliveryOn: null,
        total: "99999999999999.99990001", lines: [{ id: lineId, lineNumber: 1, description: "Approved order line", unitCode: "EA", quantity: "1", unitPrice: "99999999999999.9999", taxAmount: "0.00000001", acceptedQuantity: "0", invoicedQuantity: "0", sourcePurchaseRequestLineId: stageId }] },
        totals: { lineBaseAmount: "99999999999999.9999", grossAmount: "99999999999999.99990001" }, nextCommercialRevision: 2, financeStatus: "CommitmentHeld", sourceReservationReferences: ["RES-1"],
        financeEvidence: [{ id: lineId, commitmentReference: "FIN-1", confirmedGrossAmount: "99999999999999.99990001", currencyCode: "ZMW", evidenceReference: "FIN-EVIDENCE", releaseConfirmed: false }], financeResolutions: [], submissions: [],
        cases: [{ id: caseId, state: pending ? "Pending" : status, version: pending ? 7 : 8, sourceVersion: 2, stages: [{ id: stageId, code: "PROC", state: pending ? "Active" : "Complete", assignments: [{ id: assignmentId, state: pending ? "Pending" : "Approved", version: options.malformed ? undefined : pending ? 3 : 4, assignedToMe: true }] }] }],
        decisions: pending ? [] : [{ id: assignmentId, action: status, reason: "Recorded decision", decidedAt: new Date().toISOString() }], issued: [], deliveries: [],
        actionCandidates: [{ code: "Decide", permission: "procurement-po-approve", canStart: pending, blockers: [], requiresCommandValidation: true }, { code: "SourceEdit", permission: "procurement-po-edit", canStart: false, blockers: ["HeldCommitment"], requiresCommandValidation: true }], configuredDeliveryChannels: [], commandValidationRequired: true });
    }
    if (path === `${api}/${id}/assignments/${assignmentId}/decisions`) {
      writes.push({ path, raw: request.postData()!, key: request.headers()["idempotency-key"] });
      const body = request.postDataJSON(); status = options.stale ? "Approved" : body.action === "Approve" ? "Approved" : body.action === "Reject" ? "Rejected" : "Returned";
      if (options.stale) return json({ message: "Versions changed" }, 409);
      if (options.lost) return route.abort("failed");
      return json({ id, status, version: 5, nextStep: status === "Returned" ? "Finance release required" : "Decision recorded" });
    }
    if (path.startsWith(api + "/command-receipts/Decide/")) {
      expect(url.searchParams.get("orderId")).toBe(id); expect(path).toContain(writes[0].key); reads.push(path);
      return json({ state: "RecordedHistoricalOutcome", purchaseOrderId: id, operation: "Decide", commandKey: writes[0].key, recordedResult: { id, status }, currentOrderVersion: 5, currentOrderStatus: status, replayAuthorized: false });
    }
    unexpected.push(path); return json({ message: "Unexpected endpoint" }, 404);
  });
  return { writes, reads, unexpected };
}
async function decide(page: Page, action: "Approve" | "Reject" | "Return") {
  await page.getByRole("button", { name: action === "Return" ? "Return for changes" : action, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: action === "Approve" ? "Comment (optional)" : "Reason", exact: true }).fill("Current order and sources reviewed");
  await dialog.getByRole("button", { name: "Confirm decision", exact: true }).click();
}
test("PO-only approver uses existing Approvals entry with actual order queue/detail contracts", async ({ page }) => {
  const evidence = await fixture(page); await page.goto(root + "/approvals");
  await expect(page.getByRole("heading", { name: "Order approvals", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Review order approval", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PO-TASK-1", exact: true })).toBeVisible();
  await decide(page, "Approve"); await expect(page.getByRole("status").filter({ hasText: "Saved: Approved" })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  const command = evidence.writes[0]; expect(command.path).toBe(`${api}/${id}/assignments/${assignmentId}/decisions`); expect(command.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(JSON.parse(command.raw)).toEqual({ action: "Approve", reason: "Current order and sources reviewed", expectedOrderVersion: 4, expectedCaseVersion: 7, expectedAssignmentVersion: 3 });
  expect(evidence.unexpected).toEqual([]);
});
for (const action of ["Reject", "Return"] as const) test(`PO ${action} requires a reason and never opens editing while funds are held`, async ({ page }) => {
  const evidence = await fixture(page); await page.goto(`${root}/purchase-orders/${id}`);
  await page.getByRole("button", { name: action === "Return" ? "Return for changes" : action, exact: true }).click(); const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Confirm decision", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Reason", exact: true }).fill("Changes required before this order may proceed");
  await dialog.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await expect(page.getByText("Finance must confirm the release or restoration of held funds", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit linked draft", exact: true })).toHaveCount(0); expect(JSON.parse(evidence.writes[0].raw).action).toBe(action);
});
test("stale PO decision removes old controls and does not reuse stale Core versions", async ({ page }) => {
  const evidence = await fixture(page, { stale: true }); await page.goto(`${root}/purchase-orders/${id}`); await decide(page, "Approve");
  await expect(page.getByRole("status").filter({ hasText: "changed" })).toBeVisible(); await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(evidence.writes).toHaveLength(1);
});
test("lost PO decision uses actor-owned receipt recovery without a second POST", async ({ page }) => {
  const evidence = await fixture(page, { lost: true }); await page.goto(`${root}/purchase-orders/${id}`); await decide(page, "Approve");
  await expect(page.getByRole("button", { name: "Check saved result", exact: true })).toBeVisible();
  await expect(page.getByText(evidence.writes[0].key, { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved result found: Approved" })).toBeVisible(); expect(evidence.writes).toHaveLength(1);
  expect(evidence.reads.some((path) => path.includes("command-receipts/Decide/"))).toBe(true);
});
test("inactive PO assignment cannot expose an approval action", async ({ page }) => {
  const evidence = await fixture(page, { inactive: true }); await page.goto(`${root}/purchase-orders/${id}`);
  await expect(page.getByText("No active decision is available", { exact: false })).toBeVisible(); await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(0);
});
test("missing PO assignment version fails closed instead of borrowing PR fields", async ({ page }) => {
  const evidence = await fixture(page, { malformed: true }); await page.goto(`${root}/purchase-orders/${id}`);
  await expect(page.getByRole("alert")).toContainText("incomplete"); await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0); expect(evidence.writes).toHaveLength(0);
});
test("assigned PO queue paging preserves the order-specific route and scope", async ({ page }) => {
  const evidence = await fixture(page, { pageable: true }); await page.goto(root + "/approvals"); await page.getByRole("button", { name: "Next approvals", exact: true }).click();
  await expect(page.getByRole("cell", { name: "PO-TASK-2", exact: true })).toBeVisible(); expect(evidence.reads.some((path) => path.includes("page=2"))).toBe(true); expect(evidence.unexpected).toEqual([]);
});
