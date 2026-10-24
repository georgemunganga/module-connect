import type { PrincipalCommand, PrincipalOperation } from "../../../src/platform/procurement-principal-orders-api";

const prefix = "erp.procurement.principal-order-command.v1:";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PrincipalLocator = Pick<PrincipalCommand, "operation" | "key" | "orderId"> & { assignmentId?: string };
const operations: PrincipalOperation[] = ["Create", "Edit", "Cancel", "Funding", "Submit", "Decide", "Issue", "Ack", "ReleaseRequest", "ReleaseConfirm"];
export class PrincipalJournalError extends Error {}

/** Only a scoped locator is persisted. Command bodies, evidence references and amounts never enter storage. */
export const principalOrderJournal = {
  read(scope: string): PrincipalLocator | null {
    let raw: string | null;
    try { raw = sessionStorage.getItem(prefix + scope); }
    catch { throw new PrincipalJournalError("Order recovery storage is unavailable. Saving is paused."); }
    if (raw === null) return null;
    let value: unknown; try { value = JSON.parse(raw); } catch { throw new PrincipalJournalError("An order result needs review before another save."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrincipalJournalError("An order result needs review before another save.");
    const row = value as Record<string, unknown>;
    if (!operations.includes(row.operation as PrincipalOperation) || !uuid.test(String(row.key))
      || row.orderId !== null && !uuid.test(String(row.orderId))
      || row.assignmentId !== undefined && !uuid.test(String(row.assignmentId))
      || Object.keys(row).some(key => !["operation", "key", "orderId", "assignmentId"].includes(key)))
      throw new PrincipalJournalError("An order result needs review before another save.");
    return row as PrincipalLocator;
  },
  claim(scope: string, command: PrincipalCommand): PrincipalLocator {
    if (this.read(scope)) throw new PrincipalJournalError("Check the earlier order result before saving again.");
    const locator: PrincipalLocator = { operation: command.operation, key: command.key, orderId: command.orderId,
      ...(command.assignmentId ? { assignmentId: command.assignmentId } : {}) };
    const stored = JSON.stringify(locator);
    try { sessionStorage.setItem(prefix + scope, stored);
      if (sessionStorage.getItem(prefix + scope) !== stored) throw new Error("Storage verification failed"); }
    catch { throw new PrincipalJournalError("Order recovery storage is unavailable. Saving is paused."); }
    return locator;
  },
  clear(scope: string, locator: PrincipalLocator) {
    const current = this.read(scope);
    if (!current || current.key !== locator.key || current.operation !== locator.operation)
      throw new PrincipalJournalError("The saved command reference changed. Reconciliation is required.");
    try { sessionStorage.removeItem(prefix + scope); }
    catch { throw new PrincipalJournalError("The saved command reference could not be cleared."); }
  },
};
