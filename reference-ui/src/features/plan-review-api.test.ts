import { procurementIdentityBranch } from "../../../shared/shell-scope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePlanReviewScope, getPlanRound, listPlanReviewTasks, planDecisionCommand, planWithdrawCommand,
  recoverPlanReview, sendPlanReview, type PlanReviewIdentity, type PlanReviewLocator, type PlanRound } from "../../../src/platform/procurement-plan-review-api";
import { encodePlanDraft, getOwnPlan, PlanApiError } from "../../../src/platform/procurement-plans-api";
import { readPlanJson, sumPlanAmounts } from "../../../shared/procurement-plan-json";
import { canPlanReviewAction, hasPendingPlanCommand, planDraftFailureBlock } from "../lib/plan-review-access";
import { planReviewJournal } from "../lib/plan-review-journal";
const company = "11111111-1111-4111-8111-111111111111", branch = "22222222-2222-4222-8222-222222222222";
const principal = "33333333-3333-4333-8333-333333333333", plan = "44444444-4444-4444-8444-444444444444";
const submission = "55555555-5555-4555-8555-555555555555", approvalCase = "66666666-6666-4666-8666-666666666666";
const assignment = "77777777-7777-4777-8777-777777777777", line = "88888888-8888-4888-8888-888888888888";
const key = "99999999-9999-4999-8999-999999999999", nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("Plan editor pending-command record binding", () => {
  it("does not lock a new draft when both route and pending command are absent", () => {
    expect(hasPendingPlanCommand(undefined, null)).toBe(false);
    expect(hasPendingPlanCommand(undefined, undefined)).toBe(false);
    expect(hasPendingPlanCommand(undefined, { planId: plan })).toBe(false);
  });
  it("keeps a matching retained plan locked without blocking another plan", () => {
    expect(hasPendingPlanCommand(plan, { planId: plan })).toBe(true);
    expect(hasPendingPlanCommand(plan, null)).toBe(false);
    expect(hasPendingPlanCommand(plan, { planId: submission })).toBe(false);
  });
});
let identity: PlanReviewIdentity, selected: object;
const scope = () => capturePlanReviewScope({ ...identity }, () => identity);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const round = () => ({ planId: plan, planNumber: "PLAN-1", planStatus: "Reviewed", planVersion: 8,
  submissionId: submission, state: "Pending", submittedPlanVersion: 3, currencyCode: "ZMW", estimatedAmount: "99999999999999.9999",
  submittedSnapshot: { schemaVersion: 1, tenantId: "tenant", legalEntityId: company, planId: plan, planNumber: "PLAN-1", submittedVersion: 3,
    branchRef: branch, ownerSubjectId: principal, departmentRef: null, financialPeriodRef: "FY-2027", currencyCode: "ZMW", fundingSourceRef: null,
    estimatedAmount: "99999999999999.9999", lines: [{ id: line, lineNumber: 1, description: "Original submitted need", unitCode: "each",
      estimatedQuantity: "1.0000", estimatedAmount: "99999999999999.9999", expectedOn: null }] },
  snapshotSha256: "a".repeat(64), allowedActions: ["Withdraw"], submittedAt: "2026-11-03T12:00:00Z", completedAt: null,
  caseId: approvalCase, caseState: "Pending", caseVersion: 7,
  stages: [{ id: line, code: "Final", state: "Active", assignments: [{ id: assignment, assigneeSubjectId: principal, state: "Pending", version: 6, allowedActions: ["Approve", "Return", "Reject"] }] }], decisions: [] }) as PlanRound;
beforeEach(() => {
  identity = { tenantId: "tenant", legalEntityId: company, principalId: principal, branchId: branch, authEpoch: 0 };
  selected = { entityId: company, branch };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(selected) });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("plan exact wire contract", () => {
  it("blocks another draft mutation after uncertain/stale cancellation but permits correction of validation errors", () => {
    for (const error of [new TypeError("Response lost"), new PlanApiError(0, "Invalid saved response"), new PlanApiError(503, "Unconfirmed")]) {
      expect(planDraftFailureBlock(error)).toBe("unknown");
    }
    expect(planDraftFailureBlock(new PlanApiError(409, "Changed"))).toBe("stale");
    expect(planDraftFailureBlock(new PlanApiError(422, "Give a reason"))).toBeNull();
    expect(planDraftFailureBlock(new PlanApiError(403, "Denied"))).toBeNull();
  });
  it("preserves numeric18,4 JSON tokens and exact quoted submitted amounts without Number", async () => {
    const raw = '{"estimatedAmount":99999999999999.9999,"estimatedQuantity":0.0001,"version":3,"description":"estimatedAmount:5"}';
    expect(readPlanJson(raw)).toEqual({ estimatedAmount: "99999999999999.9999", estimatedQuantity: "0.0001", version: 3, description: "estimatedAmount:5" });
    expect(sumPlanAmounts(["99999999999999.9998", "0.0001"])).toBe("99999999999999.9999");
    expect(() => readPlanJson('{"estimatedAmount":1.00001}')).toThrow();
    expect(() => readPlanJson('{"estimatedAmount":-1}')).toThrow();
  });
  it("sends existing draft JSON-number fields losslessly and rejects client-side invalid amounts", () => {
    const wire = encodePlanDraft({ financialPeriodRef: "FY-2027", currencyCode: "ZMW", lines: [{ description: "Need", unitCode: "each", estimatedQuantity: "0.0001", estimatedAmount: "99999999999999.9999" }] });
    expect(wire).toContain('"estimatedAmount":99999999999999.9999');
    expect(wire).toContain('"estimatedQuantity":0.0001');
    expect(() => encodePlanDraft({ financialPeriodRef: "FY", currencyCode: "ZMW", lines: [{ description: "Need", unitCode: "each", estimatedQuantity: "1", estimatedAmount: "1.00001" }] })).toThrow();
  });
  it("keeps older draft DTOs usable with no new action hints or review capability", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"'+plan+'","number":"PLAN-1","financialPeriodRef":"FY","currencyCode":"ZMW","status":"Draft","version":1,"revisionNumber":0,"lines":[{"id":"'+line+'","description":"Need","unitCode":"each","estimatedQuantity":1,"estimatedAmount":99999999999999.9999,"status":"Active"}]}')));
    const result = await getOwnPlan(company, plan);
    expect(result.lines[0].estimatedAmount).toBe("99999999999999.9999"); expect(result.allowedActions).toBeUndefined();
  });
});
describe("immutable plan review and current CAS", () => {
  it("reads the reviewer-safe immutable round, never the owner-only mutable plan", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(round())); vi.stubGlobal("fetch", fetcher);
    const value = await getPlanRound(scope(), submission);
    expect(value.submittedSnapshot.lines[0].description).toBe("Original submitted need");
    expect(value.submittedPlanVersion).toBe(3); expect(value.planVersion).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/procurement/v1/plans/review-submissions/${submission}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });
  it("rejects a guessed case ID and missing submission ID instead of linking a task to the wrong record", async () => {
    const task = { planId: plan, caseId: approvalCase, caseVersion: 7, code: "Final", assignmentId: assignment, assignmentVersion: 6,
      plan: { id: plan, number: "PLAN-1", branchRef: branch, status: "Reviewed", currencyCode: "ZMW", version: 8 }, allowedActions: [] };
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [task], page: 1, pageSize: 25, total: 1, capped: false })));
    await expect(listPlanReviewTasks(scope())).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [{ ...task, submissionId: submission }], page: 1, pageSize: 25, total: 1, capped: false })));
    expect((await listPlanReviewTasks(scope())).items[0].submissionId).not.toBe(approvalCase);
  });
  it("uses current plan/case/assignment versions after Review, not the submitted snapshot version", () => {
    const command = planDecisionCommand(round(), assignment, "Approve", "", key);
    expect(JSON.parse(command.body)).toEqual({ action: "Approve", reason: null, expectedPlanVersion: 8, expectedCaseVersion: 7, expectedAssignmentVersion: 6 });
    expect(JSON.parse(planWithdrawCommand(round(), "Need changes", key).body)).toMatchObject({ expectedPlanVersion: 8, expectedCaseVersion: 7 });
    const stopped = round(); stopped.stages[0].assignments[0].allowedActions = [];
    expect(() => planDecisionCommand(stopped, assignment, "Approve", "", key)).toThrow();
    expect(() => planDecisionCommand(round(), assignment, "Return", "", key)).toThrow();
  });
  it("requires a trimmed withdrawal reason up to 2000 characters before a command can be sent", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const reason of ["", " \t\n ", "x".repeat(2001)]) {
      expect(() => planWithdrawCommand(round(), reason, key)).toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
    const command = planWithdrawCommand(round(), "  Need revised forecasts  ", key);
    expect(JSON.parse(command.body)).toEqual({ expectedPlanVersion: 8, expectedCaseVersion: 7, reason: "Need revised forecasts" });
    expect(JSON.parse(planWithdrawCommand(round(), "x".repeat(2000), key).body).reason).toHaveLength(2000);
    fetcher.mockResolvedValue(json({ planId: plan, planVersion: 9, submissionId: submission, caseId: approvalCase, status: "Draft" }));
    await sendPlanReview(scope(), command);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/procurement/v1/plans/review-submissions/${submission}/withdrawals`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedPlanVersion: 8, expectedCaseVersion: 7, reason: "Need revised forecasts" });
  });
  it.each(["plan", "company", "branch", "total", "version"])("fails closed on a mismatched immutable snapshot %s", async field => {
    const value = round();
    if (field === "plan") value.submittedSnapshot.planId = key;
    if (field === "company") value.submittedSnapshot.legalEntityId = key;
    if (field === "branch") value.submittedSnapshot.branchRef = key;
    if (field === "total") value.submittedSnapshot.estimatedAmount = "1.0000";
    if (field === "version") value.submittedSnapshot.submittedVersion = 9;
    vi.stubGlobal("fetch", vi.fn(async () => json(value)));
    await expect(getPlanRound(scope(), submission)).rejects.toThrow();
  });
  it("accepts the actual Shell All empty-branch selection for retained READ and sends no review command", async () => {
    const allSelection = { entityId: company, branch: "", branchScope: "all" };
    identity.branchId = procurementIdentityBranch(allSelection.branch); selected = allSelection;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(round())); vi.stubGlobal("fetch", fetcher);
    await getPlanRound(scope(), submission);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-Shell-Branch-Scope")).toBe("all");
    await expect(sendPlanReview(scope(), planDecisionCommand(round(), assignment, "Approve", "", key))).rejects.toThrow("Choose");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a late response after current actor or branch changes", async () => {
    const captured = scope(); const value = round();
    vi.stubGlobal("fetch", vi.fn(async () => { identity = { ...identity, principalId: key }; return json(value); }));
    await expect(getPlanRound(captured, submission)).rejects.toThrow("account or organisation changed");
  });
});
describe("server hints and current review access", () => {
  it("requires workflow, current permission, explicit scope and a server hint independently", () => {
    const captured = scope(), access = { capabilities: { planReviewWorkflow: true }, permissions: ["procurement-plan-submit"] };
    expect(canPlanReviewAction(access, captured, ["Submit"], "Submit", "procurement-plan-submit")).toBe(true);
    expect(canPlanReviewAction({ ...access, capabilities: { planReviewWorkflow: false } }, captured, ["Submit"], "Submit", "procurement-plan-submit")).toBe(false);
    expect(canPlanReviewAction({ ...access, permissions: [] }, captured, ["Submit"], "Submit", "procurement-plan-submit")).toBe(false);
    expect(canPlanReviewAction(access, captured, [], "Submit", "procurement-plan-submit")).toBe(false);
    identity = { ...identity, authEpoch: 1 };
    expect(canPlanReviewAction(access, captured, ["Submit"], "Submit", "procurement-plan-submit")).toBe(false);
  });
});
describe("original actor/key recovery and minimal journal", () => {
  const locator = (): PlanReviewLocator => ({ key, operation: "Submit", planId: plan, submissionId: null, assignmentId: null });
  it("recovers original201 by GET after lost response and never issues another POST", async () => {
    const captured = scope(), store = new Map<string, string>();
    const journal = planReviewJournal(captured, { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => { store.delete(k); } }, nonce);
    const ref = locator(); expect(journal.claim(ref)).toBe(true);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("response lost");
      return json({ planId: plan, planVersion: 3, submissionId: submission, caseId: approvalCase, status: "Submitted" }, 201);
    }); vi.stubGlobal("fetch", fetcher);
    await expect(sendPlanReview(captured, { ...ref, body: '{"expectedPlanVersion":2}' })).rejects.toThrow("not confirmed");
    expect(journal.state().blocked).toBe(true); expect(journal.claim({ ...ref, key: nonce })).toBe(false);
    const receipt = await recoverPlanReview(captured, ref); expect(receipt.httpStatus).toBe(201); expect(receipt.planVersion).toBe(3);
    expect(journal.confirm(ref, receipt)).toBe(true); expect(journal.state().blocked).toBe(false);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls[0][1]?.headers).toBeInstanceOf(Headers);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(key);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("X-Idempotency-Key")).toBe(false);
  });
  it("accepts the canonical camel-case legacy scope-claim response and its original-key recovery", async () => {
    const captured = scope(), ref: PlanReviewLocator = { key, operation: "ClaimScope", planId: plan, submissionId: null, assignmentId: null };
    const fetcher = vi.fn(async () => json({ id: plan, branchRef: branch, currencyCode: "ZMW", version: 4, scopeClaimed: true }));
    vi.stubGlobal("fetch", fetcher);
    const saved = await sendPlanReview(captured, { ...ref, body: JSON.stringify({ version: 3, confirmStoredCurrencyCode: "ZMW", reason: "Assign original department forecast" }) });
    expect(saved).toEqual({ planId: plan, planVersion: 4, httpStatus: 200 });
    expect(await recoverPlanReview(captured, ref)).toEqual(saved);
  });
  it("leaves another actor or missing result pending; stores no business fields or command body", async () => {
    const store = new Map<string, string>(), captured = scope();
    const journal = planReviewJournal(captured, { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => { store.delete(k); } }, nonce);
    const ref = locator(); journal.claim(ref);
    expect([...store.values()].join()).not.toMatch(/reason|estimatedAmount|expectedPlanVersion|body/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Unavailable" }, 404)));
    await expect(recoverPlanReview(captured, ref)).rejects.toThrow(); expect(journal.state().pending).toEqual(ref);
    identity = { ...identity, principalId: key }; expect(journal.state().pending).toBeNull();
  });
});
