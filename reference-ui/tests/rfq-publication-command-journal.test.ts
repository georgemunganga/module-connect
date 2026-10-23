import { describe, expect, it } from "vitest";
import { readPublicationRecovery, writePublicationRecovery } from "../src/lib/rfq-publication-command-journal";

const eventId = "11111111-1111-4111-8111-111111111111";
const commandKey = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const slot = JSON.stringify(["tenant", "company", "branch", "principal", eventId]);
function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: () => null,
    get length() { return values.size; } };
}

describe("principal publication recovery locator", () => {
  it("stores only the scoped original command key and target, with no supplier or quote payload", () => {
    const saved = storage();
    const locator = { type: "publication" as const, action: "decide" as const,
      key: commandKey, eventId, targetId: assignmentId };
    writePublicationRecovery(slot, locator, saved);
    expect(readPublicationRecovery(slot, saved)).toEqual(locator);
    const raw = saved.getItem("erp.rfq.publication.recovery.v1:" + slot)!;
    for (const text of ["supplierIds", "reason", "unitPrice", "body", "password"])
      expect(raw).not.toContain(text);
    expect(readPublicationRecovery(JSON.stringify(["tenant", "company", "other", "principal", eventId]), saved)).toBeNull();
  });
  it("rejects a second write while the first result is unknown and retains the first key", () => {
    const saved = storage();
    const original = { type: "contact" as const, action: "contact" as const,
      key: commandKey, eventId, targetId: assignmentId };
    writePublicationRecovery(slot, original, saved);
    expect(() => writePublicationRecovery(slot, { ...original, key: eventId }, saved)).toThrow("reconciliation");
    expect(readPublicationRecovery(slot, saved)).toEqual(original);
    writePublicationRecovery(slot, null, saved);
    expect(readPublicationRecovery(slot, saved)).toBeNull();
  });
  it("rejects malformed UUIDs, extra payload and a missing persisted write", () => {
    const saved = storage();
    expect(() => writePublicationRecovery(slot, { type: "publication", action: "open",
      key: "11111111-1111-4111-111111111111", eventId: "0" }, saved)).toThrow();
    const invalid = { type: "quote", action: "quote-create", key: commandKey,
      eventId, supplierIds: [assignmentId] };
    expect(() => writePublicationRecovery(slot, invalid as never, saved)).toThrow();
    saved.setItem = () => {};
    expect(() => writePublicationRecovery(slot, { type: "publication", action: "open", key: commandKey, eventId }, saved)).toThrow();
  });
});
