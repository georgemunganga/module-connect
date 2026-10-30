/** Actor and scope bound original-key recovery for v2 invoice Create. The exact
 * bounded draft survives browser close, without credentials or auth headers. */
const prefix = "erp.procurement.invoice-capture.v2:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-zA-Z0-9._-]{1,128}$/;
const limit = 256_000;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type InvoiceCaptureScope = { tenantId: string; companyId: string; branchId: string; principalId: string };
export type InvoiceCapturePending = { operation: "CaptureV2"; key: string; body: string };
export type InvoiceCaptureJournalState = { pending: InvoiceCapturePending | null; blocked: boolean };

function slot(scope: InvoiceCaptureScope): string {
  if (!tenant.test(scope.tenantId) || ![scope.companyId, scope.branchId, scope.principalId].every(id => guid.test(id)))
    throw new Error("Choose a permitted company and branch before recording this invoice.");
  return prefix + JSON.stringify([scope.tenantId, scope.companyId, scope.branchId, scope.principalId]);
}
function validPending(value: unknown): value is InvoiceCapturePending {
  if (!object(value) || Object.keys(value).sort().join("|") !== "body|key|operation"
    || value.operation !== "CaptureV2" || typeof value.key !== "string" || !guid.test(value.key)
    || typeof value.body !== "string" || value.body.length > limit) return false;
  try {
    const draft: unknown = JSON.parse(value.body);
    return object(draft) && draft.intakeSchemaVersion === 2
      && typeof draft.supplierId === "string" && guid.test(draft.supplierId)
      && typeof draft.expectedCurrencyReferenceId === "string" && guid.test(draft.expectedCurrencyReferenceId)
      && typeof draft.expectedCurrencyRevision === "number" && Number.isSafeInteger(draft.expectedCurrencyRevision)
      && draft.expectedCurrencyRevision > 0 && typeof draft.expectedCalculationSha256 === "string"
      && /^[0-9a-f]{64}$/i.test(draft.expectedCalculationSha256) && Array.isArray(draft.lines) && draft.lines.length > 0;
  } catch { return false; }
}
function storage(provided?: Storage): Storage | null {
  try { return provided ?? (typeof window === "undefined" ? null : window.localStorage); }
  catch { return null; }
}
export const invoiceCaptureJournal = {
  read(scope: InvoiceCaptureScope, provided?: Storage): InvoiceCaptureJournalState {
    let key: string; try { key = slot(scope); } catch { return { pending: null, blocked: true }; }
    const store = storage(provided); if (!store) return { pending: null, blocked: true };
    try {
      const raw = store.getItem(key);
      if (raw === null) return { pending: null, blocked: false };
      if (raw.length > limit) return { pending: null, blocked: true };
      const parsed: unknown = JSON.parse(raw);
      if (!object(parsed) || Object.keys(parsed).sort().join("|") !== "command|scope|version"
        || parsed.version !== 2 || !object(parsed.scope)
        || Object.keys(parsed.scope).sort().join("|") !== "branchId|companyId|principalId|tenantId"
        || Object.keys(scope).some(field => parsed.scope && (parsed.scope as Record<string, unknown>)[field] !== scope[field as keyof InvoiceCaptureScope])
        || !validPending(parsed.command)) return { pending: null, blocked: true };
      return { pending: parsed.command, blocked: true };
    } catch { return { pending: null, blocked: true }; }
  },
  claim(scope: InvoiceCaptureScope, command: InvoiceCapturePending, provided?: Storage): boolean {
    const store = storage(provided); if (!store || !validPending(command) || this.read(scope, store).blocked) return false;
    let key: string; try { key = slot(scope); } catch { return false; }
    const raw = JSON.stringify({ version: 2, scope, command });
    if (raw.length > limit || new TextEncoder().encode(raw).length > limit) return false;
    try { store.setItem(key, raw); return store.getItem(key) === raw
      && this.read(scope, store).pending?.key === command.key; }
    catch { return false; }
  },
  clear(scope: InvoiceCaptureScope, command: InvoiceCapturePending, provided?: Storage): boolean {
    const store = storage(provided); if (!store || !validPending(command)) return false;
    const state = this.read(scope, store);
    // A confirmed response in an earlier view may already have cleared this
    // scope. A readable empty slot is complete; a corrupt or different one is not.
    if (!state.pending) return !state.blocked;
    if (state.pending.key !== command.key || state.pending.body !== command.body) return false;
    try { const key = slot(scope); store.removeItem(key); return store.getItem(key) === null; }
    catch { return false; }
  },
};
