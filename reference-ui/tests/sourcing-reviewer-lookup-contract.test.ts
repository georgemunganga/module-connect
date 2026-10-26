import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupSelectedSourcingReviewers, lookupSourcingReviewers } from "../../src/platform/procurement-policy-api";
const company = "11111111-1111-4111-8111-111111111111";
const person = "22222222-2222-4222-8222-222222222222";
const body = { items: [{ principalId: person, displayName: "Core reviewer", workerId: null }], total: 1,
  offset: 0, limit: 25, nextOffset: null, isAuthority: false, configurationVersion: 1,
  supportedSourcingRuleSchemas: [1, 2] };
afterEach(() => vi.unstubAllGlobals());
describe("schema-aware sourcing reviewer lookup", () => {
  it("accepts a scoped workerless Core reviewer only through explicit schema 2", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", fetch);
    expect((await lookupSourcingReviewers(company, "Core", 0, undefined, 2)).items[0].workerId).toBeNull();
    expect(fetch.mock.calls[0][0]).toContain("schemaVersion=2");
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    await expect(lookupSourcingReviewers(company, "Core", 0)).rejects.toThrow();
  });
  it("resolves retained schema-2 selections through the same scoped route", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", fetch);
    expect((await lookupSelectedSourcingReviewers(company, [person], undefined, 2)).items[0].principalId).toBe(person);
    expect(fetch.mock.calls[0][0]).toContain("schemaVersion=2");
    expect(fetch.mock.calls[0][0]).toContain(`principalIds=${person}`);
  });
});
