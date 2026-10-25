import { describe, expect, it } from "vitest";
import { contractRateJournal } from "./contract-rate-journal";

const storage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
  };
};

describe("contract rate recovery lock", () => {
  it("survives a reload, blocks another write, and stays inside the same account and branch", () => {
    const tab = storage(), first = "tenant:company:buyer:branch-a:contract";
    expect(contractRateJournal.read(tab, first)).toBe(false);
    contractRateJournal.claim(tab, first);
    expect(contractRateJournal.read(tab, first)).toBe(true);
    expect(() => contractRateJournal.claim(tab, first)).toThrow();
    expect(contractRateJournal.read(tab, "tenant:company:buyer:branch-b:contract")).toBe(false);
    expect(contractRateJournal.read(tab, "tenant:company:other:branch-a:contract")).toBe(false);
    contractRateJournal.clear(tab, first);
    expect(contractRateJournal.read(tab, first)).toBe(false);
  });

  it("fails closed on malformed or unavailable tab storage", () => {
    const tab = storage(), scope = "tenant:company:buyer:branch:contract";
    tab.setItem("erp.procurement.contract-rate-review.v1:" + scope, "unknown");
    expect(() => contractRateJournal.read(tab, scope)).toThrow();
    const denied = { ...tab, getItem: () => { throw new Error("denied"); } } as Storage;
    expect(() => contractRateJournal.claim(denied, scope)).toThrow();
  });
});
