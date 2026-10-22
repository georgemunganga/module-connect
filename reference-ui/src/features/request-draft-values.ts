import { invoicePreview } from "./invoice-values";
import type { RequestLineDraft } from "../../../src/platform/procurement-requests-api";
/** Reuse exact BigInt scale8 products/sums. PR preview excludes discounts/tax/delivery. */
export function requestBaseAmount(lines: RequestLineDraft[]): string {
  return invoicePreview(lines.map(line => ({ quantity: line.requestedQuantity,
    unitPrice: line.estimatedUnitPrice, taxAmount: "0" }))).net;
}
export function formatRequestBaseAmount(value: string): string {
  const [whole, fraction] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
}
