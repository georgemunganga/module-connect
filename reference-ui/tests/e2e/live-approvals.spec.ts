import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", worker = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333", caseId = "44444444-4444-4444-8444-444444444444";
const assignmentId = "55555555-5555-4555-8555-555555555555", branch = "66666666-6666-4666-8666-666666666666";
const stageId = "77777777-7777-4777-8777-777777777777", decisionId = "88888888-8888-4888-8888-888888888888";
const lineId = "99999999-9999-4999-8999-999999999999";
const root = "/procurement/workspace";
test.setTimeout(90_000);
async function mockErp(page: Page, options: { enabled?: boolean; empty?: boolean; read?: boolean; decide?: boolean; loseResponse?: boolean; stale?: boolean; unopened?: boolean; pages?: boolean; pendingRelease?: boolean; finance?: boolean; fundingBlocked?: boolean; openingQueue?: boolean } = {}) {
  let state = options.pendingRelease || options.finance ? "Returned" : "Pending", requestState = options.finance ? "ReturnPendingFinanceRelease" : "Submitted", caseVersion = 2, requestVersion = 5, opened = !options.unopened;
  let lost = false, stale = options.stale, approvalReads = 0, releaseConfirmed = false;
  const decisions: Array<Record<string, unknown>> = [];
  const keys: Array<{ key: string; body: string }> = [];
  const receipts = new Map<string, Record<string, unknown>>();
  const permissions = ["procurement-access", "procurement-request-read", "procurement-request-create", "procurement-approval-open",
    ...(options.finance ? ["procurement-budget-check"] : []), ...(options.read === false ? [] : ["procurement-approval-read"]), ...(options.decide === false ? [] : ["procurement-approval-decide"])];
  const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft",
    "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"]
    .map((key) => [key, key === "requestDraft" || key === "approvals" && options.enabled !== false]));
  const detail = () => ({ caseId, requestId, requestNumber: "PR-101", purpose: "Office laptops", currencyCode: "ZMW", amount: 250,
    amountBasis: "EstimatedLineBase", state, requestState, requestVersion, caseVersion, submittedVersion: 4, openedAt: "2026-10-20T10:00:00Z",
    completedAt: state === "Pending" ? null : "2026-10-20T11:00:00Z", requestSnapshot: { lines: [{ id: lineId, description: "Laptop", quantity: "2", unitPrice: "125" }] },
    stages: [{ id: stageId, sequence: 1, code: "Manager review", state: state === "Pending" ? "Active" : state, mode: "Any", requiredApprovals: 1,
      assignments: [{ id: assignmentId, principalId: "manager", state, version: state === "Pending" ? 1 : 2, isMine: true,
        allowedActions: state === "Pending" ? options.fundingBlocked ? ["Reject", "Return"] : ["Approve", "Reject", "Return"] : [] }] }], decisions, blockers: options.fundingBlocked ? ["FinanceReservationNotConfirmed"] : [] });
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: company, branch });
  await page.route("**/api/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/procurement/v1/") && (req.headers()["x-shell-entity"] !== company || req.headers()["x-shell-location"] !== branch))
      return json({ message: "Company and branch headers are required." }, 403);
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Manager", roles: ["procurement_manager"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (url.pathname === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, workerId: worker, permissions,
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true, capabilities });
    if (url.pathname === "/api/procurement/v1/requests/approval-opening-queue") return json({
      records: options.openingQueue && !opened ? [{ requestId, requestNumber: "PR-101", purpose: "Office laptops", currencyCode: "ZMW", amount: 250,
        requestVersion, submittedAt: "2026-10-20T10:00:00Z" }] : [], count: options.openingQueue && !opened ? 1 : 0, limit: 25, offset: 0,
    });
    if (url.pathname === "/api/procurement/v1/approvals") {
      approvalReads++;
      expect(url.searchParams.get("limit")).toBe("25");
      expect(url.searchParams.get("state")).toBe("Pending");
      return json({ records: options.empty || state !== "Pending" ? [] : [{ ...detail(), stage: { id: stageId, code: "Manager review", state: "Active" }, assignments: [{ id: assignmentId, version: 1, state: "Pending" }] }], count: options.empty || state !== "Pending" ? 0 : options.pages ? 26 : 1, limit: 25, offset: Number(url.searchParams.get("offset")) });
    }
    if (url.pathname === `/api/procurement/v1/approvals/${caseId}`) { approvalReads++; return json(detail()); }
    if (url.pathname === `/api/procurement/v1/requests/${requestId}`) return json({ id: requestId, number: "PR-101", purpose: "Office laptops", currencyCode: "ZMW", status: requestState,
      approvalState: opened ? state : null, approvalInstanceRef: opened ? caseId : null,
      version: requestVersion, lineCount: 1, createdAt: "2026-10-20T10:00:00Z", submittedVersion: 4, lines: [{ id: lineId, lineNumber: 1, description: "Laptop", requestedQuantity: 2, estimatedUnitPrice: 125, unitCode: "EA", approvalStatus: "Pending" }] });
    if (url.pathname === `/api/procurement/v1/requests/${requestId}/policy-status`) return json({ requestId, requestVersion: 4, status: "Matched", isAuthority: false });
    if (url.pathname === `/api/procurement/v1/requests/${requestId}/budget-status`) return json({ requestId, requestVersion: 4, status: "Available", reservationConfirmed: true });
    if (url.pathname === `/api/procurement/v1/requests/${requestId}/approval-history`) return json({ requestId, records: opened ? [{ caseId, submittedVersion: 4, state, openedAt: "2026-10-20T10:00:00Z", decisions }] : [] });
    if (url.pathname === "/api/procurement/v1/requests/budget-queue") return json({ records: [], count: 0, limit: 50, offset: 0 });
    if (url.pathname === "/api/procurement/v1/requests/finance-release-queue") return json({
      records: options.finance && !releaseConfirmed ? [{ requestId, requestNumber: "PR-101", requestVersion, requestState,
        releaseRequestId: stageId, reservationReference: "FIN-RESERVE-1", reservedAmount: 250, currencyCode: "ZMW", requestedAt: "2026-10-20T10:00:00Z" }] : [],
      count: options.finance && !releaseConfirmed ? 1 : 0, limit: 25, offset: 0,
    });
    if (url.pathname === `/api/procurement/v1/requests/${requestId}/finance-release-confirmations`) {
      const key = req.headers()["idempotency-key"], body = req.postData()!;
      keys.push({ key, body });
      if (receipts.has(key)) { expect(keys[0].body).toBe(body); return json(receipts.get(key)); }
      const input = req.postDataJSON();
      expect(input.reservationReference).toBe("FIN-RESERVE-1"); expect(input.releasedAmount).toBe(250);
      expect(input.evidenceReference).toBe("FIN-RELEASE-1");
      expect(input.reason.trim()).not.toBe("");
      releaseConfirmed = true; requestState = "ReturnedForChanges"; requestVersion++;
      const receipt = { requestId, requestVersion, requestState, releaseRequestId: stageId, confirmationId: decisionId,
        financeReleaseState: "Confirmed", evidenceMode: "ApprovedManualEvidence" };
      receipts.set(key, receipt);
      if (options.loseResponse && !lost) { lost = true; return route.abort("failed"); }
      return json(receipt);
    }
    const opening = url.pathname === `/api/procurement/v1/requests/${requestId}/approval-cases`;
    if (opening || url.pathname === `/api/procurement/v1/approvals/${caseId}/assignments/${assignmentId}/decisions`) {
      const key = req.headers()["idempotency-key"], body = req.postData()!;
      expect(key).toMatch(/^[0-9a-f-]{36}$/i); keys.push({ key, body });
      if (receipts.has(key)) {
        expect(keys[0].body).toBe(body); return json(receipts.get(key));
      }
      if (stale) { stale = false; caseVersion++; return json({ code: "version-conflict", message: "Another approver updated this request." }, 409); }
      if (!opening) {
        const input = req.postDataJSON();
        expect(input.expectedCaseVersion).toBe(caseVersion);
        expect(input.expectedRequestVersion).toBe(requestVersion);
        if (input.action !== "Approve") expect(input.reason.trim()).not.toBe("");
        state = input.action === "Approve" ? "Approved" : input.action === "Reject" ? "Rejected" : "Returned";
        requestState = input.action === "Return" ? "ReturnPendingFinanceRelease" : state;
        caseVersion++; requestVersion++;
        decisions.push({ id: decisionId, assignmentId, actorSubjectId: "manager", action: input.action, reason: input.reason, decidedAt: "2026-10-20T11:00:00Z" });
      } else { opened = true; requestVersion++; }
      const receipt = { caseId, requestId, submittedVersion: 4, requestVersion, caseVersion, state, requestState, approvalState: state,
        ...(opening ? {} : { assignmentId, assignmentVersion: 2, decisionId }) };
      receipts.set(key, receipt);
      if (options.loseResponse && !lost) { lost = true; return route.abort("failed"); }
      return json(receipt, opening ? 201 : 200);
    }
    return json({ message: "Not found" }, 404);
  });
  return { keys, decisions, reads: () => approvalReads };
}

test("assigned approvals open scoped detail and require a reason for returns", async ({ page }) => {
  await mockErp(page);
  await page.goto(`${root}/approvals`);
  await page.getByRole("link", { name: "Review request" }).click();
  await expect(page.getByRole("heading", { name: "PR-101" })).toBeVisible();
  await page.getByRole("button", { name: "Return for changes", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Confirm decision" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Please correct the cost centre");
  await dialog.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByText("Request returned. Editing will open after Finance confirms the funds are released.")).toBeVisible();
  await expect(page.getByText("Waiting for Finance to release funds", { exact: true })).toBeVisible();
  await expect(page.getByText("Please correct the cost centre")).toBeVisible();
});

test("a lost decision response retries the exact key and payload once", async ({ page }) => {
  const evidence = await mockErp(page, { loseResponse: true });
  await page.goto(`${root}/approvals/${caseId}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Comment (optional)").fill("Checked delivery");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("button", { name: "Retry same decision" })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Comment (optional)")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByRole("status")).toContainText("Decision saved");
  expect(evidence.keys).toHaveLength(2);
  expect(evidence.keys[0]).toEqual(evidence.keys[1]);
  expect(evidence.decisions).toHaveLength(1);
});

test("stale decisions refresh revisions before a new decision", async ({ page }) => {
  const evidence = await mockErp(page, { stale: true });
  await page.goto(`${root}/approvals/${caseId}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("alert")).toContainText("Review the refreshed request");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("status")).toContainText("Decision saved");
  expect(evidence.keys[0].key).not.toBe(evidence.keys[1].key);
  expect(JSON.parse(evidence.keys[1].body).expectedCaseVersion).toBe(3);
});

test("capability false keeps approvals closed and read denial makes no queue request", async ({ page }) => {
  const evidence = await mockErp(page, { enabled: false });
  await page.goto(`${root}/approvals`);
  await expect(page.getByText("This workflow is being connected to your ERP.", { exact: false })).toBeVisible();
  expect(evidence.reads()).toBe(0);
});

test("queue empty state and read-only details never offer decisions", async ({ page }) => {
  await mockErp(page, { empty: true, decide: false });
  await page.goto(`${root}/approvals`);
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.goto(`${root}/approvals/${caseId}`);
  await expect(page.getByRole("heading", { name: "PR-101" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

test("requester starts approvals with the same key after an interrupted response", async ({ page }) => {
  const evidence = await mockErp(page, { unopened: true, loseResponse: true });
  await page.goto(`${root}/requests/${requestId}`);
  await page.getByRole("button", { name: "Start approvals" }).click();
  await expect(page.getByRole("button", { name: "Retry starting approvals" })).toBeVisible();
  await page.getByRole("button", { name: "Retry starting approvals" }).click();
  await expect(page.getByText("Submission 4 · Pending")).toBeVisible();
  expect(evidence.keys).toHaveLength(2);
  expect(evidence.keys[0]).toEqual(evidence.keys[1]);
  await expect(page.getByRole("button", { name: "Start approvals", exact: true })).toHaveCount(0);
});


test("missing approval-read permission denies the queue without loading records", async ({ page }) => {
  const evidence = await mockErp(page, { read: false });
  await page.goto(`${root}/approvals`);
  await expect(page.getByRole("alert")).toContainText("You do not have access to the assigned approval queue");
  expect(evidence.reads()).toBe(0);
});

test("assigned queue paginates through bounded server pages", async ({ page }) => {
  await mockErp(page, { pages: true });
  await page.goto(`${root}/approvals`);
  await expect(page.getByText("1–25 of 26")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("26–26 of 26")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
});


for (const deniedStatus of [403, 404]) {
  test(`navigation to a denied approval (${deniedStatus}) removes old request actions`, async ({ page }) => {
    await mockErp(page);
    const deniedCase = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await page.route(`**/api/procurement/v1/approvals/${deniedCase}`, (route) => route.fulfill({
      status: deniedStatus, contentType: "application/json", body: JSON.stringify({ message: "Approval unavailable" }),
    }));
    await page.goto(`${root}/approvals/${caseId}`);
    await expect(page.getByRole("heading", { name: "PR-101" })).toBeVisible();
    await page.evaluate((path) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }, `${root}/approvals/${deniedCase}`);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "PR-101" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  });
}

test("returned requests stay locked while Finance release is pending even with an older Submitted header", async ({ page }) => {
  await mockErp(page, { pendingRelease: true });
  await page.goto(`${root}/requests/${requestId}`);
  await expect(page.getByText("Waiting for Finance to release the reserved funds.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start approvals" })).toHaveCount(0);
});


test("Finance records manual release evidence and recovers the exact interrupted confirmation", async ({ page }) => {
  const evidence = await mockErp(page, { finance: true, loseResponse: true });
  await page.goto(`${root}/budgets`);
  await page.getByRole("button", { name: "Record release evidence" }).click();
  const dialog = page.getByRole("dialog");
  const confirmationTime = dialog.getByLabel("Finance confirmation date and time");
  await expect(confirmationTime).toHaveAttribute("step", "0.001");
  await confirmationTime.fill("2026-10-20T11:30:15.789");
  await expect(dialog.getByRole("button", { name: "Confirm release evidence" })).toBeDisabled();
  await dialog.getByLabel("Release evidence reference").fill("FIN-RELEASE-1");
  await dialog.getByLabel("Reason", { exact: true }).fill("Finance independently verified the reservation release");
  await dialog.getByRole("button", { name: "Confirm release evidence" }).click();
  await expect(dialog.getByRole("button", { name: "Retry same confirmation" })).toBeVisible();
  expect(JSON.parse(evidence.keys[0].body).confirmedAt).toBe(new Date("2026-10-20T11:30:15.789").toISOString());
  await expect(dialog.getByLabel("Release evidence reference")).toBeDisabled();
  await dialog.getByRole("button", { name: "Retry same confirmation" }).click();
  await expect(page.getByText("Release evidence recorded. The requester can now make changes.")).toBeVisible();
  expect(evidence.keys).toHaveLength(2);
  expect(evidence.keys[0]).toEqual(evidence.keys[1]);
  await expect(page.getByRole("button", { name: "Record release evidence" })).toHaveCount(0);
});


test("a Finance blocker prevents approval while preserving permitted return actions", async ({ page }) => {
  await mockErp(page, { fundingBlocked: true });
  await page.goto(`${root}/approvals/${caseId}`);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Return for changes", exact: true })).toBeVisible();
  await expect(page.getByText("Some approval checks need attention.", { exact: false })).toBeVisible();
});


test("a Procurement opener starts another request without assigned-queue access and recovers a lost response", async ({ page }) => {
  const evidence = await mockErp(page, { read: false, unopened: true, openingQueue: true, loseResponse: true });
  await page.goto(`${root}/approvals`);
  await page.getByRole("button", { name: "Start approvals for PR-101", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry starting PR-101", exact: true })).toBeVisible();
  // Refresh removes the committed request from the opening queue; the replay action must remain.
  await page.getByRole("button", { name: "Refresh waiting requests" }).click();
  await expect(page.getByText("No requests are waiting to start approvals.")).toBeVisible();
  await page.getByRole("button", { name: "Retry starting PR-101", exact: true }).click();
  await expect(page.getByText("Approvals started for PR-101.", { exact: false })).toBeVisible();
  expect(evidence.keys).toHaveLength(2);
  expect(evidence.keys[0]).toEqual(evidence.keys[1]);
  expect(evidence.reads()).toBe(0);
});
