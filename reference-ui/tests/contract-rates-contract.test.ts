import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addOwnContractRate, getOwnContractRate, listOwnContractRates, removeOwnContractRate,
  updateOwnContractRate, validContractRateDraft, type ContractRateDraft,
} from "../../src/platform/procurement-contract-rates-api";
import { validContractCeiling } from "../../src/platform/procurement-contracts-api";

const company = "11111111-1111-4111-8111-111111111111";
const contract = "22222222-2222-4222-8222-222222222222";
const rateId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";
const draft: ContractRateDraft = { catalogItemId: null, description: "Support", unitCode: "month",
  unitPriceExact: "99999999999999.9999", maximumQuantityExact: "0.0001" };
const rate = { id: rateId, lineNumber: 1, catalogItemId: null, description: "Support",
  unitCode: "month", unitPriceExact: draft.unitPriceExact, maximumQuantityExact: "0.0001",
  status: "Active", statusReason: null, version: 1 };
afterEach(() => vi.unstubAllGlobals());

describe("contract draft rates", () => {
  it("keeps exact 18,4 text and refuses rounding or number conversion", () => {
    expect(validContractRateDraft(draft)).toBeNull();
    expect(validContractCeiling("99999999999999.9999")).toBe(true);
    for (const bad of ["100000000000000", "0.00001", "1e4", "NaN", "-1", "1.0evil"])
      expect(validContractRateDraft({ ...draft, unitPriceExact: bad })).not.toBeNull();
    expect(validContractRateDraft({ ...draft, maximumQuantityExact: "0.0000" })).not.toBeNull();
  });
  it("sends exact decimal strings and parent CAS once; a lost response triggers no retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("lost response")); vi.stubGlobal("fetch", fetch);
    await expect(addOwnContractRate(company, contract, 4, draft)).rejects.toThrow("not confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/procurement/v1/contracts/" + contract + "/rates");
    expect(JSON.parse(init.body)).toEqual({ contractVersion: 4, rate: {
      catalogItemId: null, description: "Support", unitCode: "month",
      unitPrice: "99999999999999.9999", maximumQuantity: "0.0001" } });
    expect(init.headers.get("X-Shell-Entity")).toBe(company);
  });
  it("requires matched owner-scoped list and single-row response before offering recovery", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      contractId: contract, contractVersion: 4, draftVersionId: versionId, items: [rate],
    }))).mockResolvedValueOnce(new Response(JSON.stringify({
      contractId: contract, contractVersion: 4, rate,
    }))); vi.stubGlobal("fetch", fetch);
    expect((await listOwnContractRates(company, contract)).items[0].unitPriceExact).toBe(draft.unitPriceExact);
    expect((await getOwnContractRate(company, contract, rateId)).rate.id).toBe(rateId);
    expect(fetch.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
  });
  it("rejects substituted row and stale version responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      contractId: contract, contractVersion: 5, rate: { ...rate, id: versionId, version: 2 },
    }))).mockResolvedValueOnce(new Response(JSON.stringify({
      contractId: contract, contractVersion: 5, rate: { ...rate, version: 2 },
    }))); vi.stubGlobal("fetch", fetch);
    await expect(updateOwnContractRate(company, contract, rateId, 4, 1, draft)).rejects.toThrow("did not confirm");
    await expect(removeOwnContractRate(company, contract, rateId, 4, 1, "No longer offered"))
      .rejects.toThrow("did not confirm");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
