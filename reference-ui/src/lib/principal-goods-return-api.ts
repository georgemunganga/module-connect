import { procurementScopeHeaders } from "../../../shared/shell-scope";

const root = "/api/procurement/v1/returns/principal-drafts";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exact = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const invalid = () => new GoodsReturnError(0, "ERP returned incomplete return evidence. Refresh before changing this draft.");

export class GoodsReturnError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export type ReturnLabels = { purchaseOrderNumber: string; supplierDisplayName: string | null; lineNumber: number; description: string; unitCode: string; currencyCode: string; deliveryNoteReference: string; receivedAt: string };
export type ReturnEligible = { acceptanceFactId: string; receiptId: string; purchaseOrderId: string; purchaseOrderLineId: string; branchId: string; acceptedFactQuantityExact: string; labels: ReturnLabels };
export type ReturnDetail = { id: string; status: "Draft" | "Cancelled"; version: number; branchId: string; receiptId: string; acceptanceFactId: string; purchaseOrderId: string; purchaseOrderLineId: string; acceptedFactQuantityExact: string; quantityExact: string; reason: string; evidenceReference: string | null; allowedActions: Array<"Edit" | "Cancel">; labels: ReturnLabels; draftOnly: true; stockChanged: false; financeChanged: false; supplierNotified: false };
export type ReturnPage<T> = { items: T[]; nextOffset: number | null; hasMore: boolean };
export type ReturnCommand = { operation: "Create" | "Revise" | "Cancel"; key: string; targetId: string | null; body: string; method: "POST" | "PUT";
  /** Original GET detail pins retained for cancellation, which has no quantity in its POST body. */
  prior?: { quantityExact: string; evidenceReference: string | null } };
export type ReturnAck = Omit<ReturnDetail, "allowedActions" | "labels">;

export function returnQuantity(value: string, ceiling: string): string {
  if (!exact.test(value) || !exact.test(ceiling)) throw new GoodsReturnError(422, "Enter an exact quantity with up to four decimal places.");
  const units = (amount: string) => { const [whole, fraction = ""] = amount.split("."); return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0")); };
  if (units(value) <= 0n || units(value) > units(ceiling)) throw new GoodsReturnError(422, "Quantity must be positive and no greater than the selected accepted goods fact.");
  return value;
}
export function returnText(reason: string, evidenceReference?: string): { reason: string; evidenceReference: string | null } {
  const clean = reason.trim(), reference = evidenceReference?.trim() || null;
  if (!clean || clean.length > 2000 || (evidenceReference?.length ?? 0) > 300) throw new GoodsReturnError(422, "Enter a reason (1–2000 characters) and an evidence reference of at most 300 characters.");
  return { reason: clean, evidenceReference: reference };
}
/** A mounted editor cannot silently move its command to another branch. */
export function assertReturnScope(company: string, mountedBranch: string): void {
  const current = procurementScopeHeaders(company);
  if (!guid.test(mountedBranch) || current["X-Shell-Location"] !== mountedBranch || current["X-Shell-Branch-Scope"])
    throw new GoodsReturnError(0, "The selected branch changed. Reopen this return before another action.");
}
function labels(value: unknown): value is ReturnLabels {
  return record(value) && typeof value.purchaseOrderNumber === "string" && value.purchaseOrderNumber.length > 0
    && (value.supplierDisplayName === null || typeof value.supplierDisplayName === "string")
    && integer(value.lineNumber) && typeof value.description === "string" && typeof value.unitCode === "string"
    && typeof value.currencyCode === "string" && typeof value.deliveryNoteReference === "string"
    && typeof value.receivedAt === "string" && !Number.isNaN(Date.parse(value.receivedAt));
}
function exactValue(value: unknown): value is string { return typeof value === "string" && exact.test(value); }
function base(value: unknown): value is ReturnAck {
  return record(value) && [value.id, value.branchId, value.receiptId, value.acceptanceFactId, value.purchaseOrderId, value.purchaseOrderLineId].every((x) => typeof x === "string" && guid.test(x))
    && (value.status === "Draft" || value.status === "Cancelled") && integer(value.version) && value.version > 0
    && exactValue(value.acceptedFactQuantityExact) && exactValue(value.quantityExact)
    && typeof value.reason === "string" && value.reason.length > 0 && (value.evidenceReference === null || typeof value.evidenceReference === "string")
    && value.draftOnly === true && value.stockChanged === false && value.financeChanged === false && value.supplierNotified === false;
}
export function readReturnDetail(value: unknown, expectedId?: string): ReturnDetail {
  if (!record(value)) throw invalid();
  // Keep the GET-only metadata separate from the immutable acknowledgement
  // predicate, whose type deliberately has neither labels nor actions.
  const responseLabels: unknown = value.labels, responseActions: unknown = value.allowedActions;
  if (!base(value) || expectedId && value.id !== expectedId
    || !labels(responseLabels) || !Array.isArray(responseActions)
    || !responseActions.every((action: unknown) => action === "Edit" || action === "Cancel")
    || value.status !== "Draft" && responseActions.length > 0) throw invalid();
  return value as unknown as ReturnDetail;
}
export function readReturnEligible(value: unknown): ReturnEligible {
  if (!record(value) || ![value.acceptanceFactId, value.receiptId, value.purchaseOrderId, value.purchaseOrderLineId, value.branchId].every((x) => typeof x === "string" && guid.test(x))
    || !exactValue(value.acceptedFactQuantityExact) || !labels(value.labels)) throw invalid();
  return value as unknown as ReturnEligible;
}
export function readReturnAck(value: unknown, command: ReturnCommand): ReturnAck {
  returnCommandPath(command);
  if (!base(value) || !record(value) || Object.hasOwn(value, "allowedActions") || Object.hasOwn(value, "labels")
    || command.targetId && value.id !== command.targetId) throw invalid();
  let body: unknown;
  try { body = JSON.parse(command.body); } catch { throw invalid(); }
  if (!record(body) || typeof body.reason !== "string" || typeof value.reason !== "string") throw invalid();
  let normalized: { reason: string; evidenceReference: string | null };
  try { normalized = returnText(body.reason, typeof body.evidenceReference === "string" ? body.evidenceReference : undefined); }
  catch { throw invalid(); }
  if (value.reason !== normalized.reason) throw invalid();
  if (command.operation === "Create" || command.operation === "Revise") {
    if (typeof body.quantity !== "string" || body.evidenceReference !== null && typeof body.evidenceReference !== "string"
      || value.evidenceReference !== normalized.evidenceReference || value.status !== "Draft") throw invalid();
    try { returnQuantity(body.quantity, value.acceptedFactQuantityExact); } catch { throw invalid(); }
    if (scaled(body.quantity) !== scaled(value.quantityExact)) throw invalid();
  }
  if (command.operation === "Create") {
    if (body.acceptanceFactId !== value.acceptanceFactId || value.version !== 1) throw invalid();
  } else if (!integer(body.expectedRevision) || body.expectedRevision < 1 || value.version !== body.expectedRevision + 1) throw invalid();
  if (command.operation === "Cancel") {
    if (value.status !== "Cancelled" || body.evidenceReference !== undefined || !command.prior
      || scaled(command.prior.quantityExact) !== scaled(value.quantityExact)
      || command.prior.evidenceReference !== value.evidenceReference) throw invalid();
  }
  return value as unknown as ReturnAck;
}
function scaled(value: string): bigint {
  if (!exact.test(value)) throw invalid();
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
function readPage<T>(value: unknown, parse: (item: unknown) => T): ReturnPage<T> {
  if (!record(value) || Object.hasOwn(value, "total") || Object.hasOwn(value, "sort") || Object.hasOwn(value, "search")
    || !Array.isArray(value.items) || value.items.length > 25 || typeof value.hasMore !== "boolean"
    || !(value.nextOffset === null || integer(value.nextOffset)) || value.hasMore !== (value.nextOffset !== null)) throw invalid();
  return { items: value.items.map(parse), nextOffset: value.nextOffset as number | null, hasMore: value.hasMore };
}
export function returnCommandPath(command: ReturnCommand): string {
  if (!guid.test(command.key) || command.targetId !== null && !guid.test(command.targetId)
    || command.operation === "Create" && (command.targetId !== null || command.method !== "POST")
    || command.operation === "Revise" && (!command.targetId || command.method !== "PUT")
    || command.operation === "Cancel" && (!command.targetId || command.method !== "POST")) throw invalid();
  return command.operation === "Create" ? root : `${root}/${command.targetId}${command.operation === "Cancel" ? "/cancel" : ""}`;
}
async function request(company: string, path: string, init: RequestInit = {}, collection = false): Promise<unknown> {
  if (!guid.test(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  const selected = guid.test(headers.get("X-Shell-Location") ?? "") && !headers.has("X-Shell-Branch-Scope");
  const all = headers.get("X-Shell-Branch-Scope") === "all" && !headers.has("X-Shell-Location");
  if (!selected && !(collection && init.method === undefined && all)) throw new GoodsReturnError(0, "Choose a permitted branch to open returns.");
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(path, { ...init, headers, cache: "no-store", credentials: "include" }); }
  catch { throw new GoodsReturnError(0, "The response was interrupted. Check whether this return was saved before another change."); }
  let body: unknown;
  try { body = await response.json(); } catch { if (response.ok) throw invalid(); }
  if (!response.ok) throw new GoodsReturnError(response.status, response.status === 403 ? "Your current access does not permit this return action."
    : response.status === 404 ? "This return or saved result is unavailable in the selected branch."
    : response.status === 409 ? "The return or its source changed. Refresh before continuing."
    : response.status === 422 ? "Review the return quantity, reason and evidence reference."
    : "The return service is unavailable. If you just saved, check whether the return was saved.");
  return body;
}
export async function listReturnDrafts(company: string, offset: number, signal?: AbortSignal) {
  if (!integer(offset) || offset > 10000) throw invalid();
  return readPage(await request(company, `${root}?offset=${offset}`, { signal }, true), (item) => readReturnDetail(item));
}
export async function listEligibleGoods(company: string, offset: number, signal?: AbortSignal) {
  if (!integer(offset) || offset > 10000) throw invalid();
  return readPage(await request(company, `${root}/eligible-goods?offset=${offset}`, { signal }, true), readReturnEligible);
}
export async function getReturnDraft(company: string, id: string, signal?: AbortSignal) {
  if (!guid.test(id)) throw invalid();
  return readReturnDetail(await request(company, `${root}/${id}`, { signal }), id);
}
export async function sendReturnCommand(company: string, command: ReturnCommand) {
  const value = await request(company, returnCommandPath(command), { method: command.method, body: command.body, headers: { "Idempotency-Key": command.key } });
  return readReturnAck(value, command);
}
export async function recoverReturnCommand(company: string, command: ReturnCommand) {
  if (!guid.test(command.key)) throw invalid();
  return readReturnAck(await request(company, `${root}/commands/${command.key}`), command);
}
