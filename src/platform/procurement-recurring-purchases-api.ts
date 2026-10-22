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
  id: string; number: string; ownerPrincipalId: string; ownerWorkerId: string | null; workLocationId: string | null;
  status: "Draft" | "Closed"; exactExpectedAmount: string; version: number;
  closedAt: string | null; closedReason: string | null; createdAt: string;
};
export type RecurringPurchasePage = { items: RecurringPurchase[]; total: number; page: number; pageSize: number };
export class RecurringPurchaseError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** Only statuses used by known pre-commit rejection paths permit another write. */
export function isDefiniteRecurringRejection(error: unknown): error is RecurringPurchaseError {
  return error instanceof RecurringPurchaseError && [400, 401, 403, 404, 409, 422].includes(error.status);
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !date.test(value) || value < "0001-01-01") return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function validateRecurringPurchase(draft: RecurringPurchaseDraft): string | null {
  if (!guid.test(draft.supplierId)) return "Choose a supplier.";
  if (draft.supplierContractId && !guid.test(draft.supplierContractId)) return "Choose a valid contract.";
  if (!draft.title.trim() || draft.title.trim().length > 300) return "Enter a title of up to 300 characters.";
  if (!["Weekly", "Monthly", "Quarterly", "Yearly"].includes(draft.frequency)) return "Choose how often this purchase is expected.";
  if (!validDate(draft.firstCycleOn) || !validDate(draft.nextCycleOn) || draft.lastCycleOn && !validDate(draft.lastCycleOn))
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
    || !guid.test(String(value.ownerPrincipalId)) || value.ownerPrincipalId === "00000000-0000-0000-0000-000000000000"
    || value.ownerWorkerId !== null && !guid.test(String(value.ownerWorkerId)) || value.supplierContractId !== null && !guid.test(String(value.supplierContractId))
    || value.workLocationId !== null && !guid.test(String(value.workLocationId))
    || typeof value.number !== "string" || typeof value.title !== "string"
    || !["Weekly", "Monthly", "Quarterly", "Yearly"].includes(String(value.frequency))
    || !validDate(value.firstCycleOn)
    || value.lastCycleOn !== null && !validDate(value.lastCycleOn)
    || !validDate(value.nextCycleOn)
    || typeof value.currencyCode !== "string" || !/^[A-Z]{3}$/.test(value.currencyCode)
    || typeof value.exactExpectedAmount !== "string" || !Number.isSafeInteger(value.version)
    || Number(value.version) < 1 || !["Draft", "Closed"].includes(String(value.status))
    || value.status === "Closed" && (typeof value.closedReason !== "string" || !value.closedReason.trim()
      || typeof value.closedAt !== "string" || !Number.isFinite(Date.parse(value.closedAt)))
    || value.status === "Draft" && (value.closedAt !== null || value.closedReason !== null)
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)))
    throw new RecurringPurchaseError(0, "The ERP returned invalid recurring purchase details.");
  try { invoiceDecimal(value.exactExpectedAmount, true); }
  catch { throw new RecurringPurchaseError(0, "The ERP returned an invalid exact expected amount."); }
  return { ...value, expectedAmount: value.exactExpectedAmount } as unknown as RecurringPurchase;
}
export function recurringPurchaseForPrincipal(record: RecurringPurchase, principalId: string): RecurringPurchase {
  if (record.ownerPrincipalId !== principalId)
    throw new RecurringPurchaseError(0, "The returned purchase belongs to a different account. Refresh your company context.");
  return record;
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
  const saved = parseRow(await request(company, `/${id}`, { signal }));
  if (saved.id !== id) throw new RecurringPurchaseError(0, "The ERP returned a different purchase. Refresh the list.");
  return saved;
}
export async function createRecurringPurchase(company: string, draft: RecurringPurchaseDraft): Promise<RecurringPurchase> {
  const issue = validateRecurringPurchase(draft); if (issue) throw new RecurringPurchaseError(422, issue);
  const saved = parseRow(await request(company, "", { method: "POST", body: JSON.stringify(ownedDraft(draft)) }));
  if (saved.version !== 1 || saved.status !== "Draft" || !matchesDraft(saved, draft))
    throw new RecurringPurchaseError(0, "The new purchase was not confirmed. Review the saved list.");
  return saved;
}
export async function updateRecurringPurchase(company: string, id: string, version: number,
  draft: RecurringPurchaseDraft): Promise<RecurringPurchase> {
  const issue = validateRecurringPurchase(draft); if (issue) throw new RecurringPurchaseError(422, issue);
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(version + 1)) throw new RecurringPurchaseError(422, "Refresh the saved purchase.");
  const saved = parseRow(await request(company, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft: ownedDraft(draft) }) }));
  if (saved.id !== id || saved.version !== version + 1
    || saved.status !== "Draft" || !matchesDraft(saved, draft))
    throw new RecurringPurchaseError(0, "The update was not confirmed. Review the saved purchase.");
  return saved;
}
function matchesDraft(saved: RecurringPurchase, draft: RecurringPurchaseDraft): boolean {
  const amount = (value: string) => value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return saved.supplierId === draft.supplierId && saved.supplierContractId === draft.supplierContractId
    && saved.title === draft.title.trim() && saved.frequency === draft.frequency
    && saved.firstCycleOn === draft.firstCycleOn && saved.lastCycleOn === draft.lastCycleOn
    && saved.nextCycleOn === draft.nextCycleOn && saved.currencyCode === draft.currencyCode.trim().toUpperCase()
    && amount(saved.exactExpectedAmount) === amount(draft.expectedAmount);
}
function ownedDraft(draft: RecurringPurchaseDraft): RecurringPurchaseDraft {
  return { supplierId: draft.supplierId, supplierContractId: draft.supplierContractId,
    title: draft.title, frequency: draft.frequency, firstCycleOn: draft.firstCycleOn,
    lastCycleOn: draft.lastCycleOn, nextCycleOn: draft.nextCycleOn,
    currencyCode: draft.currencyCode, expectedAmount: draft.expectedAmount };
}
export async function closeRecurringPurchase(company: string, id: string, version: number,
  reason: string): Promise<RecurringPurchase> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(version + 1) || !reason.trim() || reason.trim().length > 1000)
    throw new RecurringPurchaseError(422, "Give a reason of up to 1,000 characters.");
  const value = parseRow(await request(company, `/${id}/close`, { method: "POST", body: JSON.stringify({ version, reason: reason.trim() }) }));
  if (value.id !== id || value.version !== version + 1 || value.status !== "Closed" || value.closedReason !== reason.trim()) throw new RecurringPurchaseError(0, "Closure was not confirmed. Review the saved purchase.");
  return value;
}
