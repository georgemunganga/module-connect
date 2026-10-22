import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Purpose-scoped original invoice unit review. This is not invoice approval or AP authority. */
export type UnitReviewAction = "Approve" | "Return" | "Reject";
export type UnitReviewReadiness = { invoiceId: string; invoiceVersion: number; mappingRevision: number; existingReviewId: string | null;
  canRequestReview: boolean; blockers: string[] };
export type UnitReviewTask = { reviewId: string; invoiceId: string; mappingVersionId: string; mappingRevision: number;
  branchId: string | null; openedAt: string };
export type UnitReviewPage = { items: UnitReviewTask[]; total: number; page: number; pageSize: number };
export type UnitReviewDetail = { reviewId: string; invoiceId: string; invoiceVersion: number; mappingVersionId: string; mappingRevision: number;
  coreCaseId: string; caseVersion: number; caseState: "Pending" | "Approved" | "Returned" | "Rejected";
  reviewState: "Pending" | "Verified" | "Returned" | "Rejected"; currentMapping: boolean; originalDigestCurrent: boolean;
  original: null | { invoiceNumber: string; invoiceDate: string; currencyCode: string; netAmount: string; taxAmount: string; grossAmount: string;
    lines: { id: string; lineNumber: number; description: string; quantity: string; unitPrice: string; taxAmount: string }[] };
  blockers: string[]; assignments: { assignmentId: string; assignmentVersion: number }[];
  originalDocumentLines: { invoiceLineId: string; documentVersionId: string; documentSha256: string; documentLineReference: string; unitCode: string }[];
  actionCandidates: UnitReviewAction[] };
export type PinnedReviewDocument = { documentId: string; versionId: string; versionNumber: number; fileName: string; mediaType: string;
  sizeBytes: number; sha256: string; scanState: string; canDownload: boolean };
export type UnitReviewReceipt = { schemaVersion: 1; invoiceId: string; reviewId: string; coreCaseId: string; commandKey: string;
  operation: "Open" | "Decision"; invoiceVersion: number; caseVersion: number; caseState: UnitReviewDetail["caseState"];
  reviewState: UnitReviewDetail["reviewState"]; decisionId: string | null; outcomeId: string | null; completedAt: string };
export class UnitReviewError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const guid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const id = (v: unknown): v is string => typeof v === "string" && guid.test(v) && v !== "00000000-0000-0000-0000-000000000000";
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pos = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const exact = (v: unknown): v is string => typeof v === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(v);
const invalid = () => new UnitReviewError(0, "The original invoice review could not be confirmed. Refresh its saved record.");
async function call(company: string, path: string, init: RequestInit = {}, download = false): Promise<unknown> {
  if (!id(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new UnitReviewError(0, "The response was interrupted. Check the saved review before another action."); }
  if (!response.ok) throw new UnitReviewError(response.status, response.status === 401 ? "Sign in to ERP before reviewing invoice units."
    : response.status === 403 ? "You do not have access to this original invoice review."
      : response.status === 404 ? "This review or its saved command is not available in your current access."
        : response.status === 409 ? "The invoice, assignment or original evidence changed. Refresh before continuing."
          : response.status === 422 ? "Check the review details and reason before saving."
            : "Original invoice review is unavailable. Check its saved history before another action.");
  if (download) return response.blob();
  try { return await response.json(); } catch { throw invalid(); }
}
const flags = (v: Record<string, unknown>) => v.isInvoiceApproval === false && v.canPostToFinance === false;
const textList = (v: unknown): v is string[] => Array.isArray(v) && v.every((item) => typeof item === "string");
export async function getUnitReviewReadiness(company: string, invoice: string, signal?: AbortSignal): Promise<UnitReviewReadiness> {
  if (!id(invoice)) throw invalid();
  const x = await call(company, `/invoices/${invoice}/unit-review-readiness`, { signal });
  if (!obj(x) || x.invoiceId !== invoice || !pos(x.invoiceVersion) || !count(x.mappingRevision)
    || !(x.existingReviewId === null || id(x.existingReviewId)) || typeof x.canRequestReview !== "boolean"
    || !textList(x.blockers) || x.isUnitVerification !== false || !flags(x)) throw invalid();
  return x as unknown as UnitReviewReadiness;
}
export async function listUnitReviewTasks(company: string, page: number, signal?: AbortSignal): Promise<UnitReviewPage> {
  if (!pos(page) || page > 100000) throw invalid();
  const x = await call(company, `/invoice-unit-reviews/tasks?page=${page}&pageSize=20`, { signal });
  if (!obj(x) || x.page !== page || x.pageSize !== 20 || !count(x.total) || !Array.isArray(x.items)
    || x.items.length > 20 || x.availabilityMeaning !== "CurrentMappingAssignmentsOnly" || x.canPostToFinance !== false
    || !x.items.every((r: unknown) => obj(r) && id(r.reviewId) && id(r.invoiceId) && id(r.mappingVersionId)
      && count(r.mappingRevision) && (r.branchId === null || id(r.branchId)) && typeof r.openedAt === "string" && flags(r))) throw invalid();
  return x as unknown as UnitReviewPage;
}
export async function getUnitReviewDetail(company: string, review: string, signal?: AbortSignal): Promise<UnitReviewDetail> {
  if (!id(review)) throw invalid();
  const x = await call(company, `/invoice-unit-reviews/${review}`, { signal });
  if (!obj(x) || x.reviewId !== review || !id(x.invoiceId) || !pos(x.invoiceVersion) || !id(x.mappingVersionId)
    || !count(x.mappingRevision) || !id(x.coreCaseId) || !pos(x.caseVersion)
    || !["Pending", "Approved", "Returned", "Rejected"].includes(String(x.caseState))
    || !["Pending", "Verified", "Returned", "Rejected"].includes(String(x.reviewState))
    || typeof x.currentMapping !== "boolean" || typeof x.originalDigestCurrent !== "boolean" || !textList(x.blockers)
    || !Array.isArray(x.assignments) || !Array.isArray(x.originalDocumentLines) || !Array.isArray(x.actionCandidates)
    || x.attestation !== "OriginalDocumentUnitsConfirmed" || x.actionCandidateMeaning !== "CurrentAssignmentOnlyRevalidatedByCommand" || !flags(x)) throw invalid();
  if (x.original === null) { if (x.originalDigestCurrent || x.actionCandidates.length) throw invalid(); }
  else {
    const o = x.original;
    if (!obj(o) || !x.originalDigestCurrent || typeof o.invoiceNumber !== "string" || typeof o.invoiceDate !== "string"
      || typeof o.currencyCode !== "string" || ![o.netAmount, o.taxAmount, o.grossAmount].every(exact)
      || !Array.isArray(o.lines) || !o.lines.every((l: unknown) => obj(l) && id(l.id) && pos(l.lineNumber)
        && typeof l.description === "string" && [l.quantity, l.unitPrice, l.taxAmount].every(exact))) throw invalid();
  }
  if (!x.assignments.every((a: unknown) => obj(a) && id(a.assignmentId) && pos(a.assignmentVersion))
    || !x.originalDocumentLines.every((l: unknown) => obj(l) && id(l.invoiceLineId) && id(l.documentVersionId)
      && typeof l.documentSha256 === "string" && /^[a-f\d]{64}$/i.test(l.documentSha256)
      && typeof l.documentLineReference === "string" && typeof l.unitCode === "string")
    || !x.actionCandidates.every((a: unknown) => ["Approve", "Return", "Reject"].includes(String(a))) throw invalid();
  if ((!x.currentMapping || !x.originalDigestCurrent) && (x.assignments.length || x.actionCandidates.length)) throw invalid();
  return x as unknown as UnitReviewDetail;
}
export async function getPinnedReviewDocuments(company: string, review: string, invoice: string, signal?: AbortSignal): Promise<PinnedReviewDocument[]> {
  if (!id(review) || !id(invoice)) throw invalid();
  const x = await call(company, `/invoice-unit-reviews/${review}/documents`, { signal });
  if (!obj(x) || x.reviewId !== review || x.invoiceId !== invoice || !Array.isArray(x.items)
    || x.availabilityMeaning !== "PinnedOriginalDocumentVersionsOnly" || x.isUnitVerification !== false || x.canPostToFinance !== false
    || !x.items.every((d: unknown) => obj(d) && id(d.documentId) && id(d.versionId) && pos(d.versionNumber)
      && typeof d.fileName === "string" && typeof d.mediaType === "string" && pos(d.sizeBytes)
      && typeof d.sha256 === "string" && /^[a-f\d]{64}$/i.test(d.sha256)
      && ["Quarantined", "Scanning", "Available", "Rejected", "ScanFailed"].includes(String(d.scanState))
      && typeof d.canDownload === "boolean" && (!d.canDownload || d.scanState === "Available"))) throw invalid();
  return x.items as PinnedReviewDocument[];
}
export async function downloadPinnedReviewDocument(company: string, review: string, version: string): Promise<Blob> {
  if (!id(review) || !id(version)) throw invalid();
  return await call(company, `/invoice-unit-reviews/${review}/documents/${version}/download`, {}, true) as Blob;
}
function receipt(x: unknown, key: string, operation: UnitReviewReceipt["operation"], invoice?: string, review?: string): UnitReviewReceipt {
  if (!obj(x) || x.schemaVersion !== 1 || x.commandKey !== key || x.operation !== operation
    || !id(x.invoiceId) || !id(x.reviewId) || !id(x.coreCaseId) || !pos(x.invoiceVersion) || !pos(x.caseVersion)
    || !["Pending", "Approved", "Returned", "Rejected"].includes(String(x.caseState))
    || !["Pending", "Verified", "Returned", "Rejected"].includes(String(x.reviewState))
    || !(x.decisionId === null || id(x.decisionId)) || !(x.outcomeId === null || id(x.outcomeId))
    || typeof x.completedAt !== "string" || x.recordedHistoricalResult !== true || !flags(x)
    || invoice && x.invoiceId !== invoice || review && x.reviewId !== review) throw invalid();
  const pending = x.caseState === "Pending" && x.reviewState === "Pending" && x.outcomeId === null;
  const approved = x.caseState === "Approved" && x.reviewState === "Verified" && id(x.outcomeId);
  const returned = x.caseState === "Returned" && x.reviewState === "Returned" && id(x.outcomeId);
  const rejected = x.caseState === "Rejected" && x.reviewState === "Rejected" && id(x.outcomeId);
  if (!(pending || approved || returned || rejected)
    || operation === "Open" && (!pending || x.decisionId !== null)
    || operation === "Decision" && !id(x.decisionId)) throw invalid();
  return x as unknown as UnitReviewReceipt;
}
export async function openUnitReview(company: string, invoice: string, version: number, mappingRevision: number, reason: string | null, key: string) {
  if (!id(invoice) || !id(key) || !pos(version) || !count(mappingRevision) || reason !== null && reason.length > 2000) throw invalid();
  return receipt(await call(company, `/invoices/${invoice}/unit-reviews`, { method: "POST", headers: { "Idempotency-Key": key },
    body: JSON.stringify({ invoiceVersion: version, mappingRevision, reason }) }), key, "Open", invoice);
}
export async function decideUnitReview(company: string, detail: UnitReviewDetail, assignmentId: string, assignmentVersion: number,
  action: UnitReviewAction, reason: string | null, attested: boolean, key: string) {
  if (!id(key) || !id(assignmentId) || !pos(assignmentVersion) || !detail.actionCandidates.includes(action)
    || !detail.assignments.some((a) => a.assignmentId === assignmentId && a.assignmentVersion === assignmentVersion)
    || action === "Approve" && !attested || action !== "Approve" && !reason?.trim() || reason !== null && reason.length > 2000) throw invalid();
  return receipt(await call(company, `/invoice-unit-reviews/${detail.reviewId}/assignments/${assignmentId}/decisions`, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ invoiceVersion: detail.invoiceVersion,
      caseVersion: detail.caseVersion, assignmentVersion, action, reason, attestation: action === "Approve" ? "OriginalDocumentUnitsConfirmed" : null })
  }), key, "Decision", detail.invoiceId, detail.reviewId);
}
export async function recoverUnitReview(company: string, review: string, key: string, operation: UnitReviewReceipt["operation"], invoice: string) {
  if (![review, key, invoice].every(id)) throw invalid();
  return receipt(await call(company, `/invoice-unit-reviews/${review}/commands/${key}`), key, operation, invoice, review);
}
