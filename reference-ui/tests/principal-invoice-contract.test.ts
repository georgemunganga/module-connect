import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrincipalInvoiceState, listPrincipalInvoiceSources, listPrincipalAcceptances,
  recoverPrincipalInvoiceCommand, sendPrincipalInvoiceCommand,
  type PrincipalInvoiceLocator, type PrincipalInvoiceSource } from "../../src/platform/procurement-principal-invoice-api";
import { claimPrincipalInvoicePending, clearPrincipalInvoicePending,
  readPrincipalInvoicePending } from "../src/lib/principal-invoice-command-memory";

const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const order = "33333333-3333-4333-8333-333333333333", issued = "44444444-4444-4444-8444-444444444444";
const line = "55555555-5555-4555-8555-555555555555", mapping = "66666666-6666-4666-8666-666666666666";
const key = "77777777-7777-4777-8777-777777777777";
const state = () => ({ invoiceId: invoice, invoiceVersion: 3, sourceSchemaVersion: 2, state: "Unmapped",
  stateVersion: 0, mappingRevision: 0, mappingVersionId: null, reviewId: null, reviewOutcomeId: null,
  reviewState: "NotOpened", comparisonId: null, exposureVersion: null, isAuthority: false, canPostToFinance: false });
const source = (): PrincipalInvoiceSource => ({ orderId: order, orderNumber: "PO-100", issuedVersionId: issued,
  purchaseOrderLineId: line, description: "Equipment", unitCode: "EACH", quantity: "1.0001",
  unitPrice: "0.00010001", taxAmount: "0", categoryCode: "IT", sourceSchemaVersion: 2,
  sourceState: "VerifiedIssuedAndAcceptanceHistory", matchingAuthorityAvailable: false,
  canAllocate: false, canPostToFinance: false });
const locator = (): PrincipalInvoiceLocator => ({ operation: "Map", invoiceId: invoice, key, invoiceVersion: 3,
  mappingRevision: 0, mappingVersionId: null, reviewId: null, reviewOutcomeId: null,
  orderId: order, issuedVersionId: issued });
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch); return fetch;
}
function storage() {
  const items = new Map<string, string>();
  return { getItem: (name: string) => items.get(name) ?? null,
    setItem: (name: string, value: string) => { items.set(name, value); },
    removeItem: (name: string) => { items.delete(name); }, items };
}
afterEach(() => vi.unstubAllGlobals());
describe("principal invoice protocol", () => {
  it("keeps legacy and typed states separate and rejects a false Finance flag", async () => {
    respond(state()); expect((await getPrincipalInvoiceState(company, invoice)).state).toBe("Unmapped");
    respond({ ...state(), state: "LegacyWorkflow" });
    expect((await getPrincipalInvoiceState(company, invoice)).state).toBe("LegacyWorkflow");
    respond({ ...state(), canPostToFinance: true });
    await expect(getPrincipalInvoiceState(company, invoice)).rejects.toThrow("confirm");
  });
  it("loads only typed issued lines with exact strings and no allocation authority", async () => {
    const body = { invoiceId: invoice, invoiceVersion: 3, items: [source()], total: 1,
      page: 1, pageSize: 25, sourceSchemaVersion: 2, isAuthority: false,
      matchingAuthorityAvailable: false, canPostToFinance: false };
    const fetch = respond(body);
    expect((await listPrincipalInvoiceSources(company, invoice, 1)).items[0].unitPrice).toBe("0.00010001");
    expect(fetch.mock.calls[0][0]).toContain(`/invoices/${invoice}/principal-matching/sources`);
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    respond({ ...body, items: [{ ...source(), unitPrice: 0.00010001 }] });
    await expect(listPrincipalInvoiceSources(company, invoice, 1)).rejects.toThrow("confirm");
    respond({ ...body, items: [{ ...source(), sourceSchemaVersion: 1 }] });
    await expect(listPrincipalInvoiceSources(company, invoice, 1)).rejects.toThrow("confirm");
  });
  it("treats receipt entries as history and rejects numeric money", async () => {
    const body = { invoiceId: invoice, invoiceVersion: 3, orderId: order, issuedVersionId: issued,
      purchaseOrderLineId: line, sourceSchemaVersion: 2, categoryCode: "IT", unitCode: "EACH",
      acceptedFacts: [{ principalAcceptanceFactId: mapping, principalReceivingSourceStateId: key,
        sourceSequence: 1, kind: "Goods", acceptedAt: "2026-10-23T10:00:00Z",
        acceptedQuantity: "1.0001", acceptedNetAmount: "0.00010001", acceptanceReference: "GRN-1" }],
      total: 1, historyState: "VerifiedHistoricalPositiveOnly", matchingAuthorityAvailable: false,
      canAllocate: false, canPostToFinance: false };
    respond(body); expect((await listPrincipalAcceptances(company, invoice, source()))[0].acceptedNetAmount).toBe("0.00010001");
    respond({ ...body, acceptedFacts: [{ ...body.acceptedFacts[0], acceptedNetAmount: 0.00010001 }] });
    await expect(listPrincipalAcceptances(company, invoice, source())).rejects.toThrow("confirm");
  });
  it("persists only a scoped nonsecret locator before POST, then recovers the original key by GET", async () => {
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    const marker = locator(); expect(claimPrincipalInvoicePending("tenant:company:branch:actor:bill", marker)).toBe(true);
    expect([...store.items.values()][0]).not.toMatch(/documentLineReference|reason|body|taxAmount/);
    expect(readPrincipalInvoicePending("tenant:company:branch:actor:bill").blocked).toBe(true);
    const reply = { invoiceId: invoice, invoiceVersion: 3, mappingVersionId: mapping,
      mappingRevision: 1, commandKey: key, sourceSchemaVersion: 2, state: "Mapped",
      matchingAuthorityAvailable: false, canAllocate: false, canPostToFinance: false };
    respond(reply);
    expect((await recoverPrincipalInvoiceCommand(company, marker)).mappingVersionId).toBe(mapping);
    expect(clearPrincipalInvoicePending("tenant:company:branch:actor:bill", marker)).toBe(true);
    const sent = respond(reply);
    await sendPrincipalInvoiceCommand(company, marker, { invoiceVersion: 3, expectedMappingRevision: 0,
      expectedStateVersion: 0, purchaseOrderId: order, principalIssuedVersionId: issued, lines: [] });
    expect(sent.mock.calls[0][1].method).toBe("POST");
    expect(sent.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    respond({ ...reply, canPostToFinance: true });
    await expect(recoverPrincipalInvoiceCommand(company, marker)).rejects.toThrow("confirm");
  });
  it("blocks another POST when storage cannot retain the locator", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("unavailable"); }, setItem: vi.fn() });
    expect(readPrincipalInvoicePending("scope").blocked).toBe(true);
    expect(claimPrincipalInvoicePending("scope", locator())).toBe(false);
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    store.setItem("procurement:principal-invoice:pending:v1:scope", JSON.stringify({ ...locator(), documentLineReference: "private" }));
    expect(readPrincipalInvoicePending("scope")).toEqual({ locator: null, blocked: true });
  });
});
