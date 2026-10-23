import { invoiceDecimal } from "../../shared/procurement-decimal";

/** The Finance check must never derive its amount from a JSON number. */
export function budgetAmountExact(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { invoiceDecimal(value); return true; }
  catch { return false; }
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
  if (!budgetAmountExact(value)) return "Exact amount unavailable";
  const [whole, fraction = ""] = value.split(".");
  const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const displayedFraction = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${currency} ${grouped}.${displayedFraction}`;
}
