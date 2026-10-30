import { afterEach, describe, expect, it, vi } from "vitest";
import { getInvoiceFinanceReadiness, getInvoiceMatchingHistory } from "../../src/platform/procurement-invoice-review-api";
import { principalNewWorkBlocked } from "../src/lib/invoice-principal-history-lock";
const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const line = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const own = new Set([line]);
const summary = () => ({ outcome: "Blocked", discrepancies: [{ invoiceLineId: line, code: "OwnerHistoryUnavailable" }],
  lines: [{ invoiceLineId: line, method: 1, quantity: "99999999999999.9999", netAmount: "0.00010001", taxAmount: "0", expectedUnitPrice: "100.00000001" }],
  source: { allocations: [{ invoiceId: other, ownerReference: "PRIVATE-OWNER" }] } });
const readiness = () => ({ invoiceId: invoice, invoiceVersion: 3, invoiceStatus: "Received", state: "Blocked", canPrepareHandoff: false,
  evidence: { matchingSchemaAvailable: true, mappingState: "ReviewRequired", mappingVersionId: other, mappingRevision: 1, mappingOriginalCurrent: true,
    comparisonId: other, comparisonInvoiceVersion: 2, comparisonOriginalCurrent: true, recordedComparison: summary(), unresolvedExceptionCount: 1, comparisonCurrentness: "NotRevalidated" },
  blockers: [{ code: "InvoiceValidationAuthorityUnavailable", message: "Invoice approval is not connected." }, { code: "FinanceReceiverUnavailable", message: "Finance is not connected." }],
  nextSteps: [{ code: "ReviewInvoiceComparison", message: "Review the recorded issues." }] });
function respond(body: unknown) { const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))); vi.stubGlobal("fetch", fetch); return fetch; }
afterEach(() => vi.unstubAllGlobals());
describe("read-only invoice review contract", () => {
  it("uses scoped GET and retains exact server digits while discarding raw private evidence", async () => {
    const fetch = respond(readiness()); const result = await getInvoiceFinanceReadiness(company, invoice, 3, own);
    expect(result.evidence.recordedComparison?.lines[0].netAmount).toBe("0.00010001");
    expect(result.evidence.recordedComparison?.lines[0].quantity).toBe("99999999999999.9999");
    expect(result.evidence.recordedComparison?.lines[0].method).toBe("ThreeWay");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-OWNER"); expect(JSON.stringify(result)).not.toContain("allocations");
    expect(fetch).toHaveBeenCalledTimes(1); const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/invoices/${invoice}/finance-readiness`); expect(init.method).toBe("GET");
    expect(init.headers["X-Shell-Entity"]).toBe(company); expect(init.credentials).toBe("include"); expect(init.cache).toBe("no-store");
    expect(init.body).toBeUndefined();
  });
  it("does not combine another invoice/version or accept a response claiming AP authority", async () => {
    for (const changes of [{ invoiceId: other }, { invoiceVersion: 4 }, { canPrepareHandoff: true }, { state: "Ready" }]) {
      respond({ ...readiness(), ...changes }); await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow();
    }
  });
  it("rejects rounded financial numbers and another invoice's line instead of displaying them", async () => {
    const numeric = readiness(); (numeric.evidence.recordedComparison.lines[0] as unknown as Record<string, unknown>).netAmount = 0.00010001;
    respond(numeric); await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow("incomplete");
    const foreign = readiness(); foreign.evidence.recordedComparison.discrepancies[0].invoiceLineId = other;
    respond(foreign); await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow("incomplete");
  });
  it("keeps unknown schema counts unknown and requires both real missing-owner blockers", async () => {
    const body = readiness(); const unavailable = { ...body, evidence: { ...body.evidence, matchingSchemaAvailable: false, recordedComparison: null, unresolvedExceptionCount: null } };
    respond(unavailable); expect((await getInvoiceFinanceReadiness(company, invoice, 3, own)).evidence.unresolvedExceptionCount).toBeNull();
    respond({ ...body, blockers: [] }); await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow("incomplete");
  });
  it("handles denial and connection failure with no automatic retry or command request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 403 })); vi.stubGlobal("fetch", fetch);
    await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow("access"); expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValue(new TypeError("connection lost")); await expect(getInvoiceFinanceReadiness(company, invoice, 3, own)).rejects.toThrow("loaded");
    expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("loads only a bound historical comparison projection without retaining raw source snapshots", async () => {
    const body = { invoiceId: invoice, version: 3, canPostToFinance: false, isInvoiceApproval: false, matchingStateIsRecordedResult: true, principalNewWorkLocked: false,
      original: { netAmount: "0.00010001", taxAmount: "0", grossAmount: "0.00010001", currencyCode: "ZMW",
        lines: [{ id: line, lineNumber: 1, description: "Own", quantity: "1", unitPrice: "0.00010001", taxAmount: "0" }] },
      mappings: [{ id: other, mappingRevision: 1, verificationState: "Unverified", originalDigestCurrent: true, reviewedAt: "2026-10-20T12:00:00Z", snapshot: { private: "PRIVATE-SNAPSHOT" } }],
      comparisons: [{ id: other, outcome: "Blocked", matchedAt: "2026-10-20T12:00:00Z", invoiceVersion: 2, hasHeldCapacityClaim: false,
        recordedHistoricalResult: true, isCurrentApproval: false, canPostToFinance: false, comparison: summary() }], exceptions: [] };
    respond(body); const result = await getInvoiceMatchingHistory(company, invoice, 3, own);
    expect(result.original.netAmount).toBe("0.00010001"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(principalNewWorkBlocked(false, result.principalNewWorkLocked)).toBe(false);
    respond({ ...body, isInvoiceApproval: true }); await expect(getInvoiceMatchingHistory(company, invoice, 3, own)).rejects.toThrow("incomplete");
  });
  it("uses the stored schema discriminator for principal history and rejects unlabeled schema-3 snapshots", async () => {
    const original = { netAmount: "1", taxAmount: "0", grossAmount: "1", currencyCode: "ZMW",
      lines: [{ id: line, lineNumber: 1, description: "Own", quantity: "1", unitPrice: "1", taxAmount: "0" }] };
    const mapping = { id: other, mappingRevision: 1, verificationState: "Unverified", originalDigestCurrent: true,
      reviewedAt: "2026-10-28T12:00:00Z", sourceSchemaVersion: 3,
      snapshot: { schemaVersion: 3, purchaseOrderId: other, issuedVersionId: other, lines: [], private: "PRIVATE-SNAPSHOT" } };
    const body = { invoiceId: invoice, version: 3, currentMappingVersionId: other, canPostToFinance: false, isInvoiceApproval: false,
      principalNewWorkLocked: true,
      matchingStateIsRecordedResult: true, original, mappings: [mapping], comparisons: [], exceptions: [] };
    respond(body);
    const parsed = await getInvoiceMatchingHistory(company, invoice, 3, own);
    expect(parsed.mappings[0].sourceSchemaVersion).toBe(3);
    expect(parsed.currentMappingVersionId).toBe(other);
    expect(principalNewWorkBlocked(true, parsed.principalNewWorkLocked)).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE-SNAPSHOT");
    for (const malformed of [undefined, null, "false", 0]) {
      respond({ ...body, principalNewWorkLocked: malformed });
      expect(principalNewWorkBlocked(true, (await getInvoiceMatchingHistory(company, invoice, 3, own)).principalNewWorkLocked)).toBe(true);
    }
    respond({ ...body, principalNewWorkLocked: false });
    expect(principalNewWorkBlocked(true, (await getInvoiceMatchingHistory(company, invoice, 3, own)).principalNewWorkLocked)).toBe(false);
    expect(principalNewWorkBlocked(false, true)).toBe(false);
    respond({ ...body, mappings: [{ ...mapping, sourceSchemaVersion: undefined }] });
    await expect(getInvoiceMatchingHistory(company, invoice, 3, own)).rejects.toThrow("incomplete");
    respond({ ...body, mappings: [{ ...mapping, sourceSchemaVersion: 2 }] });
    await expect(getInvoiceMatchingHistory(company, invoice, 3, own)).rejects.toThrow("incomplete");
  });
  it("locks only the recorded invoice, leaving a new invoice on the same order eligible", async () => {
    const siblingInvoice = "55555555-5555-4555-8555-555555555555", siblingLine = "66666666-6666-4666-8666-666666666666";
    const history = (invoiceId: string, lineId: string, locked: boolean) => ({
      invoiceId, version: 3, currentMappingVersionId: other, principalNewWorkLocked: locked,
      canPostToFinance: false, isInvoiceApproval: false, matchingStateIsRecordedResult: true,
      original: { netAmount: "1", taxAmount: "0", grossAmount: "1", currencyCode: "ZMW",
        lines: [{ id: lineId, lineNumber: 1, description: "Own line", quantity: "1", unitPrice: "1", taxAmount: "0" }] },
      mappings: [{ id: other, mappingRevision: 1, verificationState: "Unverified", originalDigestCurrent: true,
        reviewedAt: "2026-10-30T00:00:00Z", sourceSchemaVersion: 3,
        snapshot: { schemaVersion: 3, purchaseOrderId: company, issuedVersionId: company, lines: [] } }],
      comparisons: [], exceptions: [] });
    respond(history(invoice, line, true));
    const recorded = await getInvoiceMatchingHistory(company, invoice, 3, own);
    respond(history(siblingInvoice, siblingLine, false));
    const sibling = await getInvoiceMatchingHistory(company, siblingInvoice, 3, new Set([siblingLine]));
    expect(principalNewWorkBlocked(true, recorded.principalNewWorkLocked)).toBe(true);
    expect(principalNewWorkBlocked(true, sibling.principalNewWorkLocked)).toBe(false);
  });
});
