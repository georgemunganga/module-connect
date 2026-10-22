import { afterEach, describe, expect, it, vi } from "vitest";
import { canRetirePolicyDraft, retirePolicyDraft, type PolicyPage } from "../../../src/platform/procurement-policy-api";
const company = "11111111-1111-4111-8111-111111111111";
const id = "99999999-9999-4999-8999-999999999999";
const record: PolicyPage["items"][number] = { id, policyKey: "PURCHASE_REQUEST", policyVersionNumber: 1,
  state: "Draft", version: 2, effectiveFrom: "2026-12-01T00:00:00Z", effectiveTo: null,
  createdAt: "2026-10-22T00:00:00Z", draftRetirementVersion: 1, canRetireDraft: true };
afterEach(() => vi.unstubAllGlobals());
describe("unused buying policy draft retirement", () => {
  it("requires explicit versioned owner action metadata and safe CAS", () => {
    expect(canRetirePolicyDraft(record)).toBe(true);
    for (const changed of [{ draftRetirementVersion: undefined }, { canRetireDraft: undefined },
      { canRetireDraft: false }, { draftRetirementVersion: 2 }, { state: "Published" },
      { state: "PendingReview" }, { version: Number.MAX_SAFE_INTEGER + 1 }])
      expect(canRetirePolicyDraft({ ...record, ...changed })).toBe(false);
  });
  it("posts only the scoped saved ID/CAS and explicit trimmed reason", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company }) });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...record, state: "Retired", version: 3, rulesJson: "{}" })));
    vi.stubGlobal("fetch", fetcher); await retirePolicyDraft(company, record, "  Duplicate  ");
    expect(fetcher).toHaveBeenCalledTimes(1); const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/configuration/policies/${id}/retire`);
    expect(init.method).toBe("POST"); expect(JSON.parse(init.body)).toEqual({ version: 2, reason: "Duplicate" });
    expect(init.headers.get("X-Shell-Entity")).toBe(company);
  });
  it("never posts an absent backend action or invalid reason", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(retirePolicyDraft(company, { ...record, canRetireDraft: undefined }, "Unused")).rejects.toMatchObject({ status: 409 });
    await expect(retirePolicyDraft(company, record, " ")).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cannot confirm another policy or wrong CAS as the saved result", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...record, state: "Retired", version: 4, rulesJson: "{}" })));
    vi.stubGlobal("fetch", fetcher);
    await expect(retirePolicyDraft(company, record, "Unused")).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains stale status without automatically retrying", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Refresh draft" }), { status: 409 })); vi.stubGlobal("fetch", fetcher);
    await expect(retirePolicyDraft(company, record, "Unused")).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("lost response is unconfirmed rather than success or a repeat POST", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Interrupted")); vi.stubGlobal("fetch", fetcher);
    await expect(retirePolicyDraft(company, record, "Unused")).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
