import { describe, expect, it } from "vitest";
import type { FinanceOrderDetail, GovernedBuyerOrder, OrderReviewDetail } from
  "../../../src/platform/procurement-principal-governance-api";
import { governedActions } from "./principal-order-governance-ui-rules";

describe("principal order current-action presentation", () => {
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
