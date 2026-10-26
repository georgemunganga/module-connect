import { procurementScopeHeaders } from "../../shared/shell-scope";
import { encodeExactOrderDraft, type ExactOrderDraft } from "./procurement-order-execution-api";

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/i;
const exact = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export class PrincipalDraftError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const invalid = () => new PrincipalDraftError(0, "The ERP returned an invalid order response. Refresh and review the saved order.");

async function call(company: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  if (!validId(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/orders${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new PrincipalDraftError(0, "The response was interrupted. Check the saved result before another action."); }
  let body: unknown;
  try { body = await response.json(); } catch { throw invalid(); }
  if (!response.ok) throw new PrincipalDraftError(response.status,
    response.status === 403 ? "You do not have access to this order action."
      : response.status === 404 ? "This order is unavailable in the selected company and branch."
        : object(body) && typeof body.message === "string" ? body.message : "The order action was not confirmed.");
  return { status: response.status, body };
}

export type PrincipalSource = { purchaseRequestId: string; purchaseRequestLineId: string; requestNumber: string;
  branchRef?: string | null; expectedRequestVersion?: number; description?: string; unitCode?: string;
  categoryCode?: string; availableQuantity?: string; approvedUnitEstimate?: string; currencyCode?: string;
  canSelect: boolean };
export type PrincipalSelection = Pick<PrincipalSource,
  "purchaseRequestId" | "purchaseRequestLineId" | "expectedRequestVersion" | "canSelect">;
export type PrincipalSupplier = { id: string; number: string; displayName: string };
export type PrincipalOrderLine = { id: string; lineNumber: number; description: string; unitCode: string;
  quantity: string; unitPrice: string; taxAmount: string; purchaseRequestId: string;
  purchaseRequestLineId: string; allocationStatus: string };
export type PrincipalOrder = { id: string; number: string; supplierId: string; branchRef: string;
  currencyCode: string; status: "Draft" | "Cancelled"; version: number; createdAt: string;
  supplierDisplayName: string | null; branchDisplayName: string | null;
  originalDirectSourceSha256: string; shipToRef: string | null; billToRef: string | null;
  paymentTermRef: string | null; expectedDeliveryOn: string | null; closureReason: string | null;
  lines: PrincipalOrderLine[]; canSubmit: false; canIssue: false; financeReservationChanged: false };
export type PrincipalOrderSummary = Pick<PrincipalOrder,
  "id" | "number" | "supplierId" | "branchRef" | "currencyCode" | "status" | "version" | "createdAt" | "originalDirectSourceSha256">;
export type PrincipalOrderPage = { items: PrincipalOrderSummary[]; total: number; page: number; pageSize: number };
export type PrincipalOperation = "Create" | "Cancel";
export type PrincipalCommand = { operation: PrincipalOperation; key: string; orderId: string | null; body: string;
  draft?: ExactOrderDraft; sources?: PrincipalSelection[] };
export type PrincipalReply = { orderId: string; number: string; status: "Draft" | "Cancelled";
  version: number; originalDirectSourceSha256: string; commandKey: string;
  recordedHistoricalResult: true; canSubmit: false; canIssue: false; financeReservationChanged: false };

function source(value: unknown): value is PrincipalSource {
  return object(value) && validId(value.purchaseRequestId) && validId(value.purchaseRequestLineId)
    && typeof value.requestNumber === "string" && typeof value.canSelect === "boolean"
    && (!value.canSelect || (validId(value.branchRef) && version(value.expectedRequestVersion)
      && typeof value.description === "string" && typeof value.unitCode === "string"
      && typeof value.categoryCode === "string" && exact.test(String(value.availableQuantity))
      && exact.test(String(value.approvedUnitEstimate)) && typeof value.currencyCode === "string"));
}
function summary(value: unknown): value is PrincipalOrderSummary & Record<string, unknown> {
  return object(value) && validId(value.id) && typeof value.number === "string"
    && validId(value.supplierId) && validId(value.branchRef)
    && typeof value.currencyCode === "string" && (value.status === "Draft" || value.status === "Cancelled")
    && version(value.version) && typeof value.createdAt === "string"
    && typeof value.originalDirectSourceSha256 === "string" && digest.test(value.originalDirectSourceSha256);
}
function reply(value: unknown, operation: PrincipalOperation, key: string, orderId: string | null): value is PrincipalReply {
  return object(value) && validId(value.orderId) && (orderId === null || value.orderId === orderId)
    && value.commandKey === key && typeof value.number === "string"
    && value.status === (operation === "Create" ? "Draft" : "Cancelled")
    && version(value.version) && typeof value.originalDirectSourceSha256 === "string"
    && digest.test(value.originalDirectSourceSha256) && value.recordedHistoricalResult === true
    && value.canSubmit === false && value.canIssue === false && value.financeReservationChanged === false;
}
export async function listPrincipalSources(company: string, page: number, signal?: AbortSignal) {
  const { body } = await call(company, `/approved-principal-direct-sources?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(source)
    || !Number.isSafeInteger(body.candidateTotal) || Number(body.candidateTotal) < 0
    || !version(body.page) || !version(body.pageSize) || body.canSubmit !== false) throw invalid();
  return body as { items: PrincipalSource[]; candidateTotal: number; page: number; pageSize: number };
}
export async function listPrincipalSuppliers(company: string, page: number, search: string, signal?: AbortSignal) {
  const { body } = await call(company, `/principal-direct-suppliers?page=${page}&pageSize=25${search ? `&q=${encodeURIComponent(search)}` : ""}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(row => object(row)
    && validId(row.id) && typeof row.number === "string" && typeof row.displayName === "string")
    || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || !version(body.page) || !version(body.pageSize)) throw invalid();
  return body as { items: PrincipalSupplier[]; total: number; page: number; pageSize: number };
}
export async function listPrincipalOrders(company: string, page: number, signal?: AbortSignal): Promise<PrincipalOrderPage> {
  const { body } = await call(company, `/principal-direct-drafts?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(summary)
    || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || !version(body.page) || !version(body.pageSize)
    || body.canSubmit !== false || body.canIssue !== false) throw invalid();
  return body as unknown as PrincipalOrderPage;
}
export async function getPrincipalOrder(company: string, id: string, signal?: AbortSignal): Promise<PrincipalOrder> {
  if (!validId(id)) throw invalid();
  const { body } = await call(company, `/${id}/principal-direct-draft`, { signal });
  if (!summary(body) || body.id !== id || !Array.isArray(body.lines) || body.lines.length === 0
    || !(body.supplierDisplayName === null || typeof body.supplierDisplayName === "string")
    || !(body.branchDisplayName === null || typeof body.branchDisplayName === "string")
    || !body.lines.every(row => object(row) && validId(row.id) && version(row.lineNumber)
      && typeof row.description === "string" && typeof row.unitCode === "string"
      && exact.test(String(row.quantity)) && exact.test(String(row.unitPrice)) && exact.test(String(row.taxAmount))
      && validId(row.purchaseRequestId) && validId(row.purchaseRequestLineId)
      && (row.allocationStatus === "Reserved" || row.allocationStatus === "Released"))
    || body.canSubmit !== false || body.canIssue !== false || body.financeReservationChanged !== false) throw invalid();
  return body as unknown as PrincipalOrder;
}
export function createPrincipalBody(draft: ExactOrderDraft, chosen: PrincipalSelection[]): string {
  if (!validId(draft.supplierId) || !chosen.length || chosen.length !== draft.lines.length || chosen.length > 100
    || chosen.some(row => !row.canSelect || !validId(row.purchaseRequestId) || !validId(row.purchaseRequestLineId)
      || !version(row.expectedRequestVersion))) throw invalid();
  const selected=chosen.map((row, draftLineIndex) => ({ draftLineIndex,
    purchaseRequestId: row.purchaseRequestId, purchaseRequestLineId: row.purchaseRequestLineId,
    expectedRequestVersion: row.expectedRequestVersion }));
  return `{"draft":${encodeExactOrderDraft(draft)},"sources":${JSON.stringify(selected)}}`;
}
export function cancelPrincipalBody(record: PrincipalOrder, reason: string): string {
  if (record.status !== "Draft" || !reason.trim()) throw invalid();
  return JSON.stringify({ expectedOrderVersion: record.version,
    originalDirectSourceSha256: record.originalDirectSourceSha256, reason: reason.trim() });
}
export async function sendPrincipalCommand(company: string, command: PrincipalCommand): Promise<PrincipalReply> {
  if (!validId(command.key) || command.orderId !== null && !validId(command.orderId)) throw invalid();
  if (command.operation === "Create" && (!command.draft || !command.sources
      || createPrincipalBody(command.draft, command.sources) !== command.body)) throw invalid();
  const path = command.operation === "Create" ? "/from-approved-principal-direct-sources"
    : `/${command.orderId}/principal-direct-cancel`;
  const { status, body } = await call(company, path, { method: "POST", body: command.body,
    headers: { "Idempotency-Key": command.key } });
  if (status !== (command.operation === "Create" ? 201 : 200)
    || !reply(body, command.operation, command.key, command.orderId)) throw invalid();
  return body;
}
export async function recoverPrincipalCommand(company: string, command: PrincipalCommand): Promise<PrincipalReply> {
  if (!validId(command.key) || command.orderId !== null && !validId(command.orderId)) throw invalid();
  if (command.operation === "Create" && (!command.draft || !command.sources
      || createPrincipalBody(command.draft, command.sources) !== command.body)) throw invalid();
  // The actor-owned GET replays the retained acknowledgement itself, with its
  // original status. It does not expose a separate receipt wrapper.
  const { status, body } = await call(company, `/principal-direct-command-receipts/${command.operation}/${command.key}`);
  if (status !== (command.operation === "Create" ? 201 : 200)
    || !reply(body, command.operation, command.key, command.orderId)) throw invalid();
  return body;
}

const scaled = (value: unknown): bigint | null => {
  if (typeof value !== "string" || !exact.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
};
/** Bind an acknowledgement to the actual saved draft before releasing its journal key. */
export async function confirmPrincipalCommand(company: string, command: PrincipalCommand,
  answer: PrincipalReply): Promise<PrincipalOrder> {
  const saved = await getPrincipalOrder(company, answer.orderId);
  if (saved.id !== answer.orderId || saved.number !== answer.number || saved.status !== answer.status
    || saved.version !== answer.version
    || saved.originalDirectSourceSha256 !== answer.originalDirectSourceSha256) throw invalid();
  let submitted: unknown;
  try { submitted = JSON.parse(command.body); } catch { throw invalid(); }
  if (!object(submitted)) throw invalid();
  if (command.operation === "Cancel") {
    if (answer.version !== Number(submitted.expectedOrderVersion) + 1
      || saved.status !== "Cancelled" || saved.closureReason !== submitted.reason
      || saved.originalDirectSourceSha256 !== submitted.originalDirectSourceSha256) throw invalid();
    return saved;
  }
  if (answer.version !== 1 || saved.status !== "Draft" || !command.draft || !command.sources
    || createPrincipalBody(command.draft, command.sources) !== command.body
    || saved.supplierId !== command.draft.supplierId
    || saved.currencyCode !== command.draft.currencyCode.trim().toUpperCase()
    || saved.lines.length !== command.sources.length || saved.lines.length !== command.draft.lines.length)
    throw invalid();
  for (let i = 0; i < saved.lines.length; i++) {
    const line = saved.lines[i], draft = command.draft.lines[i], source = command.sources[i];
    if (!draft || !source || line.lineNumber !== i + 1
      || line.purchaseRequestId !== source.purchaseRequestId
      || line.purchaseRequestLineId !== source.purchaseRequestLineId
      || line.description !== draft.description.trim()
      || line.unitCode !== draft.unitCode.trim().toUpperCase()
      || scaled(line.quantity) !== scaled(draft.quantity) || scaled(line.unitPrice) !== scaled(draft.unitPrice)
      || scaled(line.taxAmount) !== scaled(draft.taxAmount) || line.allocationStatus !== "Reserved")
      throw invalid();
  }
  return saved;
}
