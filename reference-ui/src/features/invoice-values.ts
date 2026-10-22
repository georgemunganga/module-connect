import { invoiceDecimal } from "../../../shared/procurement-decimal";
export { invoiceDecimal } from "../../../shared/procurement-decimal";
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
