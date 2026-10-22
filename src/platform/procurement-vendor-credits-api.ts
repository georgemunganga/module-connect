import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Procurement commercial draft references only; Finance balances/posting remain unavailable. */
export type VendorCreditInput = { supplierInvoiceId: string; creditNumber: string; amount: string; reason: string };
export type VendorCreditDraft = Omit<VendorCreditInput, "supplierInvoiceId">;
export type VendorCreditSummary = { id: string; supplierInvoiceId: string; invoiceNumber: string; supplierId: string;
  supplierName: string; creditNumber: string; status: string; currencyCode: string;
  amount: number; exactAmount: string; version: number; createdAt: string };
export type VendorCreditDetail = VendorCreditSummary & { reason: string; creditCrudVersion: number; allowedActions: string[] };
export type VendorCreditPage = { items: VendorCreditSummary[]; total: number; page: number; pageSize: number; creditCrudVersion: number };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export class VendorCreditApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function creditAmount(value: string): string {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value) || !/[1-9]/.test(value))
    throw new VendorCreditApiError(422, "Enter a credit amount greater than zero with up to 4 decimal places.");
  return value;
}
/** Stored monetary evidence may be zero or signed; this never authorizes a new credit. */
export function creditReadAmount(value: unknown): string {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value))
    throw new VendorCreditApiError(0, "The ERP returned an invalid exact credit amount.");
  return value;
}
export function creditExactUnits(value: string): bigint {
  creditReadAmount(value);
  const negative = value.startsWith("-"), text = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = text.split(".");
  const magnitude = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
  return negative ? -magnitude : magnitude;
}
function validate(draft: VendorCreditDraft) {
  creditAmount(draft.amount);
  if (!draft.creditNumber.trim() || draft.creditNumber.trim().length > 80 || !draft.reason.trim() || draft.reason.trim().length > 1000)
    throw new VendorCreditApiError(422, "Add a credit number and a reason within the allowed length.");
}
function row(value: unknown): VendorCreditSummary {
  if (!object(value) || !guid.test(String(value.id)) || !guid.test(String(value.supplierInvoiceId))
    || !guid.test(String(value.supplierId)) || typeof value.creditNumber !== "string" || typeof value.invoiceNumber !== "string"
    || typeof value.supplierName !== "string" || typeof value.currencyCode !== "string" || !/^[A-Z]{3}$/.test(value.currencyCode)
    || typeof value.status !== "string" || !value.status.trim() || value.status.length > 80 || /[\u0000-\u001f\u007f]/.test(value.status)
    || !Number.isSafeInteger(value.version) || Number(value.version) < 1
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.exactAmount !== "string") throw new VendorCreditApiError(0, "The ERP returned invalid credit details.");
  creditReadAmount(value.exactAmount);
  return value as unknown as VendorCreditSummary;
}
function positiveMutationRow(value: unknown): VendorCreditSummary {
  const result = row(value);
  try { creditAmount(result.exactAmount); } catch { throw new VendorCreditApiError(0, "The saved credit amount was not confirmed. Review its saved details."); }
  return result;
}
async function request(company: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key,value]) => headers.set(key,value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/vendor-credits${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new VendorCreditApiError(0, "The response was not confirmed. Check saved credits before making another change."); }
  if (!response.ok) {
    let message = "";
    try { const body: unknown = await response.json(); if (object(body) && typeof body.message === "string") message = body.message; } catch { /* Safe fallback. */ }
    throw new VendorCreditApiError(response.status, response.status === 403 ? "You do not have credit access for this company."
      : message || (response.status === 409 ? "The credit changed. Reload its saved details." : "The credit action could not be completed."));
  }
  try { return await response.json() as unknown; } catch { throw new VendorCreditApiError(0, "The saved result was not confirmed. Review the credit list."); }
}
export async function listVendorCredits(company: string, page = 1, invoiceId?: string, signal?: AbortSignal, filters: { search?: string; status?: string } = {}): Promise<VendorCreditPage> {
  if (!Number.isSafeInteger(page) || page < 1 || invoiceId && !guid.test(invoiceId)) throw new VendorCreditApiError(422, "Choose a valid credit page and invoice.");
  if ((filters.search?.length ?? 0) > 160 || filters.status && !["Draft", "Cancelled"].includes(filters.status))
    throw new VendorCreditApiError(422, "Use a shorter search and a supported credit status.");
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (invoiceId) query.set("invoiceId", invoiceId);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  const result = await request(company, `?${query}`, { signal });
  if (!object(result) || result.creditCrudVersion !== 1 || !Array.isArray(result.items) || !Number.isSafeInteger(result.total)
    || Number(result.total) < 0 || result.page !== page || result.pageSize !== 25) throw new VendorCreditApiError(0, "Credit drafts are unavailable for this company.");
  return { ...result, items: result.items.map(row) } as VendorCreditPage;
}
export function creditAllows(record: VendorCreditDetail, action: "Edit" | "Cancel"): boolean {
  return record.creditCrudVersion === 1 && record.status === "Draft" && Array.isArray(record.allowedActions) && record.allowedActions.includes(action);
}
export async function getVendorCredit(company: string, id: string, signal?: AbortSignal): Promise<VendorCreditDetail> {
  if (!guid.test(id)) throw new VendorCreditApiError(422, "The credit reference is invalid.");
  const result = await request(company, `/${id}`, { signal }); row(result);
  if (!object(result) || result.id !== id || result.creditCrudVersion !== 1 || typeof result.reason !== "string"
    || !Array.isArray(result.allowedActions) || !result.allowedActions.every(action => action === "Edit" || action === "Cancel"))
    throw new VendorCreditApiError(0, "Credit actions are unavailable. Refresh the saved record.");
  return result as unknown as VendorCreditDetail;
}
export async function createVendorCredit(company: string, input: VendorCreditInput): Promise<VendorCreditSummary> {
  validate(input); if (!guid.test(input.supplierInvoiceId)) throw new VendorCreditApiError(422, "Choose an invoice first.");
  const result = positiveMutationRow(await request(company, "", { method: "POST", body: JSON.stringify(input) }));
  if (result.status !== "Draft" || result.supplierInvoiceId !== input.supplierInvoiceId) throw new VendorCreditApiError(0, "The saved credit source was not confirmed. Review the credit list.");
  return result;
}
export async function updateVendorCredit(company: string, id: string, version: number, draft: VendorCreditDraft, reason: string): Promise<VendorCreditSummary> {
  validate(draft);
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !reason.trim() || reason.trim().length > 1000)
    throw new VendorCreditApiError(422, "Refresh the saved credit and add a change reason.");
  const result = positiveMutationRow(await request(company, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft, reason: reason.trim() }) }));
  if (result.id !== id || result.status !== "Draft" || result.version <= version) throw new VendorCreditApiError(0, "The saved credit change was not confirmed. Review its details.");
  return result;
}
export async function cancelVendorCredit(company: string, id: string, version: number, reason: string): Promise<VendorCreditSummary> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !reason.trim() || reason.trim().length > 1000)
    throw new VendorCreditApiError(422, "Refresh the saved credit and add a cancellation reason.");
  const result = positiveMutationRow(await request(company, `/${id}/cancel`, { method: "POST", body: JSON.stringify({ version, reason: reason.trim() }) }));
  if (result.id !== id || result.status !== "Cancelled" || result.version <= version) throw new VendorCreditApiError(0, "Credit cancellation was not confirmed. Review its details.");
  return result;
}
