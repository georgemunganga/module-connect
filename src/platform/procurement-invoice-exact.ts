/** Invoice originals stay decimal text. BigInt is used only for exact local previews;
 * the backend remains authoritative and may reject totals that do not fit its schema. */
export function invoiceDecimal(value: unknown): string {
  if (typeof value !== "string" || value.length > 128) throw new Error("Use exact invoice amounts with up to four decimal places.");
  let text = value.trim();
  if (text.startsWith(".")) text = "0" + text;
  if (text.endsWith(".")) text = text.slice(0, -1);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
  if (!match) throw new Error("Use exact invoice amounts with up to four decimal places.");
  const exponent = match[4] ? parseInt(match[4], 10) : 0;
  if (Math.abs(exponent) > 64) throw new Error("The invoice amount is outside the supported range.");
  let coefficient = BigInt(match[2] + (match[3] ?? ""));
  let scale = (match[3]?.length ?? 0) - exponent;
  if (coefficient === 0n) return "0";
  if (match[1]) throw new Error("Invoice quantities, prices and tax cannot be negative.");
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale--; }
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  const digits = coefficient.toString();
  if (scale > 4 || Math.max(1, digits.length - scale) > 14)
    throw new Error("Invoice amounts must fit 18 digits with up to four decimal places, without rounding.");
  return decimalText(coefficient, scale);
}
function decimalText(coefficient: bigint, scale: number): string {
  const digits = coefficient.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") : digits;
}
function units(value: string): bigint {
  const [whole, fraction = ""] = invoiceDecimal(value).split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
}
export function invoiceTotals(lines: { quantity: string; unitPrice: string; taxAmount: string }[]) {
  let net = 0n, tax = 0n;
  for (const line of lines) {
    const quantity = units(line.quantity);
    if (quantity <= 0n) throw new Error("Enter a quantity greater than zero.");
    net += quantity * units(line.unitPrice); tax += units(line.taxAmount) * 10_000n;
  }
  return { netAmount: decimalText(net, 8), taxAmount: decimalText(tax, 8), grossAmount: decimalText(net + tax, 8) };
}
/** Group digits without IEEE754 conversion; retain significant preview digits and at least2 places. */
export function formatInvoiceDecimal(value: string): string {
  if (!/^(?:0|[1-9]\d{0,63})(?:\.\d{1,8})?$/.test(value)) throw new Error("Invalid exact invoice amount.");
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}
