import { procurementScopeHeaders } from "../../shared/shell-scope";

export type ApprovalAction = "Approve" | "Reject" | "Return";
export type ApprovalDecision = { id: string; assignmentId: string; actorSubjectId: string; action: ApprovalAction; reason?: string | null; decidedAt: string };
export type ApprovalQueue = { records: Array<{ caseId: string; requestId: string; requestNumber: string; purpose: string;
  currencyCode: string; amount: number; amountBasis: string; state: string; requestVersion: number; caseVersion: number;
  openedAt: string; stage: { id: string; code: string; state: string }; assignments: Array<{ id: string; version: number; state: string }> }>;
  count: number; limit: number; offset: number };
export type ApprovalDetail = { caseId: string; requestId: string; requestNumber: string; purpose: string; currencyCode: string;
  amount: number; amountBasis: string; state: string; requestState: string; requestVersion: number; caseVersion: number;
  submittedVersion: number; openedAt: string; completedAt?: string | null; requestSnapshot: Record<string, unknown>;
  stages: Array<{ id: string; sequence: number; code: string; state: string; mode: string; requiredApprovals: number;
    assignments: Array<{ id: string; principalId: string; state: string; version: number; isMine: boolean; allowedActions: ApprovalAction[] }> }>;
  decisions: ApprovalDecision[]; blockers: string[] };
export type ApprovalReceipt = { caseId: string; requestId: string; submittedVersion: number; requestVersion: number;
  caseVersion: number; state: string; requestState: string; approvalState: string; assignmentId?: string; assignmentVersion?: number; decisionId?: string };
export type ApprovalHistory = { requestId: string; records: Array<{ caseId: string; submittedVersion: number; state: string;
  openedAt: string; completedAt?: string | null; decisions: ApprovalDecision[];
  financeRelease?: { releaseRequestId: string; state: "Pending" | "Confirmed"; confirmedAt?: string | null } | null }> };
export type ApprovalCommand = { action: ApprovalAction; reason?: string | null; expectedCaseVersion: number;
  expectedAssignmentVersion: number; expectedRequestVersion: number };
export class ApprovalApiError extends Error {
  constructor(readonly status: number, message: string, readonly code = "", readonly details: string[] = []) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const version = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const validId = (id: string) => { if (!guid.test(id)) throw new ApprovalApiError(0, "The approval reference is invalid."); };
const actions = ["Approve", "Reject", "Return"];
async function request(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  validId(company);
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new ApprovalApiError(0, "The action was not confirmed. Retry the same action to check its result."); }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new ApprovalApiError(response.status,
    response.status === 401 ? "Sign in to ERP to open approvals." : response.status === 403 ? "You do not have access to this approval."
      : object(body) && typeof body.message === "string" ? body.message
        : response.status === 404 ? "Approval not found or no longer available to you."
          : response.status === 409 ? "This approval changed. Refresh before deciding again." : "Approvals are unavailable. Try again later.",
    object(body) && typeof body.code === "string" ? body.code : "",
    object(body) && Array.isArray(body.details) ? body.details.filter((v): v is string => typeof v === "string") : []);
  return body;
}
function validDecision(v: unknown): boolean {
  return object(v) && guid.test(String(v.id)) && guid.test(String(v.assignmentId)) && typeof v.actorSubjectId === "string"
    && actions.includes(String(v.action)) && (v.reason == null || typeof v.reason === "string") && typeof v.decidedAt === "string";
}
function receipt(v: unknown): ApprovalReceipt {
  if (!object(v) || !guid.test(String(v.caseId)) || !guid.test(String(v.requestId)) || !version(v.caseVersion)
    || !version(v.requestVersion) || !version(v.submittedVersion) || typeof v.state !== "string"
    || typeof v.requestState !== "string" || typeof v.approvalState !== "string") throw new ApprovalApiError(0, "The ERP did not confirm the approval result. Retry the same action.");
  return v as unknown as ApprovalReceipt;
}
export async function listAssignedApprovals(company: string, offset = 0, signal?: AbortSignal): Promise<ApprovalQueue> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApprovalApiError(0, "The approval page is invalid.");
  const body = await request(company, `/approvals?state=Pending&limit=25&offset=${offset}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || !Number.isSafeInteger(body.count) || !version(body.limit)
    || Number(body.count) < 0 || Number(body.limit) > 100 || !Number.isSafeInteger(body.offset) || Number(body.offset) < 0 || !body.records.every((v: unknown) => object(v) && guid.test(String(v.caseId))
      && guid.test(String(v.requestId)) && typeof v.requestNumber === "string" && typeof v.purpose === "string"
      && typeof v.amount === "number" && Number.isFinite(v.amount) && v.amount >= 0
      && v.amountBasis === "EstimatedLineBase" && typeof v.currencyCode === "string" && typeof v.openedAt === "string" && object(v.stage) && typeof v.stage.code === "string"))
    throw new ApprovalApiError(0, "The ERP returned an invalid approval list.");
  return body as unknown as ApprovalQueue;
}
export async function getApproval(company: string, caseId: string, signal?: AbortSignal): Promise<ApprovalDetail> {
  validId(caseId); const body = await request(company, `/approvals/${caseId}`, { signal });
  if (!object(body) || body.caseId !== caseId || !guid.test(String(body.requestId)) || !version(body.caseVersion)
    || !version(body.requestVersion) || typeof body.requestState !== "string" || typeof body.state !== "string"
    || typeof body.requestNumber !== "string" || typeof body.purpose !== "string" || typeof body.amount !== "number"
    || !Number.isFinite(body.amount) || body.amount < 0 || !version(body.submittedVersion) || typeof body.openedAt !== "string"
    || typeof body.currencyCode !== "string" || body.amountBasis !== "EstimatedLineBase" || !object(body.requestSnapshot)
    || !Array.isArray(body.decisions) || !body.decisions.every(validDecision) || !Array.isArray(body.blockers)
    || !body.blockers.every((v) => typeof v === "string") || !Array.isArray(body.stages)
    || !body.stages.every((s: unknown) => object(s) && guid.test(String(s.id)) && typeof s.code === "string"
      && typeof s.state === "string" && Array.isArray(s.assignments) && s.assignments.every((a: unknown) =>
        object(a) && guid.test(String(a.id)) && version(a.version) && typeof a.isMine === "boolean"
        && typeof a.state === "string" && Array.isArray(a.allowedActions) && a.allowedActions.every((v) => actions.includes(String(v))))))
    throw new ApprovalApiError(0, "The ERP returned invalid approval details.");
  return body as unknown as ApprovalDetail;
}
export async function openApproval(company: string, requestId: string, expectedRequestVersion: number, key: string): Promise<ApprovalReceipt> {
  validId(requestId); validId(key);
  return receipt(await request(company, `/requests/${requestId}/approval-cases`, { method: "POST",
    headers: { "Idempotency-Key": key }, body: JSON.stringify({ expectedRequestVersion }) }));
}
export async function decideApproval(company: string, caseId: string, assignmentId: string, command: ApprovalCommand, key: string): Promise<ApprovalReceipt> {
  validId(caseId); validId(assignmentId); validId(key);
  if (!actions.includes(command.action) || !version(command.expectedCaseVersion) || !version(command.expectedAssignmentVersion)
    || !version(command.expectedRequestVersion) || (command.reason?.length ?? 0) > 2000
    || command.action !== "Approve" && !command.reason?.trim()) throw new ApprovalApiError(422, "Add a reason for rejecting or returning this request.");
  const result = receipt(await request(company, `/approvals/${caseId}/assignments/${assignmentId}/decisions`, { method: "POST",
    headers: { "Idempotency-Key": key }, body: JSON.stringify(command) }));
  if (result.caseId !== caseId || result.assignmentId !== assignmentId || !guid.test(String(result.decisionId)) || !version(result.assignmentVersion))
    throw new ApprovalApiError(0, "The ERP did not confirm this decision. Retry the same action.");
  return result;
}
export async function getApprovalHistory(company: string, requestId: string, signal?: AbortSignal): Promise<ApprovalHistory> {
  validId(requestId); const body = await request(company, `/requests/${requestId}/approval-history`, { signal });
  if (!object(body) || body.requestId !== requestId || !Array.isArray(body.records)
    || !body.records.every((v: unknown) => object(v) && guid.test(String(v.caseId)) && version(v.submittedVersion)
      && typeof v.state === "string" && typeof v.openedAt === "string" && Array.isArray(v.decisions) && v.decisions.every(validDecision)))
    throw new ApprovalApiError(0, "Approval history could not be loaded.");
  return body as unknown as ApprovalHistory;
}


export type FinanceReleaseRow = { requestId: string; requestNumber: string; requestVersion: number; requestState: string;
  releaseRequestId: string; reservationReference: string; reservedAmount: number; currencyCode: string; requestedAt: string };
export type FinanceReleaseQueue = { records: FinanceReleaseRow[]; count: number; limit: number; offset: number };
export type FinanceReleaseCommand = { expectedRequestVersion: number; reservationReference: string; releasedAmount: number;
  currencyCode: string; evidenceReference: string; confirmedAt: string; reason: string };
export async function listFinanceReleases(company: string, offset = 0, signal?: AbortSignal): Promise<FinanceReleaseQueue> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApprovalApiError(0, "The Finance queue page is invalid.");
  const body = await request(company, `/requests/finance-release-queue?limit=25&offset=${offset}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || !Number.isSafeInteger(body.count) || Number(body.count) < 0
    || !version(body.limit) || Number(body.limit) > 100 || !Number.isSafeInteger(body.offset)
    || !body.records.every((v: unknown) => object(v) && guid.test(String(v.requestId)) && guid.test(String(v.releaseRequestId))
      && typeof v.requestNumber === "string" && typeof v.requestState === "string" && version(v.requestVersion)
      && typeof v.reservationReference === "string" && typeof v.reservedAmount === "number" && Number.isFinite(v.reservedAmount)
      && v.reservedAmount >= 0 && typeof v.currencyCode === "string" && typeof v.requestedAt === "string"))
    throw new ApprovalApiError(0, "The ERP returned an invalid Finance release queue.");
  return body as unknown as FinanceReleaseQueue;
}
export async function confirmFinanceRelease(company: string, requestId: string, command: FinanceReleaseCommand, key: string): Promise<{ requestId: string; requestVersion: number; requestState: string; releaseRequestId: string; confirmationId: string; financeReleaseState: "Confirmed"; evidenceMode: "ApprovedManualEvidence" }> {
  validId(requestId); validId(key);
  if (!version(command.expectedRequestVersion) || !command.evidenceReference.trim() || !command.reason.trim()
    || command.evidenceReference.length > 500 || command.reason.length > 2000 || !Number.isFinite(Date.parse(command.confirmedAt)))
    throw new ApprovalApiError(422, "Add the Finance evidence, confirmation date and reason.");
  const body = await request(company, `/requests/${requestId}/finance-release-confirmations`, { method: "POST",
    headers: { "Idempotency-Key": key }, body: JSON.stringify(command) });
  if (!object(body) || body.requestId !== requestId || !version(body.requestVersion) || typeof body.requestState !== "string"
    || !guid.test(String(body.releaseRequestId)) || !guid.test(String(body.confirmationId))
    || body.financeReleaseState !== "Confirmed" || body.evidenceMode !== "ApprovedManualEvidence")
    throw new ApprovalApiError(0, "The ERP did not confirm the Finance evidence. Retry the same confirmation.");
  return body as { requestId: string; requestVersion: number; requestState: string; releaseRequestId: string; confirmationId: string; financeReleaseState: "Confirmed"; evidenceMode: "ApprovedManualEvidence" };
}
