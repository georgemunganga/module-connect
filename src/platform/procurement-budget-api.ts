import { procurementScopeHeaders } from "../../shared/shell-scope";

import { RequestApiError } from "./procurement-requests-api";
import { budgetAmountExact, sameBudgetAmount } from "./procurement-budget-amount";

export type BudgetQueueRecord = {
  id: string; number: string; purpose: string; currencyCode: string;
  submittedAt: string; version: number; approvalState: string;
  createdBy: string; estimatedAmount: number; estimatedAmountExact?: string;
};
export type BudgetQueuePage = { records: BudgetQueueRecord[]; count: number; limit: number; offset: number };
export type BudgetCheck = {
  id: string; requestVersion: number; financeCheckRef: string;
  status: "Available" | "Insufficient" | "NotConfigured" | "PartiallyAvailable";
  checkedAmount: number; checkedAmountExact?: string; currencyCode: string; checkedAt: string;
  checkedBySubjectId: string; evidenceRef: string; decisionReason: string | null;
  reservationRef: string | null; reservationStatus: string | null;
};
export type BudgetDecision = {
  requestVersion: number; financeCheckRef: string; status: BudgetCheck["status"];
  checkedAmount: string; currencyCode: string; evidenceRef: string;
  decisionReason: string | null; reservationRef: string | null; reservationStatus: string | null;
};

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

async function call(companyId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new RequestApiError(0, "Choose an ERP company first.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/requests${path}`, {
      ...init, credentials: "include", cache: "no-store", headers,
    });
  } catch { throw new RequestApiError(0, "Finance checks are unavailable. Your decision was not confirmed."); }
  if (!response.ok) {
    let reason = "";
    try { const body: unknown = await response.json(); if (object(body)) reason = String(body.message ?? ""); }
    catch { /* Fall back to the status message. */ }
    throw new RequestApiError(response.status, reason || (response.status === 403
      ? "You do not have Finance budget review access for this company."
      : response.status === 409 ? "The request changed. Refresh it before checking funding."
        : "The Finance check failed."));
  }
  try { return await response.json(); }
  catch { throw new RequestApiError(0, "The ERP returned an invalid Finance response."); }
}

export async function listBudgetQueue(companyId: string, offset = 0, signal?: AbortSignal): Promise<BudgetQueuePage> {
  const body = await call(companyId, `/budget-queue?limit=50&offset=${Math.max(0, offset)}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || typeof body.count !== "number"
    || typeof body.limit !== "number" || typeof body.offset !== "number"
    || body.records.some((row: unknown) => !object(row) || !guid.test(String(row.id))
      || typeof row.number !== "string" || typeof row.purpose !== "string"
      || typeof row.currencyCode !== "string" || typeof row.version !== "number"
      || typeof row.estimatedAmount !== "number"
      || (row.estimatedAmountExact !== undefined && !budgetAmountExact(row.estimatedAmountExact))))
    throw new RequestApiError(0, "The ERP returned an invalid Finance review list.");
  return body as BudgetQueuePage;
}

export async function listBudgetChecks(companyId: string, id: string, signal?: AbortSignal): Promise<BudgetCheck[]> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body = await call(companyId, `/${id}/budget-checks`, { signal });
  if (!object(body) || !Array.isArray(body.records) || body.records.some((row: unknown) =>
    !object(row) || !guid.test(String(row.id)) || typeof row.financeCheckRef !== "string"
    || typeof row.requestVersion !== "number" || typeof row.status !== "string"
    || (row.checkedAmountExact !== undefined && !budgetAmountExact(row.checkedAmountExact))))
    throw new RequestApiError(0, "The ERP returned invalid Finance check history.");
  return body.records as BudgetCheck[];
}

export async function recordBudgetCheck(companyId: string, id: string, decision: BudgetDecision): Promise<BudgetCheck> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  if (!budgetAmountExact(decision.checkedAmount))
    throw new RequestApiError(0, "The exact request amount is unavailable. Refresh before recording a Finance check.");
  const body = await call(companyId, `/${id}/budget-checks`, {
    method: "POST", body: JSON.stringify(decision),
  });
  if (!object(body) || !guid.test(String(body.id)) || body.requestVersion !== decision.requestVersion
    || body.financeCheckRef !== decision.financeCheckRef || body.status !== decision.status
    || !budgetAmountExact(body.checkedAmountExact)
    || !sameBudgetAmount(body.checkedAmountExact, decision.checkedAmount))
    throw new RequestApiError(0, "The ERP did not confirm this Finance check. Refresh before retrying.");
  return body as BudgetCheck;
}
