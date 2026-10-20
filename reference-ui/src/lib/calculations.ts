import type { Line } from "./store";
export function lineSubtotal(lines: Line[]) {
  return lines.reduce(
    (sum, line) =>
      sum +
      Math.max(0, Number(line.quantity) || 0) *
        Math.max(0, Number(line.rate) || 0),
    0,
  );
}
export function transactionTotals(
  lines: Line[],
  discount: number,
  taxRate: number,
  inclusive: boolean,
) {
  const subtotal = lineSubtotal(lines);
  const discountAmount =
    (subtotal * Math.min(100, Math.max(0, discount || 0))) / 100;
  const base = subtotal - discountAmount;
  const tax = inclusive
    ? base - base / (1 + (taxRate || 0) / 100)
    : (base * (taxRate || 0)) / 100;
  return {
    subtotal,
    discountAmount,
    tax,
    total: inclusive ? base : base + tax,
  };
}
export function validateLines(lines: Line[], requireRate = true) {
  if (!lines.length) return "Add at least one item.";
  if (lines.some((line) => !line.name.trim()))
    return "Choose an item for every line.";
  if (
    lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)
  )
    return "Quantities must be greater than zero.";
  if (
    requireRate &&
    lines.some((line) => !Number.isFinite(line.rate) || line.rate < 0)
  )
    return "Rates cannot be negative.";
  return "";
}
