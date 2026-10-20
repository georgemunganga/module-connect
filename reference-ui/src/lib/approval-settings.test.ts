import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRule, exactPolicyAmount, fromRuleJson, toRuleJson } from "./buying-rules-editor";
import { saveAuthority, validAuthorityAmount } from "../../../src/platform/procurement-authority-api";

afterEach(() => vi.unstubAllGlobals());

describe("approval settings contracts", () => {
  it("preserves arbitrary supported stage codes, One/All semantics and explicit stage order", () => {
    const row = { ...emptyRule(), stages: [
      { code: "NEED", assignee: "LineManager", mode: "One" as const },
      { code: "PROC", assignee: "ProcurementManager", mode: "All" as const },
    ] };
    const json = toRuleJson("PURCHASE_REQUEST", "ZMW", [row]);
    const loaded = fromRuleJson(json, "PURCHASE_REQUEST", "ZMW")!;
    expect(loaded[0].stages).toEqual(row.stages);
    expect(JSON.parse(toRuleJson("PURCHASE_REQUEST", "ZMW", loaded))).toEqual(JSON.parse(json));
  });

  it("refuses unsupported policy fields instead of silently dropping their controls", () => {
    const document = JSON.parse(toRuleJson("PURCHASE_REQUEST", "ZMW", [emptyRule()]));
    document.rules[0].result.approvalStages[0].delegation = "restricted";
    expect(fromRuleJson(JSON.stringify(document), "PURCHASE_REQUEST", "ZMW")).toBeNull();
    delete document.rules[0].result.approvalStages[0].delegation;
    document.rules[0].when.branchIds = ["11111111-1111-4111-8111-111111111111"];
    expect(fromRuleJson(JSON.stringify(document), "PURCHASE_REQUEST", "ZMW")).toBeNull();
    document.rules[0].when.branchIds = [];
    document.rules[0].result.approvalStages[0].assignee = "BudgetOwner";
    expect(fromRuleJson(JSON.stringify(document), "PURCHASE_REQUEST", "ZMW")).toBeNull();
  });

  it("reads and writes exact numeric policy threshold tokens before JSON.parse can round them", () => {
    const json = toRuleJson("PURCHASE_REQUEST", "ZMW", [{ ...emptyRule(), minimum: "99999999999999.9998", maximum: "99999999999999.9999" }]);
    expect(json).toContain('"minimumAmountInclusive":99999999999999.9998');
    expect(json).toContain('"maximumAmountExclusive":99999999999999.9999');
    const rows = fromRuleJson(json, "PURCHASE_REQUEST", "ZMW")!;
    expect(rows[0].minimum).toBe("99999999999999.9998"); expect(rows[0].maximum).toBe("99999999999999.9999");
    expect(toRuleJson("PURCHASE_REQUEST", "ZMW", rows)).toBe(json);
    expect(fromRuleJson(json.replace("99999999999999.9999", "99999999999999.99999"), "PURCHASE_REQUEST", "ZMW")).toBeNull();
    expect(() => exactPolicyAmount("100000000000000")).toThrow();
  });

  it("does not treat escaped numeric field names inside quoted text as monetary tokens", () => {
    const row = { ...emptyRule(), method: 'minimumAmountInclusive: "100000000000000"', minimum: "1.0001" };
    const json = toRuleJson("PURCHASE_REQUEST", "ZMW", [row]);
    const loaded = fromRuleJson(json, "PURCHASE_REQUEST", "ZMW")!;
    expect(loaded[0].minimum).toBe("1.0001"); expect(loaded[0].method).toBe(row.method.trim().toUpperCase());
  });

  it.each(["100000000000000", "1.00001", "1e3", "Infinity", "-1", "0"])("does not accept invalid active limit %s", (value) => {
    expect(validAuthorityAmount(value)).toBe(false);
  });

  it("transports the exact18,4 maximum as a string and never automatically retries an interrupted create", async () => {
    const company = "11111111-1111-4111-8111-111111111111", principalId = "22222222-2222-4222-8222-222222222222";
    const fetch = vi.fn().mockRejectedValue(new TypeError("interrupted")); vi.stubGlobal("fetch", fetch);
    const draft = { currencyCode: "ZMW", amountBasis: "EstimatedLineBase" as const, maximumAmount: "99999999999999.9999",
      effectiveFrom: "2026-10-21T00:00:00.000Z", effectiveUntil: null, allBranches: true, branchRef: null,
      allDepartments: true, departmentRef: null, allCategories: true, categoryCodes: [] };
    expect(validAuthorityAmount(draft.maximumAmount)).toBe(true);
    await expect(saveAuthority(company, draft, { authorityReference: "LIMIT", principalId })).rejects.toThrow("not confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1];
    expect(JSON.parse(init.body).draft.maximumAmount).toBe("99999999999999.9999");
    expect(new Headers(init.headers).get("X-Shell-Entity")).toBe(company);
  });
});
