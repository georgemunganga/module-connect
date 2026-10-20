import { procurementScopeHeaders } from "../../shared/shell-scope";

export type AuthorityAction = "Edit" | "Submit" | "Return" | "Activate" | "Supersede" | "Revoke";
export const authorityUses = [
  { action: "PurchaseRequest.Approve", permission: "procurement-approval-decide", amountBasis: "EstimatedLineBase",
    label: "Purchase requests", reviewers: "Assigned line manager or procurement reviewer", basisLabel: "Estimated request line amount" },
  { action: "PurchaseOrder.Approve", permission: "procurement-po-approve", amountBasis: "ApprovedLineBase",
    label: "Purchase orders", reviewers: "Assigned procurement reviewers", basisLabel: "Approved order line amount" },
] as const;
export type AuthoritySpendAction = typeof authorityUses[number]["action"];
export const authorityUseForAction = (action: string) => authorityUses.find((use) => use.action === action) ?? null;
export const supportedAuthorityUse = (value: { action: string; permission: string; amountBasis: string }) =>
  authorityUses.find((use) => use.action === value.action && use.permission === value.permission && use.amountBasis === value.amountBasis) ?? null;
export type AuthorityDraft = { currencyCode: string; amountBasis: string; maximumAmount: string;
  effectiveFrom: string; effectiveUntil: string | null; allBranches: boolean; branchRef: string | null;
  allDepartments: boolean; departmentRef: string | null; allCategories: boolean; categoryCodes: string[] };
export type Authority = AuthorityDraft & { id: string; authorityReference: string; authorityVersion: number;
  principalId: string; action: string; permission: string; principalDisplayName: string | null; state: string; version: number;
  configurationOwnerPrincipalId: string; allowedActions: AuthorityAction[];
  previousGrantId: string | null; previousVersion: number | null; reviewReturnReason?: string | null };
export type AuthorityPage = { items: Authority[]; total: number; page: number; pageSize: number;
  currentActorPrincipalId: string; canCreate: boolean; createAction: AuthoritySpendAction; createAmountBasis: string; scope: { branchId: string | null; departmentId: string | null; confined: boolean } };
export type LookupKind = "people" | "branches" | "departments" | "categories";
export type LookupItem = { id?: string; code?: string; name?: string; principalId?: string; displayName?: string; workerId?: string };
export type LookupPage = { items: LookupItem[]; offset: number; limit: number; nextOffset: number | null };
export class AuthorityApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
/** Strings stay exact throughout input, transport and display, including numeric(18,4)'s maximum. */
export const validAuthorityAmount = (value: string) => /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value);
async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(company)) throw new AuthorityApiError(0, "Choose an ERP company before opening approval limits.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/configuration/spending-authorities${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AuthorityApiError(0, "The result was not confirmed. Refresh the list before retrying this action.");
  }
  if (!response.ok) {
    let code: string | undefined, message = "";
    try { const body: unknown = await response.json(); if (object(body)) { code = typeof body.code === "string" ? body.code : undefined; message = String(body.message ?? body.detail ?? body.title ?? ""); } } catch { /* Status fallback. */ }
    throw new AuthorityApiError(response.status, response.status === 403 ? "You do not have access to this approval limit action."
      : response.status === 401 ? "Sign in to ERP to manage approval limits."
      : response.status === 409 ? "This limit changed or no longer meets its checks. Refresh and compare before trying again."
      : message || "Approval limits are unavailable.", code);
  }
  try { return await response.json(); } catch { throw new AuthorityApiError(0, "The saved result was not confirmed. Refresh the list before retrying."); }
}
function record(value: unknown): value is Authority {
  return object(value) && guid.test(String(value.id)) && typeof value.authorityReference === "string"
    && guid.test(String(value.principalId)) && typeof value.version === "number" && typeof value.state === "string"
    && typeof value.action === "string" && typeof value.permission === "string" && typeof value.amountBasis === "string"
    && typeof value.maximumAmount === "string" && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value.maximumAmount)
    && Array.isArray(value.categoryCodes) && Array.isArray(value.allowedActions)
    && value.allowedActions.every((action) => ["Edit", "Submit", "Return", "Activate", "Supersede", "Revoke"].includes(String(action)));
}
export async function listAuthorities(company: string, page: number, state: string, signal?: AbortSignal,
  action: AuthoritySpendAction = "PurchaseRequest.Approve"): Promise<AuthorityPage> {
  const use = authorityUseForAction(action);
  if (!use) throw new AuthorityApiError(422, "Choose a supported approval type.");
  const body = await call(company, `?page=${page}&pageSize=25&action=${encodeURIComponent(action)}${state ? `&state=${encodeURIComponent(state)}` : ""}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(record) || typeof body.total !== "number"
    || typeof body.page !== "number" || typeof body.pageSize !== "number" || typeof body.canCreate !== "boolean"
    || body.createAction !== action || body.createAmountBasis !== use.amountBasis
    || !guid.test(String(body.currentActorPrincipalId)) || !object(body.scope)) throw new AuthorityApiError(0, "ERP approval limit settings need the current API contract.");
  return body as AuthorityPage;
}
export async function getAuthority(company: string, id: string, signal?: AbortSignal): Promise<Authority> {
  if (!guid.test(id)) throw new AuthorityApiError(0, "Choose a valid approval limit.");
  const body = await call(company, `/${id}`, { signal });
  if (!record(body)) throw new AuthorityApiError(0, "ERP returned invalid approval limit details.");
  return body;
}
export async function saveAuthority(company: string, draft: AuthorityDraft,
  source: ({ id: string; version: number } | { authorityReference: string; principalId: string }) & { action: AuthoritySpendAction }): Promise<Authority> {
  const use = authorityUseForAction(source.action);
  if (!use || draft.amountBasis !== use.amountBasis) throw new AuthorityApiError(422, "This approval type and amount basis do not match. Keep unsupported limits read-only.");
  if (draft.maximumAmount !== "0" && !validAuthorityAmount(draft.maximumAmount)) throw new AuthorityApiError(422, "Enter a finite limit with up to four decimal places.");
  const editing = "id" in source;
  const input: AuthorityDraft = { currencyCode: draft.currencyCode, amountBasis: draft.amountBasis, maximumAmount: draft.maximumAmount,
    effectiveFrom: draft.effectiveFrom, effectiveUntil: draft.effectiveUntil, allBranches: draft.allBranches, branchRef: draft.branchRef,
    allDepartments: draft.allDepartments, departmentRef: draft.departmentRef, allCategories: draft.allCategories, categoryCodes: [...draft.categoryCodes] };
  const body = await call(company, editing ? `/${source.id}` : "", { method: editing ? "PUT" : "POST", body: JSON.stringify(editing
    ? { version: source.version, draft: input }
    : { authorityReference: source.authorityReference, principalId: source.principalId, action: source.action, draft: input }) });
  if (!record(body) || body.action !== use.action || body.permission !== use.permission || body.amountBasis !== use.amountBasis)
    throw new AuthorityApiError(0, "The saved result was not confirmed. Refresh before retrying.");
  return body;
}
export async function actOnAuthority(company: string, source: Authority, action: Exclude<AuthorityAction, "Edit">, reason: string): Promise<Authority> {
  if (!supportedAuthorityUse(source)) throw new AuthorityApiError(422, "This approval type is not supported by this editor. Keep it read-only.");
  if (!source.allowedActions.includes(action)) throw new AuthorityApiError(403, "Refresh to see your available actions.");
  const body = await call(company, `/${source.id}/${action.toLowerCase()}`, { method: "POST", body: JSON.stringify({
    version: source.version, reason: reason.trim(), ...(action === "Supersede" ? { previousGrantId: source.previousGrantId, previousVersion: source.previousVersion } : {}),
  }) });
  if (!record(body) || body.action !== source.action || body.permission !== source.permission || body.amountBasis !== source.amountBasis)
    throw new AuthorityApiError(0, "The action result was not confirmed. Refresh before retrying.");
  return body;
}
export async function lookupAuthorities(company: string, kind: LookupKind, search: string, offset: number, signal?: AbortSignal,
  action: AuthoritySpendAction = "PurchaseRequest.Approve"): Promise<LookupPage> {
  if (!authorityUseForAction(action)) throw new AuthorityApiError(422, "Choose a supported approval type.");
  const body = await call(company, `/lookups/${kind}?action=${encodeURIComponent(action)}&search=${encodeURIComponent(search)}&offset=${offset}&limit=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(object) || typeof body.offset !== "number"
    || typeof body.limit !== "number" || !(body.nextOffset === null || typeof body.nextOffset === "number"))
    throw new AuthorityApiError(0, "ERP returned invalid settings choices.");
  return body as LookupPage;
}
