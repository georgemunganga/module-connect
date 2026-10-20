import { budgetAmountCoversSource, budgetCheckedAmount, budgetSourceAmount, parseBudgetJson } from "./procurement-budget-exact";
import { procurementScopeHeaders } from "../../shared/shell-scope";

import { RequestApiError } from "./procurement-requests-api";

export type BudgetQueueRecord = {
  id: string; number: string; purpose: string; currencyCode: string;
  submittedAt: string; version: number; businessVersion: number; approvalState: string;
  createdBy: string; estimatedAmount: string;
};
export type BudgetQueuePage = { records: BudgetQueueRecord[]; count: number; limit: number; offset: number };
export type BudgetCheck = {
  id: string; requestVersion: number; financeCheckRef: string;
  status: "Available" | "Insufficient" | "NotConfigured" | "PartiallyAvailable";
  checkedAmount: string; currencyCode: string; checkedAt: string;
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
  try { return parseBudgetJson(await response.text()); }
  catch { throw new RequestApiError(0, "The ERP returned an invalid Finance response."); }
}

const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => integer(value) && value > 0;
const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string";
function check(value: unknown): BudgetCheck {
  if (!object(value) || !guid.test(String(value.id)) || !positive(value.requestVersion) || typeof value.financeCheckRef !== "string"
    || !["Available", "Insufficient", "NotConfigured", "PartiallyAvailable"].includes(String(value.status))
    || typeof value.checkedAmount !== "string" || typeof value.currencyCode !== "string" || typeof value.checkedAt !== "string"
    || typeof value.checkedBySubjectId !== "string" || typeof value.evidenceRef !== "string"
    || ![value.decisionReason, value.reservationRef, value.reservationStatus].every(nullableText))
    throw new RequestApiError(0, "The ERP returned invalid Finance check history.");
  return { id: value.id as string, requestVersion: value.requestVersion, financeCheckRef: value.financeCheckRef,
    status: value.status as BudgetCheck["status"], checkedAmount: budgetCheckedAmount(value.checkedAmount), currencyCode: value.currencyCode,
    checkedAt: value.checkedAt, checkedBySubjectId: value.checkedBySubjectId, evidenceRef: value.evidenceRef,
    decisionReason: value.decisionReason as string | null, reservationRef: value.reservationRef as string | null, reservationStatus: value.reservationStatus as string | null };
}
export async function listBudgetQueue(companyId: string, offset = 0, signal?: AbortSignal): Promise<BudgetQueuePage> {
  if (!integer(offset) || offset > 100000) throw new RequestApiError(0, "Choose a valid Finance queue page.");
  const body = await call(companyId, `/budget-queue?limit=50&offset=${offset}`, { signal });
  if (!object(body) || !Array.isArray(body.records) || !integer(body.count) || !positive(body.limit) || body.limit > 100
    || body.offset !== offset || body.records.length > body.limit)
    throw new RequestApiError(0, "The ERP returned an invalid Finance review list.");
  const records = body.records.map((row: unknown): BudgetQueueRecord => {
    if (!object(row) || !positive(row.businessVersion))
      throw new RequestApiError(0, "Finance review setup needs the request business version. Refresh after the API is updated.");
    if (!guid.test(String(row.id)) || typeof row.number !== "string" || typeof row.purpose !== "string"
      || typeof row.currencyCode !== "string" || !/^[A-Z]{3}$/.test(row.currencyCode) || !positive(row.version) || row.businessVersion > row.version
      || typeof row.submittedAt !== "string" || typeof row.approvalState !== "string" || typeof row.createdBy !== "string" || typeof row.estimatedAmount !== "string")
      throw new RequestApiError(0, "The ERP returned an invalid Finance review list.");
    return { id: row.id as string, number: row.number, purpose: row.purpose, currencyCode: row.currencyCode, version: row.version,
      businessVersion: row.businessVersion, submittedAt: row.submittedAt, approvalState: row.approvalState, createdBy: row.createdBy,
      estimatedAmount: budgetSourceAmount(row.estimatedAmount) };
  });
  return { records, count: body.count, limit: body.limit, offset };
}
export async function listBudgetChecks(companyId: string, id: string, signal?: AbortSignal): Promise<BudgetCheck[]> {
  if (!guid.test(id)) throw new RequestApiError(0, "The request reference is invalid.");
  const body = await call(companyId, `/${id}/budget-checks`, { signal });
  if (!object(body) || !Array.isArray(body.records)) throw new RequestApiError(0, "The ERP returned invalid Finance check history.");
  return body.records.map(check);
}
/** Content match only: history cannot prove original recorder or authorize a new action. */
export function budgetCheckMatches(check: BudgetCheck, decision: BudgetDecision, expectedBusinessVersion: number): boolean {
  return check.requestVersion === expectedBusinessVersion && check.financeCheckRef === decision.financeCheckRef && check.status === decision.status
    && check.checkedAmount === budgetCheckedAmount(decision.checkedAmount) && check.currencyCode === decision.currencyCode
    && check.evidenceRef === decision.evidenceRef && check.decisionReason === decision.decisionReason
    && check.reservationRef === decision.reservationRef && check.reservationStatus === decision.reservationStatus;
}
export async function recordBudgetCheck(companyId: string, id: string, decision: BudgetDecision,
  sourceAmount: string, expectedBusinessVersion: number): Promise<BudgetCheck> {
  if (!guid.test(id) || !positive(decision.requestVersion) || !positive(expectedBusinessVersion) || expectedBusinessVersion > decision.requestVersion)
    throw new RequestApiError(0, "Refresh the request and its business version before checking funding.");
  const amount = budgetCheckedAmount(decision.checkedAmount);
  if (!budgetAmountCoversSource(amount, sourceAmount)) throw new RequestApiError(422, "The amount checked must cover the full exact request amount.");
  const payload = { requestVersion: decision.requestVersion, financeCheckRef: decision.financeCheckRef, status: decision.status, checkedAmount: amount,
    currencyCode: decision.currencyCode, evidenceRef: decision.evidenceRef, decisionReason: decision.decisionReason,
    reservationRef: decision.reservationRef, reservationStatus: decision.reservationStatus };
  const recorded = check(await call(companyId, `/${id}/budget-checks`, { method: "POST", body: JSON.stringify(payload) }));
  if (!budgetCheckMatches(recorded, payload, expectedBusinessVersion))
    throw new RequestApiError(0, "The ERP did not confirm this Finance check. Check its history before another save.");
  return recorded;
}
