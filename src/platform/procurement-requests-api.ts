import { invoiceDecimal } from "../../shared/procurement-decimal";
import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Own purchase requests. Submission records demand but does not approve spending. */
export type RequestLineDraft = {
  id?: string | null; description: string; unitCode: string;
  requestedQuantity: string | number; estimatedUnitPrice: string | number;
  catalogItemId?: string | null; catalogEntryId?: string | null;
  catalogPublishedVersion?: number | null; preferredSupplierId?: string | null;
  categoryCode?: string | null; purchaseType?: string | null; neededBy?: string | null;
  discountPercent?: string | number | null; taxCodeRef?: string | null;
  costCenterRef?: string | null; projectRef?: string | null;
  specificationDocumentRefId?: string | null;
};
export type RequestDraft = {
  purpose: string; currencyCode?: string | null; neededBy?: string | null;
  costCenterRef?: string | null; projectRef?: string | null;
  deliveryLocationRef?: string | null; deliveryAddressText?: string | null;
  fundingSourceRef?: string | null; notesToApprover?: string | null;
  lines: RequestLineDraft[];
};
export type RequestSummary = { id: string; number: string; purpose: string; status: string;
  currencyCode: string; neededBy?: string | null; createdAt: string; version: number; lineCount: number };
export type RequestLineDetail = Omit<RequestLineDraft, "requestedQuantity" | "estimatedUnitPrice" | "discountPercent"> & {
  id: string; lineNumber: number; approvalStatus: string; requestedQuantity: number; estimatedUnitPrice: number;
  discountPercent?: number | null;
  exactAmounts?: { requestedQuantity: string; estimatedUnitPrice: string; discountPercent: string | null };
};
export type RequestDetail = RequestSummary & Omit<RequestDraft, "lines"> & {
  requestEditVersion?: number;
  approvalState?: string | null; approvalInstanceRef?: string | null; submittedAt?: string | null; submittedVersion?: number | null;
  returnedAt?: string | null; returnedBySubjectId?: string | null; returnReason?: string | null;
  lines: RequestLineDetail[];
};
export type RequestPage = { records: RequestSummary[]; count: number; limit: number; offset: number };
export type OwnBudgetStatus = { requestId: string; requestVersion: number;
  status: "Pending" | "Available" | "Insufficient" | "NotConfigured" | "PartiallyAvailable";
  checkedAt?: string | null; reservationConfirmed: boolean };
export type OwnPolicyStatus = { requestId: string; requestVersion: number;
  status: "Pending" | "Matched" | "Blocked" | "NotSubmitted";
  isAuthority: false; evaluation?: { summary: string; resultCode: string;
    policyVersionNumber: number; evaluatedAt: string } | null };
export type PolicyQueuePage = { records: Array<{ id: string; number: string; purpose: string;
  currencyCode: string; submittedAt: string; version: number; lineCount: number;
  estimatedBaseAmount: number; policyOutcome?: string | null;
  policyResultCode?: string | null }>; count: number; limit: number; offset: number };
export type PolicyCheckResult = { requestId: string; requestVersion: number;
  status: string; isAuthority: false; message?: string | null;
  evaluation?: { id: string; outcome: string; resultCode: string } | null };
export type ApprovalReadinessStatus = { requestId: string; requestVersion: number;
  estimatedAmount: number; currencyCode: string; prerequisitesMet: boolean;
  blockers: string[]; policyEvaluationId?: string | null; financeCheckId?: string | null;
  approvalRoute?: { hasSingleRoute: boolean; blockers: string[]; lines: Array<{ lineId: string;
    stages: Array<{ code: string; assignee: string; mode: string }> }> };
  assignmentPlan?: { resolved: boolean; blockers: string[]; stages: Array<{
    code: string; assigneeKind: string; mode: string; blocker: string | null;
    candidates: Array<{ subjectId: string; displayName: string }> }> }; canOpenCase?: false;
  isAuthority: false; nextStep: string };
export class RequestApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function request<T>(companyId: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!guid.test(companyId)) throw new RequestApiError(0, "Choose an ERP company before opening requests.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/requests${path}`, { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new RequestApiError(0, "Requests are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let reason = "";
    try { const body: unknown = await response.json(); if (object(body)) reason = String(body.message ?? body.detail ?? ""); }
    catch { /* Use the status-based message. */ }
    throw new RequestApiError(response.status, response.status === 403 ? "You do not have access to requests for this company."
      : response.status === 401 ? "Sign in to ERP to manage requests."
      : reason || (response.status === 409 ? "This request changed. Refresh and compare before saving." : "The request action failed."));
  }
  try { return await response.json() as T; }
  catch { throw new RequestApiError(0, "The ERP returned an invalid request response."); }
}
function validSummary(value: unknown): value is RequestSummary {
  return object(value) && guid.test(String(value.id)) && typeof value.number === "string"
    && typeof value.purpose === "string" && typeof value.status === "string"
    && typeof value.version === "number" && typeof value.currencyCode === "string";
}
function validDetail(value: unknown): value is RequestDetail {
  const rows = object(value) ? value.lines : null;
  return validSummary(value) && Array.isArray(rows)
    && rows.every((line: unknown) => object(line) && guid.test(String(line.id))
      && typeof line.description === "string" && typeof line.requestedQuantity === "number");
}
const headerOptional = ["neededBy", "costCenterRef", "projectRef", "deliveryLocationRef", "deliveryAddressText", "fundingSourceRef", "notesToApprover"] as const;
const lineOptional = ["catalogItemId", "catalogEntryId", "catalogPublishedVersion", "preferredSupplierId", "categoryCode", "purchaseType", "neededBy", "discountPercent", "taxCodeRef", "costCenterRef", "projectRef", "specificationDocumentRefId"] as const;
/** Strict edit projection: never reconstruct original values from legacy numeric fields. */
export function readExactRequestDraft(record: RequestDetail): RequestDraft {
  if (record.requestEditVersion !== 1 || !guid.test(record.id) || !Number.isSafeInteger(record.version) || record.version < 1
    || !["Draft", "ReturnedForChanges"].includes(record.status) || typeof record.purpose !== "string"
    || typeof record.currencyCode !== "string" || !Array.isArray(record.lines)
    || headerOptional.some(key => !Object.prototype.hasOwnProperty.call(record, key)
      || !(record[key] === null || typeof record[key] === "string")))
    throw new RequestApiError(0, "Exact request editing is unavailable. Open the saved request before changing it.");
  const lines = record.lines.filter(line => line.approvalStatus !== "Cancelled").map(line => {
    const exact = line.exactAmounts;
    if (!guid.test(line.id) || typeof line.description !== "string" || typeof line.unitCode !== "string"
      || typeof line.approvalStatus !== "string" || lineOptional.some(key => !Object.prototype.hasOwnProperty.call(line, key))
      || ["categoryCode", "purchaseType", "neededBy", "taxCodeRef", "costCenterRef", "projectRef"].some(key => {
        const value = (line as unknown as Record<string, unknown>)[key]; return value !== null && typeof value !== "string";
      })
      || ["catalogItemId", "catalogEntryId", "preferredSupplierId", "specificationDocumentRefId"].some(key => {
        const value = (line as unknown as Record<string, unknown>)[key]; return value !== null && (typeof value !== "string" || !guid.test(value));
      })
      || !(line.catalogPublishedVersion === null || Number.isSafeInteger(line.catalogPublishedVersion) && Number(line.catalogPublishedVersion) > 0)
      || !exact
      || typeof exact.requestedQuantity !== "string" || typeof exact.estimatedUnitPrice !== "string"
      || !(exact.discountPercent === null || typeof exact.discountPercent === "string"))
      throw new RequestApiError(0, "Complete exact request line details are unavailable. No changes were saved.");
    let quantity: string, price: string, discount: string | null;
    try { quantity = invoiceDecimal(exact.requestedQuantity, true); price = invoiceDecimal(exact.estimatedUnitPrice);
      discount = exact.discountPercent === null ? null : invoiceDecimal(exact.discountPercent); }
    catch { throw new RequestApiError(0, "The ERP returned an invalid exact request amount. No changes were saved."); }
    if ((line.discountPercent == null) !== (discount === null))
      throw new RequestApiError(0, "Complete exact discount evidence is unavailable. No changes were saved.");
    return { id: line.id, description: line.description, unitCode: line.unitCode,
      requestedQuantity: quantity, estimatedUnitPrice: price, catalogItemId: line.catalogItemId,
      catalogEntryId: line.catalogEntryId, catalogPublishedVersion: line.catalogPublishedVersion,
      preferredSupplierId: line.preferredSupplierId, categoryCode: line.categoryCode, purchaseType: line.purchaseType,
      neededBy: line.neededBy, discountPercent: discount, taxCodeRef: line.taxCodeRef,
      costCenterRef: line.costCenterRef, projectRef: line.projectRef, specificationDocumentRefId: line.specificationDocumentRefId };
  });
  if (!lines.length) throw new RequestApiError(0, "This request has no editable active lines.");
  return { purpose: record.purpose, currencyCode: record.currencyCode, neededBy: record.neededBy,
    costCenterRef: record.costCenterRef, projectRef: record.projectRef, deliveryLocationRef: record.deliveryLocationRef,
    deliveryAddressText: record.deliveryAddressText, fundingSourceRef: record.fundingSourceRef,
    notesToApprover: record.notesToApprover, lines };
}
/** Whitelist mutable fields; retain hidden owned fields, omit status/counters/approval authority. */
export function exactRequestPayload(draft: RequestDraft): RequestDraft {
  try {
  const lines = draft.lines.map(line => ({ id: line.id ?? null, description: line.description, unitCode: line.unitCode,
    requestedQuantity: invoiceDecimal(line.requestedQuantity, true), estimatedUnitPrice: invoiceDecimal(line.estimatedUnitPrice),
    catalogItemId: line.catalogItemId ?? null, catalogEntryId: line.catalogEntryId ?? null,
    catalogPublishedVersion: line.catalogPublishedVersion ?? null, preferredSupplierId: line.preferredSupplierId ?? null,
    categoryCode: line.categoryCode ?? null, purchaseType: line.purchaseType ?? null, neededBy: line.neededBy ?? null,
    discountPercent: line.discountPercent == null ? null : invoiceDecimal(line.discountPercent), taxCodeRef: line.taxCodeRef ?? null,
    costCenterRef: line.costCenterRef ?? null, projectRef: line.projectRef ?? null,
    specificationDocumentRefId: line.specificationDocumentRefId ?? null }));
  return { purpose: draft.purpose, currencyCode: draft.currencyCode ?? null, neededBy: draft.neededBy ?? null,
    costCenterRef: draft.costCenterRef ?? null, projectRef: draft.projectRef ?? null,
    deliveryLocationRef: draft.deliveryLocationRef ?? null, deliveryAddressText: draft.deliveryAddressText ?? null,
    fundingSourceRef: draft.fundingSourceRef ?? null, notesToApprover: draft.notesToApprover ?? null, lines };
  } catch { throw new RequestApiError(422, "Use exact positive quantities and non-negative prices with up to four decimal places."); }
}

export async function listOwnRequestDrafts(companyId: string, offset = 0, signal?: AbortSignal): Promise<RequestPage> {
  const body: unknown = await request(companyId, `?limit=50&offset=${offset}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || !body.records.every(validSummary)
    || typeof body.count !== "number" || typeof body.limit !== "number" || typeof body.offset !== "number")
    throw new RequestApiError(0, "The ERP returned an invalid request list.");
  return body as unknown as RequestPage;
}
export async function getOwnRequestDraft(companyId: string, id: string, signal?: AbortSignal): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}`, { signal });
  if (!validDetail(body) || body.id !== id) throw new RequestApiError(0, "The ERP returned invalid request details.");
  return body;
}
export async function getRequestForReview(companyId: string, id: string, signal?: AbortSignal): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/review`, { signal });
  if (!validDetail(body) || body.status !== "Submitted")
    throw new RequestApiError(0, "The ERP returned invalid request review details.");
  return body;
}
export async function getRequestApprovalReadiness(companyId: string, id: string,
  signal?: AbortSignal): Promise<ApprovalReadinessStatus> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/approval-readiness`, { signal });
  if (!object(body) || body.requestId !== id || typeof body.requestVersion !== "number"
    || typeof body.estimatedAmount !== "number" || typeof body.currencyCode !== "string"
    || typeof body.prerequisitesMet !== "boolean" || body.isAuthority !== false
    || !Array.isArray(body.blockers) || body.blockers.some((item: unknown) => typeof item !== "string"))
    throw new RequestApiError(0, "The ERP returned an invalid approval check.");
  return body as ApprovalReadinessStatus;
}
export async function getOwnRequestBudgetStatus(companyId: string, id: string, signal?: AbortSignal): Promise<OwnBudgetStatus> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/budget-status`, { signal });
  if (!object(body) || body.requestId !== id || typeof body.requestVersion !== "number"
    || typeof body.status !== "string" || typeof body.reservationConfirmed !== "boolean")
    throw new RequestApiError(0, "The ERP returned an invalid budget status.");
  return body as OwnBudgetStatus;
}
export async function getOwnRequestPolicyStatus(companyId: string, id: string, signal?: AbortSignal): Promise<OwnPolicyStatus> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/policy-status`, { signal });
  if (!object(body) || body.requestId !== id || typeof body.requestVersion !== "number"
    || typeof body.status !== "string" || body.isAuthority !== false)
    throw new RequestApiError(0, "The ERP returned an invalid buying-rule status.");
  return body as OwnPolicyStatus;
}
export async function listRequestsWaitingForPolicy(companyId: string, offset = 0, signal?: AbortSignal): Promise<PolicyQueuePage> {
  const body: unknown = await request(companyId, `/policy-queue?limit=50&offset=${Math.max(0, offset)}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || typeof body.count !== "number"
    || typeof body.limit !== "number" || typeof body.offset !== "number"
    || body.records.some((row: unknown) => !object(row) || !guid.test(String(row.id))
      || typeof row.number !== "string" || typeof row.purpose !== "string"
      || typeof row.version !== "number" || typeof row.currencyCode !== "string"
      || typeof row.lineCount !== "number" || typeof row.estimatedBaseAmount !== "number"))
    throw new RequestApiError(0, "The ERP returned an invalid buying-rule queue.");
  return body as PolicyQueuePage;
}
export async function checkRequestPolicy(companyId: string, id: string, version: number): Promise<PolicyCheckResult> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/policy-evaluations`,
    { method: "POST", body: JSON.stringify({ requestVersion: version }) });
  if (!object(body) || body.requestId !== id || body.requestVersion !== version
    || typeof body.status !== "string" || body.isAuthority !== false)
    throw new RequestApiError(0, "The ERP returned an invalid buying-rule check.");
  return body as PolicyCheckResult;
}
export async function returnRequestForChanges(companyId: string, id: string, version: number, reason: string): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  if (!reason.trim() || reason.trim().length > 1000) throw new RequestApiError(0, "Explain what needs to change in up to 1,000 characters.");
  const body: unknown = await request(companyId, `/${id}/return-for-changes`,
    { method: "POST", body: JSON.stringify({ version, reason: reason.trim() }) });
  if (!validDetail(body) || body.status !== "ReturnedForChanges")
    throw new RequestApiError(0, "The ERP did not confirm the return. Refresh before retrying.");
  return body;
}
export async function createOwnRequestDraft(companyId: string, draft: RequestDraft): Promise<RequestDetail> {
  const body: unknown = await request(companyId, "", { method: "POST", body: JSON.stringify(exactRequestPayload(draft)) });
  if (!validDetail(body)) throw new RequestApiError(0, "The ERP did not confirm the saved request. Refresh before retrying.");
  readExactRequestDraft(body);
  return body;
}
export async function updateOwnRequestDraft(companyId: string, id: string, version: number, draft: RequestDraft): Promise<RequestDetail> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1) throw new RequestApiError(0, "The request reference or version is invalid.");
  const body: unknown = await request(companyId, `/${id}`, { method: "PUT", body: JSON.stringify({ ...exactRequestPayload(draft), version }) });
  if (!validDetail(body) || body.id !== id || body.version !== version + 1) throw new RequestApiError(0, "The ERP did not confirm the request update. Refresh before retrying.");
  readExactRequestDraft(body);
  return body;
}
export async function submitOwnRequest(companyId: string, id: string, version: number): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/submit`, { method: "POST", body: JSON.stringify({ version }) });
  if (!validDetail(body) || body.status !== "Submitted" || body.approvalState !== "PendingPolicyAndBudget")
    throw new RequestApiError(0, "The ERP did not confirm submission. Refresh before retrying.");
  return body;
}
export async function withdrawOwnRequestDraft(companyId: string, id: string, version: number, reason?: string): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/withdraw`, { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validDetail(body) || body.status !== "Withdrawn") throw new RequestApiError(0, "The ERP did not confirm the withdrawal. Refresh before retrying.");
  return body;
}
