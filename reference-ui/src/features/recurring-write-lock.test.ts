import { afterEach, describe, expect, it, vi } from "vitest";
import { claimRecurringWrite, confirmRecurringWrite, recurringWriteLocked } from "../lib/recurring-write-lock";
afterEach(() => vi.unstubAllGlobals());
describe("recurring purchase unconfirmed write marker", () => {
  it("persists only an opaque marker, blocks repeats and isolates scopes", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    expect(claimRecurringWrite("company:worker:branch:new")).toBe(true);
    expect(recurringWriteLocked("company:worker:branch:new")).toBe(true);
    expect(claimRecurringWrite("company:worker:branch:new")).toBe(false);
    expect(recurringWriteLocked("another-company:worker:branch:new")).toBe(false);
    expect([...entries.values()]).toEqual(["unconfirmed"]);
    confirmRecurringWrite("company:worker:branch:new");
    expect(recurringWriteLocked("company:worker:branch:new")).toBe(false);
  });
  it("refuses writes when marker storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(recurringWriteLocked("scope")).toBe(true);
    expect(claimRecurringWrite("scope")).toBe(false);
  });
});
