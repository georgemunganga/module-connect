import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupSourcingReviewers, validateSourcingPolicy } from "../../src/platform/procurement-policy-api";

const company = "11111111-1111-4111-8111-111111111111";
const principal = "22222222-2222-4222-8222-222222222222";
function respond(body: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
  vi.stubGlobal("fetch", fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("SOURCING schema-2 settings contract", () => {
  it("accepts scoped current Core reviewer without an HRMS worker only when the host declares schema 2", async () => {
    const fetch = respond({ items: [{ principalId: principal, displayName: "Current reviewer", workerId: null }],
      total: 1, offset: 0, limit: 25, nextOffset: null, isAuthority: false,
      configurationVersion: 1, supportedSourcingRuleSchemas: [1, 2] });
    const page = await lookupSourcingReviewers(company, "Current", 0);
    expect(page.items[0].workerId).toBeNull();
    expect(page.supportedSourcingRuleSchemas).toContain(2);
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    expect(fetch.mock.calls[0][0]).toContain("/lookups/sourcing-reviewers?");
  });
  it("keeps an old reviewer lookup readable without claiming schema-2 support", async () => {
    respond({ items: [], total: 0, offset: 0, limit: 25, nextOffset: null,
      isAuthority: false, configurationVersion: 1 });
    expect((await lookupSourcingReviewers(company, "", 0)).supportedSourcingRuleSchemas).toEqual([]);
  });
  it("distinguishes savable syntax from independent-review readiness", async () => {
    const fetch = respond({ isValid: true, issues: [], reviewConfigurationComplete: false,
      reviewIssues: [{ path: "$.rules[0].result.audience.contactSelection", message: "Choose contact mode" }],
      supportedSourcingRuleSchemas: [1, 2], canPublish: false, isAuthority: false });
    const checked = await validateSourcingPolicy(company, '{"policyKey":"SOURCING"}');
    expect(checked.isValid).toBe(true);
    expect(checked.reviewConfigurationComplete).toBe(false);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(fetch.mock.calls[0][0]).toContain("/validate");
  });
});
