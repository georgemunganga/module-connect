import { receivingCall, ReceivingError, readReceivingReceipt, readReceivingService, type ReceiptDetail, type ServiceDetail,
  type ReceivingCommand, type ReceivingPage, type ReceivingSource, type ReceivingSummary, type ReceivingView, type ReceivingCandidate } from "./procurement-receiving-api";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exact = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9]\d{0,29})(?:\.\d{1,8})?$/.test(value);
const quantity = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value);
const invalid = () => new ReceivingError(0, "ERP returned incomplete receiving evidence. Keep the original command reference and refresh.");
function envelope(value: unknown, expectedId?: string): Record<string, unknown> {
  if (!object(value) || value.executionVersion !== 2 || !uuid.test(String(value.id)) || expectedId && value.id !== expectedId
    || !integer(value.version) || value.version < 1 || typeof value.status !== "string" || !value.status.trim() || !["Goods", "Service"].includes(String(value.kind))
    || !uuid.test(String(value.purchaseOrderId)) || !uuid.test(String(value.issuedVersionId))) throw invalid();
  return value;
}
function page<T>(value: unknown, currentPage: number, row: (item: unknown) => T): ReceivingPage<T> {
  if (!object(value) || !Array.isArray(value.records) || !integer(value.total) || !integer(value.offset) || !integer(value.limit)
    || value.limit < 1 || value.limit > 25 || value.offset !== (currentPage - 1) * value.limit || value.records.length > value.limit) throw invalid();
  return { items: value.records.map(row), total: value.total, page: currentPage, pageSize: value.limit };
}
export async function listPrincipalReceiving(company: string, view: ReceivingView, currentPage: number, signal?: AbortSignal, state = "") {
  const task = view === "inspection" || view === "acceptance" || view === "certification";
  const size = task ? 25 : 10;
  const path = view === "inspection" ? "/receiving/principal-inspection-tasks" : view === "acceptance" ? "/receiving/principal-acceptance-tasks"
    : view === "certification" ? "/receiving/principal-service-tasks" : `/receiving/principal-worklist?kind=${view === "services" ? "Service" : "Goods"}`;
  const body = await receivingCall(company, `${path}${path.includes("?") ? "&" : "?"}offset=${(currentPage - 1) * size}&limit=${size}${state && !task ? `&status=${encodeURIComponent(state)}` : ""}`, { signal });
  return page<ReceivingSummary>(body, currentPage, (value) => {
    if (!object(value) || !uuid.test(String(value.id)) || !uuid.test(String(value.purchaseOrderId)) || !integer(value.version) || typeof value.status !== "string" || value.version < 1
      || task && (!uuid.test(String(value.lineId)) || value.isAuthority !== false)) throw invalid();
    return { id: String(value.id), number: String(value.id), status: value.status, version: value.version, executionVersion: 2,
      orderId: String(value.purchaseOrderId), orderNumber: typeof value.purchaseOrderNumber === "string" ? value.purchaseOrderNumber : String(value.purchaseOrderId),
      ...(task ? { lineId: String(value.lineId) } : {}), ...(typeof value.createdAt === "string" ? { receivedAt: value.createdAt } : {}) };
  });
}
export async function listPrincipalReceivingSources(company: string, currentPage: number, signal?: AbortSignal) {
  return page<ReceivingSource>(await receivingCall(company, `/receiving/principal-sources?offset=${(currentPage - 1) * 25}&limit=25`, { signal }), currentPage, (value) => {
    if (!object(value) || !uuid.test(String(value.purchaseOrderId)) || !uuid.test(String(value.issuedVersionId)) || !uuid.test(String(value.purchaseOrderLineId))
      || !uuid.test(String(value.siteId)) || typeof value.purchaseOrderNumber !== "string" || typeof value.description !== "string" || typeof value.unitCode !== "string"
      || typeof value.currencyCode !== "string" || !/^[A-Z]{3}$/.test(value.currencyCode)
      || !quantity(value.authorizedQuantity) || !quantity(value.netUnitPrice) || !["Goods", "Service"].includes(String(value.kind))
      || !["Recorded", "RequiresReconciliation", "NoSuccessorHistory"].includes(String(value.historyState)) || value.supplierAcknowledgmentIsDelivery !== false || value.actionCandidatesAreAuthority !== false) throw invalid();
    return { orderId: String(value.purchaseOrderId), orderNumber: value.purchaseOrderNumber, issuedVersionId: String(value.issuedVersionId), purchaseOrderLineId: String(value.purchaseOrderLineId),
      description: value.description, unitCode: value.unitCode, branchRef: String(value.siteId), currencyCode: String(value.currencyCode), orderedQuantity: value.authorizedQuantity,
      netUnitPrice: value.netUnitPrice, kind: String(value.kind), acceptanceHistory: String(value.historyState), blocker: value.historyState === "RequiresReconciliation" ? "ReceivingLegacyAcceptanceReconciliationRequired" : null };
  });
}
function taskRows(value: unknown, id: string, kind: string, offset: number): Record<string, unknown>[] {
  if (!object(value) || value.purposeOnly !== true || value.executionVersion !== 2 || !Array.isArray(value.records) || !integer(value.total) || value.total > 100 || value.offset !== offset || value.limit !== 25 || value.records.length > 25) throw invalid();
  return value.records.map((row) => {
    if (!object(row) || row.id !== id || row.taskKind !== kind || row.isAuthority !== false || !integer(row.version) || !integer(row.sourceVersion)
      || row.version < 1 || !uuid.test(String(row.lineId)) || !uuid.test(String(row.purchaseOrderLineId)) || !uuid.test(String(row.purchaseOrderId)) || !uuid.test(String(row.issuedVersionId)) || !uuid.test(String(row.siteId))
      || !object(row.projection) || !Array.isArray(row.actionCandidates) || !row.actionCandidates.every((action) => action === (kind === "Inspection" ? "Inspect" : kind === "Acceptance" ? "Accept" : "Certify"))
      || !Array.isArray(row.blockers) || !row.blockers.every((blocker) => typeof blocker === "string")) throw invalid();
    // Reject broad owner/private data on the explicitly purpose-only surface.
    if (["notes", "documents", "creatorPrincipalId", "commercialSnapshotJson", "unitPrice", "netAmount", "buyerPrincipalId", "workerId"].some((key) => Object.hasOwn(row, key) || Object.hasOwn(row.projection as object, key))) throw invalid();
    return row;
  });
}
async function tasks(company: string, id: string, kind: "Inspection" | "Acceptance" | "Service", signal?: AbortSignal) {
  if (!uuid.test(id)) throw invalid();
  const path = kind === "Service" ? `/service-acceptances/${id}/principal-certification-task` : `/receipts/${id}/principal-${kind === "Inspection" ? "inspection" : "acceptance"}-task`;
  const first = await receivingCall(company, `${path}?offset=0&limit=25`, { signal });
  const result = taskRows(first, id, kind, 0); if (!object(first) || !integer(first.total) || first.total < result.length || first.total > 100) throw invalid();
  for (let offset = 25; offset < first.total; offset += 25) {
    const next = await receivingCall(company, `${path}?offset=${offset}&limit=25`, { signal });
    if (!object(next) || next.total !== first.total || next.offset !== offset) throw invalid();
    result.push(...taskRows(next, id, kind, offset));
  }
  if (result.length !== first.total || !result.length || new Set(result.map((row) => row.lineId)).size !== result.length) throw invalid();
  return result;
}
const candidates = (row: Record<string, unknown>): ReceivingCandidate[] => (row.actionCandidates as string[]).map((action) => ({ action, candidate: true, blocker: null }));
export async function getPrincipalReceipt(company: string, id: string, inspection: boolean, signal?: AbortSignal, acceptance = false): Promise<ReceiptDetail> {
  if (!inspection && !acceptance) {
    const body = envelope(await receivingCall(company, `/receipts/${id}/principal-draft`, { signal }), id);
    if (body.kind !== "Goods") throw invalid();
    const result = readReceivingReceipt(body.receipt, id, false);
    if (result.purchaseOrderId !== body.purchaseOrderId || result.issuedVersionId !== body.issuedVersionId || result.version !== body.version || result.status !== body.status || result.executionVersion !== 2
      || result.lines.some((line) => !uuid.test(line.purchaseOrderLineId) || line.version !== result.version)) throw invalid();
    return result;
  }
  const rows = await tasks(company, id, acceptance ? "Acceptance" : "Inspection", signal), first = rows[0];
  if (rows.some((row) => row.version !== first.version || row.purchaseOrderId !== first.purchaseOrderId || row.issuedVersionId !== first.issuedVersionId)) throw invalid();
  const lines = rows.map((row) => {
    const value = row.projection as Record<string, unknown>;
    if (![value.physicalQuantity, value.initiallyRejectedQuantity, value.rejectedQuantity, value.acceptedQuantity, value.unacceptedPhysicalQuantity].every(quantity) || typeof value.observedAt !== "string"
      || value.qualifiedQuantity !== null && !exact(value.qualifiedQuantity) || value.inspectionRejectedQuantity !== null && !exact(value.inspectionRejectedQuantity)) throw invalid();
    return { id: row.lineId, version: row.version, purchaseOrderLineId: row.purchaseOrderLineId, sourceVersion: row.sourceVersion, receivedQuantity: value.physicalQuantity,
      initiallyRejectedQuantity: value.initiallyRejectedQuantity, rejectedQuantity: value.rejectedQuantity, acceptedQuantity: value.acceptedQuantity,
      unacceptedHeldQuantity: value.unacceptedPhysicalQuantity, status: row.status, inspection: value.qualifiedQuantity === null ? null : {
        qualifiedQuantity: value.qualifiedQuantity, inspectionRejectedQuantity: value.inspectionRejectedQuantity, checklistReference: value.checklistReference } };
  });
  const purpose = acceptance ? "AssignedAcceptance" : "AssignedInspection";
  return readReceivingReceipt({ id, number: id, version: first.version, status: first.status, executionVersion: 2, purchaseOrderId: first.purchaseOrderId,
    issuedVersionId: first.issuedVersionId, siteRef: first.siteId, receivedAt: (first.projection as Record<string, unknown>).observedAt, recordedAt: null, physicalEvidenceRecorded: true,
    matchingAuthorityAvailable: false, lines, draftActionCandidates: [], readPurpose: purpose,
    lineReadiness: rows.map((row) => ({ lineId: row.lineId, sourceVersion: row.sourceVersion, labels: null,
      capacity: { verified: false, orderRemainingQuantity: null, physicalRemainingQuantity: null, acceptableQuantity: null, blocker: (row.blockers as string[])[0] ?? null }, actionCandidates: candidates(row) })) }, id, true, purpose);
}
export async function getPrincipalService(company: string, id: string, certification: boolean, signal?: AbortSignal): Promise<ServiceDetail> {
  if (!certification) {
    const body = envelope(await receivingCall(company, `/service-acceptances/${id}/principal-draft`, { signal }), id);
    if (body.kind !== "Service") throw invalid();
    const result = readReceivingService(body.service, id, false);
    if (result.sourcePurchaseOrderId !== body.purchaseOrderId || result.issuedBindingId !== body.issuedVersionId || result.version !== body.version || result.status !== body.status || result.executionVersion !== 2) throw invalid();
    return result;
  }
  const rows = await tasks(company, id, "Service", signal); if (rows.length !== 1) throw invalid();
  const row = rows[0], value = row.projection as Record<string, unknown>;
  if (!quantity(value.quantity) || typeof value.deliverableReference !== "string" || typeof value.periodFrom !== "string" || typeof value.periodTo !== "string") throw invalid();
  return readReceivingService({ id, version: row.version, status: row.status, executionVersion: 2, purchaseOrderLineId: row.purchaseOrderLineId, sourcePurchaseOrderId: row.purchaseOrderId,
    issuedBindingId: row.issuedVersionId, sourceVersion: row.sourceVersion, periodFrom: value.periodFrom, periodTo: value.periodTo, deliverableRef: value.deliverableReference,
    intendedQuantity: value.quantity, acceptedQuantity: null, acceptedNetAmount: null, currentAcceptedQuantity: null, currentAcceptedNetAmount: null,
    isCertifiedRecord: false, matchingAuthorityAvailable: false, capacity: { verified: false, orderRemainingQuantity: null, physicalRemainingQuantity: null, acceptableQuantity: null, blocker: null },
    actionCandidates: candidates(row), readPurpose: "AssignedServiceCertification" }, id, true);
}
function operation(command: ReceivingCommand) {
  return command.operation === "ReceivingDraft" || command.operation === "ServiceDraft" ? command.targetId === null ? "Create" : "Revise"
    : command.operation === "ReceivingRecord" ? "Record" : command.operation === "ReceivingInspect" ? "Inspect" : command.operation === "ReceivingAccept" ? "Accept"
      : command.operation === "ServiceCertify" ? "Certify" : "Cancel";
}
export function principalReceivingCommandPath(command: ReceivingCommand) {
  if (command.protocol !== "Principal2" || !uuid.test(command.key) || !uuid.test(command.orderId) || command.targetId !== null && !uuid.test(command.targetId)) throw invalid();
  const base = command.operation.startsWith("Service") ? "/service-acceptances" : "/receipts", op = operation(command);
  if (op === "Create") { if (command.method !== "POST") throw invalid(); return `${base}/principal-drafts`; }
  if (!command.targetId || command.method !== (op === "Revise" ? "PUT" : "POST")) throw invalid();
  if (op === "Inspect" || op === "Accept") { if (!uuid.test(command.lineId ?? "")) throw invalid(); return `${base}/${command.targetId}/lines/${command.lineId}/principal-${op.toLowerCase()}`; }
  return `${base}/${command.targetId}/principal-${op === "Revise" ? "draft" : op.toLowerCase()}`;
}
function expectedStatus(command: ReceivingCommand) {
  const op = operation(command); return op === "Create" || op === "Revise" ? "Draft" : op === "Cancel" ? "Cancelled" : op === "Certify" ? "Certified" : "Recorded";
}
export async function sendPrincipalReceiving(company: string, command: ReceivingCommand) {
  const result = envelope(await receivingCall(company, principalReceivingCommandPath(command), { method: command.method, body: command.body, headers: { "Idempotency-Key": command.key } }), command.targetId ?? undefined);
  if (result.purchaseOrderId !== command.orderId || result.kind !== (command.operation.startsWith("Service") ? "Service" : "Goods") || result.status !== expectedStatus(command)) throw invalid();
  return { id: String(result.id), version: result.version as number, status: String(result.status) };
}
export async function recoverPrincipalReceiving(company: string, command: ReceivingCommand) {
  principalReceivingCommandPath(command);
  const result = envelope(await receivingCall(company, `/receiving/principal-command-receipts/${operation(command)}/${command.key}`), command.targetId ?? undefined);
  if (result.purchaseOrderId !== command.orderId || result.kind !== (command.operation.startsWith("Service") ? "Service" : "Goods") || result.status !== expectedStatus(command)) throw invalid();
  return { id: String(result.id), status: String(result.status) };
}
