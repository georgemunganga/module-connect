import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Company-scoped Procurement policy drafts. Validation never activates a policy. */
export type PolicyDraft = {
  policyKey: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rulesJson: string;
};
export type PolicyRecord = PolicyDraft & {
  id: string;
  policyVersionNumber: number;
  state: string;
  version: number;
  createdAt: string;
  lastReturnReason?: string | null;
  draftRetirementVersion?: number;
  canRetireDraft?: boolean;
};
export type PolicyPage = {
  items: Array<Pick<PolicyRecord, "id" | "policyKey" | "policyVersionNumber" | "state" | "effectiveFrom" | "effectiveTo" | "version" | "createdAt" | "draftRetirementVersion" | "canRetireDraft">>;
  total: number;
  page: number;
  pageSize: number;
};
export type PolicyIssue = { path: string; message: string };
export type PolicyValidation = { isValid: boolean; issues: PolicyIssue[] };
export type PolicyScenario = { currencyCode: string; lineBaseAmount: number;
  categoryCode: string | null; purchaseType: string | null; branchId: string | null };
export type PolicyPreview = {
  policyId: string; policyVersionNumber: number; state: string; isAuthority: false;
  coverageIssues: PolicyIssue[];
  decision: { status: string; ruleCode: string | null; priority: number | null;
    budgetReservation: string | null; sourcingMethodCode: string | null;
    minimumQuoteCount: number | null;
    approvalStages: Array<{ code: string; assignee: string; mode: string }>;
    issues: PolicyIssue[] };
};

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class PolicyActionError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "PolicyActionError"; }
}

async function call(companyId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new Error("Choose an ERP company before editing buying rules.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/configuration/policies${path}`,
      { ...init, headers, credentials: "include", cache: "no-store" });
  } catch { throw new PolicyActionError("Buying rules are unavailable. Your changes were not confirmed.", 0); }
  if (!response.ok) {
    let message = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) message = String(body.message ?? body.detail ?? "");
    } catch { /* Fall back to a safe status message. */ }
    throw new PolicyActionError(response.status === 401 ? "Sign in to ERP to manage buying rules."
      : response.status === 403 ? "You do not have access to buying rules for this company."
        : message || (response.status === 409 ? "This draft changed. Refresh it before saving." : "The buying rule action failed."), response.status);
  }
  try { return await response.json() as unknown; }
  catch { throw new PolicyActionError("ERP returned an invalid buying rule response. Check saved rules before another change.", 0); }
}

function validRecord(value: unknown): value is PolicyRecord {
  return object(value) && guid.test(String(value.id)) && typeof value.policyKey === "string"
    && typeof value.policyVersionNumber === "number" && typeof value.state === "string"
    && typeof value.version === "number" && typeof value.rulesJson === "string";
}
function validSummary(value: unknown): boolean {
  return object(value) && guid.test(String(value.id)) && typeof value.policyKey === "string"
    && typeof value.policyVersionNumber === "number" && typeof value.state === "string"
    && typeof value.version === "number" && typeof value.effectiveFrom === "string";
}

export async function listPolicies(companyId: string, signal?: AbortSignal, key?: "INVOICE_MATCHING" | "SOURCING" | "RECEIVING"): Promise<PolicyPage> {
  const body = await call(companyId, `?page=1&pageSize=100${key ? `&key=${key}` : ""}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(validSummary)
    || typeof body.total !== "number" || typeof body.page !== "number"
    || typeof body.pageSize !== "number")
    throw new PolicyActionError("ERP returned an invalid buying rule list.", 0);
  return body as PolicyPage;
}
export async function getPolicy(companyId: string, id: string, signal?: AbortSignal): Promise<PolicyRecord> {
  if (!guid.test(id)) throw new Error("Choose a valid buying rule.");
  const body = await call(companyId, `/${id}`, { signal });
  if (!validRecord(body)) throw new PolicyActionError("ERP returned invalid buying rule details.", 0);
  return body;
}
export async function validatePolicy(companyId: string, rulesJson: string): Promise<PolicyValidation> {
  const body = await call(companyId, "/validate", { method: "POST", body: JSON.stringify({ rulesJson }) });
  if (!object(body) || typeof body.isValid !== "boolean" || !Array.isArray(body.issues))
    throw new PolicyActionError("ERP returned an invalid buying rule check.", 0);
  return body as PolicyValidation;
}
export async function createPolicy(companyId: string, draft: PolicyDraft): Promise<PolicyRecord> {
  const body = await call(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!validRecord(body)) throw new PolicyActionError("ERP did not confirm the draft. Check saved rules before retrying.", 0);
  return body;
}
export async function updatePolicy(companyId: string, id: string, version: number,
  draft: PolicyDraft): Promise<PolicyRecord> {
  if (!guid.test(id)) throw new Error("Choose a valid buying rule.");
  const body = await call(companyId, `/${id}`,
    { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!validRecord(body)) throw new PolicyActionError("ERP did not confirm the updated draft. Check saved rules before retrying.", 0);
  return body;
}
export async function submitPolicyReview(companyId: string, id: string, version: number,
  reason: string): Promise<PolicyRecord> {
  if (!guid.test(id)) throw new Error("Choose a valid buying rule.");
  const body = await call(companyId, `/${id}/submit-review`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validRecord(body) || body.state !== "PendingReview")
    throw new PolicyActionError("ERP did not confirm the review request. Check saved rules before retrying.", 0);
  return body;
}
export async function previewPolicy(companyId: string, id: string,
  scenario: PolicyScenario): Promise<PolicyPreview> {
  if (!guid.test(id)) throw new Error("Choose a valid buying rule.");
  const body = await call(companyId, `/${id}/preview`,
    { method: "POST", body: JSON.stringify(scenario) });
  if (!object(body) || body.isAuthority !== false || !Array.isArray(body.coverageIssues)
    || !object(body.decision) || typeof body.decision.status !== "string")
    throw new Error("ERP returned an invalid buying rule preview.");
  return body as PolicyPreview;
}
export async function decidePolicy(companyId: string, id: string, version: number,
  action: "publish" | "return", reason: string): Promise<PolicyRecord> {
  if (!guid.test(id)) throw new Error("Choose a valid buying rule.");
  const body = await call(companyId, `/${id}/${action === "return" ? "return-for-changes" : "publish"}`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validRecord(body) || body.state !== (action === "publish" ? "Published" : "Draft"))
    throw new PolicyActionError("ERP did not confirm the policy decision. Check saved rules before retrying.", 0);
  return body;
}
export async function getEffectivePolicy(companyId: string, key: "PURCHASE_REQUEST" | "PURCHASE_ORDER" | "SOURCING" | "RECEIVING" | "INVOICE_MATCHING"):
  Promise<{ status: string; isAuthority: false; policy: Pick<PolicyRecord, "id" | "policyVersionNumber"> | null }> {
  const body = await call(companyId, `/effective?key=${key}`);
  if (!object(body) || typeof body.status !== "string" || body.isAuthority !== false)
    throw new Error("ERP returned an invalid current-policy status.");
  return body as { status: string; isAuthority: false;
    policy: Pick<PolicyRecord, "id" | "policyVersionNumber"> | null };
}

/** Canonical active workers eligible to be named for sourcing publication review. */
export type SourcingReviewerPage = { items: Array<{ principalId: string; displayName: string; workerId: string }>;
  total: number; offset: number; limit: number; nextOffset: number | null; isAuthority: false; configurationVersion: 1 };
const canonicalId = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000";
function reviewerPage(body: unknown, offset: number): SourcingReviewerPage {
  if (!object(body) || !Array.isArray(body.items) || body.items.length > 25 || body.isAuthority !== false || body.configurationVersion !== 1
    || body.items.some(item => !object(item) || !canonicalId(item.principalId) || !canonicalId(item.workerId) || typeof item.displayName !== "string")
    || !Number.isInteger(body.total) || body.offset !== offset || body.limit !== 25 || Number(body.total) < 0
    || body.nextOffset !== null && (!Number.isInteger(body.nextOffset) || body.nextOffset !== offset + 25 || Number(body.nextOffset) >= Number(body.total))
    || new Set(body.items.map(item => object(item) ? item.principalId : "")).size !== body.items.length)
    throw new PolicyActionError("Reviewer names are unavailable. Selected people have not changed.", 0);
  return body as SourcingReviewerPage;
}
export async function lookupSourcingReviewers(companyId: string, search: string, offset: number, signal?: AbortSignal): Promise<SourcingReviewerPage> {
  if (search.trim().length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new Error("Use a shorter name search and a valid page.");
  return reviewerPage(await call(companyId, `/lookups/sourcing-reviewers?${new URLSearchParams({ search: search.trim(), offset: String(offset), limit: "25" })}`, { signal }), offset);
}
export async function lookupSelectedSourcingReviewers(companyId: string, principalIds: readonly string[], signal?: AbortSignal): Promise<SourcingReviewerPage> {
  if (!principalIds.length || principalIds.length > 25 || principalIds.some(id => !canonicalId(id)) || new Set(principalIds).size !== principalIds.length)
    throw new Error("Choose a bounded set of saved reviewers.");
  const page = reviewerPage(await call(companyId, `/lookups/sourcing-reviewers?${new URLSearchParams({ principalIds: principalIds.join(","), search: "", offset: "0", limit: "25" })}`, { signal }), 0);
  if (page.nextOffset !== null || page.total !== page.items.length || page.items.length !== principalIds.length
    || page.items.some(item => !principalIds.includes(item.principalId)))
    throw new Error("Reviewer names are unavailable. Selected people have not changed.");
  return page;
}

export type ReceivingLookupKind = "people" | "sites" | "categories";
export type ReceivingLookupPage = { kind: ReceivingLookupKind; companyId: string;
  items: Array<{ id: string; displayName: string; code: string | null; principalId: string | null }>;
  total: number; offset: number; limit: number; nextOffset: number | null;
  isAuthority: false; canAcceptDelivery: false };
function receivingLookupPage(value: unknown, kind: ReceivingLookupKind, company: string, offset: number): ReceivingLookupPage {
  if (!object(value) || value.kind !== kind || value.companyId !== company || value.isAuthority !== false
    || value.canAcceptDelivery !== false || !Array.isArray(value.items) || value.items.length > 25
    || !Number.isInteger(value.total) || Number(value.total) < 0 || value.offset !== offset || value.limit !== 25
    || value.nextOffset !== null && (!Number.isInteger(value.nextOffset) || Number(value.nextOffset) <= offset)
    || value.items.some(item => !object(item) || !canonicalId(item.id) || typeof item.displayName !== "string"
      || item.code !== null && typeof item.code !== "string"
      || item.principalId !== null && !canonicalId(item.principalId)))
    throw new PolicyActionError("Current receiving names are unavailable. Selections have not changed.", 0);
  return value as ReceivingLookupPage;
}
export async function lookupReceivingReferences(company: string, kind: ReceivingLookupKind,
  search: string, offset: number, signal?: AbortSignal): Promise<ReceivingLookupPage> {
  if (search.trim().length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new Error("Use a shorter search and a valid page.");
  return receivingLookupPage(await call(company, `/lookups/receiving/${kind}?${new URLSearchParams({
    search: search.trim(), offset: String(offset), limit: "25" })}`, { signal }), kind, company, offset);
}
export async function lookupSelectedReceivingReferences(company: string, kind: ReceivingLookupKind,
  ids: readonly string[], signal?: AbortSignal): Promise<ReceivingLookupPage> {
  if (!ids.length || ids.length > 25 || ids.some(id => !canonicalId(id)) || new Set(ids).size !== ids.length)
    throw new Error("Choose up to 25 distinct saved receiving references.");
  const page = receivingLookupPage(await call(company, `/lookups/receiving/${kind}?${new URLSearchParams({
    ids: ids.join(","), search: "", offset: "0", limit: "25" })}`, { signal }), kind, company, 0);
  if (page.total !== page.items.length || page.items.length !== ids.length || page.nextOffset !== null
    || page.items.some(item => !ids.includes(item.id)))
    throw new PolicyActionError("Saved receiving names are unavailable. Selections have not changed.", 0);
  return page;
}

/** A server-owned, permission-filtered hint; the retirement command rechecks all facts. */
export function canRetirePolicyDraft(record: PolicyPage["items"][number]): boolean {
  return record.draftRetirementVersion === 1 && record.canRetireDraft === true
    && record.state === "Draft" && Number.isSafeInteger(record.version) && record.version > 0;
}
export async function retirePolicyDraft(companyId: string, record: PolicyPage["items"][number],
  reason: string): Promise<PolicyRecord> {
  if (!guid.test(record.id) || !canRetirePolicyDraft(record))
    throw new PolicyActionError("This draft is not available for retirement. Refresh the saved rules.", 409);
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 1000)
    throw new PolicyActionError("Enter a retirement reason of up to 1,000 characters.", 422);
  const body = await call(companyId, `/${record.id}/retire`, {
    method: "POST", body: JSON.stringify({ version: record.version, reason: trimmed }),
  });
  if (!validRecord(body) || body.id !== record.id || body.policyKey !== record.policyKey
    || body.policyVersionNumber !== record.policyVersionNumber || body.state !== "Retired"
    || body.version !== record.version + 1)
    throw new PolicyActionError("Retirement was not confirmed. Check the saved rules before making another change.", 0);
  return body;
}
