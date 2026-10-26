import { expect, test, type Page } from "@playwright/test";

// Transport mocks only: not a live Core/Finance/PG authorization proof.
test.setTimeout(90_000);
const company = "11111111-1111-4111-8111-111111111111", worker = "22222222-2222-4222-8222-222222222222";
const branch = "33333333-3333-4333-8333-333333333333", otherBranch = "44444444-4444-4444-8444-444444444444";
const event = "55555555-5555-4555-8555-555555555555", lineA = "66666666-6666-4666-8666-666666666666", lineB = "77777777-7777-4777-8777-777777777777";
const prA = "88888888-8888-4888-8888-888888888888", prB = "99999999-9999-4999-8999-999999999999";
type Selection = { purchaseRequestId: string; purchaseRequestLineId: string; quantity: string };
async function mock(page: Page, options: { absent?: boolean; deny?: boolean; loseCreate?: boolean; seed?: boolean; rejectCancelOnce?: boolean; loseCancel?: boolean; cancelRecovery404Once?: boolean; principal?: boolean; principalUnavailable?: boolean; publication?: boolean; publicationReadOnly?: boolean; reviewer?: boolean; losePublication?: boolean; stalePolicy?: boolean } = {}) {
  const calls: { method: string; path: string; body: unknown; key?: string }[] = []; const receipts = new Map<string, unknown>();
  let lost = false, cancelRejected = false, cancelLost = false, cancelRecoveryMissed = false, publicationLost = false,
    status = options.reviewer ? "PublicationReview" : "Draft", version = options.reviewer ? 2 : 1,
    selected: Selection[] = [], exists = Boolean(options.seed);
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
      approvedUnitEstimate: "0.0001", estimatedValue: "0.0001", allocationState: status === "Cancelled" ? "Released" : "Reserved" })) });
  await page.addInitScript(({ company, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })), { company, branch });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", isActive: true, displayName: "Buyer", email: "buyer@example.test", roles: ["procurement_officer"] } });
    if (url.pathname === "/api/core/v1/workspace-context") return json({ schemaVersion: 1,
      tenantId: "amizo", principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organisationWide: true,
      companies: [{ id: company, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branch, code: "HQ", name: "Lusaka", legalEntityId: company },
        { id: otherBranch, code: "OTHER", name: "Other branch", legalEntityId: company }] });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (url.pathname === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: company, workerId: options.principal ? null : worker,
      permissions: ["procurement-access", ...(options.deny ? [] : ["procurement-sourcing-convert", "procurement-sourcing-cancel",
        ...(options.publication && !options.reviewer ? ["procurement-sourcing-submit"] : []),
        ...(options.reviewer ? ["procurement-sourcing-publish"] : [])])],
      company: { id: company, name: "Amizo Power", code: "AMIZO", currencyCode: "ZMW" } });
    if (url.pathname === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: { vendorDraft: true, itemDraft: true, requestDraft: true, approvals: false, sourcing: false, contracts: false, orders: false,
        receiving: false, invoiceIntake: false, invoiceValidation: false, financeHandoff: false, supplierPortal: false, planningDraft: true,
        configurationDraft: true, contractDraft: true, sourcingDraft: !options.principal,
        ...(options.principal ? { principalSourcingSourceDrafts: !options.principalUnavailable,
          ...(options.publication ? { principalSourcingPublication: !options.publicationReadOnly,
            principalSourcingPublicationRead: true } : {}), sourcingSourceDrafts: false }
          : options.absent ? {} : { sourcingSourceDrafts: true }) } });
    if (url.pathname.startsWith("/api/procurement/v1/sourcing")) {
      calls.push({ method, path: url.pathname, body: method === "POST" ? request.postDataJSON() : null, key: request.headers()["idempotency-key"] });
      if (options.publication) {
        const opening = prA, caseId = prB, supplierId = lineB;
        const publication = { openingId: opening, coreCaseId: caseId, caseState: status === "Published" ? "Approved" : "Pending",
          coreCaseVersion: status === "Published" ? 2 : 1, policyVersionId: prA, policyVersionNumber: 1,
          supplierDeliveryState: "PerInvitation", reviewer: Boolean(options.reviewer),
          assignments: options.reviewer && status === "PublicationReview"
            ? [{ id: lineA, version: 1, state: "Pending", permissionKey: "procurement-sourcing-publish" }] : [] };
        if (url.pathname.endsWith("/principal-publications")) return json({ items: options.reviewer ? [] : [{ id: event,
          number: "RF-1", title: "Office supplies", currencyCode: "ZMW", status, version,
          originalDraftFingerprint: "a".repeat(64), state: "VerifiedRetainedSourcing" }],
        total: options.reviewer ? 0 : 1, page: 1, pageSize: 25, scope: "OwnCurrentCompany" });
        if (url.pathname.endsWith("/principal-publication-reviews/assigned")) return json({ items: options.reviewer && status === "PublicationReview" ? [{
          eventId: event, caseId, number: "RF-1", title: "Office supplies", currencyCode: "ZMW", status,
          eventVersion: version, caseVersion: 1, assignments: [{ id: lineA, version: 1, state: "Pending" }],
          state: "VerifiedAssignedReview" }] : [], total: options.reviewer && status === "PublicationReview" ? 1 : 0,
        page: 1, pageSize: 25, scope: "CurrentCoreAssignment" });
        if (url.pathname.endsWith("/principal-publication-suppliers")) return json({ eventId: event,
          eligibilityMeaning: "CurrentApprovedPreviewOnly", items: [{ supplierId, displayName: "Paper Supply", number: "SUP-1" }],
          total: 1, page: 1, pageSize: 25 });
        if (url.pathname.endsWith("/principal-publication") && method === "GET") return json({ ...record(),
          status, version, supplierDeliveryState: status === "Draft" ? "NotStarted" : "PerInvitation",
          publication: status === "Draft" ? undefined : publication,
          invitations: status === "Published" ? [{ id: lineA, supplierId, status: "ReadyForManualDelivery", version: 1,
            contactRecorded: false }] : [] });
        if (url.pathname.endsWith("/principal-publication-reviews") && method === "POST") {
          status = "PublicationReview"; version++;
          const saved = { eventId: event, status, version, publicationReviewId: opening, coreCaseId: caseId, coreCaseVersion: 1,
            supplierDeliveryState: "NotStarted", financeReservationChanged: false, commandKey: request.headers()["idempotency-key"] };
          receipts.set(`Publication/${saved.commandKey}`, saved);
          if (options.losePublication && !publicationLost) { publicationLost = true; return route.abort("failed"); }
          return json(saved, 201);
        }
        if (url.pathname.includes("/principal-publication-reviews/") && url.pathname.endsWith("/decisions") && method === "POST") {
          if (options.stalePolicy) return json({ code: "SourcingPolicyChanged" }, 409);
          const action = (request.postDataJSON() as { action: string }).action;
          status = action === "Approve" ? "Published" : "Draft"; version++;
          return json({ eventId: event, status, version, publicationReviewId: opening, coreCaseId: caseId,
            coreCaseVersion: 2, coreDecisionId: lineB, caseState: action === "Approve" ? "Approved" : action === "Return" ? "Returned" : "Rejected",
            supplierDeliveryState: action === "Approve" ? "ReadyForManualDelivery" : "NotStarted",
            financeReservationChanged: false, commandKey: request.headers()["idempotency-key"] });
        }
        if (url.pathname.includes("/principal-publication-commands/") && method === "GET") {
          const saved = receipts.get(`Publication/${url.pathname.split("/").at(-1)}`);
          return saved ? json(saved) : json({}, 404);
        }
      }
      if (options.principal && !url.pathname.includes("principal-") && url.pathname !== "/api/procurement/v1/sourcing")
        return json({ message: "Earlier worker workflow is unavailable" }, 404);
      if (request.headers()["x-shell-location"] === otherBranch) return json({ message: "Unavailable in this branch" }, 404);
      if (url.pathname.endsWith(options.principal ? "/approved-principal-sources" : "/approved-sources")) return json({ items: sources, candidateTotal: 2, page: 1, pageSize: 25, eligibilityMeaning: "CurrentPreviewOnly", canPublish: false });
      if (url.pathname.endsWith(options.principal ? "/principal-source-drafts" : "/source-drafts")) return json({ items: exists ? [{ ...record(), state: "VerifiedRetainedDraft" }] : [], total: exists ? 1 : 0, page: 1, pageSize: 25, canPublish: false });
      if (url.pathname.endsWith(options.principal ? "/from-approved-principal-sources" : "/from-approved-sources")) {
        const body = request.postDataJSON() as { sources: Selection[] }; selected = body.sources; exists = true;
        const saved = { eventId: event, number: "RF-1", status, version, originalDraftFingerprint: "a".repeat(64), commandKey: request.headers()["idempotency-key"],
          recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false };
        receipts.set(`Create/${saved.commandKey}`, saved);
        if (options.loseCreate && !lost) { lost = true; return route.abort("failed"); } return json(saved, 201);
      }
      if (url.pathname.includes(options.principal ? "/principal-command-receipts/" : "/command-receipts/")) { const operationKey = url.pathname.split(options.principal ? "/principal-command-receipts/" : "/command-receipts/")[1]; const saved = receipts.get(operationKey);
        const operation = operationKey.split("/")[0];
        if (operation === "Cancel" && options.cancelRecovery404Once && !cancelRecoveryMissed) { cancelRecoveryMissed = true; return json({}, 404); }
        return saved ? json({ operation, commandKey: operationKey.split("/")[1], originalStatusCode: operation === "Create" ? 201 : 200,
          responseJson: JSON.stringify(saved), recordedHistoricalResult: true, canPublish: false }) : json({}, 404); }
      if (url.pathname.endsWith(options.principal ? "/principal-source-cancel" : "/source-cancel")) {
        if (options.rejectCancelOnce && !cancelRejected) { cancelRejected = true; return json({ message: "Check the cancellation details" }, 422); }
        status = "Cancelled"; version++;
        const saved = { eventId: event, number: "RF-1", status, version, originalDraftFingerprint: "a".repeat(64), commandKey: request.headers()["idempotency-key"],
          recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false };
        receipts.set(`Cancel/${saved.commandKey}`, saved);
        if (options.loseCancel && !cancelLost) { cancelLost = true; return route.abort("failed"); }
        return json(saved); }
      if (url.pathname.endsWith(options.principal ? "/principal-source-draft" : "/source-draft")) return exists ? json(record()) : json({}, 404);
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
  expect((creation.body as { sources: Selection[] }).sources.map(x => x.quantity)).toEqual(["12345678901234.5678", "2.0001"]); expect(creation.key).toMatch(/^[0-9a-f-]{36}$/i);
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("No longer required"); await page.getByRole("button", { name: "Cancel draft and release its quantities" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible(); expect(calls.filter(x => x.method === "POST")).toHaveLength(2);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
});
test("governed RFQ list keeps server search, company status and imported table controls", async ({ page }) => {
  await mock(page, { seed: true });
  await page.goto("/procurement/workspace/rfqs?source=approved");
  await expect(page.getByRole("button", { name: "Filter Quote Requests by field" })).toBeVisible();
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await page.getByLabel("Find quote request").fill("Office");
  await expect(page.getByText("Search and status work across pages you can access.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "RF-1 · Preview" });
  await expect(preview).toContainText("Office supplies");
  await preview.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("link", { name: /RF-1.*Office supplies/ }).click();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByRole("cell", { name: "Office notebooks" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("button", { name: "Cancel draft and release its quantities" })).toBeVisible();
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

test("workerless principal capability keeps the full quote wizard, directory and detail on six distinct endpoints", async ({ page }) => {
  const calls = await mock(page, { principal: true, loseCreate: true });
  await page.goto("/procurement/workspace/rfqs");
  await expect(page.getByRole("heading", { name: "Request for Quotes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "From approved requests", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Use approved requests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use approved purchase requests", exact: true })).toBeVisible();
  await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Items (2)" }).click();
  await expect(page.getByRole("cell", { name: "Office notebooks" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("No longer required");
  await page.getByRole("button", { name: "Cancel draft and release its quantities" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.goto("/procurement/workspace/rfqs?source=principal-approved");
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByText("Office supplies", { exact: true })).toBeVisible();
  const paths = calls.map(call => call.path);
  for (const suffix of ["/approved-principal-sources", "/principal-source-drafts", "/from-approved-principal-sources",
    `/${event}/principal-source-draft`, `/${event}/principal-source-cancel`, "/principal-command-receipts/Create/"])
    expect(paths.some(path => path.includes(suffix)), suffix).toBe(true);
  expect(calls.filter(call => call.method === "POST")).toHaveLength(2);
  expect(paths.some(path => /\/(?:from-approved-sources|approved-sources|source-drafts|source-draft|source-cancel|command-receipts)\b/.test(path))).toBe(false);
});

test("absent principal capability or missing current conversion permission blocks principal saves", async ({ page }) => {
  const calls = await mock(page, { principal: true, principalUnavailable: true });
  await page.goto("/procurement/workspace/rfqs/new?source=principal-approved");
  await expect(page.getByRole("main").getByRole("link", { name: "My requests", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create internal draft", exact: true })).toHaveCount(0);
  expect(calls.some(call => call.path.includes("principal-") || call.method === "POST")).toBe(false);
});

test("principal capability alone cannot grant conversion to an unassigned buyer", async ({ page }) => {
  const calls = await mock(page, { principal: true, deny: true });
  await page.goto("/procurement/workspace/rfqs/new?source=principal-approved");
  await expect(page.getByRole("alert")).toContainText("not available");
  expect(calls.some(call => call.path.includes("principal-") || call.method === "POST")).toBe(false);
});

test("principal command journal does not become a worker command after mode change", async ({ page }) => {
  const calls = await mock(page, { principal: true, loseCreate: true });
  await page.goto("/procurement/workspace/rfqs/new?source=principal-approved"); await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  const principalJournal = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("erp.rfq.recovery.v1:")));
  expect(principalJournal).toHaveLength(1);
  expect(JSON.parse(principalJournal[0].slice("erp.rfq.recovery.v1:".length))).toContain("principal");
  await page.goto("/procurement/workspace/rfqs/new?source=approved");
  await expect(page.getByRole("alert")).toContainText("not available");
  expect(calls.filter(call => call.method === "POST")).toHaveLength(1);
  await page.goto("/procurement/workspace/rfqs/new?source=principal-approved");
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  expect(calls.filter(call => call.method === "POST")).toHaveLength(1);
});

test("cancel validation permits correction while interrupted cancellation and recovery404 retain original GET-only key", async ({ page }) => {
  const calls = await mock(page, { seed: true, rejectCancelOnce: true, loseCancel: true, cancelRecovery404Once: true });
  await page.goto(`/procurement/workspace/rfqs/${event}?source=approved`);
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Please correct this reason");
  await page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check the quote details");
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Reason", exact: true })).toHaveValue("Please correct this reason");
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("No longer required");
  await page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  const mutations = calls.filter(x => x.method === "POST" && x.path.endsWith("/source-cancel"));
  expect(mutations).toHaveLength(2); expect(mutations[0].key).not.toBe(mutations[1].key);
  const originalKey = mutations[1].key!;
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("not available");
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true })).toHaveCount(0);
  expect(calls.filter(x => x.method === "POST")).toHaveLength(2);
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  const checks = calls.filter(x => x.path.includes("/command-receipts/"));
  expect(checks).toHaveLength(2); expect(checks.every(x => x.method === "GET" && x.path.endsWith(`/Cancel/${originalKey}`))).toBe(true);
  expect(calls.filter(x => x.method === "POST")).toHaveLength(2);
});

test("unconfirmed create survives same-session navigation and recovers its original key", async ({ page }) => {
  const calls = await mock(page, { loseCreate: true });
  await page.goto("/procurement/workspace/rfqs/new?source=approved"); await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  const key = calls.find(x => x.path.endsWith("/from-approved-sources"))!.key;
  const navigate = async (path: string) => page.evaluate(path => {
    history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await navigate("/procurement/workspace/rfqs?source=approved");
  await expect(page.getByRole("heading", { name: "Request for Quotes", exact: true })).toBeVisible();
  await navigate("/procurement/workspace/rfqs/new?source=approved");
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create internal draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  expect(calls.filter(x => x.method === "POST")).toHaveLength(1);
  expect(calls.find(x => x.path.includes("/command-receipts/"))!.path).toContain(`/Create/${key}`);
});


test("hard reload recovers lost partial creation by the original GET reference without a second POST", async ({ page }) => {
  const calls = await mock(page, { loseCreate: true });
  await page.goto("/procurement/workspace/rfqs/new?source=approved"); await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  const create = calls.find(x => x.path.endsWith("/from-approved-sources"))!;
  const stored = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("erp.rfq.recovery.v1:")).map(key => sessionStorage.getItem(key)!));
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0])).toEqual({ operation: "Create", key: create.key, eventId: null });
  expect(stored[0]).not.toContain("Office"); expect(stored[0]).not.toContain("quantity");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create internal draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  expect(calls.filter(x => x.method === "POST")).toHaveLength(1);
  const recovered = calls.filter(x => x.path.includes("/command-receipts/"));
  expect(recovered).toHaveLength(1); expect(recovered[0].method).toBe("GET");
  expect(recovered[0].path).toContain(`/Create/${create.key}`);
});

test("malformed recovery storage blocks a new create without discarding the original journal", async ({ page }) => {
  const calls = await mock(page);
  const slot = JSON.stringify(["amizo", company, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", branch, "Create"]);
  await page.addInitScript(({ slot }) => sessionStorage.setItem("erp.rfq.recovery.v1:" + slot, "{broken"), { slot });
  await page.goto("/procurement/workspace/rfqs/new?source=approved");
  await expect(page.getByRole("alert")).toContainText("No new save will be sent");
  await expect(page.getByRole("button", { name: "Create internal draft", exact: true })).toHaveCount(0);
  expect(calls.filter(x => x.method === "POST")).toHaveLength(0);
  expect(await page.evaluate(slot => sessionStorage.getItem("erp.rfq.recovery.v1:" + slot), slot)).toBe("{broken");
});

test("unavailable session journal cannot send a create", async ({ page }) => {
  const calls = await mock(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("erp.rfq.recovery.v1:")) throw new DOMException("Unavailable", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/procurement/workspace/rfqs/new?source=approved"); await selectTwo(page);
  await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No new save will be sent");
  expect(calls.filter(x => x.method === "POST")).toHaveLength(0);
});

test("principal maker uses original RFQ layout to send an internal review only", async ({ page }) => {
  const calls = await mock(page, { principal: true, publication: true, seed: true });
  await page.goto(`/procurement/workspace/rfqs/${event}?source=principal-approved`);
  await expect(page.getByRole("heading", { name: "Office supplies", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Items (1)" })).toBeVisible();
  await page.getByLabel("Find an approved supplier").fill("Paper");
  await page.getByRole("button", { name: "Search suppliers" }).click();
  await expect(page.getByText("Paper Supply")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send RFQ for review" }).click();
  await expect(page.getByText("Waiting for the assigned independent reviewer.")).toBeVisible();
  const opened = calls.find(call => call.path.endsWith("/principal-publication-reviews") && call.method === "POST");
  expect(opened?.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(opened?.body).toMatchObject({ expectedEventVersion: 1, supplierIds: [lineB] });
  expect(calls.some(call => /manual-contact|manual-quotes|dispatch|award/.test(call.path))).toBe(false);
});

test("lost publication response recovers original key after reload without a second POST", async ({ page }) => {
  const calls = await mock(page, { principal: true, publication: true, seed: true, losePublication: true });
  await page.goto(`/procurement/workspace/rfqs/${event}?source=principal-approved`);
  await page.getByLabel("Find an approved supplier").fill("Paper");
  await page.getByRole("button", { name: "Search suppliers" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send RFQ for review" }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  const opened = calls.find(call => call.path.endsWith("/principal-publication-reviews") && call.method === "POST")!;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send RFQ for review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved result" }).click();
  await expect(page.getByText("Waiting for the assigned independent reviewer.")).toBeVisible();
  expect(calls.filter(call => call.path.endsWith("/principal-publication-reviews") && call.method === "POST")).toHaveLength(1);
  expect(calls.find(call => call.path.includes("/principal-publication-commands/"))?.path).toContain(opened.key);
});

test("assigned Core reviewer approves internally from the same RFQ detail", async ({ page }) => {
  const calls = await mock(page, { principal: true, publication: true, reviewer: true, seed: true });
  await page.goto("/procurement/workspace/rfqs?source=principal-approved");
  await expect(page.getByText("Publication reviews assigned to me")).toBeVisible();
  await page.getByRole("link", { name: "Review RFQ" }).click();
  await expect(page.getByText("Independent publication review")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved for internal RFQ publication", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to suppliers" })).toBeDisabled();
  expect(calls.filter(call => call.path.endsWith("/decisions") && call.method === "POST")).toHaveLength(1);
  expect(calls.some(call => /manual-contact|manual-quotes|dispatch|award/.test(call.path))).toBe(false);
});

test("reviewer returns a case for changes without supplier delivery", async ({ page }) => {
  const calls = await mock(page, { principal: true, publication: true, reviewer: true, seed: true });
  await page.goto(`/procurement/workspace/rfqs/${event}?source=principal-approved`);
  await page.getByLabel("Reason for return or rejection").fill("Update the short list");
  await page.getByRole("button", { name: "Return", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send RFQ for review" })).toHaveCount(0);
  const decision = calls.find(call => call.path.endsWith("/decisions") && call.method === "POST")!;
  expect(decision.body).toMatchObject({ action: "Return", reason: "Update the short list" });
  expect(calls.some(call => /manual-contact|manual-quotes|dispatch|award/.test(call.path))).toBe(false);
});

test("server policy change blocks review approval and retains its original recovery key", async ({ page }) => {
  const calls = await mock(page, { principal: true, publication: true, reviewer: true, seed: true, stalePolicy: true });
  await page.goto(`/procurement/workspace/rfqs/${event}?source=principal-approved`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  expect(calls.filter(call => call.path.endsWith("/decisions") && call.method === "POST")).toHaveLength(1);
  expect(calls.some(call => /manual-contact|manual-quotes|dispatch|award/.test(call.path))).toBe(false);
});

test("historical GET recovery remains available after new review work is switched off", async ({ page }) => {
  const options = { principal: true, publication: true, seed: true, losePublication: true, publicationReadOnly: false };
  const calls = await mock(page, options);
  await page.goto(`/procurement/workspace/rfqs/${event}?source=principal-approved`);
  await page.getByLabel("Find an approved supplier").fill("Paper");
  await page.getByRole("button", { name: "Search suppliers" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send RFQ for review" }).click();
  await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  options.publicationReadOnly = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Check the saved result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send RFQ for review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved result" }).click();
  await expect(page.getByText("Waiting for the assigned independent reviewer.")).toBeVisible();
  expect(calls.filter(call => call.path.endsWith("/principal-publication-reviews") && call.method === "POST")).toHaveLength(1);
  expect(calls.filter(call => call.path.includes("/principal-publication-commands/") && call.method === "GET")).toHaveLength(1);
});
