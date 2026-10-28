import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Manual entry evidence is source schema 4; document review remains on its own API. */
export type ManualAction = "Approve" | "Return" | "Reject";
export type ManualLine = { invoiceLineId: string; unitCode: string };
export type ManualReadiness = { invoiceId: string; invoiceVersion: number; mappingRevision: number;
  existingReviewId: string | null; evidenceMode: "ManualAttestation"; sourceSchemaVersion: 4;
  requiresMakerReason: true; manualUnitLines: ManualLine[] | null; canRequestReview: boolean; blockers: string[] };
export type ManualTaskPage = { items: { reviewId: string; invoiceId: string; mappingVersionId: string; mappingRevision: number;
  branchId: string | null; openedAt: string }[]; total: number; page: number; pageSize: number };
export type ManualDetail = { reviewId: string; invoiceId: string; invoiceVersion: number; makerPrincipalId: string;
  identitySchemaVersion: 3; evidenceSchemaVersion: 4 | null; mappingVersionId: string; mappingRevision: number;
  coreCaseId: string; caseVersion: number; caseState: "Pending" | "Approved" | "Returned" | "Rejected";
  reviewState: "Pending" | "Verified" | "Returned" | "Rejected"; currentMapping: boolean; originalDigestCurrent: boolean;
  original: null | { invoiceNumber: string; invoiceDate: string; currencyCode: string; netAmount: string; taxAmount: string;
    grossAmount: string; lines: { id: string; lineNumber: number; description: string; quantity: string; unitPrice: string; taxAmount: string }[] };
  blockers: string[]; assignments: { assignmentId: string; assignmentVersion: number }[];
  evidenceMode: "ManualAttestation"; sourceSchemaVersion: 4; manualUnitLines: ManualLine[]; makerReason: string;
  attestation: "ManuallyEnteredUnitsConfirmed"; actionCandidates: ManualAction[] };
export type ManualReceipt = { schemaVersion: 1; invoiceId: string; reviewId: string; coreCaseId: string; commandKey: string;
  operation: "Open" | "Decision"; invoiceVersion: number; caseVersion: number;
  caseState: ManualDetail["caseState"]; reviewState: ManualDetail["reviewState"];
  decisionId: string | null; outcomeId: string | null; completedAt: string; recordedHistoricalResult: true;
  makerPrincipalId: string; identitySchemaVersion: 3; evidenceSchemaVersion?: 4 | null };
export class ManualReviewError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const guid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/;
const id = (x: unknown): x is string => typeof x === "string" && guid.test(x) && x !== "00000000-0000-0000-0000-000000000000";
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const positive = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0;
const nonnegative = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(y => typeof y === "string");
const money = (x: unknown): x is string => typeof x === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(x);
const lines = (x: unknown): x is ManualLine[] => Array.isArray(x) && x.length <= 200 && x.every(y => object(y) && id(y.invoiceLineId) && typeof y.unitCode === "string" && y.unitCode.length > 0);
const invalid = () => new ManualReviewError(0, "InvalidManualReviewResponse", "The saved manual unit review could not be confirmed. Refresh its record.");
async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new ManualReviewError(0, "TransportInterrupted", "The response was interrupted. Check the saved result before another action."); }
  if (!response.ok) {
    let code = "ManualUnitReviewUnavailable";
    try { const body: unknown = await response.json(); if (object(body) && typeof body.code === "string") code = body.code; } catch { /* retain status */ }
    throw new ManualReviewError(response.status, code, response.status === 401 ? "Sign in to ERP to check invoice units."
      : response.status === 403 ? "This manual unit review is outside your current access."
        : response.status === 404 ? "This manual review or saved command is not available in your current access."
          : response.status === 409 ? "The invoice, assignment, or evidence changed. Refresh before continuing."
            : response.status === 422 ? "Check the selected branch and review details before saving."
              : "Manual unit review is unavailable. Check its saved history before another action.");
  }
  try { return await response.json(); } catch { throw invalid(); }
}
function common(x: Record<string, unknown>) { return x.isInvoiceApproval === false && x.canPostToFinance === false; }
function receipt(x: unknown, key: string, operation: ManualReceipt["operation"], invoice: string, review?: string): ManualReceipt {
  if (!object(x) || x.schemaVersion !== 1 || x.operation !== operation || x.commandKey !== key || x.invoiceId !== invoice
    || !id(x.reviewId) || review !== undefined && x.reviewId !== review || !id(x.coreCaseId)
    || !positive(x.invoiceVersion) || !positive(x.caseVersion) || !id(x.makerPrincipalId) || x.identitySchemaVersion !== 3
    || !(x.evidenceSchemaVersion === null || x.evidenceSchemaVersion === undefined || x.evidenceSchemaVersion === 4)
    || !["Pending", "Approved", "Returned", "Rejected"].includes(String(x.caseState))
    || !["Pending", "Verified", "Returned", "Rejected"].includes(String(x.reviewState))
    || !(x.decisionId === null || id(x.decisionId)) || !(x.outcomeId === null || id(x.outcomeId))
    || typeof x.completedAt !== "string" || x.recordedHistoricalResult !== true || !common(x)) throw invalid();
  if (operation === "Open" && (x.caseState !== "Pending" || x.reviewState !== "Pending" || x.caseVersion !== 1
    || x.decisionId !== null || x.outcomeId !== null || x.evidenceSchemaVersion === 4)) throw invalid();
  if (operation === "Decision" && !id(x.decisionId)) throw invalid();
  if (!(x.caseState === "Pending" && x.reviewState === "Pending" && x.outcomeId === null
      && (x.evidenceSchemaVersion === null || x.evidenceSchemaVersion === undefined)
    || x.caseState === "Approved" && x.reviewState === "Verified" && id(x.outcomeId) && x.evidenceSchemaVersion === 4
    || x.caseState === "Returned" && x.reviewState === "Returned" && id(x.outcomeId) && x.evidenceSchemaVersion === 4
    || x.caseState === "Rejected" && x.reviewState === "Rejected" && id(x.outcomeId) && x.evidenceSchemaVersion === 4)) throw invalid();
  return x as unknown as ManualReceipt;
}
export async function manualReadiness(company: string, invoice: string, signal?: AbortSignal): Promise<ManualReadiness> {
  if (!id(invoice)) throw invalid();
  const x = await call(company, `/invoices/${invoice}/manual-unit-review-readiness`, { signal });
  if (!object(x) || x.invoiceId !== invoice || !positive(x.invoiceVersion) || !nonnegative(x.mappingRevision)
    || !(x.existingReviewId === null || id(x.existingReviewId)) || x.evidenceMode !== "ManualAttestation" || x.sourceSchemaVersion !== 4
    || x.requiresMakerReason !== true || !(x.manualUnitLines === null || lines(x.manualUnitLines))
    || typeof x.canRequestReview !== "boolean" || !strings(x.blockers) || x.isUnitVerification !== false || !common(x)) throw invalid();
  return x as unknown as ManualReadiness;
}
export async function manualTasks(company: string, page: number, signal?: AbortSignal): Promise<ManualTaskPage> {
  if (!positive(page) || page > 100000) throw invalid();
  const x = await call(company, `/manual-invoice-unit-reviews/tasks?page=${page}&pageSize=20`, { signal });
  if (!object(x) || !Array.isArray(x.items) || x.items.length > 20 || !nonnegative(x.total) || x.page !== page || x.pageSize !== 20
    || x.availabilityMeaning !== "CurrentMappingAssignmentsOnly" || x.canPostToFinance !== false
    || !x.items.every(y => object(y) && id(y.reviewId) && id(y.invoiceId) && id(y.mappingVersionId)
      && nonnegative(y.mappingRevision) && (y.branchId === null || id(y.branchId)) && typeof y.openedAt === "string" && common(y))) throw invalid();
  return x as unknown as ManualTaskPage;
}
export async function manualDetail(company: string, review: string, signal?: AbortSignal): Promise<ManualDetail> {
  if (!id(review)) throw invalid();
  const x = await call(company, `/manual-invoice-unit-reviews/${review}`, { signal });
  if (!object(x) || x.reviewId !== review || !id(x.invoiceId) || !positive(x.invoiceVersion) || !id(x.makerPrincipalId)
    || x.identitySchemaVersion !== 3 || !(x.evidenceSchemaVersion === null || x.evidenceSchemaVersion === 4)
    || !id(x.mappingVersionId) || !nonnegative(x.mappingRevision) || !id(x.coreCaseId) || !positive(x.caseVersion)
    || !["Pending", "Approved", "Returned", "Rejected"].includes(String(x.caseState))
    || !["Pending", "Verified", "Returned", "Rejected"].includes(String(x.reviewState))
    || typeof x.currentMapping !== "boolean" || typeof x.originalDigestCurrent !== "boolean"
    || !strings(x.blockers) || !Array.isArray(x.assignments)
    || !x.assignments.every(y => object(y) && id(y.assignmentId) && positive(y.assignmentVersion))
    || x.evidenceMode !== "ManualAttestation" || x.sourceSchemaVersion !== 4 || !lines(x.manualUnitLines) || x.manualUnitLines.length === 0
    || typeof x.makerReason !== "string" || !x.makerReason.trim() || x.attestation !== "ManuallyEnteredUnitsConfirmed"
    || !Array.isArray(x.actionCandidates) || !x.actionCandidates.every(y => ["Approve", "Return", "Reject"].includes(String(y)))
    || x.actionCandidateMeaning !== "CurrentAssignmentOnlyRevalidatedByCommand" || !common(x)) throw invalid();
  if (x.original === null) { if (x.originalDigestCurrent || x.actionCandidates.length) throw invalid(); }
  else {
    const o = x.original;
    if (!object(o) || !x.originalDigestCurrent || typeof o.invoiceNumber !== "string" || typeof o.invoiceDate !== "string"
      || typeof o.currencyCode !== "string" || ![o.netAmount, o.taxAmount, o.grossAmount].every(money)
      || !Array.isArray(o.lines) || !o.lines.every(y => object(y) && id(y.id) && positive(y.lineNumber)
        && typeof y.description === "string" && [y.quantity, y.unitPrice, y.taxAmount].every(money))) throw invalid();
  }
  if ((!x.currentMapping || !x.originalDigestCurrent) && (x.assignments.length || x.actionCandidates.length)) throw invalid();
  if (x.reviewState === "Pending" ? x.evidenceSchemaVersion !== null : x.evidenceSchemaVersion !== 4) throw invalid();
  if (x.original !== null) {
    const original = x.original as { lines: { id: string }[] };
    const ids = new Set(original.lines.map(line => line.id));
    if (!x.manualUnitLines.length || x.manualUnitLines.some(line => !ids.has(line.invoiceLineId))) throw invalid();
  }
  return x as unknown as ManualDetail;
}
export async function manualOpen(company: string, readiness: ManualReadiness, reason: string, key: string, maker: string): Promise<ManualReceipt> {
  if (!id(key) || !id(maker) || !id(readiness.invoiceId) || !readiness.canRequestReview || !reason.trim() || reason.trim() !== reason || reason.length > 2000) throw invalid();
  const x = receipt(await call(company, `/invoices/${readiness.invoiceId}/manual-unit-reviews`, { method: "POST",
    headers: { "Idempotency-Key": key }, body: JSON.stringify({ invoiceVersion: readiness.invoiceVersion,
      mappingRevision: readiness.mappingRevision, reason }) }), key, "Open", readiness.invoiceId);
  if (x.makerPrincipalId !== maker || x.invoiceVersion !== readiness.invoiceVersion) throw invalid();
  return x;
}
export async function manualDecide(company: string, detail: ManualDetail, assignmentId: string, assignmentVersion: number,
  action: ManualAction, reason: string, attested: boolean, key: string): Promise<ManualReceipt> {
  if (!id(key) || !id(assignmentId) || !positive(assignmentVersion) || !detail.assignments.some(x => x.assignmentId === assignmentId && x.assignmentVersion === assignmentVersion)
    || !detail.actionCandidates.includes(action) || !reason.trim() || reason.trim() !== reason || reason.length > 2000
    || action === "Approve" && !attested) throw invalid();
  const x = receipt(await call(company, `/manual-invoice-unit-reviews/${detail.reviewId}/assignments/${assignmentId}/decisions`, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ invoiceVersion: detail.invoiceVersion,
      caseVersion: detail.caseVersion, assignmentVersion, action, reason,
      attestation: action === "Approve" ? "ManuallyEnteredUnitsConfirmed" : null })
  }), key, "Decision", detail.invoiceId, detail.reviewId);
  if (x.makerPrincipalId !== detail.makerPrincipalId || x.coreCaseId !== detail.coreCaseId
    || x.invoiceVersion !== detail.invoiceVersion || x.caseVersion !== detail.caseVersion + 1) throw invalid();
  return x;
}
export async function manualRecover(company: string, review: string, key: string, operation: ManualReceipt["operation"], invoice: string,
  expectedMaker?: string): Promise<ManualReceipt> {
  if (![review, key, invoice].every(id)) throw invalid();
  const x = receipt(await call(company, `/manual-invoice-unit-reviews/${review}/commands/${key}?operation=${operation}`), key, operation, invoice, review);
  if (expectedMaker && x.makerPrincipalId !== expectedMaker) throw invalid();
  return x;
}
/** Lost Open ACK: resolve the actor's original receipt by invoice and key, independent of current mapping. */
export async function manualRecoverOpenByInvoice(company: string, invoice: string, key: string, expectedMaker: string): Promise<ManualReceipt> {
  if (![invoice, key, expectedMaker].every(id)) throw invalid();
  const x = receipt(await call(company, `/invoices/${invoice}/manual-unit-reviews/commands/${key}`), key, "Open", invoice);
  if (x.makerPrincipalId !== expectedMaker) throw invalid();
  return x;
}
