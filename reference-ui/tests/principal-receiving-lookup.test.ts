import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupReceivingReferences, lookupSelectedReceivingReferences } from "../../src/platform/procurement-policy-api";

const company = "11111111-1111-4111-8111-111111111111";
const principal = "22222222-2222-4222-8222-222222222222";
const response = (row = { id: principal, principalId: principal, displayName: "Core reviewer", code: null }) =>
  new Response(JSON.stringify({ kind: "principals", companyId: company, items: [row], total: 1,
    offset: 0, limit: 25, nextOffset: null, isAuthority: false, canAcceptDelivery: false }),
  { status: 200, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("principal receiving named-account lookup", () => {
  it("uses the bounded current Core account directory and retains selected names", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response()); vi.stubGlobal("fetch", fetcher);
    const page = await lookupReceivingReferences(company, "principals", "Core", 0);
    expect(page.items[0]).toMatchObject({ id: principal, principalId: principal, displayName: "Core reviewer" });
    expect(page.items[0]).not.toHaveProperty("workerId");
    expect(String(fetcher.mock.calls[0][0])).toContain("/lookups/receiving/principals?");
    const selected = await lookupSelectedReceivingReferences(company, "principals", [principal]);
    expect(selected.items[0].id).toBe(principal);
    expect(String(fetcher.mock.calls[1][0])).toContain(`ids=${principal}`);
  });
  it("rejects a substituted principal ID or unexpected authority claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response({ id: principal, principalId: company, displayName: "Other", code: null })));
    await expect(lookupReceivingReferences(company, "principals", "", 0)).rejects.toThrow("Current receiving names");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ kind: "principals", companyId: company,
      items: [{ id: principal, principalId: principal, displayName: "Core reviewer", code: null }],
      total: 1, offset: 0, limit: 25, nextOffset: null, isAuthority: true, canAcceptDelivery: false }), { status: 200 })));
    await expect(lookupReceivingReferences(company, "principals", "", 0)).rejects.toThrow("Current receiving names");
  });
});
