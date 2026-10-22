import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogExactUnitPrice, listPublishedCatalog } from "../../../src/platform/procurement-catalog-api";
import { invoiceDecimal as oldInvoiceDecimal } from "./invoice-values";
import { invoiceDecimal } from "../../../shared/procurement-decimal";
const company = "11111111-1111-4111-8111-111111111111";
const row = { entryId: company, itemId: company, supplierId: company, name: "Published item", code: "ITEM", kind: "Goods",
  categoryCode: "OFFICE", unitCode: "each", currencyCode: "ZMW", supplierName: "Supplier", publishedVersion: 1 };
afterEach(() => vi.unstubAllGlobals());
describe("published catalog exact owner companion", () => {
  it("preserves wide18,4 and all four fractional digits without financial number coercion", () => {
    expect(catalogExactUnitPrice("99999999999999.9999")).toBe("99999999999999.9999");
    expect(catalogExactUnitPrice("100.1234")).toBe("100.1234");
    expect(catalogExactUnitPrice("0")).toBe("0");
  });
  it("missing legacy companion stays unavailable instead of deriving it from rounded numeric display", () => {
    expect(catalogExactUnitPrice(undefined)).toBeUndefined(); expect(catalogExactUnitPrice(null)).toBeUndefined();
    expect(catalogExactUnitPrice(12345678901234.568)).toBeUndefined();
  });
  it("invalid owner strings are not presented as exact values", () => {
    for (const value of ["-1", "1.00001", "100000000000000", "1E-04", "01", " NaN ", "", "0.00001"])
      expect(catalogExactUnitPrice(value)).toBeUndefined();
  });
  it("retains exact owner string when legacy numeric JSON lexeme exceeds JS precision", async () => {
    const prefix = JSON.stringify({ ...row, exactEstimatedUnitPrice: "99999999999999.9999" }).slice(0, -1);
    const fetcher = vi.fn().mockResolvedValue(new Response(`{"items":[${prefix},"estimatedUnitPrice":99999999999999.9999}],"total":1,"page":1,"pageSize":25}`));
    vi.stubGlobal("fetch", fetcher);
    const page = await listPublishedCatalog(company);
    expect(page.items[0].exactEstimatedUnitPrice).toBe("99999999999999.9999"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps browsing rows with missing or malformed optional companion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { ...row, estimatedUnitPrice: 100.1234 }, { ...row, estimatedUnitPrice: 100, exactEstimatedUnitPrice: "100.00001" },
    ], total: 2, page: 1, pageSize: 25 }))));
    const page = await listPublishedCatalog(company); expect(page.items).toHaveLength(2);
    expect(page.items.every(item => item.exactEstimatedUnitPrice === undefined)).toBe(true);
  });
  it("extraction preserves existing invoice validator function and acceptance behavior", () => {
    expect(oldInvoiceDecimal).toBe(invoiceDecimal); expect(oldInvoiceDecimal("0.0001", true)).toBe("0.0001");
    expect(() => oldInvoiceDecimal("0", true)).toThrow(); expect(() => oldInvoiceDecimal("1.00001")).toThrow();
    expect(oldInvoiceDecimal(1)).toBe("1");
  });
});
