import { procurementScopeHeaders } from "../../shared/shell-scope";
import { invoiceDecimal } from "../../shared/procurement-decimal";

/** Governed internal RFQ holds only; publication/award/payment are not implied. */
export type RfqSource = { purchaseRequestId: string; purchaseRequestLineId: string; requestNumber: string; state: "Available" | "FullyAllocated" | "Unavailable";
  canSelect: boolean; branchRef?: string | null; description?: string; unitCode?: string; categoryCode?: string | null; expectedRequestVersion?: number;
  sourceLineVersion?: number; availableQuantity?: string; approvedUnitEstimate?: string; currencyCode?: string; minimumQuoteCount?: number;
  sourceSubmissionId?: string; sourceCaseId?: string; methodId?: string; methodRevision?: number };
export type RfqSourcePage = { items: RfqSource[]; candidateTotal: number; page: number; pageSize: number };
export type RfqOwned = { id: string; number: string; state: "VerifiedRetainedDraft" | "Unavailable"; title?: string; currencyCode?: string;
  status?: "Draft" | "Cancelled"; version?: number; originalDraftFingerprint?: string };
export type RfqOwnedPage = { items: RfqOwned[]; total: number; page: number; pageSize: number };
export type RfqDetail = { id: string; number: string; title: string; method: string; currencyCode: string; status: "Draft" | "Cancelled"; version: number;
  originalDraftFingerprint: string; cancellationReason: string | null; lines: { id: string; purchaseRequestId: string; purchaseRequestLineId: string;
    description: string; unitCode: string; categoryCode: string | null; quantity: string; approvedUnitEstimate: string; estimatedValue: string; allocationState: "Reserved" | "Released" }[] };
export type RfqSelection = { source: RfqSource; quantity: string };
export type RfqCommand = { operation: "Create" | "Cancel"; key: string; eventId: string | null; body: string };
export type RfqReply = { eventId: string; number: string; status: "Draft" | "Cancelled"; version: number; originalDraftFingerprint: string; recordedHistoricalResult: true };
export class RfqExecutionError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
const int = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const positive = (v: unknown): v is number => int(v) && v > 0;
const text = (v: unknown): v is string => typeof v === "string";
const sha = (v: unknown): v is string => text(v) && /^[a-f0-9]{64}$/.test(v);
const nullableId = (v: unknown): v is string | null => v === null || id(v);
const exact = (v: unknown): v is string => text(v) && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(v);
const invalid = () => new RfqExecutionError(0, "ERP did not confirm the quote information. Refresh or check the saved result before continuing.");
export function rfqQuantity(value: string): string {
  try { return invoiceDecimal(value, true); }
  catch { throw new RfqExecutionError(0, "Enter a quantity greater than zero, with up to four decimal places."); }
}
function units(value: string): bigint { const [whole, fraction = ""] = rfqQuantity(value).split("."); return BigInt(whole + fraction.padEnd(4, "0")); }
export function rfqQuantityFits(quantity: string, available: string): boolean { try { return units(quantity) <= units(available); } catch { return false; } }
async function request(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company)) throw invalid();
  const headers = new Headers(init.headers); Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/sourcing${path}`, { ...init, method: init.method ?? "GET", headers, credentials: "include", cache: "no-store" }); }
  catch { throw new RfqExecutionError(0, "The response was interrupted. Check the saved result before another change."); }
  if (!response.ok) throw new RfqExecutionError(response.status, response.status === 401 ? "Sign in to ERP before continuing."
    : response.status === 403 ? "You do not have access to this quote action."
      : response.status === 404 ? "This quote or saved result is not available in your current access."
        : response.status === 409 ? "The source or quote changed. Refresh and review before continuing."
          : response.status === 422 ? "Check the quote details and quantities before saving."
            : "Quote requests are not ready, or the save could not be confirmed. Check the saved result before continuing.");
  try { return await response.json(); } catch { throw invalid(); }
}
function query(page: number, q: string) {
  if (!positive(page) || page > 100000 || q.length > 100 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  return `?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}
function pageBody(body: unknown, page: number): asserts body is Record<string, unknown> & { items: unknown[]; pageSize: number } {
  if (!object(body) || body.page !== page || !positive(body.pageSize) || body.pageSize > 25 || body.canPublish !== false
    || !Array.isArray(body.items) || body.items.length > body.pageSize) throw invalid();
}
function sourceRow(row: unknown): RfqSource {
  if (!object(row) || !id(row.purchaseRequestId) || !id(row.purchaseRequestLineId) || !text(row.requestNumber) || row.canPublish !== false) throw invalid();
  const base = { purchaseRequestId: row.purchaseRequestId, purchaseRequestLineId: row.purchaseRequestLineId, requestNumber: row.requestNumber };
  if (row.state === "Unavailable" && row.canSelect === false) return { ...base, state: "Unavailable", canSelect: false };
  if (!(row.state === "Available" || row.state === "FullyAllocated") || row.canSelect !== (row.state === "Available")
    || !Object.prototype.hasOwnProperty.call(row, "branchRef") || !nullableId(row.branchRef)
    || !text(row.description) || !text(row.unitCode) || !(row.categoryCode === null || text(row.categoryCode))
    || !positive(row.expectedRequestVersion) || !positive(row.sourceLineVersion) || !exact(row.availableQuantity) || !exact(row.approvedUnitEstimate)
    || !text(row.currencyCode) || !/^[A-Z]{3}$/.test(row.currencyCode) || !int(row.minimumQuoteCount) || row.minimumQuoteCount > 20
    || !id(row.sourceSubmissionId) || !id(row.sourceCaseId) || !id(row.methodId) || !positive(row.methodRevision)) throw invalid();
  // Four-decimal source originals are validated before use; no financial Number coercion.
  try { invoiceDecimal(row.availableQuantity); invoiceDecimal(row.approvedUnitEstimate); } catch { throw invalid(); }
  if ((row.availableQuantity === "0") !== (row.state === "FullyAllocated")) throw invalid();
  return { ...base, state: row.state, canSelect: row.state === "Available", branchRef: row.branchRef, description: row.description, unitCode: row.unitCode,
    categoryCode: row.categoryCode, expectedRequestVersion: row.expectedRequestVersion, sourceLineVersion: row.sourceLineVersion,
    availableQuantity: row.availableQuantity, approvedUnitEstimate: row.approvedUnitEstimate, currencyCode: row.currencyCode,
    minimumQuoteCount: row.minimumQuoteCount, sourceSubmissionId: row.sourceSubmissionId, sourceCaseId: row.sourceCaseId, methodId: row.methodId, methodRevision: row.methodRevision };
}
export async function listRfqSources(company: string, page = 1, q = "", signal?: AbortSignal): Promise<RfqSourcePage> {
  const body = await request(company, `/approved-sources${query(page, q)}`, { signal }); pageBody(body, page);
  if (!int(body.candidateTotal) || body.candidateTotal < body.items.length || body.eligibilityMeaning !== "CurrentPreviewOnly") throw invalid();
  const items = body.items.map(sourceRow); if (new Set(items.map(x => x.purchaseRequestLineId)).size !== items.length) throw invalid();
  return { items, candidateTotal: body.candidateTotal, page, pageSize: body.pageSize };
}
export async function listGovernedRfq(company: string, page = 1, q = "", state = "", signal?: AbortSignal): Promise<RfqOwnedPage> {
  if (state !== "" && state !== "Draft" && state !== "Cancelled") throw invalid();
  const body = await request(company, `/source-drafts${query(page, q)}${state ? `&state=${state}` : ""}`, { signal }); pageBody(body, page);
  if (!int(body.total) || body.total < body.items.length) throw invalid();
  const items = body.items.map((row): RfqOwned => {
    if (!object(row) || !id(row.id) || !text(row.number) || row.canPublish !== false) throw invalid();
    if (row.state === "Unavailable") return { id: row.id, number: row.number, state: "Unavailable" };
    if (row.state !== "VerifiedRetainedDraft" || !text(row.title) || !text(row.currencyCode) || !["Draft", "Cancelled"].includes(String(row.status))
      || !positive(row.version) || !sha(row.originalDraftFingerprint)) throw invalid();
    return { id: row.id, number: row.number, state: "VerifiedRetainedDraft", title: row.title, currencyCode: row.currencyCode,
      status: row.status as "Draft" | "Cancelled", version: row.version, originalDraftFingerprint: row.originalDraftFingerprint };
  });
  return { items, total: body.total, page, pageSize: body.pageSize };
}
export async function getGovernedRfq(company: string, eventId: string, signal?: AbortSignal): Promise<RfqDetail> {
  if (!id(eventId)) throw invalid(); const body = await request(company, `/${eventId}/source-draft`, { signal });
  if (!object(body) || body.id !== eventId || !text(body.number) || !text(body.title) || !text(body.method) || !text(body.currencyCode)
    || !(body.status === "Draft" || body.status === "Cancelled") || !positive(body.version) || !sha(body.originalDraftFingerprint)
    || !(body.cancellationReason === null || text(body.cancellationReason)) || body.canPublish !== false
    || body.supplierDeliveryState !== "NotStarted" || body.financeReservationChanged !== false || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 200) throw invalid();
  const lines = body.lines.map((line): RfqDetail["lines"][number] => {
    if (!object(line) || !id(line.id) || !id(line.purchaseRequestId) || !id(line.purchaseRequestLineId) || !text(line.description) || !text(line.unitCode)
      || !(line.categoryCode === null || text(line.categoryCode)) || ![line.quantity, line.approvedUnitEstimate, line.estimatedValue].every(exact)
      || line.allocationState !== (body.status === "Draft" ? "Reserved" : "Released")) throw invalid();
    return { id: line.id, purchaseRequestId: line.purchaseRequestId, purchaseRequestLineId: line.purchaseRequestLineId,
      description: line.description, unitCode: line.unitCode, categoryCode: line.categoryCode, quantity: line.quantity as string,
      approvedUnitEstimate: line.approvedUnitEstimate as string, estimatedValue: line.estimatedValue as string, allocationState: line.allocationState as RfqDetail["lines"][number]["allocationState"] };
  });
  if (new Set(lines.map(x => x.id)).size !== lines.length || new Set(lines.map(x => x.purchaseRequestLineId)).size !== lines.length) throw invalid();
  return { id: eventId, number: body.number, title: body.title, method: body.method, currencyCode: body.currencyCode, status: body.status,
    version: body.version, originalDraftFingerprint: body.originalDraftFingerprint, cancellationReason: body.cancellationReason, lines };
}
export function createRfqCommand(title: string, selections: readonly RfqSelection[], key: string): RfqCommand {
  const name = title.trim().replace(/\s+/g, " ");
  if (!id(key) || !name || name.length > 200 || selections.length < 1 || selections.length > 200
    || new Set(selections.map(x => x.source.purchaseRequestLineId)).size !== selections.length) throw invalid();
  const sources = selections.map(({ source, quantity }) => {
    // Revalidate selected response shape rather than trusting type assertions or mutable UI state.
    const current = sourceRow({ ...source, canPublish: false });
    if (!current.canSelect || !current.availableQuantity || !rfqQuantityFits(quantity, current.availableQuantity)) throw invalid();
    return { purchaseRequestId: current.purchaseRequestId, purchaseRequestLineId: current.purchaseRequestLineId,
      expectedRequestVersion: current.expectedRequestVersion!, quantity: rfqQuantity(quantity) };
  });
  if (selections.some(x => x.source.currencyCode !== selections[0].source.currencyCode || x.source.branchRef !== selections[0].source.branchRef)
    || sources.some(x => sources.some(y => x.purchaseRequestId === y.purchaseRequestId && x.expectedRequestVersion !== y.expectedRequestVersion))) throw invalid();
  return { operation: "Create", key, eventId: null, body: JSON.stringify({ title: name, sources }) };
}
export function cancelRfqCommand(record: RfqDetail, reason: string, key: string): RfqCommand {
  const clean = reason.trim().replace(/\s+/g, " ");
  if (!id(key) || !id(record.id) || record.status !== "Draft" || !positive(record.version) || !sha(record.originalDraftFingerprint) || !clean || clean.length > 2000) throw invalid();
  return { operation: "Cancel", key, eventId: record.id, body: JSON.stringify({ expectedEventVersion: record.version, originalDraftFingerprint: record.originalDraftFingerprint, reason: clean }) };
}
function response(body: unknown, command: RfqCommand): RfqReply {
  if (!object(body) || !id(body.eventId) || !text(body.number) || body.commandKey !== command.key || !positive(body.version) || !sha(body.originalDraftFingerprint)
    || body.recordedHistoricalResult !== true || body.canPublish !== false || body.supplierDeliveryState !== "NotStarted" || body.financeReservationChanged !== false
    || body.status !== (command.operation === "Create" ? "Draft" : "Cancelled") || command.eventId !== null && body.eventId !== command.eventId) throw invalid();
  if (command.operation === "Cancel") { const input = JSON.parse(command.body) as Record<string, unknown>;
    if (!positive(input.expectedEventVersion) || body.version <= input.expectedEventVersion || body.originalDraftFingerprint !== input.originalDraftFingerprint) throw invalid(); }
  return { eventId: body.eventId, number: body.number, status: body.status as RfqReply["status"], version: body.version,
    originalDraftFingerprint: body.originalDraftFingerprint, recordedHistoricalResult: true };
}
function validCommand(command: RfqCommand) {
  if (!id(command.key) || !(command.operation === "Create" || command.operation === "Cancel")
    || (command.operation === "Create" ? command.eventId !== null : !id(command.eventId))
    || !text(command.body) || command.body.length > 1048576) throw invalid();
}
export async function sendRfqCommand(company: string, command: RfqCommand): Promise<RfqReply> {
  validCommand(command);
  const body = await request(company, command.operation === "Create" ? "/from-approved-sources" : `/${command.eventId}/source-cancel`,
    { method: "POST", headers: { "Idempotency-Key": command.key }, body: command.body });
  return response(body, command);
}
export async function recoverRfqCommand(company: string, command: RfqCommand): Promise<RfqReply> {
  validCommand(command);
  const body = await request(company, `/command-receipts/${command.operation}/${command.key}`);
  if (!object(body) || body.operation !== command.operation || body.commandKey !== command.key || body.recordedHistoricalResult !== true
    || body.canPublish !== false || body.originalStatusCode !== (command.operation === "Create" ? 201 : 200) || !text(body.responseJson) || body.responseJson.length > 1048576) throw invalid();
  let parsed: unknown; try { parsed = JSON.parse(body.responseJson); } catch { throw invalid(); }
  return response(parsed, command);
}
