import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRule, exactPolicyAmount, fromRuleJson, toRuleJson } from "./buying-rules-editor";
import { saveAuthority, validAuthorityAmount, listAuthorities, lookupAuthorities, actOnAuthority, supportedAuthorityUse, type Authority } from "../../../src/platform/procurement-authority-api";

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
    await expect(saveAuthority(company, draft, { authorityReference: "LIMIT", principalId, action: "PurchaseRequest.Approve" })).rejects.toThrow("not confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1];
    expect(JSON.parse(init.body).draft.maximumAmount).toBe("99999999999999.9999");
    expect(new Headers(init.headers).get("X-Shell-Entity")).toBe(company);
  });
});


const company = "11111111-1111-4111-8111-111111111111";
const principalId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const orderLimit = (): Authority => ({ id: grantId, authorityReference: "PO-LIMIT", authorityVersion: 1,
  principalId, principalDisplayName: "Named reviewer", action: "PurchaseOrder.Approve", permission: "procurement-po-approve",
  amountBasis: "ApprovedLineBase", maximumAmount: "99999999999999.9999", currencyCode: "ZMW",
  effectiveFrom: "2026-10-21T00:00:00.000Z", effectiveUntil: null, allBranches: true, branchRef: null,
  allDepartments: true, departmentRef: null, allCategories: true, categoryCodes: [], state: "Draft", version: 1,
  configurationOwnerPrincipalId: principalId, allowedActions: ["Edit"], previousGrantId: null, previousVersion: null });
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("purchase order setup uses the existing backend tuple", () => {
  it("roundtrips PO policy stages and exact thresholds but refuses a request-only reviewer", () => {
    const row = { ...emptyRule("PURCHASE_ORDER"), maximum: "99999999999999.9999",
      stages: [{ code: "ORDER_REVIEW", assignee: "ProcurementManager", mode: "All" as const }] };
    const json = toRuleJson("PURCHASE_ORDER", "ZMW", [row]);
    expect(json).toContain('"transactionType":"PurchaseOrder"');
    expect(json).toContain('"amountBasis":"ApprovedLineBase"');
    const loaded = fromRuleJson(json, "PURCHASE_ORDER", "ZMW")!;
    expect(loaded[0].stages).toEqual(row.stages);
    expect(toRuleJson("PURCHASE_ORDER", "ZMW", loaded)).toBe(json);
    expect(fromRuleJson(json.replace("ProcurementManager", "LineManager"), "PURCHASE_ORDER", "ZMW")).toBeNull();
    expect(() => toRuleJson("PURCHASE_ORDER", "ZMW", [{ ...row, stages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] }])).toThrow("not connected");
    expect(fromRuleJson(json.replace("ApprovedLineBase", "Gross"), "PURCHASE_ORDER", "ZMW")).toBeNull();
  });

  it("does not reinterpret an unknown policy key as purchase requests", () => {
    const pr = toRuleJson("PURCHASE_REQUEST", "ZMW", [emptyRule()]);
    expect(fromRuleJson(pr, "FUTURE_PURCHASE", "ZMW")).toBeNull();
    expect(() => toRuleJson("FUTURE_PURCHASE", "ZMW", [emptyRule()])).toThrow("not supported");
  });

  it("scopes PO lists and eligible-person lookups by the exact backend action", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ items: [orderLimit()], total: 1, page: 1, pageSize: 25,
      currentActorPrincipalId: principalId, canCreate: true, createAction: "PurchaseOrder.Approve", createAmountBasis: "ApprovedLineBase",
      scope: { branchId: null, departmentId: null, confined: false } }))
      .mockResolvedValueOnce(response({ items: [{ principalId, displayName: "Order reviewer" }], offset: 0, limit: 25, nextOffset: null }));
    vi.stubGlobal("fetch", fetch);
    await listAuthorities(company, 1, "", undefined, "PurchaseOrder.Approve");
    await lookupAuthorities(company, "people", "reviewer", 0, undefined, "PurchaseOrder.Approve");
    for (const call of fetch.mock.calls) {
      const url = new URL(call[0], "https://fixture.test");
      expect(url.searchParams.get("action")).toBe("PurchaseOrder.Approve");
      expect(new Headers(call[1].headers).get("X-Shell-Entity")).toBe(company);
    }
  });

  it("creates an exact PO limit and edits it without injecting unsupported resource fields", async () => {
    const row = orderLimit(); const fetch = vi.fn().mockImplementation(async () => response(row)); vi.stubGlobal("fetch", fetch);
    await saveAuthority(company, row, { authorityReference: row.authorityReference, principalId, action: "PurchaseOrder.Approve" });
    const create = JSON.parse(fetch.mock.calls[0][1].body);
    expect(create).toMatchObject({ action: "PurchaseOrder.Approve", draft: { amountBasis: "ApprovedLineBase", maximumAmount: "99999999999999.9999" } });
    expect(create).not.toHaveProperty("resourceKind"); expect(create).not.toHaveProperty("assigneeKind");
    await saveAuthority(company, row, { id: row.id, version: row.version, action: "PurchaseOrder.Approve" });
    const edit = JSON.parse(fetch.mock.calls[1][1].body);
    expect(edit).toMatchObject({ version: 1, draft: { amountBasis: "ApprovedLineBase" } });
    expect(edit).not.toHaveProperty("action");
  });

  it("never sends mismatched or unsupported financial tuples", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const row = orderLimit();
    await expect(saveAuthority(company, { ...row, amountBasis: "EstimatedLineBase" },
      { authorityReference: row.authorityReference, principalId, action: "PurchaseOrder.Approve" })).rejects.toThrow("do not match");
    const unknown = { ...row, amountBasis: "Gross", allowedActions: ["Activate" as const] };
    expect(supportedAuthorityUse(unknown)).toBeNull();
    await expect(actOnAuthority(company, unknown, "Activate", "Do not reinterpret")).rejects.toThrow("read-only");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves server-denied self-review actions and treats a wrong saved tuple as unconfirmed", async () => {
    const row = orderLimit(); const fetch = vi.fn().mockResolvedValue(response({ ...row, amountBasis: "EstimatedLineBase" }));
    vi.stubGlobal("fetch", fetch);
    await expect(actOnAuthority(company, { ...row, allowedActions: [] }, "Activate", "Self review is denied")).rejects.toThrow("available actions");
    expect(fetch).not.toHaveBeenCalled();
    await expect(saveAuthority(company, row, { authorityReference: row.authorityReference, principalId, action: "PurchaseOrder.Approve" })).rejects.toMatchObject({ status: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
