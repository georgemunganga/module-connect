/** Exact manual invoice inputs; server owns authoritative totals and validation. */
export function invoiceDecimal(value: string | number, positive = false): string {
  const text = String(value);
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(text))
    throw new Error("Use a non-negative amount with up to 14 whole digits and 4 decimal places.");
  if (positive && !/[1-9]/.test(text)) throw new Error("Quantity must be greater than zero.");
  return text;
}
function units(value: string | number): bigint {
  const [whole, fraction = ""] = invoiceDecimal(value).split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
function decimal(value: bigint, scale: number): string {
  const text = value.toString().padStart(scale + 1, "0");
  return `${text.slice(0, -scale)}.${text.slice(-scale)}`.replace(/\.?0+$/, "") || "0";
}
export function invoicePreview(lines: Array<{ quantity: string | number; unitPrice: string | number; taxAmount: string | number }>) {
  let net = 0n, tax = 0n;
  for (const line of lines) {
    invoiceDecimal(line.quantity, true);
    net += units(line.quantity) * units(line.unitPrice);
    tax += units(line.taxAmount) * 10000n;
  }
  return { net: decimal(net, 8), tax: decimal(tax, 8), total: decimal(net + tax, 8) };
}
