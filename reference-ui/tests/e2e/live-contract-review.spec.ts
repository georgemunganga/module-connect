import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const contract = "33333333-3333-4333-8333-333333333333";
const supplier = "44444444-4444-4444-8444-444444444444";
const owner = "55555555-5555-4555-8555-555555555555";
const reviewer = "66666666-6666-4666-8666-666666666666";
const submission = "77777777-7777-4777-8777-777777777777";
const assignment = "88888888-8888-4888-8888-888888888888";
const caseId = "99999999-9999-4999-8999-999999999999";
const versionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const capabilityKeys = ["vendorDraft","itemDraft","requestDraft","approvals","sourcing","contracts",
  "orders","receiving","invoiceIntake","invoiceValidation","financeHandoff","supplierPortal",
  "planningDraft","configurationDraft","contractDraft","sourcingDraft"];

async function mockReview(page: Page, options: { enabled: boolean; actor: "owner" | "reviewer";
  loseSubmit?: boolean; loseDecision?: boolean; pending?: boolean; delayedRateRefresh?: boolean }) {
  let state = options.pending ? "PendingReview" : "Draft";
  let contractVersion = options.pending ? 2 : 1;
  let submitWrites = 0;
  let decideWrites = 0;
  let submitAck: Record<string, unknown> | null = null;
  let decisionAck: Record<string, unknown> | null = null;
  let rateSaved = false;
  let rateRefreshReleased = false;
  let releaseRateRefresh: (() => void) | undefined;
  const rateRefresh = new Promise<void>(resolve => { releaseRateRefresh = resolve; });
  const actorId = options.actor === "owner" ? owner : reviewer;
  const permissions = options.actor === "owner"
    ? ["procurement-access","procurement-contract-read","procurement-contract-submit",
      ...(options.delayedRateRefresh ? ["procurement-contract-edit"] : [])]
    : ["procurement-access","procurement-contract-review-read","procurement-contract-review"];
  const record = () => ({ id: contract, number: "CON-001", supplierId: supplier,
    title: "Service agreement", contractType: "Service", currencyCode: "ZMW",
    ceilingAmount: 2500, ceilingAmountExact: "2500.0000", status: state, version: contractVersion,
    effectiveFrom: null, expiresOn: null, renewalNoticeOn: null,
    draftVersion: { id: versionId, revisionNumber: 1, status: state, version: contractVersion } });
  await page.addInitScript(({ company, branch }) => localStorage.setItem("erp.shell.state.v1",
    JSON.stringify({ entityId: company, branch })), { company, branch });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { isActive: true, displayName: "ERP user", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ code: "Unavailable" }, 404);
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Head office", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [branch], confined: true });
    if (path === "/api/procurement/v1/context") return json({ principalId: actorId, tenantId: "amizo",
      legalEntityId: company, workerId: null, branch: { id: branch }, permissions,
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company,
      schemaReady: true, capabilities: { ...Object.fromEntries(capabilityKeys.map((key) =>
        [key, key === "contractDraft"])), contractDraftRates: options.delayedRateRefresh === true,
        contractInternalReview: options.enabled } });
    if (path === `/api/procurement/v1/contracts/${contract}`) {
      if (rateSaved && options.delayedRateRefresh && !rateRefreshReleased) await rateRefresh;
      return json(record());
    }
    if (path === `/api/procurement/v1/contracts/${contract}/rates` && request.method() === "POST") {
      rateSaved = true; contractVersion = 2;
      return json({ contractId: contract, contractVersion, rate: { id: assignment, version: 1,
        lineNumber: 1, description: "Monthly support", unitCode: "month",
        unitPriceExact: "5.1234", maximumQuantityExact: null, catalogItemId: null,
        status: "Active", statusReason: null } }, 201);
    }
    if (path === `/api/procurement/v1/contracts/${contract}/rates` && request.method() === "GET")
      return json({ contractId: contract, contractVersion, draftVersionId: versionId,
        items: rateSaved ? [{ id: assignment, lineNumber: 1, description: "Monthly support",
          unitCode: "month", unitPriceExact: "5.1234", maximumQuantityExact: "2.0000",
          catalogItemId: null, status: "Active", statusReason: null, version: 1 }] : [] });
    if (path === "/api/procurement/v1/contracts/internal-review/assigned") return json({
      items: options.actor === "reviewer" && state === "PendingReview" ? [{ Id: submission,
        ContractId: contract, CoreCaseId: caseId, ReviewBranchId: branch,
        AssignmentId: assignment, SubmittedAt: "2026-10-24T10:00:00Z", SubmissionNumber: 1,
        Number: "CON-001", Title: "Service agreement", CurrencyCode: "ZMW", Version: contractVersion }] : [],
      total: options.actor === "reviewer" && state === "PendingReview" ? 1 : 0, page: 1, pageSize: 25 });
    if (path === `/api/procurement/v1/contracts/${contract}/internal-review/assignments/${assignment}`
      && request.method() === "GET") return state !== "PendingReview" ? json({ code: "NotFound" }, 404) : json({ Id: submission, ContractId: contract,
      CoreCaseId: caseId, ReviewBranchId: branch, SubmissionNumber: 1,
      SubmittedAt: "2026-10-24T10:00:00Z", TermsSha256: "a".repeat(64),
      terms: { schemaVersion: 1, contractId: contract, contractVersionId: versionId,
        contractVersion: 1, versionVersion: 1, Number: "CON-001", SupplierId: supplier,
        Title: "Service agreement", ContractType: "Service", CurrencyCode: "ZMW",
        ceilingAmountExact: "2500.0000", EffectiveFrom: null, ExpiresOn: null,
        RenewalNoticeOn: null, rates: [{ Id: submission, LineNumber: 1, Version: 1,
          Status: "Active", StatusReason: null, CatalogItemId: null,
          Description: "Monthly support", UnitCode: "month", unitPriceExact: "0.0001",
          maximumQuantityExact: null }] }, Number: "CON-001", Title: "Service agreement",
      SupplierId: supplier, CurrencyCode: "ZMW", contractVersion: contractVersion,
      caseVersion: 2, assignmentVersion: 1, assignmentId: assignment });
    if (path === `/api/procurement/v1/contracts/${contract}/internal-review/submit`
      && request.method() === "POST") {
      submitWrites++;
      expect(request.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(request.postDataJSON()).toEqual({ expectedContractVersion: rateSaved ? 2 : 1, reviewBranchId: branch });
      state = "PendingReview"; contractVersion = rateSaved ? 3 : 2;
      submitAck = { schemaVersion: 1, ContractId: contract, SubmissionId: submission,
        ReviewBranchId: branch, VoteId: null, CorrectionId: null, Operation: "Submit",
        CommandKey: request.headers()["idempotency-key"], ActorPrincipalId: owner,
        contractVersion, contractStatus: state };
      if (options.loseSubmit) return route.abort("failed");
      return json(submitAck,201);
    }
    if (path.startsWith("/api/procurement/v1/contracts/internal-review/commands/"))
      return decisionAck ? json(decisionAck) : submitAck ? json(submitAck) : json({ code: "NotFound" },404);
    if (path === `/api/procurement/v1/contracts/${contract}/internal-review/assignments/${assignment}/decide`
      && request.method() === "POST") {
      decideWrites++;
      const input = request.postDataJSON();
      expect(input).toMatchObject({ expectedContractVersion: 2, expectedCaseVersion: 2,
        expectedAssignmentVersion: 1, action: "Return", reason: "Correct the rate terms" });
      state = "Returned"; contractVersion = 3;
      decisionAck = { schemaVersion: 1, ContractId: contract, SubmissionId: submission,
        ReviewBranchId: branch, VoteId: versionId, CorrectionId: null, Operation: "Decide",
        CommandKey: request.headers()["idempotency-key"], ActorPrincipalId: reviewer,
        contractVersion, contractStatus: state };
      if (options.loseDecision) return route.abort("failed");
      return json(decisionAck);
    }
    return json({ message: `Unexpected route: ${path}` },404);
  });
  return { submitWrites: () => submitWrites, decideWrites: () => decideWrites,
    releaseRateRefresh: () => { rateRefreshReleased = true; releaseRateRefresh?.(); } };
}

test("rate reconciliation gates parent submission until the saved parent version is rendered", async ({ page }) => {
  const state = await mockReview(page,{ enabled: true, actor: "owner", delayedRateRefresh: true });
  await page.goto(`/procurement/workspace/contracts/${contract}`);
  await page.getByRole("button",{ name: "Add rate" }).click();
  await page.getByLabel("Description").fill("Monthly support");
  await page.getByLabel("Unit",{ exact: true }).fill("month");
  await page.getByLabel("Unit price").fill("5.1234");
  const savedRate = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/contracts/${contract}/rates`)
    && response.request().method() === "POST");
  await page.getByRole("button",{ name: "Save rate" }).click();
  expect((await savedRate).status()).toBe(201);
  await expect(page.getByRole("button",{ name: "Submit for internal review" })).toBeDisabled();
  expect(state.submitWrites()).toBe(0);
  state.releaseRateRefresh();
  await expect(page.getByRole("cell",{ name: "Monthly support" })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Submit for internal review" })).toBeEnabled();
  await page.getByRole("button",{ name: "Submit for internal review" }).click();
  expect(state.submitWrites()).toBe(1);
});

test("internal review remains off without a distinct server capability", async ({ page }) => {
  const state = await mockReview(page,{ enabled: false, actor: "owner" });
  await page.goto(`/procurement/workspace/contracts/${contract}`);
  await expect(page.getByText("Internal contract review is not available for this ERP company yet.")).toBeVisible();
  await expect(page.getByRole("button",{ name: "Submit for internal review" })).toHaveCount(0);
  expect(state.submitWrites()).toBe(0);
});

test("lost Submit response recovers the original key without another POST", async ({ page }) => {
  const state = await mockReview(page,{ enabled: true, actor: "owner", loseSubmit: true });
  await page.goto(`/procurement/workspace/contracts/${contract}`);
  await page.getByRole("button",{ name: "Submit for internal review" }).click();
  await expect(page.getByRole("button",{ name: "Check saved review result" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{ name: "Check saved review result" })).toBeVisible();
  await page.getByRole("button",{ name: "Check saved review result" }).click();
  await expect(page.getByText("Internally approved.")).toHaveCount(0);
  await expect(page.getByText("Current state:")).toBeVisible();
  expect(state.submitWrites()).toBe(1);
});

test("named reviewer sees frozen terms and returns through the original review workflow", async ({ page }) => {
  const state = await mockReview(page,{ enabled: true, actor: "reviewer", pending: true });
  await page.goto("/procurement/workspace/contracts/internal-review");
  await expect(page.getByText("Service agreement")).toBeVisible();
  await page.getByRole("link",{ name: "Open review" }).click();
  await expect(page.getByText("Monthly support")).toBeVisible();
  await expect(page.getByText("0.0001")).toBeVisible();
  await page.getByLabel("Reason for Return or Reject").fill("Correct the rate terms");
  await page.getByRole("button",{ name: "Return for correction" }).click();
  await expect(page.getByRole("heading",{ name: "Assigned contract reviews" })).toBeVisible();
  expect(state.decideWrites()).toBe(1);
  await expect(page.getByText("No assigned reviews")).toBeVisible();
});

test("lost terminal decision retains its original key when active detail becomes 404", async ({ page }) => {
  const state = await mockReview(page,{ enabled: true, actor: "reviewer", pending: true, loseDecision: true });
  await page.goto(`/procurement/workspace/contracts/internal-review/${contract}/assignments/${assignment}`);
  await page.getByLabel("Reason for Return or Reject").fill("Correct the rate terms");
  await page.getByRole("button",{ name: "Return for correction" }).click();
  await expect(page.getByRole("button",{ name: "Check saved decision" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("This review is not available to you",{ exact: false })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Check saved decision" })).toBeVisible();
  await page.getByRole("button",{ name: "Check saved decision" }).click();
  await expect(page.getByRole("heading",{ name: "Assigned contract reviews" })).toBeVisible();
  expect(state.decideWrites()).toBe(1);
});
