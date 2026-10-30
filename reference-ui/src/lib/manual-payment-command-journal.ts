import { approvalBrowserTabNonce } from "./request-approval-journal";
import { readManualPaymentValidationAcknowledgment, manualPaymentValidationAcknowledgmentMatches,
  type ManualPaymentValidationAcknowledgment, type ManualPaymentCommand, type ManualPaymentAction, type ManualPaymentReceipt,
  type ManualPaymentScope } from "../../../src/platform/procurement-manual-payments-api";

/** Browser recovery metadata only. Never store payment amount, reason, external
 * reference, bank data, request JSON, or credentials. */
export type ManualPaymentRecoveryLocator = { key: string; action: ManualPaymentAction; id: string | null };
export type ManualPaymentRecoveryState = { pending: ManualPaymentRecoveryLocator | null; blocked: boolean };
// Volatile UI acknowledgment state only; not persisted server authority. Reloads
// retain the pending locator and must recover its original result, never re-POST.
const reportedValidation = new Map<string, { locator: ManualPaymentRecoveryLocator; acknowledgment: ManualPaymentValidationAcknowledgment }>();
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "erp.procurement.manual-payment-command.v1:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
const actions: readonly string[] = ["Create", "Revise", "Submit", "Approve", "Return", "Reject",
  "Record", "Confirm", "Dispute", "Cancel"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const valid = (value: unknown): value is ManualPaymentRecoveryLocator => object(value)
  && Object.keys(value).length === 3 && ["key", "action", "id"].every(key => Object.hasOwn(value, key))
  && id(value.key) && typeof value.action === "string" && actions.includes(value.action)
  && (value.action === "Create" ? value.id === null : id(value.id));

/** The existing tab nonce seals old journals after a public auth-context change. */
export function manualPaymentRecoverySlot(scope: ManualPaymentScope, tabNonce: string): string {
  if (!id(tabNonce) || !id(scope.identity.principalId) || !id(scope.identity.legalEntityId))
    throw new Error("Payment recovery context is unavailable.");
  return prefix + JSON.stringify([scope.identity.tenantId, scope.identity.principalId,
    scope.identity.legalEntityId, scope.identity.branchId, scope.identity.authEpoch, tabNonce]);
}

export function createManualPaymentRecoveryJournal(scope: ManualPaymentScope,
  store: Store = sessionStorage, nonce?: string) {
  const tabNonce = nonce ?? approvalBrowserTabNonce(scope.identity.tenantId, scope.identity.principalId);
  const slot = tabNonce ? manualPaymentRecoverySlot(scope, tabNonce) : null;
  const state = (): ManualPaymentRecoveryState => {
    if (!scope.current() || !slot) return { pending: null, blocked: true };
    try {
      const raw = store.getItem(slot);
      if (raw === null) return { pending: null, blocked: false };
      if (raw.length > 512) return { pending: null, blocked: true };
      const parsed: unknown = JSON.parse(raw);
      if (!object(parsed) || Object.keys(parsed).length !== 2 || parsed.slot !== slot || !valid(parsed.locator))
        return { pending: null, blocked: true };
      return { pending: parsed.locator, blocked: true };
    } catch { return { pending: null, blocked: true }; }
  };
  return {
    state,
    claim(locator: ManualPaymentRecoveryLocator): boolean {
      if (!valid(locator) || state().blocked || !slot) return false;
      try {
        reportedValidation.delete(slot);
        const text = JSON.stringify({ slot, locator });
        store.setItem(slot, text);
        const saved = state().pending;
        return store.getItem(slot) === text && saved !== null && JSON.stringify(saved) === JSON.stringify(locator);
      } catch { return false; }
    },
    /** Clear only after a parsed server result is bound to this key/action/id. */
    confirm(locator: ManualPaymentRecoveryLocator, receipt: ManualPaymentReceipt): boolean {
      const saved = state().pending;
      if (!valid(locator) || !saved || JSON.stringify(saved) !== JSON.stringify(locator) || !slot
        || receipt.commandKey !== locator.key || receipt.action !== locator.action || !id(receipt.id)
        || locator.id !== null && receipt.id !== locator.id) return false;
      try { store.removeItem(slot); reportedValidation.delete(slot); return store.getItem(slot) === null; }
      catch { return false; }
    },
    /** Reporting preserves the original key; only a live, exact first-send
     * validation witness permits the explicit Review entries acknowledgment. */
    reportValidation(locator: ManualPaymentRecoveryLocator, error: unknown, command: ManualPaymentCommand): boolean {
      const saved = state().pending;
      if (!valid(locator) || !saved || JSON.stringify(saved) !== JSON.stringify(locator) || !slot
        || command.key !== locator.key || command.action !== locator.action
        || (command.action === "Create" ? null : command.id) !== locator.id
        ) return false;
      const acknowledgment = readManualPaymentValidationAcknowledgment(error, scope, command);
      if (!acknowledgment) return false;
      reportedValidation.set(slot, { locator: { ...locator }, acknowledgment });
      return true;
    },
    canReviewEntries(): boolean {
      const saved = state().pending; const reported = slot ? reportedValidation.get(slot) : undefined;
      return !!saved && !!reported && JSON.stringify(saved) === JSON.stringify(reported.locator)
        && manualPaymentValidationAcknowledgmentMatches(reported.acknowledgment, scope, reported.locator);
    },
    acknowledgeValidation(locator: ManualPaymentRecoveryLocator): boolean {
      const saved = state().pending; const reported = slot ? reportedValidation.get(slot) : undefined;
      if (!valid(locator) || !saved || !reported || !slot
        || JSON.stringify(saved) !== JSON.stringify(locator) || JSON.stringify(reported.locator) !== JSON.stringify(locator)
        || !manualPaymentValidationAcknowledgmentMatches(reported.acknowledgment, scope, reported.locator)) return false;
      try { store.removeItem(slot); reportedValidation.delete(slot); return store.getItem(slot) === null; }
      catch { return false; }
    },
  };
}
