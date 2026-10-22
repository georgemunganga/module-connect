import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupUnitReviewers, validateUnitReviewPolicy } from "../../../src/platform/procurement-policy-api";
const company = "11111111-1111-4111-8111-111111111111", principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reply = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
afterEach(() => vi.unstubAllGlobals());
describe("current Core invoice-unit reviewer lookup", () => {
  it("accepts eligible and ineligible hints without requiring employee identity", async () => {
    reply({ items: [{ principalId: principal, displayName: "Core reviewer", canReviewOriginalUnits: true }], candidateTotal: 1, offset: 0, limit: 25, isAuthority: false });
    const page = await lookupUnitReviewers(company, "Core", 0); expect(page.items[0].principalId).toBe(principal);
    const [url, init] = vi.mocked(fetch).mock.calls[0]; expect(url).toContain("/lookups/invoice-unit-reviewers?search=Core&offset=0&limit=25"); expect(init?.credentials).toBe("include");
  });
  it.each([
    { principalId: principal, displayName: "Reviewer" }, { principalId: "worker", displayName: "Reviewer", canReviewOriginalUnits: true },
    { principalId: principal, displayName: "", canReviewOriginalUnits: true },
  ])("rejects malformed name/identity/eligibility without replacing saved choices %#", async row => {
    reply({ items: [row], candidateTotal: 1, offset: 0, limit: 25, isAuthority: false }); await expect(lookupUnitReviewers(company, "", 0)).rejects.toThrow();
  });
  it("requires the actual owner validation flags and leaves incomplete drafts incomplete", async () => {
    reply({ isValid: true, issues: [], reviewConfigurationComplete: false, reviewIssues: ["InvoiceUnitReviewNamedStagesRequired"], canPublish: false, isAuthority: false });
    expect((await validateUnitReviewPolicy(company, "{}")).reviewConfigurationComplete).toBe(false);
    reply({ isValid: true, issues: [] }); await expect(validateUnitReviewPolicy(company, "{}")).rejects.toThrow();
  });
});
