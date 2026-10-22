import type { InvoiceMatchingCommand } from "../../../src/platform/procurement-invoice-matching-api";

/** A scoped, tab-lifetime command marker. It is claimed before POST and never
 * replays a command automatically. The original key/body permit GET-only
 * recovery of the server's idempotent receipt after a reload. */
const prefix = "procurement:invoice-matching:pending:v1:";
const key = (scope: string) => prefix + scope;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (value: unknown): value is InvoiceMatchingCommand => {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<InvoiceMatchingCommand>;
  return (command.operation === "InvoiceMapping" || command.operation === "InvoiceCompare")
    && typeof command.invoiceId === "string" && uuid.test(command.invoiceId)
    && typeof command.key === "string" && uuid.test(command.key)
    && typeof command.body === "string" && command.body.length <= 100_000
    && Array.isArray(command.ownLineIds) && command.ownLineIds.length <= 200
    && command.ownLineIds.every((id) => typeof id === "string" && uuid.test(id));
};
export type PendingInvoiceCommand = { command: InvoiceMatchingCommand | null; blocked: boolean };
export function readPendingInvoiceMatching(scope: string): PendingInvoiceCommand {
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (raw === null) return { command: null, blocked: false };
    const command: unknown = JSON.parse(raw);
    return valid(command) ? { command, blocked: true } : { command: null, blocked: true };
  } catch { return { command: null, blocked: true }; }
}
export function claimPendingInvoiceMatching(scope: string, command: InvoiceMatchingCommand): boolean {
  if (!valid(command) || readPendingInvoiceMatching(scope).blocked) return false;
  try {
    const stored = JSON.stringify(command);
    sessionStorage.setItem(key(scope), stored);
    return sessionStorage.getItem(key(scope)) === stored;
  } catch { return false; }
}
export function clearPendingInvoiceMatching(scope: string, command: InvoiceMatchingCommand): boolean {
  const current = readPendingInvoiceMatching(scope);
  if (!current.command || current.command.key !== command.key) return false;
  try {
    sessionStorage.removeItem(key(scope));
    return sessionStorage.getItem(key(scope)) === null;
  } catch { return false; }
}
