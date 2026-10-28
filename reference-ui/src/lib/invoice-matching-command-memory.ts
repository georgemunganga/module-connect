import type { InvoiceMatchingRecovery } from "../../../src/platform/procurement-invoice-matching-api";

/** A scoped, tab-lifetime locator claimed before POST. It carries only IDs,
 * operation and expected version for GET-only receipt recovery after reload. */
const prefix = "procurement:invoice-matching:pending:v1:";
const key = (scope: string) => prefix + scope;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (value: unknown): value is InvoiceMatchingRecovery => {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<InvoiceMatchingRecovery>;
  const ownLineIds = command.ownLineIds;
  return (command.operation === "InvoiceMapping" || command.operation === "InvoiceCompare")
    && typeof command.invoiceId === "string" && uuid.test(command.invoiceId)
    && typeof command.key === "string" && uuid.test(command.key)
    && typeof command.expectedVersion === "number" && Number.isSafeInteger(command.expectedVersion) && command.expectedVersion > 0
    && Array.isArray(ownLineIds) && ownLineIds.length <= 200
    && ownLineIds.every((id) => typeof id === "string" && uuid.test(id))
    && new Set(ownLineIds).size === ownLineIds.length
    && (command.operation === "InvoiceMapping"
      ? typeof command.purchaseOrderId === "string" && uuid.test(command.purchaseOrderId)
        && typeof command.issuedVersionId === "string" && uuid.test(command.issuedVersionId) && command.mappingVersionId === null
      : typeof command.mappingVersionId === "string" && uuid.test(command.mappingVersionId)
        && command.purchaseOrderId === null && command.issuedVersionId === null)
    && (command.sourceSchemaVersion === undefined ? command.principalPins === undefined
      : command.sourceSchemaVersion === 3 && (command.operation === "InvoiceCompare" ? command.principalPins === undefined
        : Array.isArray(command.principalPins) && command.principalPins.length === ownLineIds.length
        && command.principalPins.every((pin) => pin && typeof pin.invoiceLineId === "string" && uuid.test(pin.invoiceLineId)
          && ownLineIds.includes(pin.invoiceLineId) && typeof pin.purchaseOrderLineId === "string" && uuid.test(pin.purchaseOrderLineId)
          && (pin.principalReceivingSourceStateId === null && pin.principalReceivingFactId === null
            || typeof pin.principalReceivingSourceStateId === "string" && uuid.test(pin.principalReceivingSourceStateId)
              && typeof pin.principalReceivingFactId === "string" && uuid.test(pin.principalReceivingFactId))
          && Object.keys(pin).every((key) => ["invoiceLineId", "purchaseOrderLineId", "principalReceivingSourceStateId", "principalReceivingFactId"].includes(key)))
        && new Set(command.principalPins.map((pin) => pin.invoiceLineId)).size === ownLineIds.length
        && command.principalPins.every((pin, at) => at === 0 || command.principalPins![at - 1].invoiceLineId.localeCompare(pin.invoiceLineId) < 0)))
    && Object.keys(command).every((key) => ["operation", "invoiceId", "key", "expectedVersion", "ownLineIds",
      "purchaseOrderId", "issuedVersionId", "mappingVersionId", "sourceSchemaVersion", "principalPins"].includes(key));
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
  if (!current.command || current.command.key !== command.key
    || current.command.sourceSchemaVersion === 3 && JSON.stringify(current.command) !== JSON.stringify(command)) return false;
  try {
    sessionStorage.removeItem(key(scope));
    return sessionStorage.getItem(key(scope)) === null;
  } catch { return false; }
}
