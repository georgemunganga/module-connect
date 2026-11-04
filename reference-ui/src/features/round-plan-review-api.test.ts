import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureRoundScope, type RoundIdentity } from "../../../src/platform/procurement-round-plan-api";
import { listRoundReviewTasks, recoverRoundReview, roundDecisionCommand, roundSubmitCommand, sendRoundReview,
  type RoundReviewDetail, type RoundSubmitContext } from "../../../src/platform/procurement-round-plan-review-api";
import { roundReviewJournal } from "../lib/round-plan-review-journal";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const company = id(1), branch = id(2), actor = id(3), event = id(4), plan = id(5), key = id(6), submission = id(7), assignment = id(8);
let identity: RoundIdentity;
const scope = () => captureRoundScope({ ...identity }, () => identity);
const context = (): RoundSubmitContext => ({ eventId: event, eventVersion: 9, planId: plan, planVersion: 3,
  status: "Draft", revisionId: id(9), contentSha256: "a".repeat(64), allowedActions: ["Submit"],
  applicableReviewPolicy: { policyVersionId: id(10), policyVersionNumber: 2 } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  identity = { tenantId: "test-company", companyId: company, principalId: actor, branchId: branch, authEpoch: 1 };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("round review command and recovery boundaries", () => {
  it("requires both the current Submit hint and the actual policy pin", () => {
    expect(() => roundSubmitCommand({ ...context(), allowedActions: [] }, key)).toThrow();
    expect(() => roundSubmitCommand({ ...context(), applicableReviewPolicy: null }, key)).toThrow();
    expect(JSON.parse(roundSubmitCommand(context(), key).body)).toMatchObject({ expectedEventVersion: 9,
      expectedPlanVersion: 3, submittedRevisionId: id(9), contentSha256: "a".repeat(64), policyVersionId: id(10), policyVersionNumber: 2 });
  });

  it("requires an independent current pending action and a reason for Return or Reject", () => {
    const detail = { currentRound: true, allowedActions: ["Approve", "Return", "Reject"], currentPlanVersion: 4,
      eventId: event, planId: plan, submissionId: submission, assignmentId: assignment,
      eventVersion: 10, caseVersion: 1, assignmentVersion: 1 } as RoundReviewDetail;
    expect(() => roundDecisionCommand({ ...detail, currentRound: false }, "Approve", "", key)).toThrow();
    expect(() => roundDecisionCommand({ ...detail, allowedActions: [] }, "Approve", "", key)).toThrow();
    expect(() => roundDecisionCommand(detail, "Return", " ", key)).toThrow();
    expect(() => roundDecisionCommand(detail, "Approve", "unrequested reason", key)).toThrow();
    expect(JSON.parse(roundDecisionCommand(detail, "Return", "  Clarify criteria  ", key).body)).toMatchObject({ action: "Return", reason: "Clarify criteria" });
    expect(JSON.parse(roundDecisionCommand(detail, "Approve", "", key).body).reason).toBeNull();
  });

  it("keeps an uncertain command blocked and recovers by GET with its original key", async () => {
    const command = roundSubmitCommand(context(), key), { body: _, ...locator } = command;
    const values = new Map<string, string>();
    const journal = roundReviewJournal(scope(), { getItem: k => values.get(k) ?? null,
      setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } }, id(11));
    expect(journal.claim(locator)).toBe(true);
    expect(journal.claim(locator)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Connection lost"); }));
    await expect(sendRoundReview(scope(), command)).rejects.toThrow();
    expect(journal.state().pending).toEqual(locator);
    expect(journal.rejectValidation(locator, 503)).toBe(false);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ schemaVersion: 1, eventId: event, planId: plan, revisionId: id(12),
      version: 4, status: "InReview", operation: "Submit", commandKey: key, reviewAvailable: true,
      publicationAvailable: false, submissionId: submission, caseId: id(13), assignmentId: null, decisionId: null }, 201));
    vi.stubGlobal("fetch", fetcher);
    const result = await recoverRoundReview(scope(), locator);
    expect(String(fetcher.mock.calls[0][0])).toContain(`/review-commands/${key}`);
    expect(fetcher.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(journal.confirm(locator, result)).toBe(true);
    expect(journal.state().blocked).toBe(false);
  });

  it("preserves scan progress for an empty task page without inventing a task", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [], nextCursor: id(14) })));
    expect(await listRoundReviewTasks(scope())).toEqual({ items: [], nextCursor: id(14) });
  });

  it("rejects a late response after identity or company context changes", async () => {
    const captured = scope();
    vi.stubGlobal("fetch", vi.fn(async () => { identity = { ...identity, principalId: id(15) }; return json({ items: [], nextCursor: null }); }));
    await expect(listRoundReviewTasks(captured)).rejects.toThrow();
  });
});
