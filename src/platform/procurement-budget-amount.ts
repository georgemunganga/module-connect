import { invoiceDecimal } from "../../shared/procurement-decimal";

/** The request base is the exact product of numeric(18,4) quantity and price. */
export function budgetEstimateExact(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,8})?$/.test(value);
}

/** The Finance check must never derive its amount from a JSON number. */
export function budgetAmountExact(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { invoiceDecimal(value); return true; }
  catch { return false; }
}

/** Smallest representable Finance amount that covers the request base. */
export function minimumBudgetCheckAmount(estimate: unknown): string | null {
  if (!budgetEstimateExact(estimate)) return null;
  const [whole, fraction = ""] = estimate.split(".");
  const firstFour = fraction.slice(0, 4).padEnd(4, "0");
  const scaled = BigInt(whole) * 10_000n + BigInt(firstFour)
    + (/[1-9]/.test(fraction.slice(4)) ? 1n : 0n);
  if (scaled > 999_999_999_999_999_999n) return null;
  return `${scaled / 10_000n}.${String(scaled % 10_000n).padStart(4, "0")}`;
}

export function validBudgetMinimum(estimate: unknown, minimum: unknown): minimum is string {
  const expected = minimumBudgetCheckAmount(estimate);
  return expected !== null && budgetAmountExact(minimum) && sameBudgetAmount(expected, minimum);
}

export function coversBudgetMinimum(checked: unknown, minimum: unknown): checked is string {
  if (!budgetAmountExact(checked) || !budgetAmountExact(minimum)) return false;
  const scaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  };
  return scaled(checked) >= scaled(minimum);
}

export function sameBudgetAmount(left: string, right: string): boolean {
  if (!budgetAmountExact(left) || !budgetAmountExact(right)) return false;
  const parts = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.padEnd(4, "0")}`;
  };
  return parts(left) === parts(right);
}

export function formatBudgetAmount(value: unknown, currency: string): string {
  if (!budgetEstimateExact(value)) return "Exact amount unavailable";
  const [whole, fraction = ""] = value.split(".");
  const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const displayedFraction = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${currency} ${grouped}.${displayedFraction}`;
}
