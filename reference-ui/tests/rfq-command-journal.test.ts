import { describe, expect, it, vi, afterEach } from "vitest";
import { readRfqRecovery, writeRfqRecovery, rfqJournalPrefix } from "../src/lib/rfq-command-journal";
import { recoverRfqCommand, rfqRecoveryReference, type RfqCommand } from "../../src/platform/procurement-sourcing-execution-api";
const key = "11111111-1111-4111-8111-111111111111", event = "22222222-2222-4222-8222-222222222222";
const company = "33333333-3333-4333-8333-333333333333";
const slot = (operation = "Create", worker = key, branch = "") => JSON.stringify(["tenant", company, worker, branch, operation]);
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(), key: () => null, get length() { return values.size; } } satisfies Storage;
}
afterEach(() => vi.unstubAllGlobals());
describe("RFQ locator journal (not a retry queue)", () => {
  it("retains only a create locator, never original title/partial quantities or body", () => {
    const command: RfqCommand = { operation: "Create", key, eventId: null, body: JSON.stringify({ title: "Private", sources: [{ quantity: "1.2345" }] }) };
    const store = storage(); writeRfqRecovery(slot(), rfqRecoveryReference(command), store);
    const saved = store.getItem(rfqJournalPrefix + slot())!;
    expect(JSON.parse(saved)).toEqual({ operation: "Create", key, eventId: null });
    for (const text of ["Private", "sources", "quantity", "body"]) expect(saved).not.toContain(text);
    expect(readRfqRecovery(slot(), store)).toEqual(rfqRecoveryReference(command));
    expect(readRfqRecovery(slot("Create", event), store)).toBeNull();
    expect(readRfqRecovery(slot("Create", key, event), store)).toBeNull();
  });
  it("retains exact cancel CAS/fingerprint without reason and clears only explicitly", () => {
    const command: RfqCommand = { operation: "Cancel", key, eventId: event, body: JSON.stringify({ expectedEventVersion: 3, originalDraftFingerprint: "a".repeat(64), reason: "Private reason" }) };
    const store = storage(), reference = rfqRecoveryReference(command), target = slot(`Cancel:${event}`);
    writeRfqRecovery(target, reference, store);
    expect(readRfqRecovery(target, store)).toEqual({ operation: "Cancel", key, eventId: event, expectedEventVersion: 3, originalDraftFingerprint: "a".repeat(64) });
    expect(store.getItem(rfqJournalPrefix + target)).not.toContain("reason");
    writeRfqRecovery(target, null, store); expect(readRfqRecovery(target, store)).toBeNull();
  });
  it("blocks malformed, oversized, extra payload and wrong-operation locators without deleting them", () => {
    const store = storage();
    for (const raw of ["{", "x".repeat(1025), JSON.stringify({ operation: "Create", key, eventId: null, body: "private" }), JSON.stringify({ operation: "Cancel", key, eventId: event, expectedEventVersion: 2, originalDraftFingerprint: "a".repeat(64) })]) {
      store.setItem(rfqJournalPrefix + slot(), raw);
      expect(() => readRfqRecovery(slot(), store)).toThrow("No new save");
      expect(store.getItem(rfqJournalPrefix + slot())).toBe(raw);
    }
  });
  it("blocks unavailable or silently discarded durable writes", () => {
    const reference = { operation: "Create" as const, key, eventId: null };
    const store = storage(); store.setItem = () => { throw new Error("Quota"); };
    expect(() => writeRfqRecovery(slot(), reference, store)).toThrow("No new save");
    store.setItem = () => {};
    expect(() => writeRfqRecovery(slot(), reference, store)).toThrow("No new save");
    store.getItem = () => { throw new Error("Denied"); };
    expect(() => readRfqRecovery(slot(), store)).toThrow("No new save");
  });
  it("recovers a reloaded locator by GET and rejects cancel result with another original binding", async () => {
    const reference = { operation: "Cancel" as const, key, eventId: event, expectedEventVersion: 3, originalDraftFingerprint: "a".repeat(64) };
    const result = { eventId: event, number: "RF-1", status: "Cancelled", version: 4, originalDraftFingerprint: "b".repeat(64), commandKey: key,
      recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ operation: "Cancel", commandKey: key, originalStatusCode: 200, responseJson: JSON.stringify(result), recordedHistoricalResult: true, canPublish: false })));
    vi.stubGlobal("fetch", fetch);
    await expect(recoverRfqCommand(company, reference)).rejects.toThrow("confirm");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBe("GET");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
});

it("never overwrites a different unresolved original reference or malformed journal", () => {
  const store = storage(); const original = { operation: "Create" as const, key, eventId: null };
  writeRfqRecovery(slot(), original, store);
  expect(() => writeRfqRecovery(slot(), { ...original, key: event }, store)).toThrow("No new save");
  expect(readRfqRecovery(slot(), store)).toEqual(original);
  store.setItem(rfqJournalPrefix + slot(), "{broken");
  expect(() => writeRfqRecovery(slot(), original, store)).toThrow("No new save");
  expect(store.getItem(rfqJournalPrefix + slot())).toBe("{broken");
});

it("keeps principal recovery in its own slot and refuses a worker locator there", () => {
  const store = storage();
  const principalSlot = JSON.stringify(["tenant", company, key, "", "Create", "principal"]);
  const command: RfqCommand = { operation: "Create", key, eventId: null, mode: "principal", body: JSON.stringify({ title: "Private", sources: [] }) };
  writeRfqRecovery(principalSlot, rfqRecoveryReference(command), store);
  expect(readRfqRecovery(principalSlot, store)).toEqual({ operation: "Create", key, eventId: null, mode: "principal" });
  expect(readRfqRecovery(slot(), store)).toBeNull();
  store.setItem(rfqJournalPrefix + principalSlot, JSON.stringify({ operation: "Create", key, eventId: null }));
  expect(() => readRfqRecovery(principalSlot, store)).toThrow("No new save");
  expect(store.getItem(rfqJournalPrefix + principalSlot)).not.toBeNull();
});
