import { describe, expect, it, vi } from "vitest";
import { fetchProcurementReadiness, ProcurementLiveError } from "./procurement-live";

const entity = "00000000-0000-0000-0000-000000000001";
const branch = "00000000-0000-0000-0000-000000000002";
const worker = "00000000-0000-0000-0000-000000000003";
const capabilities = {
  vendorDraft: true, itemDraft: true, requestDraft: true, approvals: false,
  sourcing: false, contracts: false, orders: false, receiving: false,
  invoiceValidation: false, financeHandoff: false, supplierPortal: false,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("Procurement live readiness", () => {
  it("uses Core's selected IDs and accepts only a matching ready API scope", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: worker, company: { id: entity } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: true, capabilities }));
    const result = await fetchProcurementReadiness({ entityId: entity, branch }, undefined, fetcher);
    expect(result.capabilities.vendorDraft).toBe(true);
    expect(result.capabilities.orders).toBe(false);
    expect(fetcher.mock.calls[1][1].headers).toEqual({ "X-Shell-Entity": entity, "X-Shell-Location": branch });
    expect(fetcher.mock.calls[2][1].credentials).toBe("include");
  });

  it("never falls back to demo data when sign-in or schema readiness fails", async () => {
    const signedOut = vi.fn().mockResolvedValue(json({ authenticated: false }));
    await expect(fetchProcurementReadiness({}, undefined, signedOut)).rejects.toMatchObject({ code: "sign-in" });
    expect(signedOut).toHaveBeenCalledTimes(1);

    const unmigrated = vi.fn()
      .mockResolvedValueOnce(json({ authenticated: true, user: { isActive: true } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, workerId: worker, company: { id: entity } }))
      .mockResolvedValueOnce(json({ tenantId: "tenant-a", legalEntityId: entity, schemaReady: false, capabilities }));
    await expect(fetchProcurementReadiness({}, undefined, unmigrated)).rejects.toBeInstanceOf(ProcurementLiveError);
  });
});
