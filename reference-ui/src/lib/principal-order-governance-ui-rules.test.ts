import { describe, expect, it } from "vitest";
import type { FinanceOrderDetail, GovernedBuyerOrder, OrderReviewDetail } from
  "../../../src/platform/procurement-principal-governance-api";
import { canCreateApprovedSourceOrder, governedActions, legacyDraftBlocksGovernance } from "./principal-order-governance-ui-rules";

describe("principal order current-action presentation", () => {
  it("retains the existing approved-request Create entry only for a selected-branch converter", () => {
    const branch = "11111111-1111-4111-8111-111111111111";
    const permissions = ["procurement-po-read", "procurement-po-convert"];
    expect(canCreateApprovedSourceOrder(true, permissions, branch)).toBe(true);
    expect(canCreateApprovedSourceOrder(false, permissions, branch)).toBe(false);
    expect(canCreateApprovedSourceOrder(true, permissions, null)).toBe(false);
    expect(canCreateApprovedSourceOrder(true, ["procurement-po-read"], branch)).toBe(false);
  });
  it("blocks new commands behind an unresolved legacy Create or malformed journal", () => {
    const order = "11111111-1111-4111-8111-111111111111";
    expect(legacyDraftBlocksGovernance("Create", null, order, false)).toBe(true);
    expect(legacyDraftBlocksGovernance("Cancel", order, order, false)).toBe(true);
    expect(legacyDraftBlocksGovernance("Cancel", "22222222-2222-4222-8222-222222222222", order, false)).toBe(false);
    expect(legacyDraftBlocksGovernance(null, null, order, true)).toBe(true);
  });
  it("offers funded Draft release and submit without exposing legacy Cancel", () => {
    const draft = { status: "Draft", funding: { id: "retained" }, canCancelDraft: false,
      canSubmit: true, canRequestRelease: true } as GovernedBuyerOrder;
    expect(governedActions("buyer", draft, true)).toEqual(["Submit", "ReleaseRequest"]);
    expect(governedActions("buyer", draft, false)).toEqual([]);
  });
  it("keeps historical task reads visible while new work is disabled or All is selected", () => {
    const task = { status: "ReleasePending", canRecordFunding: false,
      canConfirmRelease: false } as FinanceOrderDetail;
    expect(governedActions("finance", task, false)).toEqual([]);
    expect(governedActions("finance", task, true)).toEqual([]);
  });
  it("keeps an assigned Return escape when current positive approval is blocked", () => {
    const review = { canApprove: false, canReturn: true, canReject: true } as OrderReviewDetail;
    expect(governedActions("review", review, true)).toEqual(["Decide"]);
  });
  it("offers purpose-only Issue and acknowledgment without a buyer read flag", () => {
    const issue = { status: "Approved", canIssue: true } as GovernedBuyerOrder;
    const ack = { status: "IssuePending", canRecordAcknowledgment: true } as GovernedBuyerOrder;
    expect(governedActions("issue", issue, true)).toEqual(["Issue"]);
    expect(governedActions("ack", ack, true)).toEqual(["Ack"]);
    expect(governedActions("buyer", issue, true)).toEqual([]);
  });
});
