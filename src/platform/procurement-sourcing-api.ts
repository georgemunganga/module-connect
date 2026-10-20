import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Own RFQ/RFP/tender drafts. Publication, bids and award require separate governed APIs. */
export type SourcingLineDraft = {
  id?: string | null;
  purchaseRequestLineId?: string | null;
  description: string;
  unitCode: string;
  quantity: number;
  categoryCode?: string | null;
  neededBy?: string | null;
};
export type SourcingDraft = {
  title: string;
  method: string;
  currencyCode?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  lines: SourcingLineDraft[];
};
export type SourcingSummary = {
  id: string; number: string; title: string; method: string; currencyCode: string;
  opensAt?: string | null; closesAt?: string | null; status: string;
  version: number; lineCount: number;
};
export type SourcingDetail = Omit<SourcingSummary, "lineCount"> & {
  cancellationReason?: string | null;
  lines: (SourcingLineDraft & { id: string; lineNumber: number; status: string; version: number })[];
};
export type SourcingPage = { items: SourcingSummary[]; total: number; page: number; pageSize: number };
export class SourcingApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

async function call<T>(companyId: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!guid.test(companyId)) throw new SourcingApiError(0, "Choose an ERP company before opening quotes.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/sourcing${path}`,
      { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new SourcingApiError(0, "Quotes are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let message = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) message = String(body.message ?? body.detail ?? "");
    } catch { /* Use status-based message. */ }
    throw new SourcingApiError(response.status,
      response.status === 403 ? "You do not have access to quotes for this company."
        : response.status === 401 ? "Sign in to ERP to manage quotes."
          : message || (response.status === 409 ? "This quote changed. Refresh and compare before saving."
            : "The quote action failed."));
  }
  try { return await response.json() as T; }
  catch { throw new SourcingApiError(0, "The ERP returned an invalid quote response."); }
}

function validSummary(value: unknown): value is SourcingSummary {
  return object(value) && guid.test(String(value.id)) && typeof value.number === "string"
    && typeof value.title === "string" && typeof value.method === "string"
    && typeof value.status === "string" && typeof value.version === "number"
    && typeof value.currencyCode === "string";
}
function validDetail(value: unknown): value is SourcingDetail {
  const lines = object(value) ? value.lines : null;
  return validSummary(value) && Array.isArray(lines)
    && lines.every((line: unknown) => object(line) && guid.test(String(line.id))
      && typeof line.description === "string" && typeof line.quantity === "number"
      && typeof line.status === "string");
}
export async function listOwnSourcingDrafts(companyId: string, page = 1,
  signal?: AbortSignal): Promise<SourcingPage> {
  const body: unknown = await call(companyId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(validSummary)
    || typeof body.total !== "number" || typeof body.page !== "number"
    || typeof body.pageSize !== "number")
    throw new SourcingApiError(0, "The ERP returned an invalid quote list.");
  return body as unknown as SourcingPage;
}
export async function getOwnSourcingDraft(companyId: string, id: string,
  signal?: AbortSignal): Promise<SourcingDetail> {
  if (!guid.test(id)) throw new SourcingApiError(0, "The quote reference is invalid.");
  const body: unknown = await call(companyId, `/${id}`, { signal });
  if (!validDetail(body)) throw new SourcingApiError(0, "The ERP returned invalid quote details.");
  return body;
}
export async function createOwnSourcingDraft(companyId: string, draft: SourcingDraft): Promise<SourcingDetail> {
  const body: unknown = await call(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!validDetail(body)) throw new SourcingApiError(0, "The ERP did not confirm the saved quote. Refresh before retrying.");
  return body;
}
export async function updateOwnSourcingDraft(companyId: string, id: string,
  version: number, draft: SourcingDraft): Promise<SourcingDetail> {
  if (!guid.test(id)) throw new SourcingApiError(0, "The quote reference is invalid.");
  const body: unknown = await call(companyId, `/${id}`,
    { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!validDetail(body)) throw new SourcingApiError(0, "The ERP did not confirm the quote update. Refresh before retrying.");
  return body;
}
export async function cancelOwnSourcingDraft(companyId: string, id: string,
  version: number, reason: string): Promise<SourcingDetail> {
  if (!guid.test(id)) throw new SourcingApiError(0, "The quote reference is invalid.");
  const body: unknown = await call(companyId, `/${id}/cancel`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validDetail(body) || body.status !== "Cancelled")
    throw new SourcingApiError(0, "The ERP did not confirm cancellation. Refresh before retrying.");
  return body;
}
