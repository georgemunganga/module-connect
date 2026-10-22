import { afterEach, describe, expect, it, vi } from "vitest";
import { claimPendingInvoiceMatching, clearPendingInvoiceMatching, readPendingInvoiceMatching } from "../src/lib/invoice-matching-command-memory";
import type { InvoiceMatchingCommand } from "../../src/platform/procurement-invoice-matching-api";

const invoiceId = "22222222-2222-4222-8222-222222222222";
const command: InvoiceMatchingCommand = { invoiceId, operation: "InvoiceCompare", key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  body: JSON.stringify({ version: 3, mappingVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", reason: null }),
  ownLineIds: ["33333333-3333-4333-8333-333333333333"] };
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
  });
});
