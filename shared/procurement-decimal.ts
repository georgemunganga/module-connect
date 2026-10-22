/** Pure exact18,4 input validation; owning APIs retain authoritative validation. */
export function invoiceDecimal(value: string | number, positive = false): string {
  const text = String(value);
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(text))
    throw new Error("Use a non-negative amount with up to 14 whole digits and 4 decimal places.");
  if (positive && !/[1-9]/.test(text)) throw new Error("Quantity must be greater than zero.");
  return text;
}
