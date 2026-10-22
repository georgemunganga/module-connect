import { describe, expect, it, vi } from "vitest";
import { fetchVerifiedOrganisationContext, verifiedOrganisationContext } from "./verified-organisation-context";
const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { tenantId: "test", principalId: principal, legalEntityId: company, workerId: null,
  permissions: ["procurement-access"], company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
  branch: { id: branch, code: "MAIN", name: "Lusaka (Main)" },
  allowedCompanies: [{ id: "33333333-3333-4333-8333-333333333333", name: "Unselected company" }] };
describe("verified selected organisation display", () => {
  it("projects only the selected company/branch and never creates full choices or employee identity", () => {
    expect(verifiedOrganisationContext(context, { entityId: company, branch })).toEqual({
      company: { id: company, code: "AMIZO", name: "Amizo Power" },
      branch: { id: branch, name: "Lusaka (Main)", legalEntityId: company },
    });
  });
  it.each([
    { principalId: undefined }, { permissions: [] }, { legalEntityId: branch },
    { company: { ...context.company, name: "" } }, { branch: null },
    { branch: { ...context.branch, id: company } },
  ])("rejects unverified or mismatched data %j", override => {
    expect(() => verifiedOrganisationContext({ ...context, ...override }, { entityId: company, branch })).toThrow();
  });
  it("allows only a verified company when no branch is selected", () => {
    expect(verifiedOrganisationContext({ ...context, branch: null }, { entityId: company }).branch).toBeNull();
  });
  it("sends captured scope with no-store and does not use a master-list endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(context), { status: 200 }));
    const controller = new AbortController();
    await fetchVerifiedOrganisationContext({ entityId: company, branch }, controller.signal, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(["/api/procurement/v1/context", {
      headers: { "X-Shell-Entity": company, "X-Shell-Location": branch }, signal: controller.signal,
      credentials: "include", cache: "no-store",
    }]);
  });
  it.each([401, 403, 500])("does not show a context from failed HTTP %s", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(context), { status }));
    await expect(fetchVerifiedOrganisationContext({ entityId: company, branch }, new AbortController().signal, fetcher)).rejects.toThrow();
  });
  it("does not silently drop an invalid captured selection", async () => {
    const fetcher = vi.fn();
    await expect(fetchVerifiedOrganisationContext({ entityId: "bad" }, new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
