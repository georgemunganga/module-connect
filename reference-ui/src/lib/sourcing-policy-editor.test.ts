import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRule, exactPolicySample, fromRuleJson, toRuleJson, type RuleRow } from "./buying-rules-editor";
import { createPolicy, lookupSelectedSourcingReviewers, lookupSourcingReviewers, PolicyApiError } from "../../../src/platform/procurement-policy-api";

const company = "11111111-1111-4111-8111-111111111111", person = "22222222-2222-4222-8222-222222222222";
function chosen(): RuleRow {
  return { ...emptyRule("SOURCING"), minimum: "99999999999999.9998", maximum: "99999999999999.9999",
    sourcing: { quotes: "0", invited: "0", pack: false, criteria: false, deadline: false, companyWide: true },
    stages: [{ code: "COMMERCIAL", assignee: "ProcurementManager", mode: "All", principalIds: [person] }] };
}
afterEach(() => vi.unstubAllGlobals());
describe("sourcing rule editor", () => {
  it("requires explicit controls, counts, scope, named people and decision mode before serialization", () => {
    expect(() => toRuleJson("SOURCING", "ZMW", [emptyRule("SOURCING")])).toThrow();
    for (const patch of [{ sourcing: { ...chosen().sourcing!, pack: null } }, { sourcing: { ...chosen().sourcing!, invited: "" } },
      { stages: [{ code: "COMMERCIAL", assignee: "ProcurementManager", mode: "" as const, principalIds: [person] }] },
      { stages: [{ code: "COMMERCIAL", assignee: "ProcurementManager", mode: "One" as const, principalIds: [] }] }])
      expect(() => toRuleJson("SOURCING", "ZMW", [{ ...chosen(), ...patch }])).toThrow();
  });
  it("roundtrips exact 18,4 threshold tokens, zero/false controls and ordered named One/All steps", () => {
    const row = chosen(); row.stages.push({ code: "FINAL", assignee: "ProcurementManager", mode: "One", principalIds: [person] });
    const json = toRuleJson("SOURCING", "ZMW", [row]);
    expect(json).toContain('"maximumAmountExclusive":99999999999999.9999');
    expect(json).toContain('"minimumQuoteCount":0'); expect(json).toContain('"requirementsPackRequired":false');
    const loaded = fromRuleJson(json, "SOURCING", "ZMW")!;
    expect(loaded[0].stages).toEqual(row.stages); expect(loaded[0].sourcing).toEqual(row.sourcing);
    expect(toRuleJson("SOURCING", "ZMW", loaded)).toBe(json);
  });
  it("preserves unsupported branch-specific, unknown and duplicate JSON as read-only", () => {
    const json = toRuleJson("SOURCING", "ZMW", [chosen()]);
    expect(fromRuleJson(json.replace('"branchIds":[]', `"branchIds":["${company}"]`), "SOURCING", "ZMW")).toBeNull();
    expect(fromRuleJson(json.replace('"requirementsPackRequired":false', '"requirementsPackRequired":false,"other":true'), "SOURCING", "ZMW")).toBeNull();
    expect(fromRuleJson(json.replace('"requirementsPackRequired":false', '"requirementsPackRequired":false,"requirementsPackRequired":true'), "SOURCING", "ZMW")).toBeNull();
    expect(fromRuleJson(json, "SOURCING", "USD")).toBeNull();
  });
  it("rejects raw monetary precision loss and out-of-bound controls instead of rewriting originals", () => {
    expect(() => toRuleJson("SOURCING", "ZMW", [{ ...chosen(), maximum: "1.00001" }])).toThrow();
    for (const sourcing of [{ ...chosen().sourcing!, quotes: "21" }, { ...chosen().sourcing!, invited: "101" }])
      expect(() => toRuleJson("SOURCING", "ZMW", [{ ...chosen(), sourcing }])).toThrow();
    const json = toRuleJson("SOURCING", "ZMW", [chosen()]);
    expect(fromRuleJson(json.replace("99999999999999.9999", "99999999999999.99999"), "SOURCING", "ZMW")).toBeNull();
    expect(exactPolicySample("0.00000001", true)).toBe(1e-8);
    expect(() => exactPolicySample("99999999999999.9999", true)).toThrow();
  });
  it("does not change purchase request/order serialization or accept unsupported assignments", () => {
    for (const key of ["PURCHASE_REQUEST", "PURCHASE_ORDER"]) {
      const json = toRuleJson(key, "ZMW", [emptyRule(key)]);
      expect(toRuleJson(key, "ZMW", fromRuleJson(json, key, "ZMW")!)).toBe(json);
    }
    const json = toRuleJson("SOURCING", "ZMW", [chosen()]);
    expect(fromRuleJson(json.replace('"assignee":"ProcurementManager"', '"assignee":"BudgetOwner"'), "SOURCING", "ZMW")).toBeNull();
  });
});

const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const page = () => ({ items: [{ principalId: person, displayName: "Named person", workerId: company }],
  total: 1, offset: 0, limit: 25, nextOffset: null, isAuthority: false, configurationVersion: 1 });
describe("sourcing configuration transport", () => {
  it("requires an explicit supported owner-readiness version, never mere lookup success", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ ...page(), configurationVersion: undefined }))
      .mockResolvedValueOnce(response({ ...page(), configurationVersion: 2 })).mockResolvedValueOnce(response(page()));
    vi.stubGlobal("fetch", fetch);
    await expect(lookupSourcingReviewers(company, "Name", 0)).rejects.toThrow();
    await expect(lookupSourcingReviewers(company, "Name", 0)).rejects.toThrow();
    await expect(lookupSourcingReviewers(company, "Name", 0)).resolves.toMatchObject({ configurationVersion: 1 });
    const [url, init] = fetch.mock.calls[2];
    expect(String(url)).toContain("search=Name"); expect(new Headers(init.headers).get("X-Shell-Entity")).toBe(company);
  });
  it("resolves only requested off-page labels and rejects unrelated echoes or invented paging", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(page()))
      .mockResolvedValueOnce(response({ ...page(), items: [{ principalId: company, workerId: company, displayName: "Unrequested person" }] }))
      .mockResolvedValueOnce(response({ ...page(), nextOffset: 25, total: 30 }));
    vi.stubGlobal("fetch", fetch);
    await expect(lookupSelectedSourcingReviewers(company, [person])).resolves.toMatchObject({ items: [{ principalId: person }] });
    const [url, init] = fetch.mock.calls[0];
    const query = new URL(String(url), "https://fixture.test").searchParams;
    expect(query.get("principalIds")).toBe(person); expect(query.get("search")).toBe(""); expect(query.get("offset")).toBe("0");
    expect(new Headers(init.headers).get("X-Shell-Entity")).toBe(company);
    await expect(lookupSelectedSourcingReviewers(company, [person])).rejects.toThrow();
    await expect(lookupSelectedSourcingReviewers(company, [person])).rejects.toThrow();
    await expect(lookupSelectedSourcingReviewers(company, [person, person])).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("retains missing/revoked labels as an empty scoped result rather than echoing private names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...page(), items: [], total: 0 })));
    await expect(lookupSelectedSourcingReviewers(company, [person])).resolves.toMatchObject({ items: [], total: 0 });
  });
  it("does not automatically retry an uncertain policy create and distinguishes known denial", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Independent reviewer required" }), { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const draft = { policyKey: "SOURCING", effectiveFrom: "2026-11-01T00:00:00Z", effectiveTo: null, rulesJson: toRuleJson("SOURCING", "ZMW", [chosen()]) };
    await expect(createPolicy(company, draft)).rejects.toMatchObject({ unconfirmed: true, status: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(createPolicy(company, draft)).rejects.toBeInstanceOf(PolicyApiError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
