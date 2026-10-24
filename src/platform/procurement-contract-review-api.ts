import { procurementScopeHeaders } from "../../shared/shell-scope";
import { ContractApiError, validContractCeiling } from "./procurement-contracts-api";

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const present = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const id = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const reviewStatus = (value: unknown): value is ContractReviewStatus =>
  value === "Draft" || value === "PendingReview" || value === "Approved"
  || value === "Returned" || value === "Rejected";

export type ContractReviewStatus = "Draft" | "PendingReview" | "Approved" | "Returned" | "Rejected";
export type ContractReviewAction = "Approve" | "Return" | "Reject";
export type ContractReviewAck = {
  schemaVersion: 1; ContractId: string; SubmissionId: string; ReviewBranchId: string;
  VoteId: string | null; CorrectionId: string | null; Operation: "Submit" | "Decide" | "Correction";
  CommandKey: string; ActorPrincipalId: string; contractVersion: number;
  contractStatus: ContractReviewStatus;
};
export type AssignedContractReview = {
  Id: string; ContractId: string; CoreCaseId: string; ReviewBranchId: string;
  AssignmentId?: string;
  SubmittedAt: string; SubmissionNumber: number; Number: string; Title: string;
  CurrencyCode: string; Version: number;
};
export type AssignedContractReviews = {
  items: AssignedContractReview[]; total: number; page: number; pageSize: number;
};
export type FrozenContractReviewTerms = {
  schemaVersion: 1; contractId: string; contractVersionId: string;
  contractVersion: number; versionVersion: number; Number: string; SupplierId: string;
  Title: string; ContractType: string; CurrencyCode: string; ceilingAmountExact: string;
  EffectiveFrom: string | null; ExpiresOn: string | null; RenewalNoticeOn: string | null;
  rates: Array<{ Id: string; LineNumber: number; Version: number; Status: string;
    StatusReason: string | null; CatalogItemId: string | null; Description: string;
    UnitCode: string; unitPriceExact: string; maximumQuantityExact: string | null }>;
};
export type AssignedContractReviewDetail = {
  Id: string; ContractId: string; CoreCaseId: string; ReviewBranchId: string;
  SubmissionNumber: number; SubmittedAt: string; TermsSha256: string;
  terms: FrozenContractReviewTerms; Number: string; Title: string; SupplierId: string;
  CurrencyCode: string; contractVersion: number; caseVersion: number;
  assignmentVersion: number; assignmentId: string;
};

async function call(companyId: string, route: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(companyId)) throw new ContractApiError(0, "Choose an ERP company before opening contract review.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch("/api/procurement/v1/contracts" + route,
      { ...init, headers, credentials: "include", cache: "no-store" });
  } catch { throw new ContractApiError(0, "The review result could not be confirmed. Check its saved command before trying again."); }
  if (!response.ok) {
    let message = "";
    try { const body: unknown = await response.json(); if (present(body) && typeof body.message === "string") message = body.message; }
    catch { /* The status still determines the recovery path. */ }
    throw new ContractApiError(response.status, response.status === 403 || response.status === 404
      ? "This review is not available to you in the selected company and branch."
      : response.status === 409 ? message || "The contract or review changed. Refresh before deciding."
        : response.status === 503 ? "The review result could not be confirmed. Check its saved command."
          : message || "The review action could not be completed.");
  }
  try { return await response.json() as unknown; }
  catch { throw new ContractApiError(0, "The review result could not be confirmed. Check its saved command."); }
}

function ack(value: unknown, contractId: string, key: string, operation: ContractReviewAck["Operation"]): ContractReviewAck {
  if (!present(value) || value.schemaVersion !== 1 || value.Operation !== operation
    || value.ContractId !== contractId || value.CommandKey !== key
    || !id(value.SubmissionId) || !id(value.ReviewBranchId) || !id(value.ActorPrincipalId)
    || value.VoteId !== null && !id(value.VoteId)
    || value.CorrectionId !== null && !id(value.CorrectionId)
    || !version(value.contractVersion) || !reviewStatus(value.contractStatus)
    || operation === "Submit" && (value.contractStatus !== "PendingReview" || value.VoteId !== null || value.CorrectionId !== null)
    || operation === "Correction" && (value.contractStatus !== "Draft" || !id(value.CorrectionId) || value.VoteId !== null)
    || operation === "Decide" && (!id(value.VoteId) || value.CorrectionId !== null))
    throw new ContractApiError(0, "The ERP did not confirm this review action. Check its saved command.");
  return value as ContractReviewAck;
}

function target(contractId: string): string {
  if (!id(contractId)) throw new ContractApiError(0, "The contract reference is invalid.");
  return "/" + contractId;
}
function commandKey(key: string): string {
  if (!id(key)) throw new ContractApiError(0, "The saved review command is invalid.");
  return key;
}
export async function submitContractReview(companyId: string, contractId: string, key: string,
  expectedContractVersion: number, reviewBranchId: string): Promise<ContractReviewAck> {
  if (!version(expectedContractVersion) || !id(reviewBranchId)) throw new ContractApiError(422, "Choose an active review branch and refresh the draft.");
  return ack(await call(companyId, target(contractId) + "/internal-review/submit", {
    method: "POST", headers: { "Idempotency-Key": commandKey(key) },
    body: JSON.stringify({ expectedContractVersion, reviewBranchId }),
  }), contractId, key, "Submit");
}
export async function correctContractReview(companyId: string, contractId: string, key: string,
  expectedContractVersion: number, reason: string): Promise<ContractReviewAck> {
  if (!version(expectedContractVersion) || !reason.trim() || reason.trim().length > 2000)
    throw new ContractApiError(422, "Enter a correction reason of up to 2,000 characters.");
  return ack(await call(companyId, target(contractId) + "/internal-review/correct", {
    method: "POST", headers: { "Idempotency-Key": commandKey(key) },
    body: JSON.stringify({ expectedContractVersion, reason: reason.trim() }),
  }), contractId, key, "Correction");
}
export async function decideContractReview(companyId: string, contractId: string, assignmentId: string,
  key: string, input: { expectedContractVersion: number; expectedCaseVersion: number;
    expectedAssignmentVersion: number; action: ContractReviewAction; reason: string }): Promise<ContractReviewAck> {
  if (!id(assignmentId) || !version(input.expectedContractVersion) || !version(input.expectedCaseVersion)
    || !version(input.expectedAssignmentVersion) || !["Approve", "Return", "Reject"].includes(input.action)
    || input.action !== "Approve" && !input.reason.trim() || input.reason.trim().length > 2000)
    throw new ContractApiError(422, "Review the current assignment and give a reason for Return or Reject.");
  return ack(await call(companyId, target(contractId) + "/internal-review/assignments/" + assignmentId + "/decide", {
    method: "POST", headers: { "Idempotency-Key": commandKey(key) },
    body: JSON.stringify({ expectedContractVersion: input.expectedContractVersion,
      expectedCaseVersion: input.expectedCaseVersion,
      expectedAssignmentVersion: input.expectedAssignmentVersion,
      action: input.action, reason: input.reason.trim() || null }),
  }), contractId, key, "Decide");
}
export async function recoverContractReview(companyId: string, contractId: string,
  key: string, operation: ContractReviewAck["Operation"]): Promise<ContractReviewAck> {
  return ack(await call(companyId, "/internal-review/commands/" + commandKey(key)), contractId, key, operation);
}

function assigned(value: unknown): value is AssignedContractReview {
  return present(value) && id(value.Id) && id(value.ContractId) && id(value.CoreCaseId)
    && id(value.ReviewBranchId) && (value.AssignmentId === undefined || id(value.AssignmentId))
    && typeof value.SubmittedAt === "string"
    && version(value.SubmissionNumber) && typeof value.Number === "string"
    && typeof value.Title === "string" && typeof value.CurrencyCode === "string"
    && version(value.Version);
}
export async function listAssignedContractReviews(companyId: string, page = 1,
  signal?: AbortSignal): Promise<AssignedContractReviews> {
  if (!version(page)) throw new ContractApiError(422, "Choose a valid review page.");
  const result = await call(companyId, `/internal-review/assigned?page=${page}&pageSize=25`, { signal });
  if (!present(result) || !Array.isArray(result.items) || !result.items.every(assigned)
    || !Number.isSafeInteger(result.total) || Number(result.total) < 0
    || result.page !== page || result.pageSize !== 25)
    throw new ContractApiError(0, "The ERP returned an invalid assigned review list.");
  return result as AssignedContractReviews;
}
function frozen(value: unknown): value is FrozenContractReviewTerms {
  return present(value) && value.schemaVersion === 1 && id(value.contractId)
    && id(value.contractVersionId) && version(value.contractVersion) && version(value.versionVersion)
    && typeof value.Number === "string" && id(value.SupplierId)
    && typeof value.Title === "string" && typeof value.ContractType === "string"
    && typeof value.CurrencyCode === "string" && typeof value.ceilingAmountExact === "string"
    && validContractCeiling(value.ceilingAmountExact)
    && Array.isArray(value.rates) && value.rates.every((rate: unknown) => present(rate)
      && id(rate.Id) && version(rate.LineNumber) && version(rate.Version)
      && typeof rate.Description === "string" && typeof rate.UnitCode === "string"
      && typeof rate.unitPriceExact === "string" && validContractCeiling(rate.unitPriceExact)
      && (rate.maximumQuantityExact === null || typeof rate.maximumQuantityExact === "string"
        && validContractCeiling(rate.maximumQuantityExact))
      && (rate.Status === "Active" || rate.Status === "Removed"));
}
export async function getAssignedContractReview(companyId: string, contractId: string,
  assignmentId: string, signal?: AbortSignal): Promise<AssignedContractReviewDetail> {
  if (!id(assignmentId)) throw new ContractApiError(0, "The review assignment reference is invalid.");
  const result = await call(companyId, target(contractId) + "/internal-review/assignments/" + assignmentId,
    { signal });
  if (!present(result) || !id(result.Id) || result.ContractId !== contractId
    || !id(result.CoreCaseId) || !id(result.ReviewBranchId)
    || !version(result.SubmissionNumber) || typeof result.SubmittedAt !== "string"
    || typeof result.TermsSha256 !== "string" || !/^[a-f0-9]{64}$/.test(result.TermsSha256)
    || !frozen(result.terms) || result.terms.contractId !== contractId
    || typeof result.Number !== "string" || typeof result.Title !== "string"
    || !id(result.SupplierId) || typeof result.CurrencyCode !== "string"
    || !version(result.contractVersion) || !version(result.caseVersion)
    || !version(result.assignmentVersion) || result.assignmentId !== assignmentId)
    throw new ContractApiError(0, "The ERP returned invalid review details.");
  return result as AssignedContractReviewDetail;
}
