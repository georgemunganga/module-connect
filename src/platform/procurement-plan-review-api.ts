import { procurementScopeHeaders } from "../../shared/shell-scope";
import { readPlanJson, planAmount, sumPlanAmounts } from "../../shared/procurement-plan-json";
import type { PlanDetail } from "./procurement-plans-api";
export const planGuid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v) && v !== "00000000-0000-0000-0000-000000000000";
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const version = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const actions = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
export class PlanReviewError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const invalid = () => new PlanReviewError(0, "The plan review could not be verified. Keep the original command reference and refresh.");
export type PlanReviewIdentity = { tenantId: string; legalEntityId: string; principalId: string; branchId: string | null; authEpoch: number };
export type PlanReviewScope = { identity: Readonly<PlanReviewIdentity>; headers: Readonly<Record<string, string>>; current(): boolean; assertCurrent(): void };
export function capturePlanReviewScope(identity: PlanReviewIdentity, currentIdentity: () => PlanReviewIdentity | null): PlanReviewScope {
  if (!identity.tenantId || !planGuid(identity.legalEntityId) || !planGuid(identity.principalId) || identity.branchId !== null && !planGuid(identity.branchId)) throw invalid();
  const captured = JSON.stringify(identity), headers = procurementScopeHeaders(identity.legalEntityId);
  if ((headers["X-Shell-Location"] ?? null) !== identity.branchId || identity.branchId && headers["X-Shell-Branch-Scope"]) throw invalid();
  const current = () => { try { return JSON.stringify(currentIdentity()) === captured && JSON.stringify(procurementScopeHeaders(identity.legalEntityId)) === JSON.stringify(headers); } catch { return false; } };
  return { identity: Object.freeze({ ...identity }), headers: Object.freeze(headers), current,
    assertCurrent() { if (!current()) throw new PlanReviewError(0, "Your account or organisation changed. Open the plan again."); } };
}
async function request(scope: PlanReviewScope, path: string, init: RequestInit = {}): Promise<{ body: unknown; status: number }> {
  scope.assertCurrent();
  const headers = new Headers(scope.headers); if (init.body) headers.set("Content-Type", "application/json");
  new Headers(init.headers).forEach((v, k) => { if (k.toLowerCase() !== "idempotency-key") throw invalid(); headers.set(k, v); });
  let response: Response;
  try { response = await fetch('/api/procurement/v1/plans' + path, { ...init, credentials: "include", cache: "no-store", headers }); }
  catch { throw new PlanReviewError(0, "The response was not confirmed. Check the original saved result before another change."); }
  scope.assertCurrent(); let body: unknown;
  try { body = readPlanJson(await response.text()); } catch { throw invalid(); }
  scope.assertCurrent();
  if (!response.ok) throw new PlanReviewError(response.status, response.status === 404
    ? "This plan review or saved result is unavailable in your current scope."
    : obj(body) && typeof body.message === "string" ? body.message : "Plan review is unavailable. Check your access and refresh.");
  return { body, status: response.status };
}
export type PlanSnapshot = { schemaVersion: 1; tenantId: string; legalEntityId: string; planId: string; planNumber: string;
  submittedVersion: number; branchRef: string; ownerSubjectId: string; departmentRef: string | null;
  financialPeriodRef: string; currencyCode: string; fundingSourceRef: string | null; estimatedAmount: string; lines: Omit<PlanDetail["lines"][number], "status" | "version">[] };
export type PlanTask = { planId: string; submissionId: string; caseId: string; caseVersion: number; code: "Review" | "Final";
  assignmentId: string; assignmentVersion: number; allowedActions: string[];
  plan: { id: string; number: string; branchRef: string; status: string; currencyCode: string; ownerSubjectId: string; version: number } };
export type PlanTaskPage = { items: PlanTask[]; total: number; page: number; pageSize: number; capped: boolean };
export type PlanRound = { planId: string; planNumber: string; planStatus: string; planVersion: number; submissionId: string;
  state: string; submittedPlanVersion: number; currencyCode: string; estimatedAmount: string; submittedSnapshot: PlanSnapshot;
  snapshotSha256: string; allowedActions: string[]; submittedAt: string; completedAt: string | null;
  caseId: string; caseState: string; caseVersion: number;
  stages: { id: string; code: string; state: string; assignments: { id: string; assigneeSubjectId: string; state: string; version: number; allowedActions: string[] }[] }[];
  decisions: { id: string; actorSubjectId: string; action: string; reason: string | null; decidedAt: string }[] };
export type PlanHistory = { planId: string; planVersion: number; planStatus: string;
  rounds: { id: string; coreApprovalCaseId: string; submittedPlanVersion: number; state: string; submittedAt: string; completedAt: string | null; currencyCode: string; estimatedAmount: string; snapshotSha256: string }[];
  decisions: PlanRound["decisions"] };
export async function listPlanReviewTasks(scope: PlanReviewScope, page = 1, signal?: AbortSignal): Promise<PlanTaskPage> {
  const { body } = await request(scope, `/review-tasks?page=${page}&pageSize=25`, { signal });
  if (!obj(body) || !Array.isArray(body.items) || !Number.isSafeInteger(body.total) || body.total < 0 || !version(body.page) || !version(body.pageSize) || typeof body.capped !== "boolean"
    || !body.items.every((x: unknown) => obj(x) && planGuid(x.planId) && planGuid(x.submissionId) && planGuid(x.caseId)
      && version(x.caseVersion) && planGuid(x.assignmentId) && version(x.assignmentVersion) && ["Review", "Final"].includes(x.code)
      && actions(x.allowedActions) && obj(x.plan) && x.plan.id === x.planId && planGuid(x.plan.branchRef) && version(x.plan.version)
      && typeof x.plan.number === "string" && typeof x.plan.currencyCode === "string")) throw invalid();
  return body as PlanTaskPage;
}
export async function getPlanRound(scope: PlanReviewScope, submissionId: string, signal?: AbortSignal): Promise<PlanRound> {
  if (!planGuid(submissionId)) throw invalid(); const { body: x } = await request(scope, `/review-submissions/${submissionId}`, { signal });
  if (!obj(x) || x.submissionId !== submissionId || !planGuid(x.planId) || !version(x.planVersion) || !version(x.submittedPlanVersion)
    || !planGuid(x.caseId) || !version(x.caseVersion) || !actions(x.allowedActions) || !obj(x.submittedSnapshot) || !Array.isArray(x.stages) || !Array.isArray(x.decisions)) throw invalid();
  const s = x.submittedSnapshot;
  if (s.schemaVersion !== 1 || s.planId !== x.planId || s.tenantId !== scope.identity.tenantId || s.legalEntityId !== scope.identity.legalEntityId
    || s.submittedVersion !== x.submittedPlanVersion || s.currencyCode !== x.currencyCode || !planGuid(s.branchRef)
    || scope.identity.branchId !== null && s.branchRef !== scope.identity.branchId || !planGuid(s.ownerSubjectId)
    || typeof s.financialPeriodRef !== "string" || !Array.isArray(s.lines) || !s.lines.length
    || !s.lines.every((l: unknown) => obj(l) && planGuid(l.id) && version(l.lineNumber) && typeof l.description === "string" && typeof l.unitCode === "string")
    || new Set(s.lines.map((l: any) => l.id)).size !== s.lines.length || new Set(s.lines.map((l: any) => l.lineNumber)).size !== s.lines.length
    || typeof x.snapshotSha256 !== "string" || !/^[a-f0-9]{64}$/.test(x.snapshotSha256)) throw invalid();
  try {
    for (const l of s.lines) { planAmount(l.estimatedAmount); planAmount(l.estimatedQuantity, true); }
    if (sumPlanAmounts(s.lines.map((l: any) => l.estimatedAmount)) !== sumPlanAmounts([planAmount(s.estimatedAmount)])
      || sumPlanAmounts([planAmount(x.estimatedAmount)]) !== sumPlanAmounts([s.estimatedAmount])) throw invalid();
  } catch { throw invalid(); }
  if (!x.stages.every((stage: unknown) => obj(stage) && planGuid(stage.id) && ["Review", "Final"].includes(stage.code) && typeof stage.state === "string"
    && Array.isArray(stage.assignments) && stage.assignments.every((a: unknown) => obj(a) && planGuid(a.id) && planGuid(a.assigneeSubjectId) && version(a.version) && actions(a.allowedActions)))
    || !x.decisions.every((d: unknown) => obj(d) && planGuid(d.id) && typeof d.action === "string" && typeof d.decidedAt === "string")) throw invalid();
  return x as PlanRound;
}
export async function getPlanReviewHistory(scope: PlanReviewScope, planId: string, signal?: AbortSignal): Promise<PlanHistory> {
  if (!planGuid(planId)) throw invalid(); const { body: x } = await request(scope, `/${planId}/review-history`, { signal });
  if (!obj(x) || x.planId !== planId || !version(x.planVersion) || !Array.isArray(x.rounds) || !Array.isArray(x.decisions)
    || !x.rounds.every((r: unknown) => obj(r) && planGuid(r.id) && planGuid(r.coreApprovalCaseId) && version(r.submittedPlanVersion) && typeof r.state === "string" && typeof r.submittedAt === "string")) throw invalid();
  return x as PlanHistory;
}
export type PlanReviewLocator = { key: string; operation: "Submit" | "Decide" | "Withdraw" | "ClaimScope"; planId: string; submissionId: string | null; assignmentId: string | null };
export type PlanReviewCommand = PlanReviewLocator & { body: string };
export type PlanReviewReceipt = { planId: string; planVersion: number; status?: string; submissionId?: string; caseId?: string; decisionId?: string; httpStatus: number };
function receipt(body: unknown, status: number, ref: PlanReviewLocator): PlanReviewReceipt {
  if (!obj(body) || ![200, 201].includes(status)) throw invalid();
  if (ref.operation === "ClaimScope") {
    if (body.id !== ref.planId || !version(body.version) || body.scopeClaimed !== true) throw invalid();
    return { planId: body.id, planVersion: body.version, httpStatus: status };
  }
  if (body.planId !== ref.planId || !version(body.planVersion) || !planGuid(body.submissionId) || !planGuid(body.caseId)
    || typeof body.status !== "string" || ref.submissionId && body.submissionId !== ref.submissionId
    || ref.assignmentId && body.assignmentId !== ref.assignmentId) throw invalid();
  return { ...body, httpStatus: status } as PlanReviewReceipt;
}
export async function sendPlanReview(scope: PlanReviewScope, command: PlanReviewCommand): Promise<PlanReviewReceipt> {
  if (!planGuid(command.key) || !planGuid(command.planId) || !scope.identity.branchId || scope.headers["X-Shell-Branch-Scope"]) throw new PlanReviewError(400, "Choose the plan's permitted branch before changing its review.");
  const path = command.operation === "Submit" ? `/${command.planId}/review-submissions`
    : command.operation === "ClaimScope" ? `/${command.planId}/claim-scope`
    : command.operation === "Withdraw" ? `/review-submissions/${command.submissionId}/withdrawals`
    : `/review-submissions/${command.submissionId}/assignments/${command.assignmentId}/decisions`;
  if (["Withdraw", "Decide"].includes(command.operation) && !planGuid(command.submissionId) || command.operation === "Decide" && !planGuid(command.assignmentId)) throw invalid();
  const result = await request(scope, path, { method: "POST", headers: { "Idempotency-Key": command.key }, body: command.body });
  return receipt(result.body, result.status, command);
}
export async function recoverPlanReview(scope: PlanReviewScope, locator: PlanReviewLocator): Promise<PlanReviewReceipt> {
  if (!planGuid(locator.key) || !planGuid(locator.planId)) throw invalid();
  const result = await request(scope, `/commands/${locator.key}`); return receipt(result.body, result.status, locator);
}

/** Use current owning CAS values; the historical submitted version is evidence only. */
export function planDecisionCommand(round: PlanRound, assignmentId: string, action: "Approve" | "Return" | "Reject", reason: string, key: string): PlanReviewCommand {
  const assignment = round.stages.flatMap(stage => stage.assignments).find(a => a.id === assignmentId);
  if (!assignment || !assignment.allowedActions.includes(action) || !planGuid(key) || !version(round.planVersion) || !version(round.caseVersion)
    || !version(assignment.version) || action !== "Approve" && !reason.trim() || reason.trim().length > 2000) throw invalid();
  return { key, operation: "Decide", planId: round.planId, submissionId: round.submissionId, assignmentId,
    body: JSON.stringify({ action, reason: reason.trim() || null, expectedPlanVersion: round.planVersion,
      expectedCaseVersion: round.caseVersion, expectedAssignmentVersion: assignment.version }) };
}
export function validPlanWithdrawalReason(reason: string): boolean {
  return reason.trim().length > 0 && reason.trim().length <= 2000;
}
export function planWithdrawCommand(round: PlanRound, reason: string, key: string): PlanReviewCommand {
  if (!round.allowedActions.includes("Withdraw") || !planGuid(key) || !version(round.planVersion) || !version(round.caseVersion) || !validPlanWithdrawalReason(reason)) throw invalid();
  return { key, operation: "Withdraw", planId: round.planId, submissionId: round.submissionId, assignmentId: null,
    body: JSON.stringify({ expectedPlanVersion: round.planVersion, expectedCaseVersion: round.caseVersion, reason: reason.trim() }) };
}
