import { expect, test, type Page, type Route } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111", branch = "12121212-1212-4212-8212-121212121212";
const worker = "22222222-2222-4222-8222-222222222222", invoice = "33333333-3333-4333-8333-333333333333";
const review = "44444444-4444-4444-8444-444444444444", mapping = "55555555-5555-4555-8555-555555555555";
const assignment = "66666666-6666-4666-8666-666666666666", caseId = "77777777-7777-4777-8777-777777777777";
const line = "88888888-8888-4888-8888-888888888888", doc = "99999999-9999-4999-8999-999999999999";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "receiving",
  "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
  "invoiceOriginalUnitReview"].map((name) => [name, name === "invoiceIntake" || name === "invoiceOriginalUnitReview"]));
const flags = { isInvoiceApproval: false, canPostToFinance: false };
const receipt = (operation: "Open" | "Decision", key: string) => ({ schemaVersion: 1, invoiceId: invoice, reviewId: review, coreCaseId: caseId,
  commandKey: key, operation, invoiceVersion: 2, caseVersion: 1, caseState: "Pending", reviewState: "Pending",
  decisionId: null, outcomeId: null, completedAt: "2026-10-22T00:00:00Z", recordedHistoricalResult: true, ...flags });
async function setup(page: Page, role: "maker" | "reviewer", onApi: (route: Route, path: string) => Promise<boolean>) {
  await page.addInitScript(({ entityId, location }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch: location })),
    { entityId: company, location: branch });
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/v1")) {
      apiCalls.push(`${request.method()} ${path}`);
      expect(request.headers()["x-shell-entity"]).toBe(company);
      expect(request.headers()["x-shell-location"]).toBe(branch);
    }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: role, roles: [] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: role === "maker" ? ["procurement-access", "procurement-invoice-read", "procurement-invoice-unit-review-request"]
        : ["procurement-access", "procurement-invoice-unit-review"], company: { id: company, currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true,
      capabilities: { ...capabilities, invoiceIntake: role === "maker" } });
    if (await onApi(route, path)) return;
    return json({ message: "Unavailable in this synthetic presentation test." }, 404);
  });
  return apiCalls;
}
test("maker opens one review, then reload recovers an interrupted result by GET only", async ({ page }) => {
  let savedKey = "", opens = 0, existing = false;
  const calls = await setup(page, "maker", async (route, path) => {
    const request = route.request(), json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === `/api/procurement/v1/invoices/${invoice}`) { await json({ id: invoice, supplierId: worker, invoiceNumber: "INV-1",
      invoiceDate: "2026-10-20", currencyCode: "ZMW", status: "Received", intakeChannel: "Manual", grossAmount: "10", netAmount: "10",
      taxAmount: "0", version: 2, lines: [{ id: line, lineNumber: 1, description: "Service", quantity: "1", unitPrice: "10", taxAmount: "0" }], nextStep: "Review" }); return true; }
    if (path === `/api/procurement/v1/invoices/${invoice}/unit-review-readiness`) { await json({ invoiceId: invoice, invoiceVersion: 2,
      mappingRevision: 1, existingReviewId: existing ? review : null, canRequestReview: !existing, blockers: existing ? ["OriginalUnitReviewAlreadyOpen"] : [],
      isUnitVerification: false, ...flags }); return true; }
    if (path === `/api/procurement/v1/invoices/${invoice}/unit-reviews` && request.method() === "POST") {
      opens++; existing = true; savedKey = request.headers()["idempotency-key"]; await route.abort("failed"); return true;
    }
    if (path === `/api/procurement/v1/invoice-unit-reviews/${review}/commands/${savedKey}`) { await json(receipt("Open", savedKey)); return true; }
    return false;
  });
  await page.goto(`/procurement/workspace/bills/${invoice}`);
  await page.getByRole("button", { name: "Request original unit review" }).click();
  await expect(page.getByRole("button", { name: "Check saved review action" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Check saved review action" })).toBeVisible();
  await page.getByRole("button", { name: "Check saved review action" }).click();
  await expect(page.getByText("Saved review action found.", { exact: false })).toBeVisible();
  expect(opens).toBe(1);
  expect(calls.filter((entry) => entry === `POST /api/procurement/v1/invoices/${invoice}/unit-reviews`)).toHaveLength(1);
  expect(calls).not.toContain(`POST /api/procurement/v1/invoice-unit-reviews/${review}/assignments/${assignment}/decisions`);
});
test("purpose reviewer sees pinned original and attests explicitly without broad invoice read", async ({ page }) => {
  let votes = 0;
  const calls = await setup(page, "reviewer", async (route, path) => {
    const request = route.request(), json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/procurement/v1/invoice-unit-reviews/tasks") { await json({ items: [{ reviewId: review, invoiceId: invoice,
      mappingVersionId: mapping, mappingRevision: 1, branchId: branch, openedAt: "2026-10-22T00:00:00Z", ...flags }],
      total: 1, page: 1, pageSize: 20, availabilityMeaning: "CurrentMappingAssignmentsOnly", canPostToFinance: false }); return true; }
    if (path === `/api/procurement/v1/invoice-unit-reviews/${review}`) { await json({ reviewId: review, invoiceId: invoice,
      invoiceVersion: 2, mappingVersionId: mapping, mappingRevision: 1, coreCaseId: caseId, caseVersion: votes ? 2 : 1,
      caseState: votes ? "Approved" : "Pending", reviewState: votes ? "Verified" : "Pending", currentMapping: true, originalDigestCurrent: true,
      original: { invoiceNumber: "INV-1", invoiceDate: "2026-10-20", currencyCode: "ZMW", netAmount: "10", taxAmount: "0", grossAmount: "10",
        lines: [{ id: line, lineNumber: 1, description: "Service", quantity: "1", unitPrice: "10", taxAmount: "0" }] }, blockers: [],
      assignments: votes ? [] : [{ assignmentId: assignment, assignmentVersion: 1 }], originalDocumentLines: [{ invoiceLineId: line,
        documentVersionId: doc, documentSha256: "a".repeat(64), documentLineReference: "Page 1 line 1", unitCode: "EACH" }],
      attestation: "OriginalDocumentUnitsConfirmed", actionCandidates: votes ? [] : ["Approve", "Return", "Reject"],
      actionCandidateMeaning: "CurrentAssignmentOnlyRevalidatedByCommand", ...flags }); return true; }
    if (path === `/api/procurement/v1/invoice-unit-reviews/${review}/documents`) { await json({ reviewId: review, invoiceId: invoice,
      items: [{ documentId: mapping, versionId: doc, versionNumber: 1, fileName: "Original.pdf", mediaType: "application/pdf",
        sizeBytes: 100, sha256: "a".repeat(64), scanState: "Available", canDownload: true }],
      availabilityMeaning: "PinnedOriginalDocumentVersionsOnly", isUnitVerification: false, canPostToFinance: false }); return true; }
    if (path === `/api/procurement/v1/invoice-unit-reviews/${review}/documents/${doc}/download`) {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.7 synthetic" }); return true;
    }
    if (path === `/api/procurement/v1/invoice-unit-reviews/${review}/assignments/${assignment}/decisions`) {
      const body = request.postDataJSON(); expect(body.attestation).toBe("OriginalDocumentUnitsConfirmed");
      expect(body.action).toBe("Approve"); votes++; await json({ ...receipt("Decision", request.headers()["idempotency-key"]), caseVersion: 2,
        caseState: "Approved", reviewState: "Verified", decisionId: mapping, outcomeId: doc }); return true;
    }
    return false;
  });
  await page.goto("/procurement/workspace/approvals");
  await page.getByRole("link", { name: "Check original" }).click();
  await expect(page.getByText("INV-1 · 2026-10-20")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download original" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm original units" }).click();
  await expect(page.getByRole("button", { name: "Confirm decision" })).toBeDisabled();
  await page.getByRole("switch", { name: /I checked the original invoice document/ }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByText(/Decision recorded: Verified/)).toBeVisible();
  expect(votes).toBe(1);
  expect(calls.some((entry) => entry === `GET /api/procurement/v1/invoices/${invoice}`)).toBe(false);
});
