import { afterEach, describe, expect, it, vi } from "vitest";
import { claimPendingInvoiceMatching, clearPendingInvoiceMatching, readPendingInvoiceMatching } from "../src/lib/invoice-matching-command-memory";
import type { InvoiceMatchingRecovery } from "../../src/platform/procurement-invoice-matching-api";

const invoiceId = "22222222-2222-4222-8222-222222222222";
const command: InvoiceMatchingRecovery = { invoiceId, operation: "InvoiceCompare", key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedVersion: 3,
  ownLineIds: ["33333333-3333-4333-8333-333333333333"], purchaseOrderId: null, issuedVersionId: null,
  mappingVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
function storage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); }, items };
}
afterEach(() => vi.unstubAllGlobals());
describe("invoice matching command marker", () => {
  it("claims before POST and remains blocked on reload until the same receipt is confirmed", () => {
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    expect(claimPendingInvoiceMatching("worker:company:invoice", command)).toBe(true);
    expect([...store.items.values()][0]).not.toMatch(/body|reason|documentLineReference|invoiceUnitCode/i);
    expect(readPendingInvoiceMatching("worker:company:invoice")).toEqual({ command, blocked: true });
    expect(claimPendingInvoiceMatching("worker:company:invoice", { ...command, key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })).toBe(false);
    expect(clearPendingInvoiceMatching("worker:company:invoice", { ...command, key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })).toBe(false);
    expect(clearPendingInvoiceMatching("worker:company:invoice", command)).toBe(true);
    expect(readPendingInvoiceMatching("worker:company:invoice").blocked).toBe(false);
  });
  it("fails closed when scoped storage is unavailable or malformed", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: vi.fn() });
    expect(readPendingInvoiceMatching("scope").blocked).toBe(true);
    expect(claimPendingInvoiceMatching("scope", command)).toBe(false);
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    store.setItem("procurement:invoice-matching:pending:v1:scope", "not-json");
    expect(readPendingInvoiceMatching("scope")).toEqual({ command: null, blocked: true });
    expect(claimPendingInvoiceMatching("scope", command)).toBe(false);
    store.setItem("procurement:invoice-matching:pending:v1:scope", JSON.stringify({ ...command, body: '{"reason":"private"}' }));
    expect(readPendingInvoiceMatching("scope")).toEqual({ command: null, blocked: true });
  });
  it("retains source-3 fact pins across reload and cannot clear a different fact", () => {
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    const principal: InvoiceMatchingRecovery = { ...command, operation: "InvoiceMapping", purchaseOrderId: "44444444-4444-4444-8444-444444444444",
      issuedVersionId: "55555555-5555-4555-8555-555555555555", mappingVersionId: null, sourceSchemaVersion: 3,
      principalPins: [{ invoiceLineId: command.ownLineIds[0], purchaseOrderLineId: "66666666-6666-4666-8666-666666666666",
        principalReceivingSourceStateId: "77777777-7777-4777-8777-777777777777",
        principalReceivingFactId: "88888888-8888-4888-8888-888888888888" }] };
    expect(claimPendingInvoiceMatching("actor:company:branch:invoice", principal)).toBe(true);
    expect(readPendingInvoiceMatching("actor:company:branch:invoice").command).toEqual(principal);
    expect([...store.items.values()][0]).not.toMatch(/body|documentLineReference|password/i);
    expect(clearPendingInvoiceMatching("actor:company:branch:invoice", { ...principal,
      principalPins: [{ ...principal.principalPins![0], principalReceivingFactId: command.key }] })).toBe(false);
    expect(readPendingInvoiceMatching("actor:company:branch:invoice").blocked).toBe(true);
    expect(clearPendingInvoiceMatching("actor:company:branch:invoice", principal)).toBe(true);
    store.setItem("procurement:invoice-matching:pending:v1:scope", JSON.stringify({ ...principal,
      principalPins: [{ ...principal.principalPins![0], documentLineReference: "private" }] }));
    expect(readPendingInvoiceMatching("scope")).toEqual({ command: null, blocked: true });
  });
  it("retains a source-3 comparison discriminator with no fabricated fact pins", () => {
    const store = storage(); vi.stubGlobal("sessionStorage", store);
    const compare = { ...command, sourceSchemaVersion: 3 as const };
    expect(claimPendingInvoiceMatching("scope", compare)).toBe(true);
    expect(readPendingInvoiceMatching("scope").command).toEqual(compare);
    expect(clearPendingInvoiceMatching("scope", command)).toBe(false);
    expect(clearPendingInvoiceMatching("scope", compare)).toBe(true);
  });
});
