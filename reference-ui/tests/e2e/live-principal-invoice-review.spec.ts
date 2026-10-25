import { expect, test, type Page, type Route } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222";
const principal = "33333333-3333-4333-8333-333333333333", invoice = "44444444-4444-4444-8444-444444444444";
const review = "55555555-5555-4555-8555-555555555555", mapping = "66666666-6666-4666-8666-666666666666";
const coreCase = "77777777-7777-4777-8777-777777777777", assignment = "88888888-8888-4888-8888-888888888888";
const line = "99999999-9999-4999-8999-999999999999", doc = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const baseFlags = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "receiving",
  "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft"]
  .map(name => [name, false]));
async function setup(page: Page, enabled: boolean, onApi: (route: Route, path: string) => Promise<boolean>) {
  await page.addInitScript(({ entity, site }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: entity, branch: site })),
    { entity: company, site: branch });
  const calls: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/v1")) {
      calls.push(`${request.method()} ${path}`);
      expect(request.headers()["x-shell-entity"]).toBe(company);
      expect(request.headers()["x-shell-location"]).toBe(branch);
    }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Reviewer", roles: [] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo" });
    if (path === "/api/core/v1/workspace-context") return json({ code: "Unavailable" }, 404);
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Head office", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [branch], confined: true });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "tenant-a", legalEntityId: company,
      principalId: principal, workerId: null, branch: { id: branch }, company: { id: company, currencyCode: "ZMW" },
      permissions: ["procurement-access", "procurement-invoice-unit-review"] });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "tenant-a", legalEntityId: company,
      schemaReady: true, capabilities: { ...baseFlags, principalInvoiceMatching: enabled } });
    if (await onApi(route, path)) return;
    return json({ code: "Unavailable" }, 404);
  });
  return calls;
}
test("separate capability off does not request typed review or borrow legacy invoice permissions", async ({ page }) => {
  const calls = await setup(page, false, async () => false);
  await page.goto("/procurement/workspace/approvals");
  await expect(page.getByRole("button", { name: "Issued order bill units" })).toHaveCount(0);
  expect(calls.some(path => path.includes("principal-unit-reviews"))).toBe(false);
});
test("assigned Core reviewer sees pinned original and cannot decide until explicit attestation", async ({ page }) => {
  let decisions = 0;
  const calls = await setup(page, true, async (route, path) => {
    const request = route.request(), json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/procurement/v1/principal-unit-reviews/tasks") { await json({ items: [{ reviewId: review, invoiceId: invoice,
      mappingVersionId: mapping, branchId: branch, openedAt: "2026-10-23T10:00:00Z", sourceSchemaVersion: 2, canPostToFinance: false }],
      total: 1, page: 1, pageSize: 20, availabilityMeaning: "CurrentActiveAssignmentsOnly", canPostToFinance: false }); return true; }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}`) { await json({ reviewId: review, invoiceId: invoice,
      invoiceVersion: 2, mappingVersionId: mapping, sourceSchemaVersion: 2, coreCaseId: coreCase, caseVersion: 1,
      caseState: "Pending", reviewState: "Pending", originalDigestCurrent: true, currentMapping: true,
      original: { invoiceNumber: "BILL-1", invoiceDate: "2026-10-23", currencyCode: "ZMW", netAmount: "1.0001",
        taxAmount: "0", grossAmount: "1.0001", lines: [{ id: line, lineNumber: 1, description: "Service",
          quantity: "1.0001", unitPrice: "1", taxAmount: "0" }] }, blockers: [],
      originalDocumentLines: [{ invoiceLineId: line, documentVersionId: doc, documentSha256: "a".repeat(64),
        documentLineReference: "Page 1, line 1", unitCode: "EACH" }],
      assignments: [{ assignmentId: assignment, assignmentVersion: 1 }],
      actionCandidates: ["Approve", "Return", "Reject"], attestation: "OriginalDocumentUnitsConfirmed", canPostToFinance: false }); return true; }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}/documents`) { await json({ reviewId: review, invoiceId: invoice,
      items: [{ documentId: mapping, versionId: doc, versionNumber: 1, fileName: "Original.pdf", mediaType: "application/pdf",
        sizeBytes: 100, sha256: "a".repeat(64), scanState: "Available", canDownload: true }],
      availabilityMeaning: "PinnedOriginalDocumentVersionsOnly", canPostToFinance: false }); return true; }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}/documents/${doc}/download`) {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.7 synthetic" }); return true; }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}/assignments/${assignment}/decisions`) {
      const body = request.postDataJSON(); expect(body.attestation).toBe("OriginalDocumentUnitsConfirmed");
      expect(body.action).toBe("Approve"); decisions++;
      await json({ reviewId: review, invoiceId: invoice, invoiceVersion: 2, coreCaseId: coreCase,
        commandKey: request.headers()["idempotency-key"], decisionId: mapping, outcomeId: doc,
        caseVersion: 2, caseState: "Approved", reviewState: "Verified", sourceSchemaVersion: 2,
        isUnitVerified: true, canPostToFinance: false }); return true; }
    return false;
  });
  await page.goto("/procurement/workspace/approvals");
  await page.getByRole("link", { name: "Check original" }).click();
  await expect(page.getByText("BILL-1 · 2026-10-23")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open original" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm original units" }).click();
  await expect(page.getByRole("button", { name: "Confirm decision" })).toBeDisabled();
  await page.getByRole("switch", { name: /I checked the original invoice document/ }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByText(/Original unit decision recorded: Verified/)).toBeVisible();
  expect(decisions).toBe(1);
  expect(calls.some(path => path === `GET /api/procurement/v1/invoices/${invoice}`)).toBe(false);
});

test("a terminal decision remains recoverable by its original key after assigned detail becomes 404", async ({ page }) => {
  let submittedKey = "", decisions = 0, recoveries = 0;
  await setup(page, true, async (route, path) => {
    const request = route.request(), json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/procurement/v1/principal-unit-reviews/tasks") {
      await json({ items: [{ reviewId: review, invoiceId: invoice, mappingVersionId: mapping,
        branchId: branch, openedAt: "2026-10-23T10:00:00Z", sourceSchemaVersion: 2, canPostToFinance: false }],
      total: 1, page: 1, pageSize: 20, availabilityMeaning: "CurrentActiveAssignmentsOnly", canPostToFinance: false });
      return true;
    }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}`) {
      if (submittedKey) { await json({ code: "NotFound" }, 404); return true; }
      await json({ reviewId: review, invoiceId: invoice, invoiceVersion: 2,
        mappingVersionId: mapping, sourceSchemaVersion: 2, coreCaseId: coreCase, caseVersion: 1,
        caseState: "Pending", reviewState: "Pending", originalDigestCurrent: true, currentMapping: true,
        original: { invoiceNumber: "BILL-1", invoiceDate: "2026-10-23", currencyCode: "ZMW",
          netAmount: "1", taxAmount: "0", grossAmount: "1",
          lines: [{ id: line, lineNumber: 1, description: "Service", quantity: "1",
            unitPrice: "1", taxAmount: "0" }] }, blockers: [],
        originalDocumentLines: [{ invoiceLineId: line, documentVersionId: doc,
          documentSha256: "a".repeat(64), documentLineReference: "Page 1", unitCode: "EACH" }],
        assignments: [{ assignmentId: assignment, assignmentVersion: 1 }],
        actionCandidates: ["Approve"], attestation: "OriginalDocumentUnitsConfirmed", canPostToFinance: false });
      return true;
    }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}/documents`) {
      await json({ reviewId: review, invoiceId: invoice,
        items: [{ documentId: mapping, versionId: doc, versionNumber: 1, fileName: "Original.pdf",
          mediaType: "application/pdf", sizeBytes: 100, sha256: "a".repeat(64),
          scanState: "Available", canDownload: true }],
        availabilityMeaning: "PinnedOriginalDocumentVersionsOnly", canPostToFinance: false });
      return true;
    }
    if (path === `/api/procurement/v1/principal-unit-reviews/${review}/assignments/${assignment}/decisions`) {
      decisions++; submittedKey = request.headers()["idempotency-key"];
      await json({ code: "ResponseUnknown" }, 503); // Synthetic lost acknowledgement after commit.
      return true;
    }
    if (submittedKey && path === `/api/procurement/v1/principal-unit-reviews/${review}/commands/${submittedKey}`) {
      recoveries++;
      await json({ reviewId: review, invoiceId: invoice, invoiceVersion: 2, commandKey: submittedKey,
        decisionId: mapping, caseVersion: 2, reviewState: "Verified", sourceSchemaVersion: 2,
        canPostToFinance: false });
      return true;
    }
    return false;
  });
  await page.goto("/procurement/workspace/approvals");
  await page.getByRole("link", { name: "Check original" }).click();
  await page.getByRole("button", { name: "Confirm original units" }).click();
  await page.getByRole("switch", { name: /I checked the original invoice document/ }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("button", { name: "Check saved decision" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/This assignment may have completed/)).toBeVisible();
  await page.getByRole("button", { name: "Check saved decision" }).click();
  await expect(page.getByText(/Saved Verified decision found/)).toBeVisible();
  await expect(page.getByText(/The saved decision is complete/)).toBeVisible();
  expect(decisions).toBe(1);
  expect(recoveries).toBe(1);
});
