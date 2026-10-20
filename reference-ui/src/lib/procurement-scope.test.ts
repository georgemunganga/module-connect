import { afterEach, describe, expect, it, vi } from "vitest";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { listBudgetQueue } from "../../../src/platform/procurement-budget-api";
import { listPublishedCatalog } from "../../../src/platform/procurement-catalog-api";
import { listReferences } from "../../../src/platform/procurement-configuration-api";
import { listOwnContractDrafts } from "../../../src/platform/procurement-contracts-api";
import { listInvoiceIntake } from "../../../src/platform/procurement-invoices-api";
import { listItemDrafts } from "../../../src/platform/procurement-items-api";
import { listOwnOrderDrafts } from "../../../src/platform/procurement-orders-api";
import { listOwnPlans } from "../../../src/platform/procurement-plans-api";
import { listPolicies } from "../../../src/platform/procurement-policy-api";
import { listOwnRequestDrafts } from "../../../src/platform/procurement-requests-api";
import { listOwnSourcingDrafts } from "../../../src/platform/procurement-sourcing-api";
import { listVendorDrafts } from "../../../src/platform/procurement-vendors-api";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const storage = (entityId = company, selectedBranch = branch) => ({
  getItem: () => JSON.stringify({ entityId, branch: selectedBranch }),
});
afterEach(() => vi.unstubAllGlobals());

describe("Procurement requests use Core shell scope", () => {
  it("rejects a stale page after switching company and rejects invalid branch IDs", () => {
    expect(() => procurementScopeHeaders(company, storage(other))).toThrow("company changed");
    expect(() => procurementScopeHeaders(company, storage(company, "not-a-branch"))).toThrow("valid ERP branch");
    expect(procurementScopeHeaders(company, { getItem: () => null }))
      .toEqual({ "X-Shell-Entity": company });
  });

  const adapters = [
    ["budget", () => listBudgetQueue(company)],
    ["catalog", () => listPublishedCatalog(company)],
    ["configuration", () => listReferences(company, "categories")],
    ["contracts", () => listOwnContractDrafts(company)],
    ["invoices", () => listInvoiceIntake(company)],
    ["items", () => listItemDrafts(company)],
    ["orders", () => listOwnOrderDrafts(company)],
    ["plans", () => listOwnPlans(company)],
    ["policies", () => listPolicies(company)],
    ["requests", () => listOwnRequestDrafts(company)],
    ["sourcing", () => listOwnSourcingDrafts(company)],
    ["vendors", () => listVendorDrafts(company)],
  ] as const;

  it.each(adapters)("sends the selected company and branch through the %s adapter", async (_name, action) => {
    vi.stubGlobal("localStorage", storage());
    // A failed server response still lets us inspect the actual outgoing request contract.
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(action()).rejects.toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("X-Shell-Entity")).toBe(company);
    expect(headers.get("X-Shell-Location")).toBe(branch);
    expect(fetcher.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("reads the new branch at the next request rather than retaining an earlier selection", async () => {
    let selectedBranch = branch;
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: selectedBranch }) });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", fetcher);
    await listInvoiceIntake(company).catch(() => {});
    selectedBranch = other;
    await listInvoiceIntake(company).catch(() => {});
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-Shell-Location")).toBe(branch);
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("X-Shell-Location")).toBe(other);
  });
});
