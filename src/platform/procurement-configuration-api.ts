import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Procurement-owned reference drafts. Core owns company, currency, tax and identity masters. */
export type ReferenceKind = "categories" | "methods";
export type ReferenceDraft = {
  code: string; name: string; parentCode?: string | null; expenseAccountRef?: string | null;
  description?: string | null; policyVersionId?: string | null;
};
export type ReferenceRecord = ReferenceDraft & {
  id: string; status: string; version: number; createdAt: string;
};
export type ReferencePage = { items: ReferenceRecord[]; total: number; page: number; pageSize: number };
export class ConfigurationApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
async function call(companyId: string, kind: ReferenceKind, path: string,
  init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new ConfigurationApiError(0, "Choose an ERP company before opening settings.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/configuration/${kind}${path}`,
      { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new ConfigurationApiError(0, "Procurement settings are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let detail = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) detail = String(body.message ?? body.detail ?? "");
    } catch { /* Use status-based message. */ }
    throw new ConfigurationApiError(response.status,
      response.status === 403 ? "You do not have access to Procurement settings for this company."
        : response.status === 401 ? "Sign in to ERP to manage Procurement settings."
          : detail || (response.status === 409 ? "This setting changed. Refresh and compare before saving."
            : "The setting action failed."));
  }
  try { return await response.json() as unknown; }
  catch { throw new ConfigurationApiError(0, "The ERP returned an invalid settings response."); }
}
function valid(value: unknown): value is ReferenceRecord {
  return object(value) && guid.test(String(value.id)) && typeof value.code === "string"
    && typeof value.name === "string" && typeof value.status === "string"
    && typeof value.version === "number";
}
export async function listReferences(companyId: string, kind: ReferenceKind, page = 1,
  signal?: AbortSignal): Promise<ReferencePage> {
  const body = await call(companyId, kind, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(valid)
    || typeof body.total !== "number" || typeof body.page !== "number"
    || typeof body.pageSize !== "number")
    throw new ConfigurationApiError(0, "The ERP returned an invalid settings list.");
  return body as ReferencePage;
}
export async function getReference(companyId: string, kind: ReferenceKind,
  id: string, signal?: AbortSignal): Promise<ReferenceRecord> {
  if (!guid.test(id)) throw new ConfigurationApiError(0, "The setting reference is invalid.");
  const body = await call(companyId, kind, `/${id}`, { signal });
  if (!valid(body)) throw new ConfigurationApiError(0, "The ERP returned invalid setting details.");
  return body;
}
export async function createReference(companyId: string, kind: ReferenceKind,
  draft: ReferenceDraft): Promise<ReferenceRecord> {
  const body = await call(companyId, kind, "", { method: "POST", body: JSON.stringify(draft) });
  if (!valid(body)) throw new ConfigurationApiError(0, "The ERP did not confirm the saved setting. Refresh before retrying.");
  return body;
}
export async function updateReference(companyId: string, kind: ReferenceKind,
  id: string, version: number, draft: ReferenceDraft): Promise<ReferenceRecord> {
  if (!guid.test(id)) throw new ConfigurationApiError(0, "The setting reference is invalid.");
  const body = await call(companyId, kind, `/${id}`,
    { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!valid(body)) throw new ConfigurationApiError(0, "The ERP did not confirm the setting update. Refresh before retrying.");
  return body;
}
export async function activateReference(companyId: string, kind: ReferenceKind, id: string, version: number,
  reason: string): Promise<ReferenceRecord> {
  if (!guid.test(id)) throw new ConfigurationApiError(0, "The setting reference is invalid.");
  const body = await call(companyId, kind, `/${id}/activate`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!valid(body) || body.status !== "Active")
    throw new ConfigurationApiError(0, "The ERP did not confirm activation. Refresh before retrying.");
  return body;
}

export const activateCategory = (companyId: string, id: string, version: number, reason: string) =>
  activateReference(companyId, "categories", id, version, reason);
