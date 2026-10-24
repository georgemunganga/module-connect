import type { ContractReviewAck } from "./procurement-contract-review-api";

/** Only a locator survives an uncertain write. Reasons, terms and credentials do not. */
export type ContractReviewPending = {
  schemaVersion: 1; companyId: string; principalId: string; contractId: string;
  assignmentId: string | null; operation: ContractReviewAck["Operation"]; key: string;
};
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const contractReviewJournalSlot = (companyId: string, principalId: string,
  contractId: string, assignmentId: string | null) =>
  `procurement.contract-review.command.v1:${companyId}:${principalId}:${contractId}:${assignmentId ?? "owner"}`;

function valid(value: unknown): value is ContractReviewPending {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join(",") === ["schemaVersion", "companyId", "principalId",
    "contractId", "assignmentId", "operation", "key"].sort().join(",")
    && row.schemaVersion === 1
    && [row.companyId, row.principalId, row.contractId, row.key].every(value =>
      typeof value === "string" && guid.test(value))
    && (row.assignmentId === null || typeof row.assignmentId === "string" && guid.test(row.assignmentId))
    && ["Submit", "Decide", "Correction"].includes(String(row.operation));
}
export function readContractReviewPending(storage: Storage, scope: Omit<ContractReviewPending,
  "schemaVersion" | "operation" | "key">): ContractReviewPending | null {
  const raw = storage.getItem(contractReviewJournalSlot(scope.companyId, scope.principalId,
    scope.contractId, scope.assignmentId));
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { throw new Error("The saved review command is invalid. Get help before sending another action."); }
  if (!valid(value) || value.companyId !== scope.companyId || value.principalId !== scope.principalId
    || value.contractId !== scope.contractId || value.assignmentId !== scope.assignmentId)
    throw new Error("The saved review command is invalid. Get help before sending another action.");
  return value;
}
export function saveContractReviewPending(storage: Storage, value: ContractReviewPending): void {
  if (!valid(value)) throw new Error("The review command could not be saved safely.");
  const slot = contractReviewJournalSlot(value.companyId,value.principalId,value.contractId,value.assignmentId);
  if (storage.getItem(slot)) throw new Error("Check the earlier review command before sending another.");
  storage.setItem(slot, JSON.stringify(value));
  if (storage.getItem(slot) !== JSON.stringify(value))
    throw new Error("The review command could not be saved safely.");
}
export function clearContractReviewPending(storage: Storage, value: ContractReviewPending): void {
  const slot = contractReviewJournalSlot(value.companyId,value.principalId,value.contractId,value.assignmentId);
  if (storage.getItem(slot) === JSON.stringify(value)) storage.removeItem(slot);
}
