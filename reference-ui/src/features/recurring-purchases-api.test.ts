import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeRecurringPurchase, createRecurringPurchase, getRecurringPurchase, listRecurringPurchases,
  updateRecurringPurchase, validateRecurringPurchase, type RecurringPurchaseDraft,
} from "../../../src/platform/procurement-recurring-purchases-api";

const company = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const supplier = "33333333-3333-4333-8333-333333333333";
const owner = "44444444-4444-4444-8444-444444444444";
const draft: RecurringPurchaseDraft = { supplierId: supplier, supplierContractId: null,
  title: "Monthly service", frequency: "Monthly", firstCycleOn: "2026-11-01",
  lastCycleOn: "2027-10-01", nextCycleOn: "2026-11-01",
  currencyCode: "ZMW", expectedAmount: "99999999999999.9999" };
const row = { ...draft, id, number: "RPC-1", ownerWorkerId: owner, workLocationId: null,
  expectedAmount: 99999999999999.99, exactExpectedAmount: draft.expectedAmount,
  status: "Draft", version: 1, createdAt: "2026-10-22T00:00:00Z", closedAt: null, closedReason: null };
afterEach(() => vi.unstubAllGlobals());

describe("recurring purchase planning contract", () => {
  it("requires valid cycle dates, supplier and exact positive amount", () => {
    expect(validateRecurringPurchase(draft)).toBeNull();
    for (const expectedAmount of ["0", "-1", "1.00001", "100000000000000", "1e3"])
      expect(validateRecurringPurchase({ ...draft, expectedAmount })).not.toBeNull();
    expect(validateRecurringPurchase({ ...draft, nextCycleOn: "2028-01-01" })).not.toBeNull();
    expect(validateRecurringPurchase({ ...draft, supplierId: "" })).not.toBeNull();
    for (const firstCycleOn of ["2026-02-30", "0000-01-01", "2026-13-01"])
      expect(validateRecurringPurchase({ ...draft, firstCycleOn })).not.toBeNull();
  });
  it("sends exact string, captured company and branch without posting a bill", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: id }) });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const saved = await createRecurringPurchase(company, draft);
    expect(saved.expectedAmount).toBe(draft.expectedAmount);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/procurement/v1/recurring-purchases");
    expect(init.headers.get("X-Shell-Entity")).toBe(company);
    expect(init.headers.get("X-Shell-Location")).toBe(id);
    expect(JSON.parse(init.body)).toEqual(draft);
  });
  it("uses authoritative exact amount for edits and sends CAS", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(row), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...row, title: "Updated service", version: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const loaded = await getRecurringPurchase(company, id);
    expect(loaded.expectedAmount).toBe("99999999999999.9999");
    await updateRecurringPurchase(company, id, loaded.version, { ...draft,
      expectedAmount: loaded.exactExpectedAmount, title: "Updated service" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ version: 1,
      draft: { expectedAmount: "99999999999999.9999", title: "Updated service" } });
  });
  it("preserves list totals and refuses malformed success", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [row], total: 101, page: 1, pageSize: 25 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...row, exactExpectedAmount: "0" }), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await listRecurringPurchases(company)).total).toBe(101);
    await expect(createRecurringPurchase(company, draft)).rejects.toMatchObject({ status: 0 });
  });
  it("rejects a different saved identity and mismatched update fields", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...row, id: supplier }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(row), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getRecurringPurchase(company, id)).rejects.toMatchObject({ status: 0 });
    await expect(updateRecurringPurchase(company, id, 1, { ...draft, title: "Different title" })).rejects.toMatchObject({ status: 0 });
  });
  it("rejects an unadvanced revision even when submitted fields are unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 })));
    await expect(updateRecurringPurchase(company, id, 1, draft)).rejects.toMatchObject({ status: 0 });
  });
  it("rejects unconfirmed closure details and a different closure revision", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...row, status: "Closed", version: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...row, status: "Closed", version: 3,
        closedAt: "2026-10-22T00:00:00Z", closedReason: "Ended" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(closeRecurringPurchase(company, id, 1, "Ended")).rejects.toMatchObject({ status: 0 });
    await expect(closeRecurringPurchase(company, id, 1, "Ended")).rejects.toMatchObject({ status: 0 });
  });
  it("does not assume a failed close succeeded", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Refresh first" }), { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(closeRecurringPurchase(company, id, 1, "No longer needed")).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
