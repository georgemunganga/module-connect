import { invoiceDecimal } from "../../shared/procurement-decimal";
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
export type PolicyScenario = { currencyCode: string; lineBaseAmount: number | string;
  categoryCode: string | null; purchaseType: string | null; branchId: string | null; requesterRoleKeys?: string[]; departmentId?: string | null };
export type PolicyPreview = {
  policyId: string; policyVersionNumber: number; state: string; isAuthority: false;
  coverageIssues: PolicyIssue[];
  decision: { status: string; ruleCode: string | null; priority: number | null;
    budgetReservation: string | null; sourcingMethodCode: string | null;
    minimumQuoteCount: number | null;
    approvalStages: Array<{ code: string; assignee: string; mode: string; binding?: { kind: string; key: string } }>;
    issues: PolicyIssue[] };
};

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class PolicyActionError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "PolicyActionError"; }
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
    let message = "", code: string | undefined;
    try {
      const body: unknown = await response.json();
      if (object(body)) { message = String(body.message ?? body.detail ?? ""); code = typeof body.code === "string" ? body.code : undefined; }
    } catch { /* Fall back to a safe status message. */ }
    throw new PolicyActionError(response.status === 401 ? "Sign in to ERP to manage buying rules."
      : response.status === 403 ? "You do not have access to buying rules for this company."
        : message || (response.status === 409 ? "This draft changed. Refresh it before saving." : "The buying rule action failed."), response.status, code);
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

export async function listPolicies(companyId: string, signal?: AbortSignal, key?: "INVOICE_MATCHING" | "INVOICE_UNIT_REVIEW" | "SOURCING" | "RECEIVING" | "MANUAL_PAYMENT_REVIEW" | "PROCUREMENT_PLAN_REVIEW" | "COMMERCIAL_ROUND_PLAN_REVIEW"): Promise<PolicyPage> {
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
export async function validateSourcingPolicy(companyId: string, rulesJson: string):
  Promise<PolicyValidation & { reviewConfigurationComplete: boolean; reviewIssues: PolicyIssue[];
    supportedSourcingRuleSchemas: number[] }> {
  const body = await call(companyId, "/validate", { method: "POST", body: JSON.stringify({ rulesJson }) });
  if (!object(body) || typeof body.isValid !== "boolean" || !Array.isArray(body.issues)
    || typeof body.reviewConfigurationComplete !== "boolean" || !Array.isArray(body.reviewIssues)
    || !Array.isArray(body.supportedSourcingRuleSchemas)
    || body.supportedSourcingRuleSchemas.some(value => value !== 1 && value !== 2)
    || [...body.issues, ...body.reviewIssues].some(issue => !object(issue)
      || typeof issue.path !== "string" || typeof issue.message !== "string"))
    throw new PolicyActionError("ERP returned an invalid sourcing rule check.", 0);
  return body as PolicyValidation & { reviewConfigurationComplete: boolean;
    reviewIssues: PolicyIssue[]; supportedSourcingRuleSchemas: number[] };
}
export async function validateManualPaymentPolicy(companyId: string, rulesJson: string):
  Promise<PolicyValidation & { reviewReady: boolean; reviewIssues: PolicyIssue[] }> {
  const body = await call(companyId, "/validate", { method: "POST", body: JSON.stringify({ rulesJson }) });
  if (!object(body) || typeof body.isValid !== "boolean" || !Array.isArray(body.issues)
    || typeof body.reviewReady !== "boolean" || !Array.isArray(body.reviewIssues)
    || [...body.issues, ...body.reviewIssues].some(issue => !object(issue)
      || typeof issue.path !== "string" || typeof issue.message !== "string"))
    throw new PolicyActionError("ERP returned an invalid manual payment review check.", 0);
  return body as PolicyValidation & { reviewReady: boolean; reviewIssues: PolicyIssue[] };
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
    { method: "POST", body: JSON.stringify({ ...scenario, lineBaseAmount: invoiceDecimal(scenario.lineBaseAmount) })
      .replace(/("lineBaseAmount"\s*:\s*)"([0-9.]+)"/, (_, prefix: string, amount: string) => prefix + invoiceDecimal(amount)) });
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
export async function getEffectivePolicy(companyId: string, key: "PURCHASE_REQUEST" | "PURCHASE_ORDER" | "SOURCING" | "RECEIVING" | "INVOICE_MATCHING" | "INVOICE_UNIT_REVIEW" | "MANUAL_PAYMENT_REVIEW" | "PROCUREMENT_PLAN_REVIEW" | "COMMERCIAL_ROUND_PLAN_REVIEW"):
  Promise<{ status: string; isAuthority: false; policy: Pick<PolicyRecord, "id" | "policyVersionNumber"> | null }> {
  const body = await call(companyId, `/effective?key=${key}`);
  if (!object(body) || typeof body.status !== "string" || body.isAuthority !== false)
    throw new Error("ERP returned an invalid current-policy status.");
  return body as { status: string; isAuthority: false;
    policy: Pick<PolicyRecord, "id" | "policyVersionNumber"> | null };
}

/** Scoped current Core accounts. A schema-2 reviewer may have no HRMS worker. */
export type SourcingReviewerPage = { items: Array<{ principalId: string; displayName: string; workerId: string | null }>;
  total: number; offset: number; limit: number; nextOffset: number | null; isAuthority: false;
  configurationVersion: 1; supportedSourcingRuleSchemas: number[] };
const canonicalId = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000";
function reviewerPage(body: unknown, offset: number, schemaVersion: 1 | 2): SourcingReviewerPage {
  if (!object(body) || !Array.isArray(body.items) || body.items.length > 25 || body.isAuthority !== false || body.configurationVersion !== 1
    || body.items.some(item => !object(item) || !canonicalId(item.principalId)
      || schemaVersion === 1 && !canonicalId(item.workerId)
      || schemaVersion === 2 && item.workerId !== null && !canonicalId(item.workerId)
      || typeof item.displayName !== "string")
    || !Number.isInteger(body.total) || body.offset !== offset || body.limit !== 25 || Number(body.total) < 0
    || body.nextOffset !== null && (!Number.isInteger(body.nextOffset) || body.nextOffset !== offset + 25 || Number(body.nextOffset) >= Number(body.total))
    || new Set(body.items.map(item => object(item) ? item.principalId : "")).size !== body.items.length
    || body.supportedSourcingRuleSchemas !== undefined && (!Array.isArray(body.supportedSourcingRuleSchemas)
      || body.supportedSourcingRuleSchemas.some(value => value !== 1 && value !== 2)))
    throw new PolicyActionError("Reviewer names are unavailable. Selected people have not changed.", 0);
  return { ...body, supportedSourcingRuleSchemas: Array.isArray(body.supportedSourcingRuleSchemas)
    ? body.supportedSourcingRuleSchemas : [] } as SourcingReviewerPage;
}
export async function lookupSourcingReviewers(companyId: string, search: string, offset: number,
  signal?: AbortSignal, schemaVersion: 1 | 2 = 1): Promise<SourcingReviewerPage> {
  if (search.trim().length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new Error("Use a shorter name search and a valid page.");
  return reviewerPage(await call(companyId, `/lookups/sourcing-reviewers?${new URLSearchParams({ search: search.trim(), offset: String(offset), limit: "25",
    ...(schemaVersion === 2 ? { schemaVersion: "2" } : {}) })}`, { signal }), offset, schemaVersion);
}
export async function lookupSelectedSourcingReviewers(companyId: string, principalIds: readonly string[],
  signal?: AbortSignal, schemaVersion: 1 | 2 = 1): Promise<SourcingReviewerPage> {
  if (!principalIds.length || principalIds.length > 25 || principalIds.some(id => !canonicalId(id)) || new Set(principalIds).size !== principalIds.length)
    throw new Error("Choose a bounded set of saved reviewers.");
  const page = reviewerPage(await call(companyId, `/lookups/sourcing-reviewers?${new URLSearchParams({ principalIds: principalIds.join(","),
    search: "", offset: "0", limit: "25", ...(schemaVersion === 2 ? { schemaVersion: "2" } : {}) })}`, { signal }), 0, schemaVersion);
  if (page.nextOffset !== null || page.total !== page.items.length || page.items.length !== principalIds.length
    || page.items.some(item => !principalIds.includes(item.principalId)))
    throw new Error("Reviewer names are unavailable. Selected people have not changed.");
  return page;
}

export type ReceivingLookupKind = "people" | "principals" | "sites" | "categories";
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
      || item.principalId !== null && !canonicalId(item.principalId)
      || kind === "principals" && (item.principalId !== item.id || item.code !== null)))
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

/** Current Core accounts. Eligibility is a lookup hint, never permission or approval authority. */
export type UnitReviewerPage = { items: Array<{ principalId: string; displayName: string; canReviewOriginalUnits: boolean }>;
  candidateTotal: number; offset: number; limit: 25; isAuthority: false };
export async function lookupUnitReviewers(company: string, search: string, offset: number, signal?: AbortSignal): Promise<UnitReviewerPage> {
  if (search.trim().length > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
    throw new Error("Use a bounded reviewer name search.");
  const body = await call(company, `/lookups/invoice-unit-reviewers?${new URLSearchParams({ search: search.trim(), offset: String(offset), limit: "25" })}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || body.items.length > 25 || body.isAuthority !== false
    || body.offset !== offset || body.limit !== 25 || !Number.isSafeInteger(body.candidateTotal) || Number(body.candidateTotal) < 0
    || body.items.some(row => !object(row) || !canonicalId(row.principalId) || typeof row.displayName !== "string" || !row.displayName.trim()
      || typeof row.canReviewOriginalUnits !== "boolean")
    || new Set(body.items.map(row => object(row) ? row.principalId : "")).size !== body.items.length
    || body.items.length > Math.max(0, Number(body.candidateTotal) - offset))
    throw new PolicyActionError("Current reviewer names could not be confirmed. Saved selections have not changed.", 0);
  return body as UnitReviewerPage;
}
export async function validateUnitReviewPolicy(company: string, rulesJson: string): Promise<{ isValid: boolean; issues: string[]; reviewConfigurationComplete: boolean; reviewIssues: string[] }> {
  const body = await call(company, "/validate", { method: "POST", body: JSON.stringify({ rulesJson }) });
  if (!object(body) || typeof body.isValid !== "boolean" || typeof body.reviewConfigurationComplete !== "boolean"
    || !Array.isArray(body.issues) || body.issues.some(issue => typeof issue !== "string")
    || !Array.isArray(body.reviewIssues) || body.reviewIssues.some(issue => typeof issue !== "string")
    || body.canPublish !== false || body.isAuthority !== false
    || body.isValid !== (body.issues.length === 0) || body.reviewConfigurationComplete !== (body.reviewIssues.length === 0))
    throw new PolicyActionError("The saved review rule check could not be confirmed.", 0);
  return body as { isValid: boolean; issues: string[]; reviewConfigurationComplete: boolean; reviewIssues: string[] };
}

/** Current Plan-stage people only; the server repeats permissions/scope at publication and use. */
export type PlanPolicyPeoplePage = { items: Array<{ principalId: string; displayName: string }>;
  purpose: "Review" | "Final"; candidateTotal: number; offset: number; limit: number; isAuthority: false };
function planPolicyPeople(body: unknown, purpose: "Review" | "Final", offset: number, limit = 25): PlanPolicyPeoplePage {
  if (!object(body) || body.purpose !== purpose || body.isAuthority !== false || body.offset !== offset || body.limit !== limit
    || !Number.isSafeInteger(body.candidateTotal) || Number(body.candidateTotal) < 0 || !Array.isArray(body.items) || body.items.length > limit
    || body.items.length !== Math.max(0, Math.min(limit, Number(body.candidateTotal) - offset)) || !body.items.every((x: unknown) => object(x) && canonicalId(x.principalId) && typeof x.displayName === "string" && x.displayName.trim().length > 0)
    || new Set(body.items.map((x: any) => x.principalId)).size !== body.items.length)
    throw new PolicyActionError("Current plan reviewer names could not be verified. Saved selections have not changed.", 0);
  return body as PlanPolicyPeoplePage;
}
export async function lookupPlanPolicyReviewers(company: string, purpose: "Review" | "Final", search: string, offset: number, signal?: AbortSignal): Promise<PlanPolicyPeoplePage> {
  if (!["Review", "Final"].includes(purpose) || search.trim().length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new PolicyActionError("Choose a plan review stage and a shorter valid name search.", 422);
  return planPolicyPeople(await call(company, `/lookups/plan-reviewers?${new URLSearchParams({ purpose, search: search.trim(), offset: String(offset), limit: "25" })}`, { signal }), purpose, offset);
}
export async function validatePlanReviewPolicy(company: string, rulesJson: string): Promise<PolicyValidation & { isAuthority: false; canPublish: false }> {
  const body = await call(company, "/validate", { method: "POST", body: JSON.stringify({ rulesJson }) });
  if (!object(body) || typeof body.isValid !== "boolean" || body.isAuthority !== false || body.canPublish !== false
    || !Array.isArray(body.issues) || !body.issues.every(x => typeof x === "string"))
    throw new PolicyActionError("The plan rule check could not be verified. No policy was activated.", 0);
  return { isValid: body.isValid, issues: body.issues.map(message => ({ path: "", message })), isAuthority: false, canPublish: false };
}

export async function lookupSelectedPlanPolicyReviewers(company: string, purpose: "Review" | "Final", principalIds: readonly string[], signal?: AbortSignal): Promise<PlanPolicyPeoplePage> {
  if (!["Review", "Final"].includes(purpose) || !principalIds.length || principalIds.length > 50 || principalIds.some(id => !canonicalId(id)) || new Set(principalIds).size !== principalIds.length)
    throw new PolicyActionError("Choose up to 50 distinct saved plan reviewers.", 422);
  const page = planPolicyPeople(await call(company, `/lookups/plan-reviewers?${new URLSearchParams({ purpose, principalIds: principalIds.join(","), search: "", offset: "0", limit: "50" })}`, { signal }), purpose, 0, 50);
  if (page.candidateTotal !== page.items.length || page.candidateTotal > principalIds.length || page.items.some(item => !principalIds.includes(item.principalId)))
    throw new PolicyActionError("Saved plan reviewer names could not be verified. Selections have not changed.", 0);
  // Omitted unavailable people keep their saved ID and a generic unavailable label in the picker.
  return page;
}

export type RoundPolicyPeoplePage = { items: { principalId: string; displayName: string }[]; total: number; offset: number; limit: number; nextOffset: number | null; purpose: "RoundPlanReview"; unavailablePrincipalIds: string[]; isAuthority: false };
function roundPolicyPeople(x: unknown, offset: number): RoundPolicyPeoplePage {
  if (!object(x) || x.purpose !== "RoundPlanReview" || x.isAuthority !== false || x.offset !== offset || x.limit !== 25 || !Number.isSafeInteger(x.total) || Number(x.total) < 0
    || !Array.isArray(x.items) || x.items.length !== Math.max(0, Math.min(25, Number(x.total) - offset)) || !x.items.every(p => object(p) && canonicalId(p.principalId) && typeof p.displayName === "string" && !!p.displayName.trim() && !("workerId" in p))
    || new Set(x.items.map((p: any) => p.principalId)).size !== x.items.length || !Array.isArray(x.unavailablePrincipalIds) || !x.unavailablePrincipalIds.every(canonicalId)
    || new Set(x.unavailablePrincipalIds).size !== x.unavailablePrincipalIds.length
    || x.nextOffset !== (x.items.length > 0 && offset + x.items.length < Number(x.total) && offset + x.items.length <= 100000 ? offset + x.items.length : null))
    throw new PolicyActionError("Current evaluation-plan reviewer names could not be confirmed. Saved selections have not changed.", 0);
  return x as RoundPolicyPeoplePage;
}
export async function lookupRoundPolicyReviewers(company: string, search: string, offset: number, signal?: AbortSignal): Promise<RoundPolicyPeoplePage> {
  if (search.trim().length > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new PolicyActionError("Use a shorter reviewer search and a valid page.", 422);
  const page = roundPolicyPeople(await call(company, `/lookups/round-plan-reviewers?${new URLSearchParams({ search: search.trim(), offset: String(offset), limit: "25" })}`, { signal }), offset);
  if (page.unavailablePrincipalIds.length) throw new PolicyActionError("Reviewer search could not be confirmed.", 0);
  return page;
}
export async function lookupSelectedRoundPolicyReviewers(company: string, ids: readonly string[], signal?: AbortSignal): Promise<RoundPolicyPeoplePage> {
  if (!ids.length || ids.length > 25 || !ids.every(canonicalId) || new Set(ids).size !== ids.length) throw new PolicyActionError("Choose up to 25 distinct saved reviewers.", 422);
  const page = roundPolicyPeople(await call(company, `/lookups/round-plan-reviewers?${new URLSearchParams({ principalIds: ids.join(","), offset: "0", limit: "25" })}`, { signal }), 0);
  const returned = [...page.items.map(x => x.principalId), ...page.unavailablePrincipalIds];
  if (page.total !== page.items.length || returned.length !== ids.length || new Set(returned).size !== ids.length || returned.some(id => !ids.includes(id))) throw new PolicyActionError("Saved reviewer names could not be confirmed. Their IDs remain unchanged.", 0);
  return page;
}
export const validateRoundReviewPolicy = validatePlanReviewPolicy;

export type RequestCoreRole = { key: string; label: string };
export async function lookupRequestRoles(company: string, signal?: AbortSignal): Promise<RequestCoreRole[]> {
  const body = await call(company, "/lookups/request-roles", { signal });
  if (!object(body) || !Array.isArray(body.items) || body.items.length > 500 || body.isAuthority !== false
    || !body.items.every(row => object(row) && typeof row.key === "string" && /^[a-z][a-z0-9_-]{0,99}$/.test(row.key) && typeof row.label === "string")
    || new Set(body.items.map(row => (row as RequestCoreRole).key)).size !== body.items.length)
    throw new PolicyActionError("Core role names could not be verified. Refresh before choosing a role.", 0);
  return body.items as RequestCoreRole[];
}
export async function lookupRequestApprovers(company: string, search: string, offset: number, signal?: AbortSignal,
  selected?: readonly string[]): Promise<{ items: { principalId: string; displayName: string }[]; nextOffset: number | null }> {
  const query = selected ? `principalIds=${encodeURIComponent(selected.join(','))}` : `search=${encodeURIComponent(search)}&offset=${offset}&limit=25`;
  const body = await call(company, `/lookups/request-approvers?${query}`, { signal });
  if (!object(body) || body.isAuthority !== false || !Array.isArray(body.items)
    || body.items.length > 50 || !body.items.every(row => object(row) && typeof row.principalId === "string" && guid.test(row.principalId) && typeof row.displayName === "string")
    || !(body.nextOffset === null || typeof body.nextOffset === "number" && Number.isSafeInteger(body.nextOffset) && body.nextOffset >= 0))
    throw new PolicyActionError("Approver names could not be verified. Your selections are unchanged.", 0);
  return body as { items: { principalId: string; displayName: string }[]; nextOffset: number | null };
}

export type RequestDepartment = { id: string; label: string };
export async function lookupRequestDepartments(company: string, signal?: AbortSignal): Promise<RequestDepartment[]> {
  const body = await call(company, "/lookups/request-departments", { signal });
  if (!object(body) || !Array.isArray(body.items) || body.items.length > 500 || body.isAuthority !== false
    || !body.items.every(row => object(row) && typeof row.id === "string" && guid.test(row.id) && typeof row.label === "string")
    || new Set(body.items.map(row => (row as RequestDepartment).id)).size !== body.items.length)
    throw new PolicyActionError("Core department names could not be verified. Your selections are unchanged.", 0);
  return body.items as RequestDepartment[];
}
