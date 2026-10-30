import { describe, expect, it } from "vitest";
import { documentNewWorkBlocked, invoiceMappingNewWorkAllowed, principalHistoryLock, principalNewWorkBlocked } from "./invoice-principal-history-lock";

describe("invoice-scoped recorded comparison lock", () => {
  it("fails closed on an absent or malformed principal boolean", () => {
    for (const value of [undefined, null, "false", 0, {}]) expect(principalHistoryLock(value)).toBe(true);
    expect(principalHistoryLock(true)).toBe(true);
    expect(principalHistoryLock(false)).toBe(false);
    expect(principalNewWorkBlocked(true, null)).toBe(true);
  });
  it("blocks source-3 work on the recorded invoice but permits a sibling invoice on the same order", () => {
    const recorded = { locked: true, currentMappingSchema: 3 as const };
    const sibling = { locked: false, currentMappingSchema: 3 as const };
    expect(principalNewWorkBlocked(true, recorded.locked)).toBe(true);
    expect(documentNewWorkBlocked(recorded, true)).toBe(true);
    expect(principalNewWorkBlocked(true, sibling.locked)).toBe(false);
    expect(documentNewWorkBlocked(sibling, true)).toBe(false);
  });
  it("leaves legacy document and matching actions available under their existing gates", () => {
    expect(principalNewWorkBlocked(false, true)).toBe(false);
    expect(documentNewWorkBlocked({ locked: true, currentMappingSchema: null }, true)).toBe(false);
    expect(documentNewWorkBlocked(null, false)).toBe(false);
    expect(documentNewWorkBlocked(null, true)).toBe(true);
  });
  it("never routes an existing source-3 mapping through legacy linking when principal writes are off", () => {
    expect(invoiceMappingNewWorkAllowed(3, false, true, true)).toBe(false);
    expect(invoiceMappingNewWorkAllowed(3, false, true, false)).toBe(false);
    expect(invoiceMappingNewWorkAllowed(3, true, true, true)).toBe(false);
    expect(invoiceMappingNewWorkAllowed(3, true, true, false)).toBe(true);
  });
  it("retains existing legacy and unmapped action availability", () => {
    expect(invoiceMappingNewWorkAllowed(null, false, true, true)).toBe(true);
    expect(invoiceMappingNewWorkAllowed(null, false, true, false)).toBe(true);
    expect(invoiceMappingNewWorkAllowed(null, false, false, false)).toBe(false);
    expect(invoiceMappingNewWorkAllowed(null, true, false, false)).toBe(true);
    expect(invoiceMappingNewWorkAllowed(undefined, false, true, false)).toBe(false);
    expect(invoiceMappingNewWorkAllowed(undefined, true, false, false)).toBe(false);
  });
});
