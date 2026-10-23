import type { InvoiceSummary } from "../../../src/platform/procurement-invoices-api";
import { compareExactDecimal } from "../lib/decimal-comparison";
export { compareExactDecimal as compareInvoiceAmounts } from "../lib/decimal-comparison";

/** The endpoint is paginated; every operation here is scoped to one loaded page. */
export type InvoiceListFilters = Record<string, string>;
export type InvoiceSort = "newest" | "oldest" | "number" | "vendor" | "date" | "status" | "amount";

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
    const by = sort === "amount" ? -compareExactDecimal(left.grossAmount, right.grossAmount)
      : sort === "oldest" ? left.createdAt.localeCompare(right.createdAt)
        : sort === "number" ? left.invoiceNumber.localeCompare(right.invoiceNumber)
          : sort === "vendor" ? (left.supplierName ?? "").localeCompare(right.supplierName ?? "")
            : sort === "date" ? left.invoiceDate.localeCompare(right.invoiceDate)
              : sort === "status" ? left.status.localeCompare(right.status)
                : right.createdAt.localeCompare(left.createdAt);
    return by || left.id.localeCompare(right.id);
  });
}
