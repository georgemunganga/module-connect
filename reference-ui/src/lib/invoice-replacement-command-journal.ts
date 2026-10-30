import { readInvoiceReplacementInput, readInvoiceReplacementResult,
  type InvoiceReplacementResult } from "../../../src/platform/procurement-invoices-api";
import type { InvoiceCaptureScope } from "./invoice-capture-command-journal";

/** Exact correction command recovery only; never credentials, auth headers or
 * policy authority. Company, branch, principal and original invoice stay bound.
 * Backend uniqueness/transactions govern concurrent browsers, not this journal.
 *
 * M6E integration hold: before exposing a correction form, provide explicit
 * resolution for a definite original-POST validation rejection (for example422),
 * tied to the current authenticated scope and the exact original key/body. It
 * must be separate from uncertain original-key recovery:403/404, transport and
 * proxy outcomes cannot release a pending command. Do not add a generic reset
 * or silently reuse the shared HTTP-rejection list as permission to discard. */
const prefix = "erp.procurement.invoice-replacement.v1:";
const limit = 256_000;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-zA-Z0-9._-]{1,128}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonzeroGuid = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
export type InvoiceReplacementScope = InvoiceCaptureScope & { sourceInvoiceId: string };
export type InvoiceReplacementPending = { operation: "InvoiceReplaceV2"; key: string; body: string };
export type InvoiceReplacementJournalState = { pending: InvoiceReplacementPending | null; blocked: boolean };
function normalized(scope: InvoiceReplacementScope): InvoiceReplacementScope {
  if (Object.keys(scope).sort().join("|") !== "branchId|companyId|principalId|sourceInvoiceId|tenantId"
    || !tenant.test(scope.tenantId) || ![scope.companyId, scope.branchId, scope.principalId, scope.sourceInvoiceId].every(nonzeroGuid))
    throw new Error("Choose a permitted company, branch and source invoice before preparing a correction.");
  return { tenantId: scope.tenantId, companyId: scope.companyId.toLowerCase(), branchId: scope.branchId.toLowerCase(),
    principalId: scope.principalId.toLowerCase(), sourceInvoiceId: scope.sourceInvoiceId.toLowerCase() };
}
function slot(scope: InvoiceReplacementScope): string {
  const s = normalized(scope);
  return prefix + JSON.stringify([s.tenantId, s.companyId, s.branchId, s.principalId, s.sourceInvoiceId]);
}
function valid(command: unknown): command is InvoiceReplacementPending {
  if (!object(command) || Object.keys(command).sort().join("|") !== "body|key|operation"
    || command.operation !== "InvoiceReplaceV2" || !nonzeroGuid(command.key) || typeof command.body !== "string") return false;
  try { readInvoiceReplacementInput(command.body); return true; } catch { return false; }
}
function storage(provided?: Storage): Storage | null {
  try { return provided ?? (typeof window === "undefined" ? null : window.localStorage); }
  catch { return null; }
}
const bounded = (raw: string): boolean => raw.length <= limit && new TextEncoder().encode(raw).length <= limit;
export const invoiceReplacementJournal = {
  read(scope: InvoiceReplacementScope, provided?: Storage): InvoiceReplacementJournalState {
    let key: string; let s: InvoiceReplacementScope;
    try { s = normalized(scope); key = slot(s); } catch { return { pending: null, blocked: true }; }
    const store = storage(provided); if (!store) return { pending: null, blocked: true };
    try {
      const raw = store.getItem(key);
      if (raw === null) return { pending: null, blocked: false };
      if (!bounded(raw)) return { pending: null, blocked: true };
      const parsed: unknown = JSON.parse(raw);
      if (!object(parsed) || Object.keys(parsed).sort().join("|") !== "command|scope|version"
        || parsed.version !== 1 || !object(parsed.scope)
        || Object.keys(parsed.scope).sort().join("|") !== "branchId|companyId|principalId|sourceInvoiceId|tenantId"
        || Object.keys(s).some(field => (parsed.scope as Record<string, unknown>)[field] !== s[field as keyof InvoiceReplacementScope])
        || !valid(parsed.command)) return { pending: null, blocked: true };
      return { pending: parsed.command, blocked: true };
    } catch { return { pending: null, blocked: true }; }
  },
  claim(scope: InvoiceReplacementScope, command: InvoiceReplacementPending, provided?: Storage): boolean {
    const store = storage(provided);
    if (!store || !valid(command) || this.read(scope, store).blocked) return false;
    let key: string; let raw: string;
    try { key = slot(scope); raw = JSON.stringify({ version: 1, scope: normalized(scope), command }); }
    catch { return false; }
    if (!bounded(raw)) return false;
    try { store.setItem(key, raw); return store.getItem(key) === raw
      && this.read(scope, store).pending?.key === command.key; }
    catch { return false; }
  },
  /** The only release path needs the authenticated original201 receipt. A404,
   * network failure, changed scope or a newly constructed key cannot release it. */
  confirm(scope: InvoiceReplacementScope, command: InvoiceReplacementPending,
    result: InvoiceReplacementResult, provided?: Storage): boolean {
    const store = storage(provided); if (!store || !valid(command)) return false;
    const current = this.read(scope, store);
    if (!current.pending || current.pending.key !== command.key || current.pending.body !== command.body) return false;
    try {
      const saved = readInvoiceReplacementResult(result, normalized(scope).sourceInvoiceId, command.key);
      if (saved.invoiceNumber !== readInvoiceReplacementInput(command.body).correctedInvoice.invoiceNumber.trim()) return false;
      const key = slot(scope); store.removeItem(key); return store.getItem(key) === null;
    } catch { return false; }
  },
};
