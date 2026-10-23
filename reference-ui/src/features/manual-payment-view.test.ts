import { describe, expect, it } from "vitest";
import { manualPaymentStatusLabels, manualPaymentVisibleActions } from "./manual-payment-view";
import type { ManualPaymentDetail } from "../../../src/platform/procurement-manual-payments-api";

const creator = "11111111-1111-4111-8111-111111111111";
const approver = "22222222-2222-4222-8222-222222222222";
const recorder = "33333333-3333-4333-8333-333333333333";
const confirmer = "44444444-4444-4444-8444-444444444444";
const request = (status: ManualPaymentDetail["request"]["status"]) => ({ status,
  creatorPrincipalId: creator, approverPrincipalId: approver,
  recorderPrincipalId: recorder, confirmerPrincipalId: confirmer }) as ManualPaymentDetail["request"];

describe("manual payment presentation", () => {
  it("separates review, external recording, and manual confirmation by named current action", () => {
    expect(manualPaymentVisibleActions(request("Draft"), creator, ["procurement-payment-submit"]))
      .toEqual(["Submit"]);
    expect(manualPaymentVisibleActions(request("PendingApproval"), approver, ["procurement-payment-approve"]))
      .toEqual(["Approve", "Return", "Reject"]);
    expect(manualPaymentVisibleActions(request("Approved"), recorder, ["procurement-payment-record"]))
      .toEqual(["Record"]);
    expect(manualPaymentVisibleActions(request("PaymentRecorded"), confirmer, ["procurement-payment-confirm"]))
      .toEqual(["Confirm", "Dispute"]);
  });
  it("does not give a creator an approver button or infer Finance Paid", () => {
    expect(manualPaymentVisibleActions(request("PendingApproval"), creator,
      ["procurement-payment-approve"])).toEqual([]);
    expect(manualPaymentVisibleActions(request("ConfirmedManually"), confirmer,
      ["procurement-payment-confirm"])).toEqual([]);
    expect(Object.values(manualPaymentStatusLabels)).not.toContain("Paid");
    expect(manualPaymentStatusLabels.ConfirmedManually).toBe("Manually confirmed");
  });
});
