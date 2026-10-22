import { procurementScopeHeaders } from "../../shared/shell-scope";
import { invoiceDecimal } from "../../shared/procurement-decimal";

/** Planned Procurement spend only; no Finance bill, liability, or payment action. */
export type RecurringPurchaseDraft = {
  supplierId: string; supplierContractId: string | null; title: string;
  frequency: "Weekly" | "Monthly" | "Quarterly" | "Yearly";
  firstCycleOn: string; lastCycleOn: string | null; nextCycleOn: string;
  currencyCode: string; expectedAmount: string;
};
export type RecurringPurchase = RecurringPurchaseDraft & {
  id: string; number: string; ownerWorkerId: string; workLocationId: string | null;
  status: "Draft" | "Closed"; exactExpectedAmount: string; version: number;
  closedAt: string | null; closedReason: string | null; createdAt: string;
};
export type RecurringPurchasePage = { items: RecurringPurchase[]; total: number; page: number; pageSize: number };
export class RecurringPurchaseError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function validateRecurringPurchase(draft: RecurringPurchaseDraft): string | null {
  if (!guid.test(draft.supplierId)) return "Choose a supplier.";
  if (draft.supplierContractId && !guid.test(draft.supplierContractId)) return "Choose a valid contract.";
  if (!draft.title.trim() || draft.title.trim().length > 300) return "Enter a title of up to 300 characters.";
  if (!["Weekly", "Monthly", "Quarterly", "Yearly"].includes(draft.frequency)) return "Choose how often this purchase is expected.";
  if (!date.test(draft.firstCycleOn) || !date.test(draft.nextCycleOn) || draft.lastCycleOn && !date.test(draft.lastCycleOn))
    return "Choose valid purchase dates.";
  if (draft.nextCycleOn < draft.firstCycleOn || draft.lastCycleOn &&
      (draft.lastCycleOn < draft.firstCycleOn || draft.nextCycleOn > draft.lastCycleOn))
    return "The next purchase date must be within the schedule.";
  if (!/^[a-z]{3}$/i.test(draft.currencyCode)) return "Choose a three-letter currency code.";
  try { invoiceDecimal(draft.expectedAmount, true); }
  catch { return "Enter a positive expected amount with up to four decimal places."; }
  return null;
}
function parseRow(value: unknown): RecurringPurchase {
  if (!object(value) || !guid.test(String(value.id)) || !guid.test(String(value.supplierId))
    || !guid.test(String(value.ownerWorkerId)) || value.supplierContractId !== null && !guid.test(String(value.supplierContractId))
    || value.workLocationId !== null && !guid.test(String(value.workLocationId))
    || typeof value.number !== "string" || typeof value.title !== "string"
    || !["Weekly", "Monthly", "Quarterly", "Yearly"].includes(String(value.frequency))
    || typeof value.firstCycleOn !== "string" || !date.test(value.firstCycleOn)
    || value.lastCycleOn !== null && (typeof value.lastCycleOn !== "string" || !date.test(value.lastCycleOn))
    || typeof value.nextCycleOn !== "string" || !date.test(value.nextCycleOn)
    || typeof value.currencyCode !== "string" || !/^[A-Z]{3}$/.test(value.currencyCode)
    || typeof value.exactExpectedAmount !== "string" || !Number.isSafeInteger(value.version)
    || Number(value.version) < 1 || !["Draft", "Closed"].includes(String(value.status))
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)))
    throw new RecurringPurchaseError(0, "The ERP returned invalid recurring purchase details.");
  try { invoiceDecimal(value.exactExpectedAmount, true); }
  catch { throw new RecurringPurchaseError(0, "The ERP returned an invalid exact expected amount."); }
  return { ...value, expectedAmount: value.exactExpectedAmount } as unknown as RecurringPurchase;
}
async function request(companyId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new RecurringPurchaseError(0, "Choose an ERP company.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/recurring-purchases${path}`,
    { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new RecurringPurchaseError(0, "The response was not confirmed. Review saved recurring purchases before retrying."); }
  if (!response.ok) {
    let message = "";
    try { const body: unknown = await response.json(); if (object(body) && typeof body.message === "string") message = body.message; }
    catch { /* status fallback */ }
    throw new RecurringPurchaseError(response.status,
      response.status === 403 ? "You cannot change recurring purchases for this company."
        : message || "The recurring purchase action could not be completed.");
  }
  try { return await response.json() as unknown; }
  catch { throw new RecurringPurchaseError(0, "The saved result was not confirmed. Review the list before retrying."); }
}
export async function listRecurringPurchases(company: string, page = 1, signal?: AbortSignal): Promise<RecurringPurchasePage> {
  if (!Number.isSafeInteger(page) || page < 1) throw new RecurringPurchaseError(422, "Choose a valid page.");
  const value = await request(company, `?page=${page}&pageSize=25`, { signal });
  if (!object(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.total)
    || !Number.isSafeInteger(value.page) || !Number.isSafeInteger(value.pageSize)
    || Number(value.total) < 0 || value.page !== page || value.pageSize !== 25)
    throw new RecurringPurchaseError(0, "The ERP returned an invalid recurring purchase list.");
  return { items: value.items.map(parseRow), total: value.total as number, page, pageSize: 25 };
}
export async function getRecurringPurchase(company: string, id: string, signal?: AbortSignal): Promise<RecurringPurchase> {
  if (!guid.test(id)) throw new RecurringPurchaseError(422, "The recurring purchase reference is invalid.");
  return parseRow(await request(company, `/${id}`, { signal }));
}
export async function createRecurringPurchase(company: string, draft: RecurringPurchaseDraft): Promise<RecurringPurchase> {
  const issue = validateRecurringPurchase(draft); if (issue) throw new RecurringPurchaseError(422, issue);
  return parseRow(await request(company, "", { method: "POST", body: JSON.stringify(ownedDraft(draft)) }));
}
export async function updateRecurringPurchase(company: string, id: string, version: number,
  draft: RecurringPurchaseDraft): Promise<RecurringPurchase> {
  const issue = validateRecurringPurchase(draft); if (issue) throw new RecurringPurchaseError(422, issue);
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1) throw new RecurringPurchaseError(422, "Refresh the saved purchase.");
  return parseRow(await request(company, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft: ownedDraft(draft) }) }));
}
function ownedDraft(draft: RecurringPurchaseDraft): RecurringPurchaseDraft {
  return { supplierId: draft.supplierId, supplierContractId: draft.supplierContractId,
    title: draft.title, frequency: draft.frequency, firstCycleOn: draft.firstCycleOn,
    lastCycleOn: draft.lastCycleOn, nextCycleOn: draft.nextCycleOn,
    currencyCode: draft.currencyCode, expectedAmount: draft.expectedAmount };
}
export async function closeRecurringPurchase(company: string, id: string, version: number,
  reason: string): Promise<RecurringPurchase> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !reason.trim() || reason.trim().length > 1000)
    throw new RecurringPurchaseError(422, "Give a reason of up to 1,000 characters.");
  const value = parseRow(await request(company, `/${id}/close`, { method: "POST", body: JSON.stringify({ version, reason: reason.trim() }) }));
  if (value.status !== "Closed") throw new RecurringPurchaseError(0, "Closure was not confirmed. Review the saved purchase.");
  return value;
}
