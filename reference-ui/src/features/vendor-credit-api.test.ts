import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelVendorCredit, createVendorCredit, listVendorCredits, getVendorCredit, creditReadAmount, creditExactUnits, creditAllows, creditAmount, updateVendorCredit, type VendorCreditDetail } from "../../../src/platform/procurement-vendor-credits-api";
const company = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const row: VendorCreditDetail = { id, supplierInvoiceId: id, invoiceNumber: "BILL-1", supplierId: id, supplierName: "Supplier", creditNumber: "CREDIT-1", status: "Draft",
  currencyCode: "ZMW", amount: 1, exactAmount: "99999999999999.9999", version: 1, createdAt: "2026-10-22T00:00:00Z", creditCrudVersion: 1, allowedActions: ["Edit", "Cancel"], reason: "Price correction" };
afterEach(() => vi.unstubAllGlobals());
describe("invoice-linked credit contract", () => {
  it("retains exact18,4 without Number and rejects zero/overflow/excess precision", () => {
    expect(creditAmount("99999999999999.9999")).toBe("99999999999999.9999");
    for (const value of ["0", "0.0000", "-1", "1.00001", "100000000000000", "1e3", ""]) expect(() => creditAmount(value)).toThrow();
  });
  it("requires explicit current action and version, never cancelled state", () => {
    expect(creditAllows(row, "Edit")).toBe(true);
    expect(creditAllows({ ...row, creditCrudVersion: 0 }, "Edit")).toBe(false);
    expect(creditAllows({ ...row, status: "Cancelled" }, "Cancel")).toBe(false);
  });
  it.each(["Received", "HistoricalAdjusted"])("reads retained %s rows in lists/details without allowing draft mutations", async status => {
    const retained = { ...row, status, allowedActions: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [retained], total: 1, page: 1, pageSize: 25, creditCrudVersion: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(retained), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    expect((await listVendorCredits(company)).items[0].status).toBe(status);
    const detail = await getVendorCredit(company, id); expect(detail.status).toBe(status);
    expect(creditAllows(detail, "Edit")).toBe(false); expect(creditAllows(detail, "Cancel")).toBe(false);
    expect(creditAllows({ ...detail, allowedActions: ["Edit", "Cancel"] }, "Edit")).toBe(false);
  });
  it.each([{ exact: "0", legacy: 0 }, { exact: "-1.2345", legacy: -1.2345 }])("reads historical amount $exact exactly without draft authority", async ({ exact, legacy }) => {
    const retained = { ...row, status: "Received", exactAmount: exact, amount: legacy, allowedActions: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [retained], total: 1, page: 1, pageSize: 25, creditCrudVersion: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(retained), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    expect((await listVendorCredits(company)).items[0].exactAmount).toBe(exact);
    const detail = await getVendorCredit(company, id); expect(detail.exactAmount).toBe(exact);
    expect(creditAllows(detail, "Edit")).toBe(false); expect(creditAllows(detail, "Cancel")).toBe(false);
  });
  it("sorts signed exact amounts by magnitude and rejects non-model precision", () => {
    expect(creditReadAmount("-99999999999999.9999")).toBe("-99999999999999.9999");
    expect(["0", "-1.2345", "-1.1000", "1.2345"].sort((left, right) => creditExactUnits(left) < creditExactUnits(right) ? -1 : creditExactUnits(left) > creditExactUnits(right) ? 1 : 0))
      .toEqual(["-1.2345", "-1.1000", "0", "1.2345"]);
    expect(creditExactUnits("-0.1234")).toBe(-1234n);
    for (const value of ["NaN", "Infinity", "-100000000000000", "-1.00001"]) expect(() => creditReadAmount(value)).toThrow();
  });
  it("sends only actual invoice identity and exact amount under captured Core scope", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: id }) });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 201 })); vi.stubGlobal("fetch", fetcher);
    await createVendorCredit(company, { supplierInvoiceId: id, creditNumber: "CREDIT-1", amount: row.exactAmount, reason: "Price correction" });
    const [url, init] = fetcher.mock.calls[0]; expect(url).toBe("/api/procurement/v1/vendor-credits");
    expect(init.headers.get("X-Shell-Location")).toBe(id); expect(init.headers.get("X-Shell-Entity")).toBe(company);
    expect(JSON.parse(init.body)).toEqual({ supplierInvoiceId: id, creditNumber: "CREDIT-1", amount: "99999999999999.9999", reason: "Price correction" });
  });
  it("preserves original update CAS and fixed source identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...row, version: 4 }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await updateVendorCredit(company, id, 3, { creditNumber: "CREDIT-1", amount: "1.2345", reason: "Correct original" }, "Fix amount");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ version: 3, draft: { creditNumber: "CREDIT-1", amount: "1.2345", reason: "Correct original" }, reason: "Fix amount" });
  });
  it("sends bounded search and status filters to the server before paging", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25, creditCrudVersion: 1 }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await listVendorCredits(company, 1, id, undefined, { search: "Supplier & credit", status: "Draft" });
    const url = new URL(fetcher.mock.calls[0][0], "https://example.test");
    expect(url.searchParams.get("search")).toBe("Supplier & credit"); expect(url.searchParams.get("status")).toBe("Draft"); expect(url.searchParams.get("invoiceId")).toBe(id);
    await expect(listVendorCredits(company, 1, undefined, undefined, { status: "Posted" })).rejects.toMatchObject({ status: 422 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("treats a malformed successful mutation result as unconfirmed", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...row, exactAmount: "0" }), { status: 201 })); vi.stubGlobal("fetch", fetcher);
    await expect(createVendorCredit(company, { supplierInvoiceId: id, creditNumber: "CREDIT-1", amount: "1", reason: "Correct original" })).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry a stale or unconfirmed cancellation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "Refresh credit" }), { status: 409 })).mockRejectedValueOnce(new TypeError("Network lost")); vi.stubGlobal("fetch", fetcher);
    await expect(cancelVendorCredit(company, id, 3, "Withdraw" )).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(cancelVendorCredit(company, id, 3, "Withdraw" )).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
