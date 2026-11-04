import { roundGuid, roundRequest, RoundPlanError, validateRoundDraft, type RoundContent, type RoundPolicyPin, type RoundScope, type RoundPlanState } from "./procurement-round-plan-api";
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const version = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
const hash = (x: unknown): x is string => typeof x === "string" && /^[a-f\d]{64}$/.test(x);
const invalid = () => new RoundPlanError(0, "The evaluation-plan review could not be verified. Keep the original save reference and refresh.");
const policyPin = (x: unknown): x is RoundPolicyPin | null => x === null || object(x) && roundGuid(x.policyVersionId) && version(x.policyVersionNumber);
const actions = ["Approve", "Return", "Reject"] as const;
export type RoundDecision = typeof actions[number];
export type RoundReviewOperation = "Submit" | RoundDecision;
export type RoundSubmitContext = { eventId: string; eventVersion: number; planId: string; planVersion: number; status: RoundPlanState; revisionId: string;
  contentSha256: string; allowedActions: string[]; applicableReviewPolicy: RoundPolicyPin | null };
export type RoundReviewTask = { eventId: string; planId: string; submissionId: string; caseId: string; assignmentId: string; submittedVersion: number;
  currentPlanVersion: number; eventVersion: number; contentSha256: string; assignmentVersion: number };
export type RoundReviewDetail = { eventId: string; planId: string; submissionId: string; submittedRevisionId: string; submittedVersion: number;
  currentPlanVersion: number; currentStatus: RoundPlanState; eventVersion: number; currentRound: boolean; allowedActions: RoundDecision[];
  eventHeader: { number: string; title: string; method: string; currencyCode: string; branchId: string }; contentSha256: string; submittedSnapshot: RoundContent;
  caseId: string; caseVersion: number; caseState: string; assignmentId: string; assignmentVersion: number; assignmentState: string;
  policyVersionId: string; policyVersionNumber: number };
export type RoundReviewLocator = { eventId: string; planId: string; key: string; operation: RoundReviewOperation;
  submissionId: string | null; assignmentId: string | null; expectedResultVersion: number };
export type RoundReviewCommand = RoundReviewLocator & { body: string };
export type RoundReviewReceipt = { schemaVersion: 1; eventId: string; planId: string; revisionId: string; version: number; status: RoundPlanState;
  operation: RoundReviewOperation; commandKey: string; reviewAvailable: true; publicationAvailable: false; submissionId: string; caseId: string;
  assignmentId: string | null; decisionId: string | null; httpStatus: number };
const states = ["Draft", "InReview", "Published", "Rejected", "Cancelled"];
function eventPath(eventId: string, suffix: string) { if (!roundGuid(eventId)) throw invalid(); return `/${eventId}/round-plan${suffix}`; }
function explicitBranch(scope: RoundScope) { scope.assertCurrent(); if (!scope.identity.branchId || scope.headers["X-Shell-Branch-Scope"]) throw new RoundPlanError(400, "Choose this RFQ’s permitted branch before changing its evaluation plan."); }
export async function getRoundSubmitContext(scope: RoundScope, eventId: string, signal?: AbortSignal): Promise<RoundSubmitContext> {
  explicitBranch(scope); const { body: x } = await roundRequest(scope, eventPath(eventId, "/submit-context"), { signal });
  if (!object(x) || x.eventId !== eventId || !version(x.eventVersion) || !roundGuid(x.planId) || !version(x.planVersion) || !states.includes(x.status)
    || !roundGuid(x.revisionId) || !hash(x.contentSha256) || !policyPin(x.applicableReviewPolicy) || !Array.isArray(x.allowedActions)
    || !x.allowedActions.every((a: unknown) => typeof a === "string" && ["Create", "Revise", "Cancel", "Submit"].includes(a))
    || x.allowedActions.includes("Submit") && (x.status !== "Draft" || !x.applicableReviewPolicy)) throw invalid();
  return x as RoundSubmitContext;
}
export async function listRoundReviewTasks(scope: RoundScope, after: string | null = null, signal?: AbortSignal): Promise<{ items: RoundReviewTask[]; nextCursor: string | null }> {
  if (after !== null && !roundGuid(after)) throw invalid();
  const { body: x } = await roundRequest(scope, `/round-plan/review-tasks?limit=25${after ? `&after=${after}` : ""}`, { signal });
  if (!object(x) || !Array.isArray(x.items) || x.items.length > 25 || !(x.nextCursor === null || roundGuid(x.nextCursor))
    || x.nextCursor === after && after !== null || !x.items.every((r: unknown) => object(r)
      && [r.eventId, r.planId, r.submissionId, r.caseId, r.assignmentId].every(roundGuid) && [r.submittedVersion, r.currentPlanVersion, r.eventVersion, r.assignmentVersion].every(version)
      && r.currentPlanVersion >= r.submittedVersion && hash(r.contentSha256)) || new Set(x.items.map((r: any) => r.assignmentId)).size !== x.items.length) throw invalid();
  return x as { items: RoundReviewTask[]; nextCursor: string | null };
}
export async function getRoundReviewDetail(scope: RoundScope, eventId: string, submissionId: string, signal?: AbortSignal): Promise<RoundReviewDetail> {
  if (!roundGuid(submissionId)) throw invalid();
  const { body: x } = await roundRequest(scope, eventPath(eventId, `/reviews/${submissionId}`), { signal });
  if (!object(x) || x.eventId !== eventId || x.submissionId !== submissionId || ![x.planId, x.submittedRevisionId, x.caseId, x.assignmentId, x.policyVersionId].every(roundGuid)
    || ![x.submittedVersion, x.currentPlanVersion, x.eventVersion, x.caseVersion, x.assignmentVersion, x.policyVersionNumber].every(version)
    || x.currentPlanVersion < x.submittedVersion || !states.includes(x.currentStatus) || !hash(x.contentSha256) || typeof x.currentRound !== "boolean"
    || !object(x.eventHeader) || !roundGuid(x.eventHeader.branchId) || scope.identity.branchId !== null && scope.identity.branchId !== x.eventHeader.branchId
    || ![x.eventHeader.number, x.eventHeader.title, x.eventHeader.method].every(v => typeof v === "string") || !/^[A-Z]{3}$/.test(x.eventHeader.currencyCode)
    || typeof x.caseState !== "string" || typeof x.assignmentState !== "string" || !Array.isArray(x.allowedActions) || !x.allowedActions.every((a: any) => actions.includes(a))
    || x.allowedActions.length && (!x.currentRound || x.currentStatus !== "InReview" || x.caseState !== "Pending" || x.assignmentState !== "Pending" || !!scope.headers["X-Shell-Branch-Scope"])
    || !object(x.submittedSnapshot) || x.submittedSnapshot.schemaVersion !== 1 || typeof x.submittedSnapshot.companyTimeZoneId !== "string") throw invalid();
  validateRoundDraft(x.submittedSnapshot);
  return x as RoundReviewDetail;
}
export function validRoundReviewLocator(x: unknown): x is RoundReviewLocator {
  if (!object(x) || Object.keys(x).length !== 7 || ![x.eventId, x.planId, x.key].every(roundGuid) || !version(x.expectedResultVersion) || !["Submit", ...actions].includes(x.operation)) return false;
  return x.operation === "Submit" ? x.submissionId === null && x.assignmentId === null : roundGuid(x.submissionId) && roundGuid(x.assignmentId);
}
export function roundSubmitCommand(context: RoundSubmitContext, key: string): RoundReviewCommand {
  if (!roundGuid(key) || !context.allowedActions.includes("Submit") || !context.applicableReviewPolicy || context.status !== "Draft" || !version(context.planVersion + 1)) throw invalid();
  const locator: RoundReviewLocator = { eventId: context.eventId, planId: context.planId, key, operation: "Submit", submissionId: null, assignmentId: null, expectedResultVersion: context.planVersion + 1 };
  if (!validRoundReviewLocator(locator)) throw invalid();
  return { ...locator, body: JSON.stringify({ expectedEventVersion: context.eventVersion, expectedPlanVersion: context.planVersion,
    submittedRevisionId: context.revisionId, contentSha256: context.contentSha256, ...context.applicableReviewPolicy }) };
}
export function roundDecisionCommand(detail: RoundReviewDetail, action: RoundDecision, reason: string, key: string): RoundReviewCommand {
  const trimmed = reason.trim();
  if (!roundGuid(key) || !detail.currentRound || !detail.allowedActions.includes(action) || !version(detail.currentPlanVersion + 1)
    || action !== "Approve" && (!trimmed || trimmed.length > 2000) || action === "Approve" && trimmed) throw invalid();
  const locator: RoundReviewLocator = { eventId: detail.eventId, planId: detail.planId, key, operation: action, submissionId: detail.submissionId,
    assignmentId: detail.assignmentId, expectedResultVersion: detail.currentPlanVersion + 1 };
  if (!validRoundReviewLocator(locator)) throw invalid();
  return { ...locator, body: JSON.stringify({ submissionId: detail.submissionId, assignmentId: detail.assignmentId, expectedEventVersion: detail.eventVersion,
    expectedPlanVersion: detail.currentPlanVersion, expectedCaseVersion: detail.caseVersion, expectedAssignmentVersion: detail.assignmentVersion, action, reason: action === "Approve" ? null : trimmed }) };
}
function receipt(x: unknown, status: number, locator: RoundReviewLocator): RoundReviewReceipt {
  const allowed = locator.operation === "Submit" ? ["InReview"] : locator.operation === "Approve" ? ["InReview", "Published"] : locator.operation === "Return" ? ["Draft"] : ["Rejected"];
  if (!object(x) || x.schemaVersion !== 1 || x.eventId !== locator.eventId || x.planId !== locator.planId || x.commandKey !== locator.key || x.operation !== locator.operation
    || x.version !== locator.expectedResultVersion || !roundGuid(x.revisionId) || !allowed.includes(x.status) || ![x.submissionId, x.caseId].every(roundGuid)
    || x.reviewAvailable !== true || x.publicationAvailable !== false || status !== (locator.operation === "Submit" ? 201 : 200)
    || locator.operation === "Submit" && (x.assignmentId !== null || x.decisionId !== null)
    || locator.operation !== "Submit" && (x.submissionId !== locator.submissionId || x.assignmentId !== locator.assignmentId || !roundGuid(x.decisionId))) throw invalid();
  return { ...x, httpStatus: status } as RoundReviewReceipt;
}
export async function sendRoundReview(scope: RoundScope, command: RoundReviewCommand): Promise<RoundReviewReceipt> {
  explicitBranch(scope); const { body: payload, ...locator } = command; if (!validRoundReviewLocator(locator)) throw invalid();
  const { body, status } = await roundRequest(scope, eventPath(command.eventId, command.operation === "Submit" ? "/submit" : "/decisions"),
    { method: "POST", headers: { "Idempotency-Key": command.key }, body: payload });
  return receipt(body, status, locator);
}
export async function recoverRoundReview(scope: RoundScope, locator: RoundReviewLocator): Promise<RoundReviewReceipt> {
  if (!validRoundReviewLocator(locator)) throw invalid();
  const { body, status } = await roundRequest(scope, eventPath(locator.eventId, `/review-commands/${locator.key}`)); return receipt(body, status, locator);
}
