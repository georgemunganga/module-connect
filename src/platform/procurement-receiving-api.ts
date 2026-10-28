import { procurementScopeHeaders } from "../../shared/shell-scope";

export type ReceivingView = "receipts" | "services" | "inspection" | "acceptance" | "certification";
export type ReceivingCandidate = { action: string; candidate: boolean; blocker: string | null };
export type ReceivingCapacity = { verified: boolean; orderRemainingQuantity: string | null; physicalRemainingQuantity: string | null; acceptableQuantity: string | null; blocker: string | null };
export type ReceivingLabels = { orderNumber: string; supplierDisplayName: string; description: string; unitCode: string; currencyCode: string; branchRef: string; issuedVersionId: string };
export type ReceivingEffect = { id: string; kind: string; quantity: string; netAmount: string | null; ledgerSequence: number; evidenceReference: string; occurredAt: string };
export type ReceivingSource = { orderId: string; orderNumber: string; issuedVersionId: string; purchaseOrderLineId: string; description?: string; unitCode?: string; currencyCode?: string; branchRef?: string; orderedQuantity?: string; netUnitPrice?: string; kind?: string | null; blocker?: string | null; acceptanceHistory: string };
export type ReceivingSummary = { id?: string; receiptId?: string; number?: string; status: string; version: number; executionVersion?: number; orderId: string; orderNumber: string; siteRef?: string; lineId?: string; deliverableRef?: string; receivedAt?: string; periodFrom?: string; periodTo?: string };
export type ReceivingPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ReceiptLine = { id: string; version: number; purchaseOrderLineId: string; sourceVersion: number; receivedQuantity: string; initiallyRejectedQuantity: string; rejectedQuantity: string; acceptedQuantity: string; unacceptedHeldQuantity: string | null; status: string; inspection: null | { qualifiedQuantity: string; inspectionRejectedQuantity: string; checklistReference: string } };
export type ReceiptReadiness = { lineId: string; sourceVersion: number; labels: ReceivingLabels | null; capacity: ReceivingCapacity; actionCandidates: ReceivingCandidate[]; effects?: ReceivingEffect[]; blocker?: string };
export type ReceivingDocuments = { references: { id: string; fileName: string; documentVersion: number; classification: string | null }[]; contentAccessAvailable: false; uploadAvailable: false };
export type ReceiptDetail = { id: string; number: string; version: number; status: string; executionVersion: number; purchaseOrderId: string; issuedVersionId: string | null; siteRef: string | null; receivedAt: string; recordedAt: string | null; deliveryNoteRef?: string | null; notes?: string | null; physicalEvidenceRecorded: boolean; matchingAuthorityAvailable: false; lines: ReceiptLine[]; lineReadiness: ReceiptReadiness[]; draftActionCandidates: ReceivingCandidate[]; readPurpose: string; documents?: ReceivingDocuments };
export type ServiceDetail = { id: string; version: number; status: string; executionVersion: number; purchaseOrderLineId: string; sourcePurchaseOrderId: string | null; issuedBindingId: string; sourceVersion: number; periodFrom: string; periodTo: string; deliverableRef: string; notes?: string | null; cancellationReason?: string | null; intendedQuantity: string | null; acceptedQuantity: string | null; acceptedNetAmount: string | null; currentAcceptedQuantity: string | null; currentAcceptedNetAmount: string | null; isCertifiedRecord: boolean; matchingAuthorityAvailable: false; labels?: ReceivingLabels; capacity: ReceivingCapacity; actionCandidates: ReceivingCandidate[]; draftActionCandidates?: ReceivingCandidate[]; effects?: ReceivingEffect[]; readPurpose: string; blocker?: string; documents?: ReceivingDocuments };
export type ReceiptDraft = { purchaseOrderId: string; issuedVersionId: string; siteId: string; receivedAt: string; deliveryNoteRef: string | null; notes: string | null; lines: { id?: string; purchaseOrderLineId: string; receivedQuantity: string; rejectedQuantity: string }[] };
export type ServiceDraft = { purchaseOrderId: string; issuedVersionId: string; purchaseOrderLineId: string; deliverableReference: string; periodFrom: string; periodTo: string; quantity: string; notes: string | null };
export type ReceivingOperation = "ReceivingDraft" | "ServiceDraft" | "ReceivingRecord" | "ReceivingInspect" | "ReceivingAccept" | "ServiceCertify" | "ReceivingCancel" | "ServiceCancel";
/** Preserve this command unchanged until its outcome is known; never automatically repost. */
export type ReceivingCommand = { operation: ReceivingOperation; orderId: string; targetId: string | null; lineId?: string; key: string; method: "POST" | "PUT"; body: string; protocol?: "Principal2" };
export class ReceivingError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exact = (value: unknown): value is string => typeof value === "string" && /^-?(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(value);
const invalid = () => new ReceivingError(0, "ERP returned incomplete receiving evidence. Refresh before taking an action.");
export function receivingQuantity(value: string): string {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value)) throw new ReceivingError(422, "Use an exact quantity with up to four decimal places.");
  return value;
}
export async function receivingCall(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!uuid.test(company)) throw invalid();
  const headers = new Headers(init.headers); Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new ReceivingError(0, "The response was interrupted. Check the saved result before making another change."); }
  let body: unknown; try { body = await response.json(); } catch { if (response.ok) throw invalid(); }
  if (!response.ok) throw new ReceivingError(response.status, response.status === 403 ? "You do not have access to this delivery action."
    : response.status === 404 ? "This delivery or saved result is unavailable in your current scope."
    : response.status === 409 ? "The delivery or its controls changed. Refresh and review before continuing."
    : object(body) && typeof body.message === "string" ? body.message : "Receiving is unavailable. Try again later.");
  return body;
}
const call = receivingCall;
function page<T>(body: unknown, row: (value: unknown) => boolean): ReceivingPage<T> {
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(row) || !integer(body.total) || !integer(body.page) || !integer(body.pageSize)) throw invalid();
  return body as unknown as ReceivingPage<T>;
}
export async function listReceiving(company: string, view: ReceivingView, currentPage: number, signal?: AbortSignal, state = "") {
  const path = view === "inspection" ? "/receiving/inspection-tasks" : view === "certification" ? "/receiving/service-tasks" : `/receiving/worklist?view=${view}`;
  return page<ReceivingSummary>(await call(company, `${path}${path.includes("?") ? "&" : "?"}page=${currentPage}&pageSize=25${state && (view === "receipts" || view === "services") ? `&state=${encodeURIComponent(state)}` : ""}`, { signal }),
    (row) => object(row) && uuid.test(String(row.id ?? row.receiptId)) && typeof row.status === "string" && integer(row.version) && uuid.test(String(row.orderId)) && typeof row.orderNumber === "string");
}
export async function listReceivingSources(company: string, currentPage: number, signal?: AbortSignal) {
  return page<ReceivingSource>(await call(company, `/receiving/sources?page=${currentPage}&pageSize=25`, { signal }), (row) => object(row)
    && uuid.test(String(row.orderId)) && uuid.test(String(row.issuedVersionId)) && uuid.test(String(row.purchaseOrderLineId))
    && typeof row.orderNumber === "string" && typeof row.acceptanceHistory === "string"
    && (row.blocker != null || typeof row.description === "string" && typeof row.unitCode === "string" && exact(row.orderedQuantity) && exact(row.netUnitPrice)));
}
function candidates(value: unknown): boolean { return Array.isArray(value) && value.every((row) => object(row) && typeof row.action === "string" && typeof row.candidate === "boolean" && (row.blocker == null || typeof row.blocker === "string")); }
function effects(value: unknown): boolean { return value === undefined || Array.isArray(value) && value.every((row) => object(row) && uuid.test(String(row.id)) && exact(row.quantity) && (row.netAmount === null || exact(row.netAmount)) && integer(row.ledgerSequence) && typeof row.kind === "string" && typeof row.evidenceReference === "string" && typeof row.occurredAt === "string"); }
function documents(value: unknown): boolean { return value === undefined || object(value) && value.contentAccessAvailable === false && value.uploadAvailable === false && Array.isArray(value.references) && value.references.every((row) => object(row) && uuid.test(String(row.id)) && typeof row.fileName === "string" && integer(row.documentVersion) && (row.classification == null || typeof row.classification === "string")); }
function capacity(value: unknown): boolean { return object(value) && typeof value.verified === "boolean" && [value.orderRemainingQuantity, value.physicalRemainingQuantity, value.acceptableQuantity].every((amount) => amount == null || exact(amount)); }
export async function getReceipt(company: string, id: string, inspection: boolean, signal?: AbortSignal): Promise<ReceiptDetail> {
  if (!uuid.test(id)) throw invalid(); const body = await call(company, `/receipts/${id}${inspection ? "/inspection-task" : ""}`, { signal });
  return readReceivingReceipt(body, id, inspection);
}
export function readReceivingReceipt(body: unknown, id: string, inspection: boolean, expectedPurpose = inspection ? "AssignedInspection" : "Receipt"): ReceiptDetail {
  if (!object(body) || body.id !== id || !integer(body.version) || !integer(body.executionVersion) || typeof body.status !== "string"
    || body.matchingAuthorityAvailable !== false || !Array.isArray(body.lines) || !body.lines.every((line) => object(line) && uuid.test(String(line.id)) && integer(line.version) && integer(line.sourceVersion)
      && [line.receivedQuantity, line.initiallyRejectedQuantity, line.rejectedQuantity, line.acceptedQuantity].every(exact) && (line.unacceptedHeldQuantity == null || exact(line.unacceptedHeldQuantity)))
    || body.readPurpose !== expectedPurpose
    || (inspection && (Object.hasOwn(body, "notes") || Object.hasOwn(body, "deliveryNoteRef") || Object.hasOwn(body, "documents")))
    || !documents(body.documents) || !candidates(body.draftActionCandidates) || !Array.isArray(body.lineReadiness) || !body.lineReadiness.every((line) => object(line) && uuid.test(String(line.lineId)) && capacity(line.capacity) && candidates(line.actionCandidates) && effects(line.effects))) throw invalid();
  return body as unknown as ReceiptDetail;
}
export async function getService(company: string, id: string, certification: boolean, signal?: AbortSignal): Promise<ServiceDetail> {
  if (!uuid.test(id)) throw invalid(); const body = await call(company, `/service-acceptances/${id}${certification ? "/certification-task" : ""}`, { signal });
  return readReceivingService(body, id, certification);
}
export function readReceivingService(body: unknown, id: string, certification: boolean): ServiceDetail {
  if (!object(body) || body.id !== id || !integer(body.version) || !integer(body.sourceVersion) || !integer(body.executionVersion) || typeof body.status !== "string" || body.matchingAuthorityAvailable !== false
    || ![body.acceptedQuantity, body.acceptedNetAmount, body.currentAcceptedQuantity, body.currentAcceptedNetAmount].every((value) => exact(value) || certification && value === null) || (body.intendedQuantity != null && !exact(body.intendedQuantity))
    || body.readPurpose !== (certification ? "AssignedServiceCertification" : "Receipt")
    || (certification && (Object.hasOwn(body, "notes") || Object.hasOwn(body, "cancellationReason") || Object.hasOwn(body, "documents")))
    || (!certification && [body.notes, body.cancellationReason].some((value) => value !== undefined && value !== null && typeof value !== "string"))
    || !documents(body.documents) || !effects(body.effects) || !capacity(body.capacity) || !candidates(body.actionCandidates) || (body.draftActionCandidates != null && !candidates(body.draftActionCandidates))) throw invalid();
  return body as unknown as ServiceDetail;
}
export function receivingCommandPath(command: ReceivingCommand): string {
  if (command.protocol === "Principal2") throw invalid();
  if (!uuid.test(command.key) || !uuid.test(command.orderId) || command.targetId !== null && !uuid.test(command.targetId)) throw invalid();
  const service = command.operation.startsWith("Service"), base = service ? "/service-acceptances" : "/receipts";
  if (command.operation === "ReceivingDraft" || command.operation === "ServiceDraft") return command.targetId ? `${base}/${command.targetId}/draft` : `${base}/drafts`;
  if (!command.targetId) throw invalid();
  if (command.operation === "ReceivingInspect" || command.operation === "ReceivingAccept") {
    if (!uuid.test(command.lineId ?? "")) throw invalid();
    return `${base}/${command.targetId}/lines/${command.lineId}/${command.operation === "ReceivingInspect" ? "inspect" : "accept"}`;
  }
  return `${base}/${command.targetId}/${command.operation === "ReceivingRecord" ? "record" : command.operation === "ServiceCertify" ? "certify" : "cancel-draft"}`;
}
export async function sendReceiving(company: string, command: ReceivingCommand): Promise<{ id: string; version: number; status: string }> {
  const result = await call(company, receivingCommandPath(command), { method: command.method, body: command.body, headers: { "Idempotency-Key": command.key } });
  if (!object(result) || !uuid.test(String(result.id)) || command.targetId !== null && result.id !== command.targetId || !integer(result.version) || typeof result.status !== "string") throw invalid();
  return result as { id: string; version: number; status: string };
}
export async function recoverReceiving(company: string, command: ReceivingCommand) {
  const body = await call(company, `/orders/command-receipts/${command.operation}/${command.key}?orderId=${command.orderId}`);
  if (!object(body) || body.state !== "RecordedHistoricalOutcome" || body.purchaseOrderId !== command.orderId || body.commandKey !== command.key || body.operation !== command.operation || body.replayAuthorized !== false
    || !object(body.recordedResult) || !uuid.test(String(body.recordedResult.id)) || command.targetId !== null && body.recordedResult.id !== command.targetId || !integer(body.currentTargetVersion) || typeof body.currentTargetStatus !== "string") throw invalid();
  return { id: String(body.recordedResult.id), status: body.currentTargetStatus };
}
