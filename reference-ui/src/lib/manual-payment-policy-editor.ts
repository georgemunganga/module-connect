import { invoiceDecimal } from "../../../shared/procurement-decimal";

/** Typed projection of the owner-defined MANUAL_PAYMENT_REVIEW v1 document. */
export type ManualPaymentLimit = { currencyCode: string; maximumExact: string };
export const emptyManualPaymentLimit = (): ManualPaymentLimit => ({ currencyCode: "", maximumExact: "" });
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");

export function serializeManualPaymentPolicy(rows: ManualPaymentLimit[]): string {
  if (rows.length < 1 || rows.length > 32)
    throw new Error("Set an explicit maximum for one to 32 currencies.");
  const maximumByCurrency: Record<string, string> = {};
  for (const row of rows) {
    const currency = row.currencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || Object.hasOwn(maximumByCurrency, currency))
      throw new Error("Use distinct three-letter currency codes for payment review limits.");
    try { maximumByCurrency[currency] = invoiceDecimal(row.maximumExact, true); }
    catch { throw new Error("Enter a positive exact maximum with up to 14 whole digits and four decimal places."); }
  }
  return JSON.stringify({ schemaVersion: 1, identitySchemaVersion: 2,
    policyKey: "MANUAL_PAYMENT_REVIEW", transactionType: "ManualPaymentReview",
    approvalType: "SingleApprover", independentCreatorApprover: true,
    independentRecorderConfirmer: true, maximumByCurrency });
}

/** Unknown or incomplete older policies remain visible but read-only. */
export function parseManualPaymentPolicy(json: string): ManualPaymentLimit[] | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 16384) return null;
    const doc: unknown = JSON.parse(json);
    if (!object(doc) || !keys(doc, ["schemaVersion", "identitySchemaVersion", "policyKey",
      "transactionType", "approvalType", "independentCreatorApprover", "independentRecorderConfirmer", "maximumByCurrency"])
      || doc.schemaVersion !== 1 || doc.identitySchemaVersion !== 2
      || doc.policyKey !== "MANUAL_PAYMENT_REVIEW" || doc.transactionType !== "ManualPaymentReview"
      || doc.approvalType !== "SingleApprover" || doc.independentCreatorApprover !== true
      || doc.independentRecorderConfirmer !== true || !object(doc.maximumByCurrency)) return null;
    const rows = Object.entries(doc.maximumByCurrency).map(([currencyCode, maximumExact]) => {
      if (typeof maximumExact !== "string") throw new Error("Invalid limit");
      return { currencyCode, maximumExact };
    });
    serializeManualPaymentPolicy(rows);
    return rows;
  } catch { return null; }
}
