import { boundedNonnegativeDecimal, invoiceDecimal } from "./procurement-invoice-exact";
import { parseFinancialJson } from "./procurement-invoice-json";

export function budgetSourceAmount(value: unknown): string {
  try { return boundedNonnegativeDecimal(value, 38, 8); }
  catch { throw new Error("The request amount is not a supported exact value. Refresh it before checking funding."); }
}
export function budgetCheckedAmount(value: unknown): string {
  try { return invoiceDecimal(value); }
  catch { throw new Error("Enter the amount checked by Finance with up to four decimal places, without rounding."); }
}
/** Only an exact representable source amount may be suggested. No ceiling or currency rounding. */
export function defaultBudgetCheckedAmount(source: string): string {
  try { return budgetCheckedAmount(budgetSourceAmount(source)); } catch { return ""; }
}
function units8(value: string): bigint {
  const [whole, fraction = ""] = budgetSourceAmount(value).split(".");
  return BigInt(whole + fraction.padEnd(8, "0"));
}
export function budgetAmountCoversSource(checked: string, source: string): boolean {
  return units8(budgetCheckedAmount(checked)) >= units8(source);
}
const fields = new Map<string, (value: string) => string>([["estimatedAmount", budgetSourceAmount], ["checkedAmount", budgetCheckedAmount]]);
export function parseBudgetJson(text: string): unknown { return parseFinancialJson(text, fields); }
