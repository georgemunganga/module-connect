import { afterEach, describe, expect, it, vi } from "vitest";
import { decideUnitReview, getUnitReviewDetail, openUnitReview, recoverUnitReview,
  type UnitReviewAction } from "../../../src/platform/procurement-invoice-unit-review-api";

const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333", key = "44444444-4444-4444-8444-444444444444";
const decision = "55555555-5555-4555-8555-555555555555", outcome = "66666666-6666-4666-8666-666666666666";
const coreCase = "77777777-7777-4777-8777-777777777777", mapping = "88888888-8888-4888-8888-888888888888";
const assignment = "99999999-9999-4999-8999-999999999999";
// These are independent Core account identifiers; no HR worker is required.
const maker = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const identity = { makerPrincipalId: maker, identitySchemaVersion: 3 as const };
const detail = () => ({ ...identity, evidenceSchemaVersion: null, reviewId: review, invoiceId: invoice, invoiceVersion: 2,
  mappingVersionId: mapping, mappingRevision: 1, coreCaseId: coreCase, caseVersion: 1, caseState: "Pending" as const,
  reviewState: "Pending" as const, currentMapping: true, originalDigestCurrent: true,
  original: { invoiceNumber: "SYNTHETIC-1", invoiceDate: "2026-10-22", currencyCode: "ZMW", netAmount: "1", taxAmount: "0", grossAmount: "1", lines: [] },
  blockers: [], assignments: [{ assignmentId: assignment, assignmentVersion: 1 }], originalDocumentLines: [],
  actionCandidates: ["Approve"] as UnitReviewAction[], attestation: "OriginalDocumentUnitsConfirmed",
  actionCandidateMeaning: "CurrentAssignmentOnlyRevalidatedByCommand", isInvoiceApproval: false, canPostToFinance: false });
const receipt = (operation: "Open" | "Decision" = "Open") => ({ ...identity, schemaVersion: 1, invoiceId: invoice,
  reviewId: review, coreCaseId: coreCase, commandKey: key, operation, invoiceVersion: 2,
  caseVersion: operation === "Open" ? 1 : 2, caseState: "Pending", reviewState: "Pending",
  decisionId: operation === "Open" ? null : decision, outcomeId: null, completedAt: "2026-10-22T00:00:00Z",
  recordedHistoricalResult: true, isInvoiceApproval: false, canPostToFinance: false });
const reply = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body),
  { status: 200, headers: { "Content-Type": "application/json" } })));
afterEach(() => vi.unstubAllGlobals());

describe("retained original unit review identity metadata", () => {
  it("accepts current source identity3 without changing wire envelope1", async () => {
    reply({ ...detail(), identitySchemaVersion: 3 });
    await expect(getUnitReviewDetail(company, review)).resolves.toMatchObject({ makerPrincipalId: maker, identitySchemaVersion: 3 });
    reply({ ...receipt(), identitySchemaVersion: 3 });
    await expect(recoverUnitReview(company, review, key, "Open", invoice)).resolves.toMatchObject({ schemaVersion: 1 });
  });
  it.each([
    { makerPrincipalId: null }, { makerPrincipalId: "00000000-0000-0000-0000-000000000000" },
    { makerPrincipalId: maker.toUpperCase() }, { identitySchemaVersion: undefined },
    { identitySchemaVersion: "3" }, { identitySchemaVersion: 2 }, { identitySchemaVersion: 4 }, { evidenceSchemaVersion: 3 },
  ])("rejects malformed/partial or prematurely terminal metadata %#", async malformed => {
    reply({ ...detail(), ...malformed }); await expect(getUnitReviewDetail(company, review)).rejects.toThrow();
    reply({ ...receipt(), ...malformed }); await expect(recoverUnitReview(company, review, key, "Open", invoice)).rejects.toThrow();
  });
  it("accepts terminal evidence3 only alongside an actual sealed terminal receipt", async () => {
    reply({ ...receipt("Decision"), caseState: "Approved", reviewState: "Verified", outcomeId: outcome, evidenceSchemaVersion: 3 });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).resolves.toMatchObject({ schemaVersion: 1, evidenceSchemaVersion: 3 });
    reply({ ...receipt("Decision"), caseState: "Approved", reviewState: "Verified", outcomeId: outcome, evidenceSchemaVersion: null });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow();
  });
  it.each([{ makerPrincipalId: other }, { identitySchemaVersion: 2 }])("rejects a decision receipt for a different retained source %#", async changed => {
    reply({ ...receipt("Decision"), ...changed });
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow();
  });
  it("does not clear a new-detail action on a receipt missing its known identity metadata", async () => {
    const { makerPrincipalId: _maker, identitySchemaVersion: _identity, ...oldReceipt } = receipt("Decision");
    reply(oldReceipt);
    await expect(decideUnitReview(company, detail(), assignment, 1, "Approve", null, true, key)).rejects.toThrow();
  });
  it("checks supplied opening-maker metadata against the actual context principal", async () => {
    reply({ ...receipt(), makerPrincipalId: other });
    await expect(openUnitReview(company, invoice, 2, 1, null, key, maker)).rejects.toThrow();
    reply(receipt());
    await expect(openUnitReview(company, invoice, 2, 1, null, key, maker)).resolves.toMatchObject({ makerPrincipalId: maker });
  });
  it("retains an interrupted command when recovered metadata conflicts with known source", async () => {
    reply({ ...receipt(), makerPrincipalId: other });
    await expect(recoverUnitReview(company, review, key, "Open", invoice, maker)).rejects.toThrow();
    reply({ ...receipt("Decision"), identitySchemaVersion: 2 });
    await expect(recoverUnitReview(company, review, key, "Decision", invoice, maker, 3)).rejects.toThrow();
  });
  it("keeps older wire1 without additive metadata readable", async () => {
    const { makerPrincipalId: _maker, identitySchemaVersion: _identity, ...oldReceipt } = receipt();
    reply(oldReceipt); await expect(openUnitReview(company, invoice, 2, 1, null, key, maker)).resolves.toMatchObject({ schemaVersion: 1 });
    const { makerPrincipalId: _detailMaker, identitySchemaVersion: _detailIdentity, evidenceSchemaVersion: _evidence, ...oldDetail } = detail();
    reply(oldDetail); await expect(getUnitReviewDetail(company, review)).resolves.toMatchObject({ reviewId: review });
  });
  it("rejects internal version3 being substituted for receipt wire1", async () => {
    reply({ ...receipt(), schemaVersion: 3 });
    await expect(recoverUnitReview(company, review, key, "Open", invoice)).rejects.toThrow();
  });
});
