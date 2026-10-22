import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogPriceCanEdit, catalogPriceEditDraft, updateCatalogPrice, type CatalogPrice } from "../../../src/platform/procurement-items-api";
const company = "11111111-1111-4111-8111-111111111111", item = "22222222-2222-4222-8222-222222222222";
const priceId = "33333333-3333-4333-8333-333333333333", vendor = "44444444-4444-4444-8444-444444444444";
const price: CatalogPrice = { id: priceId, catalogItemId: item, supplierId: vendor, currencyCode: "ZMW", unitCode: "each",
  unitPrice: 1, minimumQuantity: null, maximumQuantity: 2, taxBasis: "Exclusive", audienceCode: "STAFF",
  effectiveFrom: "2026-10-22T12:34:56.123456Z", effectiveTo: null, status: "Draft", version: 3, catalogEditVersion: 1,
  exactAmounts: { unitPrice: "99999999999999.9999", minimumQuantity: null, maximumQuantity: "2.0001" } };
afterEach(() => vi.unstubAllGlobals());
describe("existing catalog price edit contract", () => {
  it("takes exact companion values and preserves complete saved terms rather than numeric display approximations", () => {
    const draft = catalogPriceEditDraft(price);
    expect(draft.unitPrice).toBe("99999999999999.9999"); expect(draft.maximumQuantity).toBe("2.0001");
    expect(draft).toMatchObject({ taxBasis: "Exclusive", audienceCode: "STAFF", minimumQuantity: null,
      effectiveFrom: "2026-10-22T12:34:56.123456Z", effectiveTo: null, supplierId: vendor });
  });
  it("does not infer complete editable terms from older readable DTOs or missing fields", () => {
    expect(catalogPriceCanEdit({ ...price, catalogEditVersion: undefined })).toBe(false);
    expect(catalogPriceCanEdit({ ...price, exactAmounts: undefined })).toBe(false);
    const incomplete = { ...price }; delete incomplete.taxBasis;
    expect(catalogPriceCanEdit(incomplete)).toBe(false);
    expect(catalogPriceCanEdit({ ...price, status: "Published" })).toBe(false);
  });
  it("rejects malformed exact facts and unsafe versions without financial Number coercion", () => {
    expect(catalogPriceCanEdit({ ...price, exactAmounts: { ...price.exactAmounts!, unitPrice: "1.00001" } })).toBe(false);
    expect(catalogPriceCanEdit({ ...price, version: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(catalogPriceCanEdit({ ...price, effectiveFrom: "unknown" })).toBe(false);
  });
  it("PUTs original CAS and exact strings through captured Core scope, never posts a replacement price", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: vendor }) });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...price, version: 4 }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const draft = catalogPriceEditDraft(price); await updateCatalogPrice(company, item, priceId, 3, draft);
    expect(fetcher).toHaveBeenCalledTimes(1); const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/items/${item}/catalog-entries/${priceId}`); expect(init.method).toBe("PUT");
    expect(init.headers.get("X-Shell-Entity")).toBe(company); expect(init.headers.get("X-Shell-Location")).toBe(vendor);
    expect(JSON.parse(init.body)).toEqual({ version: 3, entry: draft });
    expect(JSON.parse(init.body).entry.unitPrice).toBe("99999999999999.9999");
  });
  it("a wrong saved target or revision is unconfirmed rather than a successful correction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...price, catalogItemId: vendor, version: 4 }), { status: 200 })));
    await expect(updateCatalogPrice(company, item, priceId, 3, catalogPriceEditDraft(price))).rejects.toMatchObject({ status: 0 });
  });
  it("does not retry stale or interrupted corrections", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "Refresh this catalog price" }), { status: 409 }))
      .mockRejectedValueOnce(new TypeError("Lost response")); vi.stubGlobal("fetch", fetcher);
    await expect(updateCatalogPrice(company, item, priceId, 3, catalogPriceEditDraft(price))).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(updateCatalogPrice(company, item, priceId, 3, catalogPriceEditDraft(price))).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
