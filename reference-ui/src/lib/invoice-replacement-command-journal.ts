import { readInvoiceReplacementInput, readInvoiceReplacementResult, isInvoiceReplacementValidationRejection,
  normalizeReplacementCommandScope, type InvoiceReplacementCommandScope, type InvoiceReplacementResult } from "../../../src/platform/procurement-invoices-api";

/** Exact correction command recovery only; never credentials, auth headers or
 * policy authority. Company, branch, principal and original invoice stay bound.
 * Backend uniqueness/transactions govern concurrent browsers, not this journal.
 *
 * A known firstPOST validation-failed422 has a separate explicit review path.
 * 403/404, unknown409, transport and proxy outcomes cannot release a pending
 * command. No generic reset or shared rejection-list discard is supported. */
const prefix = "erp.procurement.invoice-replacement.v1:";
const limit = 520_000; // One bounded original command plus an exact local422 marker.
const pendingLimit = 256_000;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonzeroGuid = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
export type InvoiceReplacementScope = InvoiceReplacementCommandScope;
export type InvoiceReplacementPending = { operation: "InvoiceReplaceV2"; key: string; body: string };
export type InvoiceReplacementJournalState = { pending: InvoiceReplacementPending | null; blocked: boolean; validationRejected?: true };
function normalized(scope: InvoiceReplacementScope): InvoiceReplacementScope {
  return normalizeReplacementCommandScope(scope);
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
const bounded = (raw: string, max = limit): boolean => raw.length <= max && new TextEncoder().encode(raw).length <= max;
function validRejection(note: unknown, scope: InvoiceReplacementScope, command: InvoiceReplacementPending): boolean {
  return object(note) && Object.keys(note).sort().join("|") === "body|code|key|kind|scope|status"
    && note.kind === "OriginalPostValidationRejected" && note.status === 422 && note.code === "validation-failed"
    && note.key === command.key && note.body === command.body && object(note.scope)
    && Object.keys(note.scope).sort().join("|") === "branchId|companyId|principalId|sourceInvoiceId|tenantId"
    && Object.keys(scope).every(key => (note.scope as Record<string, unknown>)[key] === scope[key as keyof InvoiceReplacementScope]);
}
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
      if (!object(parsed) || !["command|scope|version", "command|rejection|scope|version"].includes(Object.keys(parsed).sort().join("|"))
        || parsed.version !== 1 || !object(parsed.scope)
        || Object.keys(parsed.scope).sort().join("|") !== "branchId|companyId|principalId|sourceInvoiceId|tenantId"
        || Object.keys(s).some(field => (parsed.scope as Record<string, unknown>)[field] !== s[field as keyof InvoiceReplacementScope])
        || !valid(parsed.command) || parsed.rejection !== undefined && !validRejection(parsed.rejection, s, parsed.command)) return { pending: null, blocked: true };
      return { pending: parsed.command, blocked: true, ...(parsed.rejection ? { validationRejected: true as const } : {}) };
    } catch { return { pending: null, blocked: true }; }
  },
  claim(scope: InvoiceReplacementScope, command: InvoiceReplacementPending, provided?: Storage): boolean {
    const store = storage(provided);
    if (!store || !valid(command) || this.read(scope, store).blocked) return false;
    let key: string; let raw: string;
    try { key = slot(scope); raw = JSON.stringify({ version: 1, scope: normalized(scope), command }); }
    catch { return false; }
    if (!bounded(raw, pendingLimit)) return false;
    try { store.setItem(key, raw); return store.getItem(key) === raw
      && this.read(scope, store).pending?.key === command.key; }
    catch { return false; }
  },
  /** This is reported local UX history, NOT authenticated server authority or
   * proof of no commit after reload. It is stamped only from a live firstPOST
   * validation-failed422 witness and binds the exact scope/key/body. The server
   * still validates every later command and enforces source uniqueness. */
  noteValidationRejected(scope: InvoiceReplacementScope, command: InvoiceReplacementPending,
    cause: unknown, provided?: Storage): boolean {
    const store = storage(provided); if (!store || !valid(command)
      || !isInvoiceReplacementValidationRejection(cause, scope, command.key, command.body)) return false;
    const saved = this.read(scope, store);
    if (!saved.pending || saved.pending.key !== command.key || saved.pending.body !== command.body) return false;
    try {
      const s = normalized(scope); const raw = JSON.stringify({ version: 1, scope: s, command,
        rejection: { kind: "OriginalPostValidationRejected", status: 422, code: "validation-failed",
          scope: s, key: command.key, body: command.body } });
      if (!bounded(raw)) return false;
      store.setItem(slot(s), raw); return store.getItem(slot(s)) === raw && this.read(s, store).validationRejected === true;
    } catch { return false; }
  },
  /** Call only after explicit Review entries acknowledgement. A stored local
   * rejection note is never used to claim backend authority or a successful save. */
  reviewValidationRejected(scope: InvoiceReplacementScope, command: InvoiceReplacementPending,
    provided?: Storage, liveCause?: unknown): boolean {
    const store = storage(provided); if (!store || !valid(command)) return false;
    const saved = this.read(scope, store);
    if (!saved.pending || saved.pending.key !== command.key || saved.pending.body !== command.body
      || !(saved.validationRejected || isInvoiceReplacementValidationRejection(liveCause, scope, command.key, command.body))) return false;
    try { const key = slot(scope); store.removeItem(key); return store.getItem(key) === null; }
    catch { return false; }
  },
  /** Successful release needs the authenticated original201 receipt. A404,
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
