import type { ManualPaymentAction, ManualPaymentDetail, ManualPaymentStatus } from "../../../src/platform/procurement-manual-payments-api";

export const manualPaymentStatusLabels: Record<ManualPaymentStatus, string> = {
  Draft: "Draft", PendingApproval: "Awaiting review", Approved: "Approved for recording",
  PaymentRecorded: "External payment recorded", ConfirmedManually: "Manually confirmed",
  Rejected: "Rejected", Cancelled: "Cancelled", Disputed: "Disputed",
};

/** Conservative visibility only. The owning server rechecks current Core authority,
 * assignment, source invoice, independent people and workflow case per command. */
export function manualPaymentVisibleActions(request: ManualPaymentDetail["request"],
  principalId: string, permissions: readonly string[]): ManualPaymentAction[] {
  const available: ManualPaymentAction[] = [];
  const has = (action: string) => permissions.includes(action);
  if (request.status === "Draft" && principalId === request.creatorPrincipalId && has("procurement-payment-submit")) available.push("Submit");
  if (request.status === "PendingApproval" && principalId === request.approverPrincipalId && has("procurement-payment-approve")) available.push("Approve", "Return", "Reject");
  if (request.status === "Approved" && principalId === request.recorderPrincipalId && has("procurement-payment-record")) available.push("Record");
  if (request.status === "PaymentRecorded" && principalId === request.confirmerPrincipalId && has("procurement-payment-confirm")) available.push("Confirm", "Dispute");
  if (["Draft", "PendingApproval", "Approved"].includes(request.status)
    && [request.creatorPrincipalId, request.approverPrincipalId].includes(principalId)
    && has("procurement-payment-cancel")) available.push("Cancel");
  return available;
}
