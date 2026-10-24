import { expect, test } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const invoice = "44444444-4444-4444-8444-444444444444";
const line = "55555555-5555-4555-8555-555555555555";
const mapping = "66666666-6666-4666-8666-666666666666";
const outcome = "77777777-7777-4777-8777-777777777777";
const first = "88888888-8888-4888-8888-888888888888";
const second = "99999999-9999-4999-8999-999999999999";

test("separate issue notes stay with their own owner record and unknown POST recovers by GET", async ({ page }) => {
  let posted = 0, legacyMatchingReads = 0, originalKey = "";
  await page.addInitScript(({ entity, site }) => localStorage.setItem("erp.shell.state.v1",
    JSON.stringify({ entityId: entity, branch: site })), { entity: company, site: branch });
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Invoice owner", roles: [] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path.startsWith("/api/procurement/v1")) {
      expect(request.headers()["x-shell-entity"]).toBe(company);
      expect(request.headers()["x-shell-location"]).toBe(branch);
    }
    if (path.startsWith(`/api/procurement/v1/invoices/${invoice}/matching`)) legacyMatchingReads++;
    if (path === "/api/procurement/v1/context") return json({ tenantId: "tenant-a", legalEntityId: company,
      principalId: actor, workerId: null, company: { id: company, currencyCode: "ZMW" },
      permissions: ["procurement-access", "procurement-invoice-read", "procurement-invoice-match", "procurement-invoice-capture"] });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "tenant-a", legalEntityId: company,
      schemaReady: true, capabilities: { invoiceIntake: true, principalInvoiceMatching: true } });
    if (path === `/api/procurement/v1/invoices/${invoice}`) return json({ id: invoice,
      supplierId: company, supplierName: "Supplier", invoiceNumber: "BILL-42", invoiceDate: "2026-10-23",
      currencyCode: "ZMW", status: "Received", intakeChannel: "Manual", version: 2,
      createdAt: "2026-10-23T10:00:00Z", netAmount: "1", taxAmount: "0", grossAmount: "1",
      nextStep: "Resolve the recorded comparison issues.", lines: [{ id: line, lineNumber: 1,
        description: "Service", quantity: "1", unitPrice: "1", taxAmount: "0" }] });
    if (path === `/api/procurement/v1/invoices/${invoice}/principal-matching/status`) return json({
      invoiceId: invoice, invoiceVersion: 2, sourceSchemaVersion: 2, state: "ComparisonBlocked",
      stateVersion: 2, mappingRevision: 1, mappingVersionId: mapping, reviewId: outcome,
      reviewOutcomeId: outcome, reviewState: "Verified", comparisonId: null, exposureVersion: 1,
      isAuthority: false, canPostToFinance: false });
    if (path === `/api/procurement/v1/invoices/${invoice}/principal-matching/exceptions`) return json({
      invoiceId: invoice, invoiceVersion: 2, sourceSchemaVersion: 2, page: 1, pageSize: 20, total: 2,
      canPostToFinance: false, items: [first, second].map((issueId, index) => ({ issueId,
        supplierInvoiceLineId: line, mappingVersionId: mapping, code: index ? "SecondIssue" : "FirstIssue",
        state: "Open", ownerPrincipalId: actor, version: 1, openedAt: "2026-10-23T10:00:00Z",
        dueAt: null, resolvedAt: null, resolutionReference: null, history: [] })) });
    if (path === `/api/procurement/v1/invoices/${invoice}/principal-matching/exceptions/${second}/actions`) {
      posted++; originalKey = request.headers()["idempotency-key"];
      expect(request.postDataJSON()).toEqual({ expectedVersion: 1, action: "Comment",
        reason: "Second issue note", evidenceReference: null, newOwnerPrincipalId: null });
      return json({ code: "ResponseUnknown" }, 503);
    }
    if (originalKey && path === `/api/procurement/v1/invoices/${invoice}/principal-matching/exceptions/commands/${originalKey}`)
      return json({ invoiceId: invoice, invoiceVersion: 2, issueId: second, actionId: first,
        commandKey: originalKey, ownerPrincipalId: actor, issueState: "Open", issueVersion: 1,
        sourceSchemaVersion: 2, canPostToFinance: false });
    return json({ code: "Unavailable" }, 404);
  });
  await page.goto(`/procurement/workspace/bills/${invoice}`);
  const notes = page.getByRole("textbox", { name: "Correction note or next step" });
  await expect(notes).toHaveCount(2);
  await notes.nth(0).fill("First issue note");
  await notes.nth(1).fill("Second issue note");
  await expect(notes.nth(0)).toHaveValue("First issue note");
  await page.getByRole("button", { name: "Add note" }).nth(1).click();
  await expect(page.getByRole("button", { name: "Check saved action" })).toBeVisible();
  await page.getByRole("button", { name: "Check saved action" }).click();
  await expect(page.getByText(/Saved Open action found/)).toBeVisible();
  expect(posted).toBe(1);
  expect(legacyMatchingReads).toBe(0); // Typed mapping never opens the legacy writer.
});
