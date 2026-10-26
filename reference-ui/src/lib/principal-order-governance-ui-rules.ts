import type { FinanceOrderDetail, GovernedBuyerOrder, GovernanceOperation,
  OrderReviewDetail } from "../../../src/platform/procurement-principal-governance-api";

export type GovernedTask = "buyer" | "finance" | "review" | "issue" | "ack";
export type GovernedDetail = GovernedBuyerOrder | FinanceOrderDetail | OrderReviewDetail;

/** Server preview plus current selected-branch/write-capability gate. The server rechecks on save. */
export function governedActions(task: GovernedTask, record: GovernedDetail | null,
  canWrite: boolean): GovernanceOperation[] {
  if (!canWrite || !record) return [];
  if (task === "buyer" && "canSubmit" in record)
    return [record.canSubmit ? "Submit" : null, record.canRequestRelease ? "ReleaseRequest" : null]
      .filter((item): item is GovernanceOperation => item !== null);
  if (task === "finance" && "canRecordFunding" in record)
    return [record.canRecordFunding ? "Funding" : null, record.canConfirmRelease ? "ReleaseConfirm" : null]
      .filter((item): item is GovernanceOperation => item !== null);
  if (task === "review" && "canApprove" in record)
    return record.canApprove || record.canReturn || record.canReject ? ["Decide"] : [];
  if (task === "issue" && "canIssue" in record && record.canIssue) return ["Issue"];
  if (task === "ack" && "canRecordAcknowledgment" in record && record.canRecordAcknowledgment) return ["Ack"];
  return [];
}
