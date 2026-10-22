import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const requestId = "77777777-7777-4777-8777-777777777777";
const lineId = "88888888-8888-4888-8888-888888888888";
const catalogEntryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const catalogItemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const catalogSupplierId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "requestDraft"]));
type RecordValue = Record<string, unknown> & { id: string; version: number; purpose: string; status: string; lines: Record<string, unknown>[] };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; confirmedBudget?: boolean; matchedPolicy?: boolean; policyReviewer?: boolean; blockedPolicy?: boolean; changedRouteLines?: boolean; oldEditContract?: boolean; missingCatalogExact?: boolean; permissions?: string[]; seedDraft?: boolean } = {}) {
  let record: RecordValue | null = options.seedDraft ? { id: requestId, number: "PR-001", version: 1, purpose: "Office chairs", status: "Draft", currencyCode: "ZMW", createdAt: "2026-10-18T00:00:00Z", lines: [{ id: lineId, lineNumber: 1, approvalStatus: "Pending", description: "Office chair", unitCode: "each", requestedQuantity: 1, estimatedUnitPrice: 250 }] } : null;
  let policyChecked = false;
  let policyBlocked = Boolean(options.blockedPolicy);
  await page.addInitScript((entityId) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Requester", email: "requester@example.test", roles: [options.policyReviewer ? "procurement_manager" : "employee"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId,
      permissions: options.permissions ?? ["procurement-access", "procurement-request-read", "procurement-request-create", "procurement-request-edit", "procurement-request-submit",
        ...(options.policyReviewer ? ["procurement-policy-evaluate", "procurement-request-return"] : [])],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/catalog") return json({ items: [{
      entryId: catalogEntryId, itemId: catalogItemId, supplierId: catalogSupplierId,
      code: "CHAIR-1", name: "Office chair", kind: "Goods", categoryCode: "OFFICE",
      unitCode: "each", estimatedUnitPrice: 250, exactEstimatedUnitPrice: options.missingCatalogExact ? undefined : "250", currencyCode: "ZMW",
      supplierName: "Office Supply", publishedVersion: 1,
    }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/requests/policy-queue")
      return json({ records: record?.status === "Submitted" && !policyChecked ? [{
        id: requestId, number: record.number, purpose: record.purpose,
        currencyCode: record.currencyCode, submittedAt: record.submittedAt,
        version: record.version, lineCount: record.lines.length,
        estimatedBaseAmount: record.lines.reduce((sum, line) => sum + Number(line.requestedQuantity) * Number(line.estimatedUnitPrice), 0),
        policyOutcome: policyBlocked ? "Blocked" : null,
        policyResultCode: policyBlocked ? "InactiveReference" : null,
      }] : [], count: record?.status === "Submitted" && !policyChecked ? 1 : 0, limit: 50, offset: 0 });
    if (path === "/api/procurement/v1/requests") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403) : json({ records: record ? [{ ...record, lineCount: record.lines.length }] : [], count: record ? 1 : 0, limit: 50, offset: 0 });
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        record = { ...input, id: requestId, number: "PR-001", status: "Draft", version: 1, requestEditVersion: 1, currencyCode: input.currencyCode || "ZMW", createdAt: "2026-10-18T00:00:00Z",
          lines: input.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, requestedQuantity: Number(line.requestedQuantity), estimatedUnitPrice: Number(line.estimatedUnitPrice),
            discountPercent: line.discountPercent == null ? null : Number(line.discountPercent), exactAmounts: { requestedQuantity: String(line.requestedQuantity), estimatedUnitPrice: String(line.estimatedUnitPrice), discountPercent: line.discountPercent == null ? null : String(line.discountPercent) }, id: index ? "99999999-9999-4999-8999-999999999999" : lineId, lineNumber: index + 1, approvalStatus: "Pending" })) };
        return json(record, 201);
      }
    }
    if (path === `/api/procurement/v1/requests/${requestId}` && record) {
      if (request.method() === "GET") return json(options.oldEditContract ? { ...record, requestEditVersion: undefined } : record);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "Refresh this request before saving changes." }, 409);
        const input = request.postDataJSON();
        if (input.version !== record.version) return json({ message: "Stale version" }, 409);
        record = { ...record, ...input, version: input.version + 1,
          lines: input.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, requestedQuantity: Number(line.requestedQuantity), estimatedUnitPrice: Number(line.estimatedUnitPrice),
            discountPercent: line.discountPercent == null ? null : Number(line.discountPercent), exactAmounts: { requestedQuantity: String(line.requestedQuantity), estimatedUnitPrice: String(line.estimatedUnitPrice), discountPercent: line.discountPercent == null ? null : String(line.discountPercent) }, id: line.id || (index ? "99999999-9999-4999-8999-999999999999" : lineId), lineNumber: index + 1, approvalStatus: "Pending" })) };
        if (record.lines.every((line) => line.categoryCode !== "UNKNOWN")) policyBlocked = false;
        return json(record);
      }
    }
    if (path === `/api/procurement/v1/requests/${requestId}/review` && record)
      return record.status === "Submitted" ? json(record) : json({ message: "Request not available for review." }, 404);
    if (path === `/api/procurement/v1/requests/${requestId}/approval-readiness` && record) {
      const blockers = [
        ...(!options.matchedPolicy && !policyChecked || policyBlocked ? ["BuyingRulesNotMatched"] : []),
        ...(!options.confirmedBudget ? ["FinanceReservationNotConfirmed"] : []),
        ...(options.changedRouteLines ? ["PinnedDecisionLinesChanged"] : []),
      ];
      return json({ requestId, requestVersion: record.version, estimatedAmount: 250,
        currencyCode: record.currencyCode, prerequisitesMet: blockers.length === 0,
        blockers, isAuthority: false, canOpenCase: false,
        approvalRoute: { hasSingleRoute: !options.changedRouteLines,
          blockers: options.changedRouteLines ? ["PinnedDecisionLinesChanged"] : [],
          lines: options.changedRouteLines ? [] : [{ lineId: record.lines[0]?.id,
          stages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] }] },
        assignmentPlan: { resolved: !options.changedRouteLines, blockers: [],
          stages: options.changedRouteLines ? [] : [{ code: "NEED", assigneeKind: "LineManager",
            mode: "One", blocker: null,
            candidates: [{ subjectId: "manager-1", displayName: "Jane Manager" }] }] },
        nextStep: "An independent approver is still required." });
    }
    if (path === `/api/procurement/v1/requests/${requestId}/withdraw` && record) {
      const { version, reason } = request.postDataJSON();
      if (version !== record.version) return json({ message: "Refresh this request." }, 409);
      if (record.status === "Submitted" && !reason) return json({ message: "Give a withdrawal reason." }, 422);
      record = { ...record, status: "Withdrawn", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/return-for-changes` && record) {
      const { version, reason } = request.postDataJSON();
      if (record.status !== "Submitted" || version !== record.version) return json({ message: "Refresh this request." }, 409);
      if (!reason?.trim()) return json({ message: "Explain what should change." }, 422);
      if (options.confirmedBudget) return json({ code: "budget-reservation-active", message: "Finance must release the confirmed reservation." }, 409);
      record = { ...record, status: "ReturnedForChanges", approvalState: "ReturnedForChanges",
        returnReason: reason, returnedAt: "2026-10-19T15:00:00Z", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/submit` && record) {
      const { version } = request.postDataJSON();
      if (version !== record.version || !["Draft", "ReturnedForChanges"].includes(record.status)) return json({ message: "Refresh this request." }, 409);
      if (!record.neededBy && record.lines.some((line) => !line.neededBy))
        return json({ message: "Choose a needed-by date." }, 422);
      record = { ...record, status: "Submitted", approvalState: "PendingPolicyAndBudget",
        returnReason: null, returnedAt: null, submittedAt: "2026-10-19T00:00:00Z", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/budget-status` && record)
      return json({ requestId, requestVersion: record.version, status: options.confirmedBudget ? "Available" : "Pending",
        checkedAt: options.confirmedBudget ? "2026-10-19T14:00:00Z" : null, reservationConfirmed: Boolean(options.confirmedBudget) });
    if (path === `/api/procurement/v1/requests/${requestId}/policy-evaluations` && record) {
      if (request.postDataJSON().requestVersion !== record.version) return json({ message: "Refresh request." }, 409);
      policyChecked = true;
      return json({ requestId, requestVersion: record.version, status: "Matched", isAuthority: false,
        message: "Buying rules matched. Funding and independent approvals are still required.",
        evaluation: { id: "99999999-9999-4999-8999-999999999999", outcome: "Matched", resultCode: "RulesMatched" } });
    }
    if (path === `/api/procurement/v1/requests/${requestId}/policy-status` && record)
      return json({ requestId, requestVersion: record.version,
        status: record.status !== "Submitted" ? "NotSubmitted" : policyBlocked ? "Blocked" : options.matchedPolicy || policyChecked ? "Matched" : "Pending", isAuthority: false,
        evaluation: policyBlocked ? { summary: "Buying rules need correction before this request can proceed.",
          resultCode: "InactiveReference", policyVersionNumber: 1, evaluatedAt: "2026-10-19T14:00:00Z" }
          : options.matchedPolicy || policyChecked ? { summary: "Buying rules matched. Funding and independent approvals are still required.",
          resultCode: "RulesMatched", policyVersionNumber: 1, evaluatedAt: "2026-10-19T14:00:00Z" } : null });
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}

test("request reader cannot open create or edit controls or send a draft write", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/procurement/v1/requests") && request.method() !== "GET") writes.push(request.method()); });
  await mockErp(page, { permissions: ["procurement-access", "procurement-request-read"], seedDraft: true });
  await page.goto("/procurement/workspace/requests");
  await expect(page.getByRole("link", { name: "New request" })).toHaveCount(0);
  await page.goto(`/procurement/workspace/requests/${requestId}`);
  await expect(page.getByRole("heading", { name: "Office chairs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit request" })).toHaveCount(0);
  await page.goto("/procurement/workspace/requests/new");
  await expect(page.getByRole("alert")).toContainText("do not have access to create a request");
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.goto(`/procurement/workspace/requests/${requestId}/edit`);
  await expect(page.getByRole("alert")).toContainText("do not have access to edit this request");
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("employee selects a published catalog price and saves its reference on the request", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/requests/new");
  await expect(page.getByText("Office Supply · ZMW 250 / each")).toBeVisible();
  await page.getByRole("button", { name: "Use item" }).click();
  await expect(page.getByLabel("Item or service 1")).toHaveValue("Office chair");
  await expect(page.getByLabel("Estimated unit price")).toHaveValue("250");
  await expect(page.getByText("From approved catalog", { exact: false })).toBeVisible();
  const saving = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/procurement/v1/requests" && request.method() === "POST");
  await page.getByRole("button", { name: "Save draft" }).click();
  const payload = (await saving).postDataJSON();
  expect(payload.lines[0].catalogEntryId).toBe(catalogEntryId);
  expect(payload.lines[0].catalogItemId).toBe(catalogItemId);
  expect(payload.lines[0].preferredSupplierId).toBe(catalogSupplierId);
  await expect(page.getByRole("heading", { name: "Purchase Office chair" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Office chair" })).toBeVisible();
  await page.getByRole("link", { name: "Edit request" }).click();
  await expect(page.getByText("From approved catalog", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Estimated unit price")).toHaveValue("250");
});

test("request draft lines persist, edit and withdraw", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/requests");
  await expect(page.getByText("What do you need to buy?")).toBeVisible();
  await expect(page.getByText("Office equipment for new team")).toHaveCount(0);
  await page.getByRole("link", { name: "New request" }).first().click();
  await page.getByLabel("What do you need?").fill("Office chairs for Lusaka");
  await page.getByLabel("Item or service 1").fill("Office chair");
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Estimated unit price").fill("1200");
  await expect(page.getByText("Estimated amount before discounts, tax and delivery: ZMW 3,600")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Office chairs for Lusaka" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Office chair" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Office chair" })).toBeVisible();
  await page.getByRole("link", { name: "Edit request" }).click();
  await page.getByLabel("Quantity").fill("4");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
  await expect(page.getByText("Withdrawn")).toBeVisible();
});

test("request submission stays pending policy and budget and needs a withdrawal reason", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Replacement laptops");
  await page.getByLabel("Item or service 1").fill("Laptop");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Send for review" })).toBeEnabled();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Sent for policy and budget review.", { exact: false })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for Procurement to check this request", { exact: false })).toBeVisible();
  await expect(page.getByText("Waiting for Finance to check the budget.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toBeDisabled();
  await page.getByLabel("Reason").fill("Request no longer needed");
  await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
  await expect(page.getByText("Withdrawn")).toBeVisible();
});

test("request shows rule and Finance evidence without implying approval", async ({ page }) => {
  await mockErp(page, { confirmedBudget: true, matchedPolicy: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Replacement laptops");
  await page.getByLabel("Item or service 1").fill("Laptop");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Checked; this has not approved the request", { exact: false })).toBeVisible();
  await expect(page.getByText("Finance confirmed funds for this request.")).toBeVisible();
  await expect(page.getByText("This request has not been approved", { exact: false })).toBeVisible();
});

test("Procurement can check queued buying rules without approving a request", async ({ page }) => {
  await mockErp(page, { policyReviewer: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Replacement laptops");
  await page.getByLabel("Item or service 1").fill("Laptop");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByRole("link", { name: "Back to my requests" }).click();
  await expect(page.getByRole("heading", { name: "Buying-rule checks and issues" })).toBeVisible();
  await page.getByRole("button", { name: "Check buying rules" }).click();
  await expect(page.getByText("Buying rules checked. Funding and approval are still required.")).toBeVisible();
  await expect(page.getByText("No requests need a buying-rule check or follow-up.")).toBeVisible();
});

test("a blocked rule result remains visible for Procurement follow-up", async ({ page }) => {
  await mockErp(page, { policyReviewer: true, blockedPolicy: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Unlisted laptops");
  await page.getByLabel("Item or service 1").fill("Laptop");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Buying rules need correction before this request can proceed.")).toBeVisible();
  await page.getByRole("link", { name: "Back to my requests" }).click();
  await expect(page.getByText("Needs attention: InactiveReference")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return for changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check buying rules" })).toHaveCount(0);
});

test("Procurement explains when the saved approval route no longer matches request items", async ({ page }) => {
  await mockErp(page, { policyReviewer: true, changedRouteLines: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Office supplies");
  await page.getByLabel("Item or service 1").fill("Paper");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByRole("link", { name: "Back to my requests" }).click();
  await page.getByRole("button", { name: "View details" }).click();
  await expect(page.getByText("The request items changed after the buying-rule check. Run it again.")).toBeVisible();
  await expect(page.getByText("Approval route from buying rules")).toHaveCount(0);
});

test("Procurement returns a blocked request with a note and requester resubmits corrected details", async ({ page }) => {
  await mockErp(page, { policyReviewer: true, blockedPolicy: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Correct buying category");
  await page.getByLabel("Item or service 1").fill("Laptop");
  await page.getByLabel("Category").fill("UNKNOWN");
  await page.getByLabel("Needed by").first().fill("2026-11-30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByRole("link", { name: "Back to my requests" }).click();
  await page.getByRole("button", { name: "View details" }).click();
  await expect(page.getByText("Approval route from buying rules")).toBeVisible();
  await expect(page.getByText("NEED · LineManager · Jane Manager")).toBeVisible();
  await expect(page.getByText("No approval task has opened.", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "UNKNOWN" })).toBeVisible();
  await expect(page.getByText("The buying rules still need a successful check.")).toBeVisible();
  await expect(page.getByText("Finance has not confirmed the full amount in this currency.")).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Return for changes" }).click();
  await expect(page.getByRole("button", { name: "Send back to requester" })).toBeDisabled();
  await page.getByLabel("What should the requester fix?").fill("Choose an active category.");
  await page.getByRole("button", { name: "Send back to requester" }).click();
  await expect(page.getByText("was returned to the requester with your note", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Correct buying category" }).click();
  await expect(page.getByText("Choose an active category.")).toBeVisible();
  await page.getByRole("link", { name: "Edit request" }).click();
  await page.getByLabel("Category").fill("OFFICE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Choose an active category.")).toHaveCount(0);
  await expect(page.getByText("This request has not been approved", { exact: false })).toBeVisible();
});

test("request list denial shows no local demo records", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/requests");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("Office equipment for new team")).toHaveCount(0);
});

test("pending live workflows keep the ERP menu without sample transactions", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText("This workflow is being connected to your ERP.", { exact: false })).toBeVisible();
  await expect(page.getByText("Office equipment for new team")).toHaveCount(0);
  await page.getByRole("link", { name: "My requests" }).last().click();
  await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
});

test("stale request edit keeps entered lines", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Office chairs for Lusaka");
  await page.getByLabel("Item or service 1").fill("Office chair");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit request" }).click();
  await page.getByLabel("Item or service 1").fill("Unsaved chair change");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  await expect(page.getByLabel("Item or service 1")).toHaveValue("Unsaved chair change");
});


test("unavailable requests edit cannot create a replacement record", async ({ page }) => {
  await mockErp(page);
  let writes = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/procurement/v1/requests")
      && ["POST", "PUT"].includes(request.method())) writes++;
  });
  await page.goto(`/procurement/workspace/requests/${requestId}/edit`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});


test("unconfirmed requests create preserves entries and blocks repeat submission", async ({ page }) => {
  await mockErp(page);
  let attempts = 0;
  await page.route("**/api/procurement/v1/requests", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++; await route.abort("connectionreset");
  });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?", { exact: true }).fill("Unconfirmed request");
  await page.getByLabel("Item or service 1", { exact: true }).fill("Chair");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("save result was not confirmed");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveValue("Unconfirmed request");
  await page.getByRole("link", { name: /^Review saved / }).click();
  await expect(page).toHaveURL(/\/requests$/);
  expect(attempts).toBe(1);
});


test("wide request originals stay exact through capture, reload and header-only edit", async ({ page }) => {
  await mockErp(page);
  const mutations: Array<{ method: string; body: Record<string, unknown> }> = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (["POST", "PUT"].includes(request.method()) && ["/api/procurement/v1/requests", `/api/procurement/v1/requests/${requestId}`].includes(path))
      mutations.push({ method: request.method(), body: request.postDataJSON() });
  });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Exact wide original");
  await page.getByLabel("Item or service 1").fill("Exact original line");
  await page.getByLabel("Estimated unit price").fill("12345678901234.5678");
  await page.getByLabel("Funding source").fill("Retained hidden source");
  await expect(page.getByText("Estimated amount before discounts, tax and delivery: ZMW 12,345,678,901,234.5678")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Exact wide original" })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Edit request" }).click();
  await expect(page.getByLabel("Estimated unit price")).toHaveValue("12345678901234.5678");
  await expect(page.getByLabel("Funding source")).toHaveValue("Retained hidden source");
  await page.getByLabel("What do you need?").fill("Corrected exact header");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Corrected exact header" })).toBeVisible();
  expect(mutations.map(row => row.method)).toEqual(["POST", "PUT"]);
  for (const mutation of mutations) {
    expect(mutation.body.fundingSourceRef).toBe("Retained hidden source");
    expect((mutation.body.lines as Record<string, unknown>[])[0]).toMatchObject({ requestedQuantity: "1", estimatedUnitPrice: "12345678901234.5678" });
  }
});

test("two exact eight-place products remain visible and are not rounded before save", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Tiny exact originals");
  await page.getByLabel("Item or service 1").fill("Tiny1");
  await page.getByLabel("Quantity", { exact: true }).fill("0.0001");
  await page.getByLabel("Estimated unit price").fill("0.0001");
  await page.getByRole("button", { name: "Add line", exact: true }).click();
  await page.getByLabel("Item or service 2").fill("Tiny2");
  await page.getByLabel("Quantity", { exact: true }).nth(1).fill("0.0001");
  await page.getByLabel("Estimated unit price").nth(1).fill("0.0001");
  await expect(page.getByText("Estimated amount before discounts, tax and delivery: ZMW 0.00000002")).toBeVisible();
  const saving = page.waitForRequest(request => new URL(request.url()).pathname === "/api/procurement/v1/requests" && request.method() === "POST");
  await page.getByRole("button", { name: "Save draft" }).click();
  expect((await saving).postDataJSON().lines).toEqual(expect.arrayContaining([expect.objectContaining({ requestedQuantity: "0.0001", estimatedUnitPrice: "0.0001" })]));
  await expect(page.getByRole("heading", { name: "Tiny exact originals" })).toBeVisible();
});

test("a readable older request cannot be edited without the complete exact contract", async ({ page }) => {
  await mockErp(page, { oldEditContract: true });
  let puts = 0;
  page.on("request", request => { if (request.method() === "PUT") puts += 1; });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?").fill("Older readable draft");
  await page.getByLabel("Item or service 1").fill("Old contract line");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Older readable draft" })).toBeVisible();
  await page.getByRole("link", { name: "Edit request" }).click();
  await expect(page.getByRole("alert")).toContainText("Exact request editing is unavailable");
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  expect(puts).toBe(0);
});

test("catalog selection needs its exact saved price and invalid precision sends no request", async ({ page }) => {
  await mockErp(page, { missingCatalogExact: true });
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/procurement/v1/requests") posts += 1; });
  await page.goto("/procurement/workspace/requests/new");
  await expect(page.getByText("Office Supply · Confirm price")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use item" })).toBeDisabled();
  await page.getByLabel("What do you need?").fill("Invalid precision");
  await page.getByLabel("Item or service 1").fill("Custom original");
  await page.getByLabel("Estimated unit price").fill("1.00001");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("up to four decimal places");
  expect(posts).toBe(0);
});
