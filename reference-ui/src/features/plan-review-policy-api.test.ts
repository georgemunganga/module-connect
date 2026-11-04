import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolicy, decidePolicy, getEffectivePolicy, listPolicies, lookupPlanPolicyReviewers, lookupSelectedPlanPolicyReviewers,
  submitPolicyReview, updatePolicy, validatePlanReviewPolicy } from "../../../src/platform/procurement-policy-api";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222";
const reviewer = "aaaa3333-3333-4333-8333-333333333333", final = "44444444-4444-4444-8444-444444444444", policy = "55555555-5555-4555-8555-555555555555";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const page = (purpose: "Review" | "Final", items: any[] = [{ principalId: reviewer, displayName: "Current reviewer" }], extra = {}) => ({ purpose, items, candidateTotal: items.length, offset: 0, limit: 25, isAuthority: false, ...extra });
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch }) }); });
afterEach(() => { vi.unstubAllGlobals(); });
describe("Plan policy current Core people contract", () => {
  it.each(["Review", "Final"] as const)("uses the purpose-filtered Plan lookup for %s without a worker or sourcing permission", async purpose => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page(purpose))); vi.stubGlobal("fetch", fetcher);
    const value = await lookupPlanPolicyReviewers(company, purpose, "Current", 0);
    expect(value.items[0].principalId).toBe(reviewer);
    const [url, init] = fetcher.mock.calls[0] as any;
    expect(url).toContain("/lookups/plan-reviewers?purpose=" + purpose); expect(url).not.toContain("sourcing-reviewers");
    expect(init.credentials).toBe("include"); expect(new Headers(init.headers).get("X-Shell-Location")).toBe(branch);
  });
  it("retains omitted unavailable IDs for generic name labels without substituting another person", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page("Review", [{ principalId: reviewer, displayName: "Current reviewer" }], { limit: 50 }))); vi.stubGlobal("fetch", fetcher);
    expect((await lookupSelectedPlanPolicyReviewers(company, "Review", [reviewer, final])).items).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toContain("principalIds=" + reviewer + "%2C" + final);
    fetcher.mockResolvedValue(json(page("Review", [{ principalId: policy, displayName: "Wrong person" }], { limit: 50 })));
    await expect(lookupSelectedPlanPolicyReviewers(company, "Review", [reviewer])).rejects.toThrow();
  });
  it("rejects invalid/duplicate hydration before HTTP", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const ids of [[], [reviewer, reviewer], [reviewer.toUpperCase()], [""], Array.from({ length: 51 }, () => reviewer)]) {
      await expect(lookupSelectedPlanPolicyReviewers(company, "Final", ids)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains exact eligible candidate totals and rejects a wrong purpose or fake authority marker", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page("Review", Array.from({ length: 5 }, (_, n) => ({ principalId: `66666666-6666-4666-8666-${String(n + 1).padStart(12, "0")}`, displayName: `Current ${n}` })), { candidateTotal: 30, offset: 25 }))));
    expect((await lookupPlanPolicyReviewers(company, "Review", "", 25)).candidateTotal).toBe(30);
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page("Final")))); await expect(lookupPlanPolicyReviewers(company, "Review", "", 0)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(page("Review", [], { isAuthority: true })))); await expect(lookupPlanPolicyReviewers(company, "Review", "", 0)).rejects.toThrow();
  });
  it("preserves the bounded-search error so the existing picker asks for a narrower name", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ code: "plan-reviewer-search-required", message: "Narrow the name search." }, 422)));
    await expect(lookupPlanPolicyReviewers(company, "Review", "", 0)).rejects.toMatchObject({ status: 422, code: "plan-reviewer-search-required" });
  });
});
describe("existing policy command reuse for Plan", () => {
  const rulesJson = JSON.stringify({ schemaVersion: 2, stages: [{ purpose: "Review", mode: "Any", requiredApprovals: 1, assigneePrincipalIds: [reviewer] }, { purpose: "Final", mode: "All", requiredApprovals: 1, assigneePrincipalIds: [final] }] });
  const record = (state = "Draft", version = 1) => ({ id: policy, policyKey: "PROCUREMENT_PLAN_REVIEW", policyVersionNumber: 1, state, version,
    effectiveFrom: "2026-11-03T12:30:00.123456Z", effectiveTo: null, rulesJson, createdAt: "2026-11-03T12:00:00Z" });
  it("maps Plan key listing/effective status to existing scoped policy APIs", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ items: [record()], total: 1, page: 1, pageSize: 25 })); vi.stubGlobal("fetch", fetcher);
    await listPolicies(company, undefined, "PROCUREMENT_PLAN_REVIEW"); expect(fetcher.mock.calls[0][0]).toContain("key=PROCUREMENT_PLAN_REVIEW");
    fetcher.mockResolvedValue(json({ status: "Effective", isAuthority: false, policy: { id: policy, policyVersionNumber: 1 } }));
    await getEffectivePolicy(company, "PROCUREMENT_PLAN_REVIEW"); expect(fetcher.mock.calls[1][0]).toContain("/effective?key=PROCUREMENT_PLAN_REVIEW");
  });
  it("validates the Plan string-issue format without implying publication or authority", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ isValid: false, issues: ["Choose independent people."], canPublish: false, isAuthority: false })));
    expect(await validatePlanReviewPolicy(company, rulesJson)).toEqual({ isValid: false, issues: [{ path: "", message: "Choose independent people." }], canPublish: false, isAuthority: false });
  });
  it("uses the existing create/update/review/independent publish routes without a second engine", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(record())); vi.stubGlobal("fetch", fetcher);
    const draft = { policyKey: "PROCUREMENT_PLAN_REVIEW", effectiveFrom: record().effectiveFrom, effectiveTo: null, rulesJson };
    await createPolicy(company, draft); await updatePolicy(company, policy, 1, draft);
    fetcher.mockResolvedValue(json(record("PendingReview", 3))); await submitPolicyReview(company, policy, 2, "Independent policy review");
    fetcher.mockResolvedValue(json(record("Published", 4))); await decidePolicy(company, policy, 3, "publish", "Approved configuration");
    expect(fetcher.mock.calls.map((x: any) => new URL(x[0], "https://example.test").pathname)).toEqual([
      "/api/procurement/v1/configuration/policies", `/api/procurement/v1/configuration/policies/${policy}`,
      `/api/procurement/v1/configuration/policies/${policy}/submit-review`, `/api/procurement/v1/configuration/policies/${policy}/publish`]);
    expect(JSON.parse((fetcher.mock.calls[0] as any)[1].body).rulesJson).not.toMatch(/currencyCode|threshold/);
  });
});
