import { afterEach, describe, expect, it, vi } from "vitest";
import { claimUnitReviewPending, clearUnitReviewPending, readUnitReviewPending } from "../src/lib/invoice-unit-review-command";
import { decideUnitReview, getUnitReviewDetail, getUnitReviewReadiness, listUnitReviewTasks, openUnitReview, recoverUnitReview,
  type UnitReviewDetail } from "../../src/platform/procurement-invoice-unit-review-api";

const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333", mapping = "44444444-4444-4444-8444-444444444444";
const assignment = "55555555-5555-4555-8555-555555555555", core = "66666666-6666-4666-8666-666666666666";
const line = "77777777-7777-4777-8777-777777777777", doc = "88888888-8888-4888-8888-888888888888";
const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const decisionId = "99999999-9999-4999-8999-999999999999", outcomeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const mock = (body: unknown, status = 200) => { const fetch = vi.fn().mockResolvedValue(json(body, status)); vi.stubGlobal("fetch", fetch); return fetch; };
const flags = { isInvoiceApproval: false, canPostToFinance: false };
const detail = (): UnitReviewDetail => ({ reviewId: review, invoiceId: invoice, invoiceVersion: 4, mappingVersionId: mapping,
  mappingRevision: 1, coreCaseId: core, caseVersion: 1, caseState: "Pending", reviewState: "Pending", currentMapping: true,
  originalDigestCurrent: true, original: { invoiceNumber: "INV-1", invoiceDate: "2026-10-20", currencyCode: "ZMW",
    netAmount: "10.0000", taxAmount: "0", grossAmount: "10.0000", lines: [{ id: line, lineNumber: 1,
      description: "Service", quantity: "1", unitPrice: "10.0000", taxAmount: "0" }] }, blockers: [],
  assignments: [{ assignmentId: assignment, assignmentVersion: 1 }], originalDocumentLines: [{ invoiceLineId: line,
    documentVersionId: doc, documentSha256: "a".repeat(64), documentLineReference: "Page 1 line 2", unitCode: "EACH" }],
  actionCandidates: ["Approve", "Return", "Reject"] });
const detailWire = () => ({ ...detail(), attestation: "OriginalDocumentUnitsConfirmed",
  actionCandidateMeaning: "CurrentAssignmentOnlyRevalidatedByCommand", ...flags });
const receipt = (operation: "Open" | "Decision") => ({ schemaVersion: 1, invoiceId: invoice, reviewId: review, coreCaseId: core,
  commandKey: key, operation, invoiceVersion: 4, caseVersion: operation === "Open" ? 1 : 2,
  caseState: operation === "Open" ? "Pending" : "Approved", reviewState: operation === "Open" ? "Pending" : "Verified",
  decisionId: operation === "Open" ? null : decisionId, outcomeId: operation === "Open" ? null : outcomeId,
  completedAt: "2026-10-22T00:00:00Z", recordedHistoricalResult: true, ...flags });
afterEach(() => vi.unstubAllGlobals());
describe("original invoice unit review purpose API", () => {
  it("requires actual readiness and keeps unavailable distinct from empty", async () => {
    const ready = { invoiceId: invoice, invoiceVersion: 4, mappingRevision: 1, existingReviewId: null,
      canRequestReview: true, blockers: [], isUnitVerification: false, ...flags };
    const fetch = mock(ready); expect((await getUnitReviewReadiness(company, invoice)).canRequestReview).toBe(true);
    expect(fetch.mock.calls[0][0]).toContain(`/invoices/${invoice}/unit-review-readiness`);
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    mock({ ...ready, canPostToFinance: true }); await expect(getUnitReviewReadiness(company, invoice)).rejects.toThrow("confirmed");
    mock({ message: "Unavailable" }, 503); await expect(getUnitReviewReadiness(company, invoice)).rejects.toThrow("unavailable");
  });
  it("keeps assignment tasks purpose-only and exact original facts scoped to review", async () => {
    const tasks = { items: [{ reviewId: review, invoiceId: invoice, mappingVersionId: mapping, mappingRevision: 1,
      branchId: null, openedAt: "2026-10-22T00:00:00Z", ...flags }], total: 1, page: 1, pageSize: 20,
      availabilityMeaning: "CurrentMappingAssignmentsOnly", canPostToFinance: false };
    const fetch = mock(tasks); expect((await listUnitReviewTasks(company, 1)).items).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toContain("/invoice-unit-reviews/tasks?page=1&pageSize=20");
    mock(detailWire()); expect((await getUnitReviewDetail(company, review)).original?.lines[0].unitPrice).toBe("10.0000");
    mock({ ...detailWire(), original: { ...detailWire().original, grossAmount: 10 } });
    await expect(getUnitReviewDetail(company, review)).rejects.toThrow("confirmed");
    mock({ ...detailWire(), currentMapping: false }); await expect(getUnitReviewDetail(company, review)).rejects.toThrow("confirmed");
  });
  it("sends plain open and explicit human attested decision, with original-key GET-only recovery", async () => {
    const fetch = mock(receipt("Open")); await openUnitReview(company, invoice, 4, 1, null, key);
    expect(fetch.mock.calls[0][1].method).toBe("POST"); expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ invoiceVersion: 4, mappingRevision: 1, reason: null });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, false, key)).rejects.toThrow("confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    const vote = mock(receipt("Decision")); await decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key);
    expect(JSON.parse(vote.mock.calls[0][1].body).attestation).toBe("OriginalDocumentUnitsConfirmed");
    await expect(decideUnitReview(company, detail(), assignment, 1, "Return", null, false, key)).rejects.toThrow("confirmed");
    const recovery = mock(receipt("Decision")); await recoverUnitReview(company, review, key, "Decision", invoice);
    expect(recovery.mock.calls[0][1].method).toBe("GET"); expect(recovery.mock.calls[0][0]).toContain(`/invoice-unit-reviews/${review}/commands/${key}`);
    mock({ ...receipt("Decision"), canPostToFinance: true }); await expect(recoverUnitReview(company, review, key, "Decision", invoice)).rejects.toThrow("confirmed");
  });
  it("rejects replies for another invoice version or a non-advancing decision case", async () => {
    mock(receipt("Open"));
    await expect(openUnitReview(company, invoice, 3, 1, null, key)).rejects.toThrow("confirmed");
    mock({ ...receipt("Decision"), invoiceVersion: 5 });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow("confirmed");
    mock({ ...receipt("Decision"), caseVersion: 1 });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow("confirmed");
    mock({ ...receipt("Decision"), caseVersion: 3 });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow("confirmed");
    mock({ ...receipt("Decision"), coreCaseId: mapping });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow("confirmed");
  });
});
describe("reload-safe unit review marker", () => {
  it("writes only a nonsecret locator before POST and blocks a second key after reload", () => {
    const map = new Map<string, string>(); vi.stubGlobal("sessionStorage", { getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } });
    const marker = { operation: "Open" as const, invoiceId: invoice, reviewId: null, key };
    expect(claimUnitReviewPending("own-scope", marker)).toBe(true);
    expect([...map.values()][0]).not.toMatch(/reason|attestation|amount/i);
    expect(readUnitReviewPending("own-scope")).toEqual({ pending: marker, blocked: true });
    expect(claimUnitReviewPending("own-scope", { ...marker, key: doc })).toBe(false);
    const storageKey = [...map.keys()][0]!;
    map.set(storageKey, JSON.stringify({ ...marker, body: '{"reason":"private"}' }));
    expect(readUnitReviewPending("own-scope")).toEqual({ pending: null, blocked: true });
    map.set(storageKey, JSON.stringify(marker));
    expect(clearUnitReviewPending("own-scope", marker)).toBe(true);
  });
  it("fails closed if browser storage is unavailable or malformed", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(readUnitReviewPending("own-scope").blocked).toBe(true);
    expect(claimUnitReviewPending("own-scope", { operation: "Open", invoiceId: invoice, reviewId: null, key })).toBe(false);
  });
});
