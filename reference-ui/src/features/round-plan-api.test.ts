import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureRoundScope, getRoundPlan, getRoundPlanVersion, getRoundPlanHistory, roundCommand, sendRoundPlan, recoverRoundPlan, validateRoundDraft,
  type RoundDraft, type RoundIdentity, type RoundLocator } from "../../../src/platform/procurement-round-plan-api";
import { roundPlanActionAvailable } from "../lib/round-plan-access";
import { roundPlanJournal } from "../lib/round-plan-journal";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222", principal = "33333333-3333-4333-8333-333333333333";
const event = "44444444-4444-4444-8444-444444444444", plan = "55555555-5555-4555-8555-555555555555", revision = "66666666-6666-4666-8666-666666666666";
const logical = "77777777-7777-4777-8777-777777777777", key = "88888888-8888-4888-8888-888888888888", nonce = "99999999-9999-4999-8999-999999999999";
const empty = (): RoundDraft => ({ requirements: null, proposedPolicyReference: null, disclosureProposal: null, documentRequirements: null, opensAt: null, closesAt: null, technicalReleaseAt: null, commercialReleaseAt: null, criteria: [], participants: [] });
const record = (enrolled = true) => ({ enrolled, source: { id: event, branchId: branch, number: "RFQ-1", title: "Quoted needs", currencyCode: "ZMW", supplierFacingWorkflowAvailable: false },
  plan: enrolled ? { id: plan, version: 3, status: "Draft", makerPrincipalId: principal } : null,
  ...(enrolled ? { revision: { id: revision, version: 3, operation: "Revise", status: "Draft", actorPrincipalId: principal, recordedAt: "2026-11-03T10:00:00Z", reason: null, contentSha256: "a".repeat(64) },
    content: { ...empty(), schemaVersion: 1, companyTimeZoneId: "Africa/Lusaka" }, people: [], contentIsIncompleteProposal: true } : {}), reviewAvailable: false, publicationAvailable: false });
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });
let identity: RoundIdentity, selected: unknown;
const scope = () => captureRoundScope({ ...identity }, () => identity);
beforeEach(() => { identity = { tenantId: "amizo", companyId: company, principalId: principal, branchId: branch, authEpoch: 1 }; selected = { entityId: company, branch }; vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(selected) }); });
afterEach(() => vi.unstubAllGlobals());
describe("commercial round incomplete draft contract", () => {
  it("accepts empty incomplete proposals without inventing weights, policy or team defaults", () => { expect(() => validateRoundDraft(empty())).not.toThrow(); });
  it("preserves exact decimal strings including numeric18,4 upper bound and stable logical IDs", () => {
    const draft = empty(); draft.criteria = [{ logicalId: logical, order: 1, code: "PRICE", stage: "Commercial", kind: "Weighted", description: null, rubric: null, weight: "99999999999999.9999", maximumScore: "10.0001", minimumScore: "0.0001" }];
    const command = roundCommand(event, 7, 3, "Revise", key, draft);
    expect(command.body).toContain('"weight":"99999999999999.9999"');
    expect(JSON.parse(command.body)).toMatchObject({ expectedEventVersion: 7, expectedPlanVersion: 3, draft: { criteria: [{ logicalId: logical }] }, reason: null });
    expect(command.body).not.toContain(revision);
  });
  it.each(["number", "precision", "negative", "passfail", "threshold", "duplicate"])("rejects invalid scalar or child identity: %s", fault => {
    const draft = empty(); const row: any = { logicalId: logical, order: 1, code: "CHECK", stage: "Technical", kind: "Weighted", description: null, rubric: null, weight: "1", maximumScore: "10", minimumScore: "1" };
    if (fault === "number") row.weight = 0.1;
    if (fault === "precision") row.weight = "0.00001";
    if (fault === "negative") row.weight = "-1";
    if (fault === "passfail") row.kind = "PassFail";
    if (fault === "threshold") row.minimumScore = "11";
    draft.criteria = fault === "duplicate" ? [row, { ...row, order: 2, code: "OTHER" }] : [row];
    expect(() => roundCommand(event, 7, 3, "Revise", key, draft)).toThrow();
  });
  it("rejects invalid instants/order and requires a trimmed cancellation reason up to2000", () => {
    const draft = { ...empty(), opensAt: "2026-12-01T10:00:00Z", closesAt: "2026-12-01T09:00:00Z" };
    expect(() => validateRoundDraft(draft)).toThrow();
    expect(() => roundCommand(event, 7, 3, "Cancel", key, undefined, " ")).toThrow();
    expect(() => roundCommand(event, 7, 3, "Cancel", key, undefined, "x".repeat(2001))).toThrow();
    expect(JSON.parse(roundCommand(event, 7, 3, "Cancel", key, undefined, "Plan withdrawn").body)).toEqual({ expectedEventVersion: 7, expectedPlanVersion: 3, draft: null, reason: "Plan withdrawn" });
  });
});
describe("retained round scope and history", () => {
  it("reads unenrolled state without pretending its false future flags disable the existing M4 flow", async () => {
    const fetcher = vi.fn(async () => json(record(false))); vi.stubGlobal("fetch", fetcher);
    const value = await getRoundPlan(scope(), event); expect(value.enrolled).toBe(false); expect(value.plan).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reads exact original versions and cursor history, never owner-only M4 detail", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes("history") ? json({ items: [{ id: revision, version: 3, operation: "Revise", status: "Draft", actorPrincipalId: principal, recordedAt: "2026-11-03T10:00:00Z", reason: null }], nextVersion: null }) : json(record())); vi.stubGlobal("fetch", fetcher);
    const snapshot = await getRoundPlanVersion(scope(), event, 3); expect(snapshot.revision?.id).toBe(revision);
    const history = await getRoundPlanHistory(scope(), event, 2); expect(history.items[0].version).toBe(3);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([`/api/procurement/v1/sourcing/${event}/round-plan/versions/3`, `/api/procurement/v1/sourcing/${event}/round-plan/history?afterVersion=2&limit=25`]);
  });
  it("rejects mismatched event/branch/version or an enabled future workflow flag", async () => {
    for (const fault of ["event", "branch", "version", "publication"]) {
      const x = record(); if (fault === "event") x.source.id = key; if (fault === "branch") x.source.branchId = key; if (fault === "version") x.revision!.version = 4; if (fault === "publication") (x as any).publicationAvailable = true;
      vi.stubGlobal("fetch", vi.fn(async () => json(x))); await expect(getRoundPlan(scope(), event)).rejects.toThrow();
    }
  });
  it("keeps Company All retained reads and blocks writes before HTTP", async () => {
    identity.branchId = null; selected = { entityId: company, branchScope: "all" };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(record())); vi.stubGlobal("fetch", fetcher);
    await getRoundPlan(scope(), event); expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-Shell-Branch-Scope")).toBe("all");
    await expect(sendRoundPlan(scope(), roundCommand(event, 7, null, "Create", key, empty()))).rejects.toThrow("Choose"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a response when the actor changes while the read is in flight", async () => {
    const captured = scope(); vi.stubGlobal("fetch", vi.fn(async () => { identity = { ...identity, principalId: key }; return json(record()); }));
    await expect(getRoundPlan(captured, event)).rejects.toThrow("account or organisation changed");
  });
});
describe("authoritative action admission", () => {
  it("requires READ, technical Record, named action grant, hint and selected current scope independently", () => {
    const captured = scope(), access = { capabilities: { roundPlanRead: true, roundPlanRecord: true }, permissions: ["procurement-round-plan-read", "procurement-round-plan-cancel"] };
    expect(roundPlanActionAvailable(access, captured, ["Cancel"], "Cancel")).toBe(true);
    expect(roundPlanActionAvailable(access, captured, ["Revise"], "Revise")).toBe(false);
    expect(roundPlanActionAvailable({ ...access, capabilities: { ...access.capabilities, roundPlanRecord: false } }, captured, ["Cancel"], "Cancel")).toBe(false);
    expect(roundPlanActionAvailable({ ...access, permissions: ["procurement-round-plan-cancel"] }, captured, ["Cancel"], "Cancel")).toBe(false);
    expect(roundPlanActionAvailable(access, captured, [], "Cancel")).toBe(false);
    identity = { ...identity, principalId: key }; expect(roundPlanActionAvailable(access, captured, ["Cancel"], "Cancel")).toBe(false);
  });
});
describe("original actor/key exact command receipt", () => {
  it("allows user correction only after a confirmed validation rejection, never an ambiguous or stale result", () => {
    const store = new Map<string, string>(), locator: RoundLocator = { eventId: event, operation: "Revise", key };
    const journal = roundPlanJournal(scope(), event, { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => { store.delete(k); } }, nonce);
    journal.claim(locator); expect(journal.discardRejectedValidation(locator, 409)).toBe(false); expect(journal.state().blocked).toBe(true);
    expect(journal.discardRejectedValidation({ ...locator, key: nonce }, 422)).toBe(false);
    expect(journal.discardRejectedValidation(locator, 422)).toBe(true); expect(journal.state().blocked).toBe(false);
  });
  it("preserves original201 GET recovery after a lost response, with no repeat POST or business fields in the journal", async () => {
    const captured = scope(), store = new Map<string, string>(), locator: RoundLocator = { eventId: event, operation: "Create", key };
    const journal = roundPlanJournal(captured, event, { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => { store.delete(k); } }, nonce);
    expect(journal.claim(locator)).toBe(true);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") throw new Error("lost"); return json({ schemaVersion: 1, eventId: event, planId: plan, revisionId: revision, version: 1, status: "Draft", operation: "Create", commandKey: key, reviewAvailable: false, publicationAvailable: false }, 201); }); vi.stubGlobal("fetch", fetcher);
    await expect(sendRoundPlan(captured, roundCommand(event, 7, null, "Create", key, empty()))).rejects.toThrow("not confirmed");
    expect(journal.claim({ ...locator, key: nonce })).toBe(false);
    expect(journal.discardRejectedValidation(locator, 0)).toBe(false);
    expect(journal.discardRejectedValidation(locator, 503)).toBe(false);
    expect([...store.values()].join()).not.toMatch(/requirements|weight|reason|expectedEventVersion/);
    const result = await recoverRoundPlan(captured, locator); expect(result.httpStatus).toBe(201); expect(journal.confirm(locator, result)).toBe(true);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(key);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("X-Idempotency-Key")).toBe(false);
  });
});
