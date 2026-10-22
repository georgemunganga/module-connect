import type { ApprovalLocator, ApprovalJournalScope } from "../../shared/procurement-approval-command";
import { ApprovalApiError, type ApprovalReceipt } from "./procurement-approvals-api";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const guid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v)
  && v !== "00000000-0000-0000-0000-000000000000";
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const exactKeys = (v: object, names: string[]) => Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
const invalid = () => new ApprovalApiError(0, "The original approval result could not be confirmed. Its saved reference remains blocked.");
/** The same exact 8-field Open / 11-field Decide original result as the owning API. */
export function readBoundApprovalResult(value: unknown, locator: ApprovalLocator): ApprovalReceipt {
  const common = ["caseId", "requestId", "submittedVersion", "requestVersion", "caseVersion", "state", "requestState", "approvalState"];
  if (!object(value) || !exactKeys(value, locator.operation === "Open" ? common : [...common, "assignmentId", "assignmentVersion", "decisionId"])
    || !guid(value.caseId) || value.requestId !== locator.requestId || !positive(value.submittedVersion)
    || !positive(value.requestVersion) || !positive(value.caseVersion) || value.requestVersion < value.submittedVersion
    || value.submittedVersion > locator.expectedRequestVersion || value.approvalState !== value.state) throw invalid();
  const state = value.state, requestState = value.requestState;
  if (!(state === "Pending" && requestState === "Submitted" || state === "Approved" && requestState === "Approved"
    || state === "Rejected" && requestState === "Rejected" || state === "Returned" && requestState === "ReturnPendingFinanceRelease")) throw invalid();
  if (locator.operation === "Open") {
    if (state !== "Pending" || value.requestVersion !== locator.expectedRequestVersion + 1) throw invalid();
  } else if (value.caseId !== locator.caseId || value.assignmentId !== locator.assignmentId || !guid(value.decisionId)
    || !positive(value.assignmentVersion) || value.assignmentVersion !== locator.expectedAssignmentVersion! + 1
    || value.caseVersion !== locator.expectedCaseVersion! + (state === "Pending" ? 0 : 1)
    || value.requestVersion !== locator.expectedRequestVersion + (state === "Pending" ? 0 : 1)) throw invalid();
  return value as unknown as ApprovalReceipt;
}
export type ApprovalAcknowledgement = { acknowledgementSchemaVersion: 1; acknowledgement: "Completed";
  operation: "Open" | "Decide"; commandKey: string; requestId: string; caseId: string; assignmentId: string | null;
  completedAt: string; result: ApprovalReceipt };
export function readApprovalAcknowledgement(value: unknown, locator: ApprovalLocator): ApprovalAcknowledgement {
  if (!object(value) || !exactKeys(value, ["acknowledgementSchemaVersion", "acknowledgement", "operation", "commandKey", "requestId", "caseId", "assignmentId", "completedAt", "result"])
    || value.acknowledgementSchemaVersion !== 1 || value.acknowledgement !== "Completed" || value.operation !== locator.operation
    || value.commandKey !== locator.key || value.requestId !== locator.requestId || !guid(value.caseId)
    || value.assignmentId !== locator.assignmentId || locator.caseId !== null && value.caseId !== locator.caseId
    || typeof value.completedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(value.completedAt)
    || !Number.isFinite(Date.parse(value.completedAt))) throw invalid();
  const result = readBoundApprovalResult(value.result, locator);
  if (value.caseId !== result.caseId) throw invalid();
  return { ...value, result } as ApprovalAcknowledgement;
}
/** Explicit GET only; absence/denial/transport never releases the caller's locator. */
export async function getApprovalAcknowledgement(scope: ApprovalJournalScope, locator: ApprovalLocator,
  signal?: AbortSignal): Promise<ApprovalAcknowledgement> {
  if (!guid(scope.companyId) || !guid(scope.principalId) || !guid(locator.key) || !guid(locator.requestId)
    || !(scope.branchId === null || guid(scope.branchId)) || !["Open", "Decide"].includes(locator.operation)) throw invalid();
  const headers = { "X-Shell-Entity": scope.companyId, ...(scope.branchId ? { "X-Shell-Location": scope.branchId } : {}) };
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/requests/${locator.requestId}/approval-commands/${locator.operation}/${locator.key}`,
    { method: "GET", headers, credentials: "include", cache: "no-store", signal }); }
  catch { throw new ApprovalApiError(0, "The saved result check was interrupted. Keep its reference and check again."); }
  if (!response.ok) throw new ApprovalApiError(response.status,
    "The original result is not currently available to your account. This does not show that the command failed; its reference remains blocked.");
  let value: unknown;
  try { value = await response.json(); } catch { throw invalid(); }
  return readApprovalAcknowledgement(value, locator);
}
