import { describe, expect, it, vi } from "vitest";
import { fetchProcurementReadiness, ProcurementLiveError } from "./procurement-live";

const entity = "00000000-0000-0000-0000-000000000001";
const branch = "00000000-0000-0000-0000-000000000002";
const worker = "00000000-0000-0000-0000-000000000003";
const capabilities = {
  vendorDraft: true, itemDraft: true, requestDraft: true, approvals: false,
  sourcing: false, contracts: false, orders: false, orderDraft: true, receiving: false,
  invoiceIntake: true, invoiceValidation: false, financeHandoff: false, supplierPortal: false, planningDraft: true, configurationDraft: true, contractDraft: true, sourcingDraft: true,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("Procurement live readiness", () => {
  it("accepts explicit ERP administrator review without inventing a worker or mutation permissions", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true, roles: ["erp_admin"] } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: null, adminViewOnly: true,
        company: { id: entity, currencyCode: "ZMW" }, permissions: ["procurement-access", "procurement-vendor-read", "procurement-receipt-view", "procurement-vendor-create", "procurement-approval-decide"] }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: true, capabilities }));
    const result = await fetchProcurementReadiness({ entityId: entity, branch }, undefined, fetcher);
    expect(result.workerId).toBeNull();
    expect(result.adminViewOnly).toBe(true);
    expect(result.permissions).toEqual(["procurement-access", "procurement-vendor-read", "procurement-receipt-view"]);
    expect(fetcher.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity, "X-Shell-Location": branch });
  });

  it.each([
    { roles: ["employee"], workerId: null, adminViewOnly: true },
    { roles: ["erp_admin"], workerId: null, adminViewOnly: false },
    { roles: ["erp_admin"], workerId: null },
    { roles: ["erp_admin"], workerId: worker, adminViewOnly: true },
  ])("rejects contradictory or unconfirmed administrator context %j", async ({ roles, ...context }) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true, roles } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, company: { id: entity, currencyCode: "ZMW" }, ...context }));
    await expect(fetchProcurementReadiness({}, undefined, fetcher)).rejects.toMatchObject({ code: "invalid-response" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not reinterpret a server access denial as administrator review", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true, roles: ["erp_admin"] } }))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(fetchProcurementReadiness({}, undefined, fetcher)).rejects.toMatchObject({ code: "access" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses Core's selected IDs and accepts only a matching ready API scope", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: worker, company: { id: entity, currencyCode: "ZMW" } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: true, capabilities }));
    const result = await fetchProcurementReadiness({ entityId: entity, branch }, undefined, fetcher);
    expect(result.capabilities.vendorDraft).toBe(true);
    expect(result.defaultCurrencyCode).toBe("ZMW");
    expect(result.capabilities.orders).toBe(false);
    expect(fetcher.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity, "X-Shell-Location": branch });
    expect(fetcher.mock.calls[2][1].credentials).toBe("include");
  });

  it("keeps existing pages ready while an older API omits new draft capabilities", async () => {
    const earlierCapabilities = Object.fromEntries(Object.entries(capabilities)
      .filter(([key]) => key !== "invoiceIntake" && key !== "orderDraft"));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: worker,
        company: { id: entity, currencyCode: "ZMW" } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity,
        schemaReady: true, capabilities: earlierCapabilities }));
    const result = await fetchProcurementReadiness({ entityId: entity }, undefined, fetcher);
    expect(result.capabilities.vendorDraft).toBe(true);
    expect(result.capabilities.invoiceIntake).toBe(false);
    expect(result.capabilities.orderDraft).toBe(false);
  });

  it("never falls back to demo data when sign-in or schema readiness fails", async () => {
    const signedOut = vi.fn().mockResolvedValue(json({ authenticated: false }));
    await expect(fetchProcurementReadiness({}, undefined, signedOut)).rejects.toMatchObject({ code: "sign-in" });
    expect(signedOut).toHaveBeenCalledTimes(1);

    const unmigrated = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: worker, company: { id: entity, currencyCode: "ZMW" } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: false, capabilities }));
    await expect(fetchProcurementReadiness({}, undefined, unmigrated)).rejects.toBeInstanceOf(ProcurementLiveError);
  });
});
