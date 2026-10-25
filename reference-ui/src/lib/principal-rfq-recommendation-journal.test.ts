import { describe, expect, it } from "vitest";
import { recommendationCommand } from "./principal-rfq-recommendation-api";
import { recommendationJournal, type RecommendationJournalScope } from "./principal-rfq-recommendation-journal";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const scope: RecommendationJournalScope = { tenantId: "amizo", companyId: id(1), principalId: id(2), branchId: id(3), roundId: id(4), recordId: "new" };
const command = recommendationCommand(scope.roundId, null, 0, null,
  [{ offerId: id(5), sourcingLineId: id(6), quantityExact: "0.0001", proposedValueExact: "0.00000001", rationale: "A reason" }], id(7));
function memory(): Storage {
  const rows = new Map<string, string>();
  return { getItem: key => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); },
    removeItem: key => { rows.delete(key); }, clear: () => rows.clear(), key: index => [...rows.keys()][index] ?? null,
    get length() { return rows.size; } };
}
describe("bounded tab-local recommendation recovery", () => {
  it("claims the full exact command before POST and survives a new page instance", () => {
    const store = memory(); recommendationJournal.claim(scope, command, store);
    expect(recommendationJournal.read(scope, store)).toEqual(command);
    expect(() => recommendationJournal.claim(scope, { ...command, key: id(8) }, store)).toThrow();
    recommendationJournal.clear(scope, command, store); expect(recommendationJournal.read(scope, store)).toBeNull();
  });
  it("rejects a substituted scope, command key, body or schema without clearing the pending write", () => {
    const store = memory(); recommendationJournal.claim(scope, command, store);
    const key = store.key(0)!; const original = JSON.parse(store.getItem(key)!);
    for (const changed of [
      { ...original, scope: { ...original.scope, branchId: id(9) } },
      { ...original, command: { ...original.command, key: "not-a-uuid" } },
      { ...original, command: { ...original.command, body: JSON.stringify({ ...JSON.parse(command.body), expectedRevision: 5 }) } },
      { ...original, schemaVersion: 2 },
    ]) {
      store.setItem(key, JSON.stringify(changed)); expect(() => recommendationJournal.read(scope, store)).toThrow();
    }
    store.setItem(key, JSON.stringify(original));
    expect(() => recommendationJournal.clear(scope, { ...command, key: id(10) }, store)).toThrow();
    expect(recommendationJournal.read(scope, store)).toEqual(command);
  });
  it("does not send when storage refuses to retain the claim", () => {
    const blocked = memory(); blocked.setItem = () => {};
    expect(() => recommendationJournal.claim(scope, command, blocked)).toThrow(/storage|saved/i);
  });
});
