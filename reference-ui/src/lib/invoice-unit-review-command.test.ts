import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimUnitReviewPending, clearUnitReviewPending, readUnitReviewPending, type UnitReviewPending } from "./invoice-unit-review-command";
const invoice = "11111111-1111-4111-8111-111111111111", review = "22222222-2222-4222-8222-222222222222", key = "33333333-3333-4333-8333-333333333333";
const pending: UnitReviewPending = { operation: "Decision", invoiceId: invoice, reviewId: review, key };
beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal("sessionStorage", {
  getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => values.set(name, value), removeItem: (name: string) => values.delete(name),
}); });
afterEach(() => vi.unstubAllGlobals());
describe("principal-scoped original-unit review journal", () => {
  it("does not clear an acknowledgement for another invoice or review even when its key matches", () => {
    expect(claimUnitReviewPending("tenant:company:branch:CorePrincipal", pending)).toBe(true);
    for (const change of [{ invoiceId: key }, { reviewId: invoice }, { key: invoice }, { operation: "Open" as const }])
      expect(clearUnitReviewPending("tenant:company:branch:CorePrincipal", { ...pending, ...change })).toBe(false);
    expect(readUnitReviewPending("tenant:company:branch:CorePrincipal").blocked).toBe(true);
    expect(clearUnitReviewPending("tenant:company:branch:CorePrincipal", pending)).toBe(true);
  });
  it("does not let another company, branch or system principal release a pending command", () => {
    const scope = "tenant:company:branch:CorePrincipal"; expect(claimUnitReviewPending(scope, pending)).toBe(true);
    for (const other of ["tenant:other-company:branch:CorePrincipal", "tenant:company:other-branch:CorePrincipal", "tenant:company:branch:AnotherCorePrincipal"])
      expect(clearUnitReviewPending(other, pending)).toBe(false);
    expect(readUnitReviewPending(scope).pending).toEqual(pending);
  });
});
