import { afterEach, describe, expect, it, vi } from "vitest";
import { ERP_SHELL_STORAGE_KEY } from "../../../shared/shell-scope";
import { openedRecommendationRounds, recommendationSource, recommendationCommand, recommendationAck,
  recommendationDetail, recommendationLines, recoverRecommendation, saveRecommendation } from "./principal-rfq-recommendation-api";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const company = id(1), branch = id(2), round = id(3), offer = id(4), line = id(5), draft = id(6), key = id(7);
const hash = "a".repeat(64);
const selected = [{ offerId: offer, sourcingLineId: line, quantityExact: "0.0001", proposedValueExact: "0.00000001", rationale: "Human comparison" }];
const source = { roundId: round, unsealingId: id(8), rfqTitle: "Verified quote request", sourceLines: [{ sourceLineId: line, lineLabel: "Line 1" }],
  offers: [{ offerId: offer, offerSha256: hash, offerLabel: "Offer 1", supplierLabel: null,
    lines: [{ sourceLineId: line, lineLabel: "Line 1", offeredQuantityExact: "1.0000", currencyCode: "ZMW" }] }],
  canSubmit: false, awardAvailable: false, purchaseOrderAvailable: false };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function branchSelected() { vi.stubGlobal("localStorage", { getItem: (name: string) => name === ERP_SHELL_STORAGE_KEY ? JSON.stringify({ entityId: company, branch }) : null }); }
afterEach(() => vi.unstubAllGlobals());

describe("purpose-scoped recommendation adapter", () => {
  it("keeps exact quantities and values as strings and binds each saved revision", () => {
    const command = recommendationCommand(round, null, 0, null, selected, key);
    expect(JSON.parse(command.body)).toEqual({ draftId: null, expectedRevision: 0, expectedSnapshotSha256: null, lines: selected });
    expect(recommendationAck({ draftId: draft, roundId: round, revisionId: id(9), revision: 1, state: "Draft", snapshotSha256: hash,
      awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false }, command).draftId).toBe(draft);
    for (const bad of [{ ...selected[0], quantityExact: "1e-4" }, { ...selected[0], proposedValueExact: "0.000000001" },
      { ...selected[0], rationale: " trimmed " }]) expect(() => recommendationLines([bad])).toThrow();
    expect(() => recommendationAck({ draftId: draft, roundId: id(10), revisionId: id(9), revision: 1, state: "Draft", snapshotSha256: hash,
      awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false }, command)).toThrow();
    expect(() => recommendationAck({ draftId: draft, roundId: round, revisionId: id(9), revision: 0, state: "Draft", snapshotSha256: hash,
      awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false }, command)).toThrow();
  });
  it("discovers no more than three round IDs, then requires a separate verified source", async () => {
    branchSelected(); const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("commercial-opened-rounds")) return json({ items: [{ roundId: round, sourcingEventId: id(9), branchId: branch,
        openedAt: "2026-10-25T10:00:00Z", unsealingId: id(8) }], total: 1, offset: 0, limit: 3,
        priceReadRequiresRetainedProof: true, evaluationAvailable: false, awardAvailable: false, purchaseOrderAvailable: false });
      return json(source);
    }));
    const opened = await openedRecommendationRounds(company, 0);
    expect(opened.items).toHaveLength(1); expect(opened.items[0]).not.toHaveProperty("rfqTitle");
    expect((await recommendationSource(company, round)).rfqTitle).toBe("Verified quote request");
    expect(calls).toEqual(["/api/procurement/v1/sourcing/commercial-opened-rounds?offset=0&limit=3",
      `/api/procurement/v1/sourcing/commercial-rounds/${round}/recommendation-source`]);
  });
  it("sends one keyed POST and recovers only by original-key GET", async () => {
    branchSelected(); const calls: { method: string; url: string; key: string | null; body: unknown }[] = [];
    const ack = { draftId: draft, roundId: round, revisionId: id(9), revision: 1, state: "Draft", snapshotSha256: hash,
      awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? "GET", url, key: new Headers(init.headers).get("Idempotency-Key"), body: init.body ? JSON.parse(String(init.body)) : null });
      return json(ack, 201);
    }));
    const command = recommendationCommand(round, null, 0, null, selected, key);
    await saveRecommendation(company, command); await recoverRecommendation(company, command);
    expect(calls).toEqual([
      { method: "POST", url: `/api/procurement/v1/sourcing/commercial-rounds/${round}/recommendation-drafts`, key, body: JSON.parse(command.body) },
      { method: "GET", url: `/api/procurement/v1/sourcing/commercial-rounds/${round}/recommendation-commands/${key}`, key: null, body: null },
    ]);
  });
  it("rejects substituted detail snapshots and a missing selected branch before any fetch", async () => {
    branchSelected(); vi.stubGlobal("fetch", vi.fn(async () => json({ draftId: draft, roundId: round, state: "Draft",
      currentRevision: 1, currentRevisionId: id(9), currentSnapshotSha256: hash, lines: selected,
      revisions: [{ id: id(9), revision: 1, recordedAt: "2026-10-25T10:00:00Z", snapshotSha256: "b".repeat(64) }],
      assessmentCoverageComplete: null, canSubmit: false, awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false })));
    await expect(recommendationDetail(company, round, draft)).rejects.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => null });
    const transport = vi.fn(); vi.stubGlobal("fetch", transport);
    await expect(recommendationSource(company, round)).rejects.toThrow(/Choose a permitted branch/);
    expect(transport).not.toHaveBeenCalled();
  });
});
