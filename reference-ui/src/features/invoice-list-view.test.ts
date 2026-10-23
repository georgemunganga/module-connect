import { describe, expect, it } from "vitest";
import type { InvoiceSummary } from "../../../src/platform/procurement-invoices-api";
import { compareInvoiceAmounts, invoicePageRows } from "./invoice-list-view";
const row = (id: string, invoiceNumber: string, grossAmount: string, status: InvoiceSummary["status"] = "Received"): InvoiceSummary => ({
  id, supplierId: "supplier", supplierName: id === "b" ? "Beta" : "Alpha", invoiceNumber,
  invoiceDate: "2026-10-20", currencyCode: "ZMW", grossAmount, status, intakeChannel: "Manual", version: 1,
  createdAt: `2026-10-20T00:00:0${id === "a" ? "1" : "2"}Z`,
});
describe("live invoice page presentation", () => {
  it("sorts large and fractional invoice values without Number precision loss", () => {
    expect(compareInvoiceAmounts("9007199254740993.01", "9007199254740992.99")).toBeGreaterThan(0);
    expect(compareInvoiceAmounts("1.20", "1.2")).toBe(0);
    expect(invoicePageRows([row("a", "A", "9007199254740993.01"), row("b", "B", "9007199254740992.99")], "", {}, "amount").map(x => x.id)).toEqual(["a", "b"]);
  });
  it("filters only the loaded page and leaves its source untouched", () => {
    const loaded = [row("a", "INV-1", "10.00"), row("b", "INV-2", "20.00", "Cancelled")];
    expect(invoicePageRows(loaded, "beta", { status: "Cancelled" }, "newest").map(x => x.id)).toEqual(["b"]);
    expect(loaded.map(x => x.id)).toEqual(["a", "b"]);
  });
});
