import { afterEach, describe, expect, it, vi } from "vitest";
import { PolicyActionError, createPolicy, getPolicy, updatePolicy } from "../../../src/platform/procurement-policy-api";
import { claimAuthorityCreateGuard, readAuthorityCreateGuard } from "./authority-create-guard";
import { parsePlanPolicy } from "./plan-review-policy-editor";
import { settlePlanPolicyCommand } from "./plan-review-policy-command";
const company = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const store = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } }; };
afterEach(() => { vi.unstubAllGlobals(); });
describe("Plan operational policy known rejection recovery", () => {
  it.each([400, 401, 403, 404, 409, 422])("clears only a known no-commit rejection %s and requires a fresh read", status => {
    const storage = store(); expect(claimAuthorityCreateGuard("plan", storage)).toBe(true);
    expect(settlePlanPolicyCommand("plan", { confirmed: false, error: new PolicyActionError("Rejected", status) }, storage))
      .toEqual({ guard: "clear", rejected: true, needsFreshRead: true });
  });
  it.each([0, 408, 429, 499, 500, 502, 503])("retains the pending marker for uncertain status %s", status => {
    const storage = store(); claimAuthorityCreateGuard("plan", storage);
    expect(settlePlanPolicyCommand("plan", { confirmed: false, error: new PolicyActionError("Unconfirmed", status) }, storage).guard).toBe("pending");
    expect(claimAuthorityCreateGuard("plan", storage)).toBe(false);
  });
  it.each([undefined, null, new TypeError("Response lost")])("never treats unknown thrown values as success (%s)", error => {
    const storage = store(); claimAuthorityCreateGuard("plan", storage);
    expect(settlePlanPolicyCommand("plan", { confirmed: false, error }, storage).guard).toBe("pending");
  });
  it("allows a rejected403 editor to reopen a fresh saved version without an automatic POST replay", async () => {
    const storage = store(), marker = "plan";
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company }) });
    const draft = { policyKey: "PROCUREMENT_PLAN_REVIEW", rulesJson: JSON.stringify({ schemaVersion: 2, stages: [{ purpose: "Review", mode: "Any", requiredApprovals: 1, assigneePrincipalIds: ["33333333-3333-4333-8333-333333333333"] }, { purpose: "Final", mode: "All", requiredApprovals: 1, assigneePrincipalIds: ["44444444-4444-4444-8444-444444444444"] }] }), effectiveFrom: "2026-11-03T00:00:00Z", effectiveTo: null };
    const saved = { ...draft, id, policyVersionNumber: 1, version: 2, state: "Draft", createdAt: "2026-11-03T00:00:00Z" };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ code: "plan-policy-configuration-denied" }), { status: 403 }));
    vi.stubGlobal("fetch", fetcher); expect(claimAuthorityCreateGuard(marker, storage)).toBe(true);
    let result;
    try { await createPolicy(company, draft); throw new Error("Expected403"); }
    catch (error) { result = settlePlanPolicyCommand(marker, { confirmed: false, error }, storage); }
    expect(result).toEqual({ guard: "clear", rejected: true, needsFreshRead: true });
    expect(fetcher).toHaveBeenCalledTimes(1); // Settling performs no network retry.
    fetcher.mockResolvedValue(new Response(JSON.stringify(saved))); const fresh = await getPolicy(company, id);
    expect(fresh.version).toBe(2); expect(parsePlanPolicy(fresh.rulesJson)).not.toBeNull(); expect(readAuthorityCreateGuard(marker, storage)).toBe("clear");
    expect(claimAuthorityCreateGuard(marker, storage)).toBe(true); // Explicit next user action after fresh GET.
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...saved, version: 3 })));
    await updatePolicy(company, id, fresh.version, draft);
    expect(fetcher.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["POST", "GET", "PUT"]);
    expect(settlePlanPolicyCommand(marker, { confirmed: true }, storage).guard).toBe("clear");
  });
});
