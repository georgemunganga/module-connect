import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Department procurement forecasts. Draft plans never reserve budget or authorize a purchase. */
export type PlanLineDraft = {
  id?: string | null; catalogItemId?: string | null; description: string;
  categoryCode?: string | null; unitCode: string; estimatedQuantity: number;
  estimatedAmount: number; expectedOn?: string | null; fundingSourceRef?: string | null;
};
export type PlanDraft = {
  financialPeriodRef: string; currencyCode: string; fundingSourceRef?: string | null;
  lines: PlanLineDraft[];
};
export type PlanSummary = {
  id: string; number: string; financialPeriodRef: string; departmentRef?: string | null;
  currencyCode: string; status: string; revisionNumber: number; version: number;
  createdAt: string; lineCount: number;
};
export type PlanDetail = Omit<PlanSummary, "lineCount"> & {
  fundingSourceRef?: string | null; statusReason?: string | null;
  lines: (PlanLineDraft & { id: string; lineNumber: number; status: string; version: number })[];
};
export type PlanPage = { items: PlanSummary[]; total: number; page: number; pageSize: number };
export class PlanApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
async function call(companyId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new PlanApiError(0, "Choose an ERP company before opening plans.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/plans${path}`,
      { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new PlanApiError(0, "Plans are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let detail = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) detail = String(body.message ?? body.detail ?? "");
    } catch { /* Use status-based message. */ }
    throw new PlanApiError(response.status,
      response.status === 403 ? "You do not have access to plans for this company."
        : response.status === 401 ? "Sign in to ERP to manage plans."
          : detail || (response.status === 409 ? "This plan changed. Refresh and compare before saving."
            : "The plan action failed."));
  }
  try { return await response.json() as unknown; }
  catch { throw new PlanApiError(0, "The ERP returned an invalid plan response."); }
}
function summary(value: unknown): value is PlanSummary {
  return object(value) && guid.test(String(value.id)) && typeof value.number === "string"
    && typeof value.financialPeriodRef === "string" && typeof value.currencyCode === "string"
    && typeof value.status === "string" && typeof value.version === "number"
    && typeof value.revisionNumber === "number";
}
function detail(value: unknown): value is PlanDetail {
  const lines = object(value) ? value.lines : null;
  return summary(value) && Array.isArray(lines)
    && lines.every((line: unknown) => object(line) && guid.test(String(line.id))
      && typeof line.description === "string" && typeof line.estimatedQuantity === "number"
      && typeof line.estimatedAmount === "number" && typeof line.status === "string");
}
export async function listOwnPlans(companyId: string, page = 1,
  signal?: AbortSignal): Promise<PlanPage> {
  const body = await call(companyId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(summary)
    || typeof body.total !== "number" || typeof body.page !== "number"
    || typeof body.pageSize !== "number")
    throw new PlanApiError(0, "The ERP returned an invalid plan list.");
  return body as PlanPage;
}
export async function getOwnPlan(companyId: string, id: string,
  signal?: AbortSignal): Promise<PlanDetail> {
  if (!guid.test(id)) throw new PlanApiError(0, "The plan reference is invalid.");
  const body = await call(companyId, `/${id}`, { signal });
  if (!detail(body)) throw new PlanApiError(0, "The ERP returned invalid plan details.");
  return body;
}
export async function createOwnPlan(companyId: string, draft: PlanDraft): Promise<PlanDetail> {
  const body = await call(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!detail(body)) throw new PlanApiError(0, "The ERP did not confirm the saved plan. Refresh before retrying.");
  return body;
}
export async function updateOwnPlan(companyId: string, id: string, version: number,
  draft: PlanDraft): Promise<PlanDetail> {
  if (!guid.test(id)) throw new PlanApiError(0, "The plan reference is invalid.");
  const body = await call(companyId, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!detail(body)) throw new PlanApiError(0, "The ERP did not confirm the plan update. Refresh before retrying.");
  return body;
}
export async function cancelOwnPlan(companyId: string, id: string, version: number,
  reason: string): Promise<PlanDetail> {
  if (!guid.test(id)) throw new PlanApiError(0, "The plan reference is invalid.");
  const body = await call(companyId, `/${id}/cancel`, { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!detail(body) || body.status !== "Cancelled")
    throw new PlanApiError(0, "The ERP did not confirm cancellation. Refresh before retrying.");
  return body;
}
