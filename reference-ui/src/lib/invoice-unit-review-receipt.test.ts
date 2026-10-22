import { afterEach, describe, expect, it, vi } from "vitest";
import { getPinnedReviewDocuments, recoverUnitReview } from "../../../src/platform/procurement-invoice-unit-review-api";

const company = "11111111-1111-4111-8111-111111111111";
const invoice = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const decision = "55555555-5555-4555-8555-555555555555";
const outcome = "66666666-6666-4666-8666-666666666666";
const reply = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body),
  { status: 200, headers: { "Content-Type": "application/json" } })));
const receipt = (operation: "Open" | "Decision", caseState: string, reviewState: string,
  decisionId: string | null, outcomeId: string | null) => ({ schemaVersion: 1, invoiceId: invoice,
    reviewId: review, coreCaseId: "77777777-7777-4777-8777-777777777777", commandKey: key,
    operation, invoiceVersion: 2, caseVersion: 1, caseState, reviewState,
    decisionId, outcomeId, completedAt: "2026-10-22T00:00:00Z", recordedHistoricalResult: true,
    isInvoiceApproval: false, canPostToFinance: false });

afterEach(() => vi.unstubAllGlobals());
describe("original invoice review historical acknowledgements", () => {
  it("accepts opening and a nonterminal vote with their distinct ID shapes", async () => {
    reply(receipt("Open", "Pending", "Pending", null, null));
    await expect(recoverUnitReview(company, review, key, "Open", invoice)).resolves.toMatchObject({ reviewState: "Pending" });
    reply(receipt("Decision", "Pending", "Pending", decision, null));
    await expect(recoverUnitReview(company, review, key, "Decision", invoice)).resolves.toMatchObject({ decisionId: decision });
  });
  it("accepts a terminal verified review only with the sealed outcome", async () => {
    reply(receipt("Decision", "Approved", "Verified", decision, outcome));
    await expect(recoverUnitReview(company, review, key, "Decision", invoice)).resolves.toMatchObject({ outcomeId: outcome });
  });
  it.each([
    receipt("Open", "Pending", "Pending", decision, null),
    receipt("Decision", "Pending", "Pending", null, null),
    receipt("Decision", "Approved", "Pending", decision, outcome),
    receipt("Decision", "Approved", "Verified", decision, null),
    receipt("Decision", "Pending", "Verified", decision, outcome),
    receipt("Decision", "Returned", "Rejected", decision, outcome),
  ])("rejects impossible status/ID combination %#", async item => {
    reply(item);
    await expect(recoverUnitReview(company, review, key, item.operation as "Open" | "Decision", invoice)).rejects.toThrow();
  });
  it("rejects document wrappers for a different invoice even with matching review ID", async () => {
    reply({ reviewId: review, invoiceId: company, availabilityMeaning: "PinnedOriginalDocumentVersionsOnly",
      isUnitVerification: false, canPostToFinance: false, items: [] });
    await expect(getPinnedReviewDocuments(company, review, invoice)).rejects.toThrow();
  });
});
