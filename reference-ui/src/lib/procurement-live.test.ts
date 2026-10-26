import { describe, expect, it, vi } from "vitest";
import { fetchProcurementReadiness, ProcurementLiveError } from "./procurement-live";
const entity = "00000000-0000-0000-0000-000000000001";
const branch = "00000000-0000-0000-0000-000000000002";
const worker = "00000000-0000-0000-0000-000000000003";
const principal = "00000000-0000-0000-0000-000000000004";
const capabilities = {
  vendorDraft: true, itemDraft: true, requestDraft: true, approvals: false,
  sourcing: false, contracts: false, orders: false, receiving: false,
  invoiceValidation: false, financeHandoff: false, supplierPortal: false,
  planningDraft: true, configurationDraft: true, contractDraft: true, sourcingDraft: true,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function fixture(overrides: Record<string, unknown> = {}, flags: Record<string, unknown> = {}, roles: string[] = []) {
  return vi.fn()
    .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true, roles } }))
    .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, principalId: principal,
      workerId: null, company: { id: entity, currencyCode: "ZMW" },
      permissions: ["procurement-access", "procurement-vendor-read", "procurement-vendor-create"], ...overrides }))
    .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: true,
      capabilities: { ...capabilities, ...flags } }));
}
describe("Procurement system-user readiness", () => {
  it("accepts a permissioned Core user without an employee or assumed administrator role", async () => {
    const fetcher = fixture();
    const result = await fetchProcurementReadiness({ entityId: entity, branch }, undefined, fetcher);
    expect(result.principalId).toBe(principal);
    expect(result.workerId).toBeNull();
    expect(result.adminViewOnly).toBe(false);
    expect(result.permissions).toEqual(["procurement-access", "procurement-vendor-read", "procurement-vendor-create"]);
    expect(fetcher.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity, "X-Shell-Location": branch });
    expect(fetcher.mock.calls[2][1].credentials).toBe("include");
  });
  it("requests explicit All branches only for a selected company's payment workspace", async () => {
    const all = fixture({ branch: null });
    const result = await fetchProcurementReadiness({ entityId: entity, branchScope: "all" }, undefined, all, true);
    expect(result.effectiveBranchId).toBeNull();
    expect(all.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity,
      "X-Shell-Branch-Scope": "all" });
    expect(all.mock.calls[2][1].headers).toEqual({ "X-Shell-Entity": entity,
      "X-Shell-Branch-Scope": "all" });
    const requestList = fixture({ branch: null });
    await fetchProcurementReadiness({ entityId: entity, branchScope: "all" }, undefined, requestList);
    expect(requestList.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity,
      "X-Shell-Branch-Scope": "all" });
    const selected = fixture({ branch: { id: branch } });
    await fetchProcurementReadiness({ entityId: entity, branch }, undefined, selected, true);
    expect(selected.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity,
      "X-Shell-Location": branch });
    const legacy = fixture({ branch: { id: branch } });
    await fetchProcurementReadiness({}, undefined, legacy, true);
    expect(legacy.mock.calls[1][1].headers).toEqual({});
  });
  it("refuses a default branch response for an explicit payment All request", async () => {
    await expect(fetchProcurementReadiness({ entityId: entity, branchScope: "all" }, undefined,
      fixture({ branch: { id: branch } }), true)).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("never infers All from an omitted branch or accepts All with a selected branch", async () => {
    const unset = fixture({ branch: { id: branch } });
    await fetchProcurementReadiness({ entityId: entity }, undefined, unset);
    expect(unset.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity });
    await expect(fetchProcurementReadiness({ entityId: entity, branch, branchScope: "all" },
      undefined, fixture())).rejects.toMatchObject({ code: "invalid-scope" });
  });
  it("preserves an optional employee projection without using it as the acting principal", async () => {
    const result = await fetchProcurementReadiness({ entityId: entity }, undefined, fixture({ workerId: worker }));
    expect(result.workerId).toBe(worker);
    expect(result.principalId).not.toBe(worker);
  });
  it("does not derive grants or read-only restrictions from ERP administrator roles", async () => {
    const result = await fetchProcurementReadiness({}, undefined,
      fixture({ permissions: ["procurement-access", "procurement-vendor-create"], adminViewOnly: true }, {}, ["erp_admin"]));
    expect(result.adminViewOnly).toBe(false);
    expect(result.permissions).toEqual(["procurement-access", "procurement-vendor-create"]);
  });
  it.each([
    { principalId: undefined }, { principalId: worker, workerId: "not-an-employee-id" },
    { principalId: "00000000-0000-0000-0000-000000000000" }, { principalId: "bad" },
    { company: { id: branch, currencyCode: "ZMW" } }, { company: { id: entity, currencyCode: "invalid" } },
    { permissions: [] }, { permissions: undefined }, { permissions: ["procurement-access", null] },
  ])("rejects an invalid or ungranted context %j", async overrides => {
    await expect(fetchProcurementReadiness({}, undefined, fixture(overrides))).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("rejects a company context different from the selected company", async () => {
    await expect(fetchProcurementReadiness({ entityId: branch }, undefined, fixture())).rejects.toMatchObject({ code: "invalid-response" });
  });
  it.each([undefined, false, true, "true"])("requires explicit optional workflow availability (%s)", async flag => {
    const result = await fetchProcurementReadiness({}, undefined,
      fixture({}, { invoiceOriginalUnitReview: flag, invoiceComparison: flag, vendorCreditDraft: flag }));
    expect(result.capabilities.invoiceOriginalUnitReview).toBe(flag === true);
    expect(result.capabilities.invoiceComparison).toBe(flag === true);
    expect(result.capabilities.vendorCreditDraft).toBe(flag === true);
  });
  it.each([undefined, false, true, "true"])("requires explicit recurring planning availability (%s)", async flag => {
    const result = await fetchProcurementReadiness({}, undefined, fixture({}, { recurringPurchaseDraft: flag }));
    expect(result.capabilities.recurringPurchaseDraft).toBe(flag === true);
  });
  it.each([undefined, false, true, "true", 1, null])("keeps manual payment workflow off without an explicit server flag (%s)", async flag => {
    const result = await fetchProcurementReadiness({}, undefined, fixture({}, { manualPaymentWorkflow: flag }));
    expect(result.capabilities.manualPaymentWorkflow).toBe(flag === true);
  });
  it.each([undefined, false, true, "true", 1, null])("requires explicit separate principal approval availability (%s)", async flag => {
    const result = await fetchProcurementReadiness({}, undefined, fixture({}, { principalApprovals: flag }));
    expect(result.capabilities.principalApprovals).toBe(flag === true);
    expect(result.capabilities.approvals).toBe(false);
    expect(result.capabilities.orders).toBe(false);
    expect(result.capabilities.receiving).toBe(false);
    expect(result.capabilities.financeHandoff).toBe(false);
    expect(result.workerId).toBeNull();
  });
  it.each([undefined, false, true, "true", 1, null])("keeps principal RFQ source drafts off without a real separate capability (%s)", async flag => {
    const result = await fetchProcurementReadiness({}, undefined,
      fixture({}, { principalSourcingSourceDrafts: flag, sourcingSourceDrafts: false }));
    expect(result.capabilities.principalSourcingSourceDrafts).toBe(flag === true);
    expect(result.capabilities.sourcingSourceDrafts).toBe(false);
    expect(result.workerId).toBeNull();
  });
  it("keeps old API principal approvals disabled without replacing legacy availability", async () => {
    const result = await fetchProcurementReadiness({}, undefined, fixture({}, { approvals: true }));
    expect(result.capabilities.principalApprovals).toBe(false);
    expect(result.capabilities.approvals).toBe(true);
  });
  it("retains the actual effective branch without inventing a company-wide value", async () => {
    expect((await fetchProcurementReadiness({}, undefined, fixture())).effectiveBranchId).toBeUndefined();
    expect((await fetchProcurementReadiness({}, undefined, fixture({ branch: null }))).effectiveBranchId).toBeNull();
    expect((await fetchProcurementReadiness({}, undefined, fixture({ branch: { id: branch } }))).effectiveBranchId).toBe(branch);
  });
  it.each([null, { id: entity }, { id: "not-a-uuid" }])("rejects mismatched effective selected branch %j", async value => {
    await expect(fetchProcurementReadiness({ entityId: entity, branch }, undefined, fixture({ branch: value }))).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("does not infer worker-based availability over the server's actual capabilities", async () => {
    const result = await fetchProcurementReadiness({}, undefined, fixture({}, { orders: true, approvals: true }));
    expect(result.capabilities.orders).toBe(true);
    expect(result.capabilities.approvals).toBe(true);
  });
  it("keeps existing screens ready with missing optional adapters defaulted off", async () => {
    const result = await fetchProcurementReadiness({}, undefined, fixture());
    expect(result.capabilities.invoiceIntake).toBe(false);
    expect(result.capabilities.orderDraft).toBe(false);
    expect(result.capabilities.invoiceOriginalUnitReview).toBe(false);
  });
  it("does not reinterpret server denial as administrator access", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true, roles: ["erp_admin"] } }))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(fetchProcurementReadiness({}, undefined, fetcher)).rejects.toMatchObject({ code: "access" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires a signed-in active account", async () => {
    await expect(fetchProcurementReadiness({}, undefined, vi.fn().mockResolvedValue(json({ authenticated: false }))))
      .rejects.toMatchObject({ code: "sign-in" });
    await expect(fetchProcurementReadiness({}, undefined, vi.fn().mockResolvedValue(json({ authenticated: true, user: { isActive: false } }))))
      .rejects.toMatchObject({ code: "access" });
  });
  it("requires matching schema readiness", async () => {
    const fetcher = fixture();
    fetcher.mockReset().mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, principalId: principal, workerId: null,
        company: { id: entity, currencyCode: "ZMW" }, permissions: ["procurement-access"] }))
      .mockResolvedValueOnce(json({ tenantId: "different", legalEntityId: entity, schemaReady: true, capabilities }));
    await expect(fetchProcurementReadiness({}, undefined, fetcher)).rejects.toBeInstanceOf(ProcurementLiveError);
  });
});
it("rejects a legacy branch label before any readiness request can omit its scope", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(fetchProcurementReadiness({ entityId: entity, branch: "Lusaka (Main)" }, undefined, fetcher)).rejects.toMatchObject({ code: "invalid-scope" });
  expect(fetcher).not.toHaveBeenCalled();
});
