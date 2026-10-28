import { afterEach, describe, expect, it, vi } from "vitest";
import { manualDecide, manualDetail, manualOpen, manualReadiness, manualRecover, manualRecoverOpenByInvoice,
  type ManualDetail, type ManualReadiness } from "../../../src/platform/procurement-invoice-manual-unit-review-api";

const company = "11111111-1111-4111-8111-111111111111";
const invoice = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const maker = "55555555-5555-4555-8555-555555555555";
const assignment = "66666666-6666-4666-8666-666666666666";
const coreCase = "77777777-7777-4777-8777-777777777777";
const line = "88888888-8888-4888-8888-888888888888";
const receipt = (operation: "Open" | "Decision") => ({ schemaVersion: 1, invoiceId: invoice, reviewId: review,
  coreCaseId: coreCase, commandKey: key, operation, invoiceVersion: 2, caseVersion: operation === "Open" ? 1 : 3,
  caseState: "Pending", reviewState: "Pending", decisionId: operation === "Open" ? null : "99999999-9999-4999-8999-999999999999",
  outcomeId: null, completedAt: "2026-10-28T00:00:00Z", recordedHistoricalResult: true,
  makerPrincipalId: maker, identitySchemaVersion: 3, evidenceSchemaVersion: null,
  isInvoiceApproval: false, canPostToFinance: false });
const readiness: ManualReadiness = { invoiceId: invoice, invoiceVersion: 2, mappingRevision: 1, existingReviewId: null,
  evidenceMode: "ManualAttestation", sourceSchemaVersion: 4, requiresMakerReason: true,
  manualUnitLines: [{ invoiceLineId: line, unitCode: "EA" }], canRequestReview: true, blockers: [] };
const detail: ManualDetail = { reviewId: review, invoiceId: invoice, invoiceVersion: 2, makerPrincipalId: maker,
  identitySchemaVersion: 3, evidenceSchemaVersion: null, mappingVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mappingRevision: 1,
  coreCaseId: coreCase, caseVersion: 2, caseState: "Pending", reviewState: "Pending", currentMapping: true,
  originalDigestCurrent: true, original: { invoiceNumber: "BILL-1", invoiceDate: "2026-10-28", currencyCode: "ZMW",
    netAmount: "5.1234", taxAmount: "0", grossAmount: "5.1234", lines: [{ id: line, lineNumber: 1, description: "Service",
      quantity: "1", unitPrice: "5.1234", taxAmount: "0" }] }, blockers: [], assignments: [{ assignmentId: assignment, assignmentVersion: 1 }],
  evidenceMode: "ManualAttestation", sourceSchemaVersion: 4, manualUnitLines: [{ invoiceLineId: line, unitCode: "EA" }],
  makerReason: "Check entered units", attestation: "ManuallyEnteredUnitsConfirmed", actionCandidates: ["Approve", "Return", "Reject"] };
const reply = (body: unknown, status = 200) => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};
afterEach(() => vi.unstubAllGlobals());

describe("manual unit review source schema 4", () => {
  it("accepts manual readiness and rejects document evidence and fake placeholders", async () => {
    reply({ ...readiness, isUnitVerification: false, isInvoiceApproval: false, canPostToFinance: false });
    await expect(manualReadiness(company, invoice)).resolves.toMatchObject({ sourceSchemaVersion: 4, requiresMakerReason: true });
    reply({ ...readiness, sourceSchemaVersion: 3, isUnitVerification: false, isInvoiceApproval: false, canPostToFinance: false });
    await expect(manualReadiness(company, invoice)).rejects.toThrow();
    reply({ ...readiness, manualUnitLines: [{ invoiceLineId: line, unitCode: "" }], isUnitVerification: false, isInvoiceApproval: false, canPostToFinance: false });
    await expect(manualReadiness(company, invoice)).rejects.toThrow();
  });
  it("requires real manual detail and never asks for pinned document downloads", async () => {
    reply({ ...detail, actionCandidateMeaning: "CurrentAssignmentOnlyRevalidatedByCommand", isInvoiceApproval: false, canPostToFinance: false });
    await expect(manualDetail(company, review)).resolves.toMatchObject({ attestation: "ManuallyEnteredUnitsConfirmed" });
    reply({ ...detail, evidenceMode: "DocumentReview", actionCandidateMeaning: "CurrentAssignmentOnlyRevalidatedByCommand", isInvoiceApproval: false, canPostToFinance: false });
    await expect(manualDetail(company, review)).rejects.toThrow();
  });
  it("sends one exact manual Open and Decision with the original key", async () => {
    const send = reply(receipt("Open"));
    await manualOpen(company, readiness, "Check entered units", key, maker);
    expect(send).toHaveBeenCalledTimes(1);
    const init = send.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ invoiceVersion: 2, mappingRevision: 1, reason: "Check entered units" });
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(key);
    await expect(manualOpen(company, readiness, "", key, maker)).rejects.toThrow();
    const decide = reply(receipt("Decision"));
    await manualDecide(company, detail, assignment, 1, "Approve", "Entered unit verified", true, key);
    const decisionBody = JSON.parse(String(decide.mock.calls[0][1]?.body));
    expect(decisionBody).toEqual({ invoiceVersion: 2, caseVersion: 2, assignmentVersion: 1,
      action: "Approve", reason: "Entered unit verified", attestation: "ManuallyEnteredUnitsConfirmed" });
    await expect(manualDecide(company, detail, assignment, 1, "Approve", "", true, key)).rejects.toThrow();
  });
  it("recovers by exact operation and retains server denial code", async () => {
    const fetcher = reply(receipt("Decision"));
    await expect(manualRecover(company, review, key, "Decision", invoice, maker)).resolves.toMatchObject({ decisionId: receipt("Decision").decisionId });
    expect(String(fetcher.mock.calls[0][0])).toContain(`operation=Decision`);
    reply({ code: "InvoiceUnitReviewSelectedBranchRequired" }, 422);
    await expect(manualReadiness(company, invoice)).rejects.toMatchObject({ status: 422, code: "InvoiceUnitReviewSelectedBranchRequired" });
    const openWithoutNull = { ...receipt("Open") } as Record<string, unknown>;
    delete openWithoutNull.evidenceSchemaVersion;
    const lostOpen = reply(openWithoutNull);
    await expect(manualRecover(company, review, key, "Open", invoice, maker)).resolves.toMatchObject({ reviewState: "Pending" });
    await expect(manualRecoverOpenByInvoice(company, invoice, key, maker)).resolves.toMatchObject({ reviewId: review });
    expect(String(lostOpen.mock.calls[1][0])).toContain(`/invoices/${invoice}/manual-unit-reviews/commands/${key}`);
    await expect(manualRecoverOpenByInvoice(company, invoice, key, company)).rejects.toThrow();
  });
});
