import { describe, expect, it } from "vitest";
import { masterImportJournal, type ImportScope } from "./master-import-journal";

const scope: ImportScope = { tenantId: "test-tenant", companyId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222", branch: "all:", kind: "vendors" };
const locator = { batchId: "33333333-3333-4333-8333-333333333333", commandKey: "44444444-4444-4444-8444-444444444444",
  previewSha256: "a".repeat(64), expiresAt: "2026-10-27T00:00:00Z" };
function memory() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); }, clear: () => entries.clear(), key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; } } as Storage;
}
describe("scoped master import recovery", () => {
  it("retains only the batch, digest, original key and expiry; another company cannot read it", () => {
    const storage = memory(); masterImportJournal.claim(scope, locator, storage);
    expect(masterImportJournal.read(scope, storage)).toEqual(locator);
    expect(masterImportJournal.read({ ...scope, companyId: "55555555-5555-4555-8555-555555555555" }, storage)).toBeNull();
    expect(storage.getItem(storage.key(0) ?? "")).not.toContain("csvBase64");
    expect(() => masterImportJournal.claim(scope, locator, storage)).toThrow();
  });
  it("rejects forged or corrupt saved commands and preserves the original key", () => {
    const storage = memory(); masterImportJournal.claim(scope, locator, storage);
    expect(() => masterImportJournal.clear(scope, { ...locator, commandKey: "66666666-6666-4666-8666-666666666666" }, storage)).toThrow();
    expect(masterImportJournal.read(scope, storage)).toEqual(locator);
    masterImportJournal.clear(scope, locator, storage); expect(masterImportJournal.read(scope, storage)).toBeNull();
  });
  it("fails closed if recovery storage does not retain the claim", () => {
    const storage = { ...memory(), setItem: () => undefined } as Storage;
    expect(() => masterImportJournal.claim(scope, locator, storage)).toThrow(/unavailable/);
  });
});
