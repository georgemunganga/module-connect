import type { InvoiceMatchingRecovery } from "../../../src/platform/procurement-invoice-matching-api";

/** A scoped, tab-lifetime locator claimed before POST. It carries only IDs,
 * operation and expected version for GET-only receipt recovery after reload. */
const prefix = "procurement:invoice-matching:pending:v1:";
const key = (scope: string) => prefix + scope;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (value: unknown): value is InvoiceMatchingRecovery => {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<InvoiceMatchingRecovery>;
  return (command.operation === "InvoiceMapping" || command.operation === "InvoiceCompare")
    && typeof command.invoiceId === "string" && uuid.test(command.invoiceId)
    && typeof command.key === "string" && uuid.test(command.key)
    && typeof command.expectedVersion === "number" && Number.isSafeInteger(command.expectedVersion) && command.expectedVersion > 0
    && Array.isArray(command.ownLineIds) && command.ownLineIds.length <= 200
    && command.ownLineIds.every((id) => typeof id === "string" && uuid.test(id))
    && new Set(command.ownLineIds).size === command.ownLineIds.length
    && (command.operation === "InvoiceMapping"
      ? typeof command.purchaseOrderId === "string" && uuid.test(command.purchaseOrderId)
        && typeof command.issuedVersionId === "string" && uuid.test(command.issuedVersionId) && command.mappingVersionId === null
      : typeof command.mappingVersionId === "string" && uuid.test(command.mappingVersionId)
        && command.purchaseOrderId === null && command.issuedVersionId === null)
    && Object.keys(command).every((key) => ["operation", "invoiceId", "key", "expectedVersion", "ownLineIds",
      "purchaseOrderId", "issuedVersionId", "mappingVersionId"].includes(key));
};
export type PendingInvoiceCommand = { command: InvoiceMatchingRecovery | null; blocked: boolean };
export function readPendingInvoiceMatching(scope: string): PendingInvoiceCommand {
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (raw === null) return { command: null, blocked: false };
    const command: unknown = JSON.parse(raw);
    return valid(command) ? { command, blocked: true } : { command: null, blocked: true };
  } catch { return { command: null, blocked: true }; }
}
export function claimPendingInvoiceMatching(scope: string, command: InvoiceMatchingRecovery): boolean {
  if (!valid(command) || readPendingInvoiceMatching(scope).blocked) return false;
  try {
    const stored = JSON.stringify(command);
    sessionStorage.setItem(key(scope), stored);
    return sessionStorage.getItem(key(scope)) === stored;
  } catch { return false; }
}
export function clearPendingInvoiceMatching(scope: string, command: InvoiceMatchingRecovery): boolean {
  const current = readPendingInvoiceMatching(scope);
  if (!current.command || current.command.key !== command.key) return false;
  try {
    sessionStorage.removeItem(key(scope));
    return sessionStorage.getItem(key(scope)) === null;
  } catch { return false; }
}
