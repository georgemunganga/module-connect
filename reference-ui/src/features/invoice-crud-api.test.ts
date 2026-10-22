import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelInvoiceIntake, invoiceAllows, invoiceEditInput, updateInvoiceIntake, type InvoiceDetail } from "../../../src/platform/procurement-invoices-api";

const company = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const row: InvoiceDetail = { id, supplierId: "33333333-3333-4333-8333-333333333333", invoiceNumber: "INV-1", invoiceDate: "2026-10-22",
  currencyCode: "ZMW", grossAmount: 99999999999999.9999, netAmount: 99999999999999.9999, taxAmount: 0, status: "Received", intakeChannel: "Manual",
  version: 3, createdAt: "2026-10-22T00:00:00Z", nextStep: "Review", intakeCrudVersion: 1, allowedActions: ["Edit", "Cancel"],
  lines: [{ id: "line", lineNumber: 1, description: "Supplies", quantity: 1, unitPrice: 99999999999999.9999, taxAmount: 0,
    taxCodeRef: "TAX-A", costCenterRef: "SITE-A", exactAmounts: { quantity: "1", unitPrice: "99999999999999.9999", taxAmount: "0" } }] };
afterEach(() => vi.unstubAllGlobals());

describe("invoice CRUD contract", () => {
  it("requires explicit current backend actions and exact read aliases", () => {
    expect(invoiceAllows({ ...row, intakeCrudVersion: undefined }, "Edit")).toBe(false);
    expect(invoiceAllows({ ...row, status: "Cancelled" }, "Cancel")).toBe(false);
    expect(invoiceAllows({ ...row, allowedActions: [] }, "Edit")).toBe(false);
    expect(invoiceEditInput(row).lines[0]).toMatchObject({ unitPrice: "99999999999999.9999", taxCodeRef: "TAX-A", costCenterRef: "SITE-A" });
    expect(() => invoiceEditInput({ ...row, lines: row.lines.map(line => ({ ...line, exactAmounts: undefined })) })).toThrow("Exact invoice details");
  });
  it("sends original CAS and exact strings to the scoped update endpoint", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: id }) });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await updateInvoiceIntake(company, id, row.version, invoiceEditInput(row), "  Correct original  ");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/invoices/${id}`);
    expect(init.method).toBe("PUT"); expect(init.headers.get("X-Shell-Entity")).toBe(company); expect(init.headers.get("X-Shell-Location")).toBe(id);
    expect(JSON.parse(init.body)).toMatchObject({ version: 3, reason: "Correct original", draft: { lines: [{ unitPrice: "99999999999999.9999" }] } });
  });
  it("preserves a known stale conflict and never retries mutation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Refresh saved invoice" }), { status: 409 })); vi.stubGlobal("fetch", fetcher);
    await expect(cancelInvoiceIntake(company, id, 3, "Duplicate original")).rejects.toMatchObject({ status: 409, message: "Refresh saved invoice" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not interpret a lost cancellation response as success", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Network error")); vi.stubGlobal("fetch", fetcher);
    await expect(cancelInvoiceIntake(company, id, 3, "Duplicate original")).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
