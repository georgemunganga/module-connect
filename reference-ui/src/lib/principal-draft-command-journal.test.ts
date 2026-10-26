import { beforeEach, describe, expect, it, vi } from "vitest";
import { principalDraftJournal, principalDraftScope } from "./principal-draft-command-journal";
import { createPrincipalBody } from "../../../src/platform/procurement-principal-drafts-api";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, values };
};
beforeEach(() => vi.unstubAllGlobals());
describe("principal draft command journal", () => {
  it("retains one exact Create body and key across reload and HQ to All branch changes", () => {
    const storage = memory(); vi.stubGlobal("sessionStorage", storage);
    const scope = principalDraftScope("tenant-a", id(1), id(2));
    const draft = { supplierId: id(4), currencyCode: "ZMW", shipToRef: "", billToRef: "",
      paymentTermRef: "", expectedDeliveryOn: null,
      lines: [{ description: "Supplies", unitCode: "each", quantity: "1", unitPrice: "2", taxAmount: "0" }] };
    const sources = [{ canSelect: true, purchaseRequestId: id(5), purchaseRequestLineId: id(6), expectedRequestVersion: 2 }];
    const command = { operation: "Create" as const, key: id(3), orderId: null,
      body: createPrincipalBody(draft, sources), draft, sources };
    principalDraftJournal.claim(scope, command);
    expect(principalDraftJournal.read(principalDraftScope("tenant-a", id(1), id(2)))).toEqual(command);
    expect(() => principalDraftJournal.claim(scope, { ...command, key: id(5) })).toThrow();
    principalDraftJournal.clear(scope, command);
    expect(principalDraftJournal.read(scope)).toBeNull();
  });
  it("keeps tenant, company, and actor journals separate and rejects malformed stored data", () => {
    const storage = memory(); vi.stubGlobal("sessionStorage", storage);
    const scope = principalDraftScope("tenant-a", id(1), id(2));
    storage.values.set(scope, '{"operation":"Cancel","key":"bad"}');
    expect(() => principalDraftJournal.read(scope)).toThrow();
    expect(principalDraftJournal.read(principalDraftScope("tenant-b", id(1), id(2)))).toBeNull();
    expect(principalDraftJournal.read(principalDraftScope("tenant-a", id(9), id(2)))).toBeNull();
    expect(principalDraftJournal.read(principalDraftScope("tenant-a", id(1), id(8)))).toBeNull();
  });
  it("blocks a POST when session storage cannot retain the original command", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => { throw new Error("storage denied"); } });
    expect(() => principalDraftJournal.claim(principalDraftScope("tenant-a", id(1), id(2)),
      { operation: "Cancel", key: id(3), orderId: id(4),
        body: JSON.stringify({ expectedOrderVersion: 1, originalDirectSourceSha256: "a".repeat(64), reason: "Corrected" }) })).toThrow();
  });
});
