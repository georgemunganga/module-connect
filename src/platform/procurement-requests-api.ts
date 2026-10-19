/** Own purchase requests. Submission records demand but does not approve spending. */
export type RequestLineDraft = {
  id?: string | null; description: string; unitCode: string;
  requestedQuantity: number; estimatedUnitPrice: number;
  catalogItemId?: string | null; catalogEntryId?: string | null;
  catalogPublishedVersion?: number | null; preferredSupplierId?: string | null;
  categoryCode?: string | null; purchaseType?: string | null; neededBy?: string | null;
  discountPercent?: number | null; taxCodeRef?: string | null;
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
export type RequestDetail = RequestSummary & Omit<RequestDraft, "lines"> & {
  approvalState?: string | null; submittedAt?: string | null; submittedVersion?: number | null;
  lines: (RequestLineDraft & { id: string; lineNumber: number; approvalStatus: string })[];
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
export class RequestApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function request<T>(companyId: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!guid.test(companyId)) throw new RequestApiError(0, "Choose an ERP company before opening requests.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Shell-Entity", companyId);
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
  if (!validDetail(body)) throw new RequestApiError(0, "The ERP returned invalid request details.");
  return body;
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
export async function createOwnRequestDraft(companyId: string, draft: RequestDraft): Promise<RequestDetail> {
  const body: unknown = await request(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!validDetail(body)) throw new RequestApiError(0, "The ERP did not confirm the saved request. Refresh before retrying.");
  return body;
}
export async function updateOwnRequestDraft(companyId: string, id: string, version: number, draft: RequestDraft): Promise<RequestDetail> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body: unknown = await request(companyId, `/${id}`, { method: "PUT", body: JSON.stringify({ ...draft, version }) });
  if (!validDetail(body)) throw new RequestApiError(0, "The ERP did not confirm the request update. Refresh before retrying.");
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
