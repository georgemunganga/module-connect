import { validateRfqRecoveryReference, type RfqRecoveryReference } from "../../../src/platform/procurement-sourcing-execution-api";
export const rfqJournalPrefix = "erp.rfq.recovery.v1:";
const unavailable = () => new Error("Saved-result recovery storage is unavailable or invalid. No new save will be sent. Keep this tab and ask Procurement to reconcile the original save reference.");
/** Only a locator is retained. No draft, title, reason, source quantities or credentials. */
export function readRfqRecovery(slot: string, storage: Storage = sessionStorage): RfqRecoveryReference | null {
  try {
    const raw = storage.getItem(rfqJournalPrefix + slot);
    if (raw === null) return null;
    if (raw.length > 1024) throw unavailable();
    const reference = validateRfqRecoveryReference(JSON.parse(raw));
    const operation: unknown = JSON.parse(slot)[4];
    if (operation !== (reference.operation === "Create" ? "Create" : `Cancel:${reference.eventId}`)) throw unavailable();
    return reference;
  } catch { throw unavailable(); }
}
export function writeRfqRecovery(slot: string, value: RfqRecoveryReference | null, storage: Storage = sessionStorage): void {
  try {
    const key = rfqJournalPrefix + slot;
    if (value === null) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw unavailable();
    } else {
      const reference = validateRfqRecoveryReference(value);
      const encoded = JSON.stringify(reference);
      const existing = readRfqRecovery(slot, storage);
      if (existing && JSON.stringify(existing) !== encoded) throw unavailable();
      storage.setItem(key, encoded);
      if (storage.getItem(key) !== encoded || readRfqRecovery(slot, storage) === null) throw unavailable();
    }
  } catch { throw unavailable(); }
}
