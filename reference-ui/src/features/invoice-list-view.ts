import type { InvoiceSummary } from "../../../src/platform/procurement-invoices-api";

/** The endpoint is paginated; every operation here is scoped to one loaded page. */
export type InvoiceListFilters = Record<string, string>;
export type InvoiceSort = "newest" | "oldest" | "number" | "vendor" | "date" | "status" | "amount";

/** Compare decimal text without converting invoice amounts to binary floating point. */
export function compareInvoiceAmounts(a: number | string, b: number | string): number {
  const parts = (value: number | string) => {
    const text = String(value);
    const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
    return match ? { whole: match[1], fraction: match[2] ?? "" } : null;
  };
  const left = parts(a), right = parts(b);
  if (!left || !right) return String(a).localeCompare(String(b));
  if (left.whole.length !== right.whole.length) return left.whole.length - right.whole.length;
  const whole = left.whole.localeCompare(right.whole);
  if (whole) return whole;
  return left.fraction.padEnd(Math.max(left.fraction.length, right.fraction.length), "0")
    .localeCompare(right.fraction.padEnd(Math.max(left.fraction.length, right.fraction.length), "0"));
}

export function invoicePageRows(items: InvoiceSummary[], query: string, filters: InvoiceListFilters, sort: InvoiceSort): InvoiceSummary[] {
  const contains = (value: string, needle?: string) => !needle || value.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());
  const result = items.filter((row) => {
    const amount = String(row.grossAmount);
    return contains(`${row.invoiceNumber} ${row.supplierName ?? ""} ${row.id}`, query)
      && contains(row.invoiceNumber, filters.number)
      && contains(row.supplierName ?? "", filters.vendor)
      && contains(row.invoiceDate, filters.date)
      && (!filters.status || row.status === filters.status)
      && contains(amount, filters.amount);
  });
  return result.sort((left, right) => {
    const by = sort === "amount" ? -compareInvoiceAmounts(left.grossAmount, right.grossAmount)
      : sort === "oldest" ? left.createdAt.localeCompare(right.createdAt)
        : sort === "number" ? left.invoiceNumber.localeCompare(right.invoiceNumber)
          : sort === "vendor" ? (left.supplierName ?? "").localeCompare(right.supplierName ?? "")
            : sort === "date" ? left.invoiceDate.localeCompare(right.invoiceDate)
              : sort === "status" ? left.status.localeCompare(right.status)
                : right.createdAt.localeCompare(left.createdAt);
    return by || left.id.localeCompare(right.id);
  });
}
