import { quotationReference, type QuotationReference } from "../../../src/platform/procurement-quotation-api";
const prefix = "erp.quotation.recovery.v1:";
const invalid = () => new Error("The original quotation save needs reconciliation. Keep its reference and ask Procurement for help.");
export function readQuotationRecovery(slot: string, storage: Storage = sessionStorage): QuotationReference | null {
  try { const raw = storage.getItem(prefix + slot); if (raw === null) return null; if (raw.length > 400) throw invalid(); return quotationReference(JSON.parse(raw)); } catch { throw invalid(); }
}
export function writeQuotationRecovery(slot: string, value: QuotationReference | null, storage: Storage = sessionStorage): void {
  try {
    const name = prefix + slot;
    if (value === null) { storage.removeItem(name); if (storage.getItem(name) !== null) throw invalid(); return; }
    const ref = quotationReference(value), old = readQuotationRecovery(slot, storage), encoded = JSON.stringify(ref);
    if (old && JSON.stringify(old) !== encoded) throw invalid();
    storage.setItem(name, encoded); if (storage.getItem(name) !== encoded) throw invalid();
  } catch { throw invalid(); }
}
