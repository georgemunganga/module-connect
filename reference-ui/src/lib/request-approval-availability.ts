import type { ProcurementReadiness } from "./procurement-live";

/** Only PR approval screens share these wire routes. This does not enable PO,
 * receiving, Finance recording or any downstream legacy evidence consumer. */
export function requestApprovalsAvailable(capabilities: Pick<ProcurementReadiness["capabilities"], "approvals" | "principalApprovals">): boolean {
  return capabilities.principalApprovals === true || capabilities.approvals === true;
}
