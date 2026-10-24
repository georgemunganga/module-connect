import type { PrincipalOrderDetail } from "../../../src/platform/procurement-principal-orders-api";
import type { ExactOrderDraft } from "../../../src/platform/procurement-order-execution-api";

const exact = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const units = (value: string): bigint | null => {
  if (!exact.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
};

/** Client guidance only; the owning Edit command repeats every source and amount check. */
export function draftEditProblem(order: PrincipalOrderDetail, draft: ExactOrderDraft): string | null {
  if (draft.supplierId !== order.supplierId || draft.currencyCode !== order.currencyCode
    || draft.lines.length !== order.lines.length)
    return "The supplier, currency and approved source lines must stay unchanged.";
  for (const [index, current] of draft.lines.entries()) {
    const original = order.lines[index];
    if (!original || current.id !== original.id || current.unitCode !== original.unitCode)
      return "The approved line and its unit must stay unchanged.";
    const quantity = units(current.quantity), price = units(current.unitPrice), tax = units(current.taxAmount);
    const priorQuantity = units(original.quantity), priorPrice = units(original.unitPrice), priorTax = units(original.taxAmount);
    if (quantity === null || price === null || tax === null || priorQuantity === null
      || priorPrice === null || priorTax === null || quantity <= 0n)
      return "Enter exact positive quantities and valid amounts with up to four decimal places.";
    if (quantity > priorQuantity || price > priorPrice || tax > priorTax
      || quantity * price > priorQuantity * priorPrice)
      return "Increasing quantity, unit price, line value or tax needs a separate approval workflow.";
  }
  return null;
}
