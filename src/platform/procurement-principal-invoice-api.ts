import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Held P31 protocol. These records describe Procurement evidence, never AP or payment. */
export type PrincipalInvoiceState = { invoiceId: string; invoiceVersion: number; sourceSchemaVersion: 2;
  state: "Unmapped" | "LegacyWorkflow" | "Mapped" | "Reviewed" | "ComparisonBlocked" | "Compared"; stateVersion: number;
  mappingRevision: number; mappingVersionId: string | null; reviewId: string | null;
  reviewOutcomeId: string | null; reviewState: string; comparisonId: string | null;
  exposureVersion: number | null; isAuthority: false; canPostToFinance: false };
export type PrincipalInvoiceSource = { orderId: string; orderNumber: string; issuedVersionId: string;
  purchaseOrderLineId: string; description: string; unitCode: string; quantity: string;
  unitPrice: string; taxAmount: string; categoryCode: string; sourceSchemaVersion: 2;
  sourceState: "VerifiedIssuedAndAcceptanceHistory"; matchingAuthorityAvailable: false;
  canAllocate: false; canPostToFinance: false };
export type PrincipalInvoiceSourcePage = { invoiceId: string; invoiceVersion: number; items: PrincipalInvoiceSource[];
  total: number; page: number; pageSize: number; sourceSchemaVersion: 2; isAuthority: false;
  matchingAuthorityAvailable: false; canPostToFinance: false };
export type PrincipalAcceptance = { principalAcceptanceFactId: string; principalReceivingSourceStateId: string;
  sourceSequence: number; kind: "Goods" | "Service"; acceptedAt: string; acceptedQuantity: string;
  acceptedNetAmount: string; acceptanceReference: string };
export type PrincipalInvoiceMappingLine = { invoiceLineId: string; purchaseOrderLineId: string;
  principalReceivingSourceStateId: string | null; principalAcceptanceFactId: string | null;
  acceptanceSequence: number | null; invoiceUnitCode: string; documentVersionId: string;
  documentLineReference: string };
export type PrincipalInvoiceCommand = "Map" | "OpenReview" | "Compare" | "DecideReview" | "IssueAction";
export type PrincipalInvoiceLocator = { operation: PrincipalInvoiceCommand; invoiceId: string; key: string;
  invoiceVersion: number; mappingRevision: number; mappingVersionId: string | null;
  reviewId: string | null; reviewOutcomeId: string | null; orderId: string | null;
  issuedVersionId: string | null; expectedCaseVersion?: number | null;
  issueId?: string | null; expectedIssueVersion?: number | null };
export class PrincipalInvoiceError extends Error { constructor(readonly status: number, message: string) { super(message); } }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exact = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(value);
const nullableId = (value: unknown) => value === null || id(value);
const invalid = () => new PrincipalInvoiceError(0, "ERP did not confirm the invoice evidence. Refresh the saved record before continuing.");

async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company) || !path.startsWith("/")) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new PrincipalInvoiceError(0, "The response was interrupted. Check the saved action before trying again."); }
  let body: unknown; try { body = await response.json(); } catch { if (response.ok) throw invalid(); }
  if (!response.ok) throw new PrincipalInvoiceError(response.status, response.status === 401 ? "Sign in to ERP before continuing."
    : response.status === 403 ? "You do not have access to this invoice action."
      : response.status === 404 ? "This invoice or saved action is not available in the selected company."
        : response.status === 409 ? "The invoice, source or review changed. Refresh before continuing."
          : response.status === 422 ? "Check the invoice line details before saving."
            : "Principal invoice review is not available. Check the saved result if you submitted a change.");
  return body;
}
const invoicePath = (invoice: string) => { if (!id(invoice)) throw invalid(); return `/invoices/${invoice}`; };
export async function getPrincipalInvoiceState(company: string, invoice: string, signal?: AbortSignal): Promise<PrincipalInvoiceState> {
  const body = await call(company, `${invoicePath(invoice)}/principal-matching/status`, { signal });
  if (!record(body) || body.invoiceId !== invoice || body.sourceSchemaVersion !== 2 || !integer(body.invoiceVersion)
    || !integer(body.mappingRevision) || !integer(body.stateVersion)
    || !["Unmapped", "LegacyWorkflow", "Mapped", "Reviewed", "ComparisonBlocked", "Compared"].includes(String(body.state))
    || !nullableId(body.mappingVersionId) || !nullableId(body.reviewId) || !nullableId(body.reviewOutcomeId)
    || !nullableId(body.comparisonId) || !(body.exposureVersion === null || integer(body.exposureVersion))
    || typeof body.reviewState !== "string" || body.isAuthority !== false || body.canPostToFinance !== false
    || (body.state === "Unmapped" || body.state === "LegacyWorkflow") && (body.mappingVersionId !== null || body.mappingRevision !== 0)
    || ["Mapped", "Reviewed", "ComparisonBlocked", "Compared"].includes(String(body.state)) && (!id(body.mappingVersionId) || body.mappingRevision === 0)) throw invalid();
  return body as unknown as PrincipalInvoiceState;
}
export async function listPrincipalInvoiceSources(company: string, invoice: string, page: number, q = "", signal?: AbortSignal): Promise<PrincipalInvoiceSourcePage> {
  if (!integer(page) || page < 1 || page > 100000 || q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  const body = await call(company, `${invoicePath(invoice)}/principal-matching/sources?page=${page}&pageSize=25&q=${encodeURIComponent(q)}`, { signal });
  if (!record(body) || body.invoiceId !== invoice || body.sourceSchemaVersion !== 2 || !integer(body.invoiceVersion)
    || !integer(body.total) || body.page !== page || !integer(body.pageSize) || body.pageSize < 1 || body.pageSize > 25
    || body.isAuthority !== false || body.matchingAuthorityAvailable !== false || body.canPostToFinance !== false
    || !Array.isArray(body.items) || body.items.length > body.pageSize) throw invalid();
  for (const row of body.items) if (!record(row) || ![row.orderId, row.issuedVersionId, row.purchaseOrderLineId].every(id)
    || typeof row.orderNumber !== "string" || typeof row.description !== "string" || typeof row.unitCode !== "string"
    || typeof row.categoryCode !== "string" || ![row.quantity, row.unitPrice, row.taxAmount].every(exact)
    || row.sourceSchemaVersion !== 2 || row.sourceState !== "VerifiedIssuedAndAcceptanceHistory"
    || row.matchingAuthorityAvailable !== false || row.canAllocate !== false || row.canPostToFinance !== false) throw invalid();
  return body as unknown as PrincipalInvoiceSourcePage;
}
export async function listPrincipalAcceptances(company: string, invoice: string, source: PrincipalInvoiceSource, signal?: AbortSignal): Promise<PrincipalAcceptance[]> {
  const body = await call(company, `${invoicePath(invoice)}/principal-matching/sources/${source.orderId}/lines/${source.purchaseOrderLineId}/acceptances`, { signal });
  if (!record(body) || body.invoiceId !== invoice || body.orderId !== source.orderId
    || body.issuedVersionId !== source.issuedVersionId || body.purchaseOrderLineId !== source.purchaseOrderLineId
    || body.sourceSchemaVersion !== 2 || !Array.isArray(body.acceptedFacts) || !integer(body.total)
    || body.total !== body.acceptedFacts.length || body.historyState !== "VerifiedHistoricalPositiveOnly"
    || body.matchingAuthorityAvailable !== false || body.canAllocate !== false || body.canPostToFinance !== false) throw invalid();
  for (const fact of body.acceptedFacts) if (!record(fact) || !id(fact.principalAcceptanceFactId)
    || !id(fact.principalReceivingSourceStateId) || !integer(fact.sourceSequence)
    || !["Goods", "Service"].includes(String(fact.kind)) || ![fact.acceptedQuantity, fact.acceptedNetAmount].every(exact)
    || typeof fact.acceptanceReference !== "string" || typeof fact.acceptedAt !== "string") throw invalid();
  return body.acceptedFacts as PrincipalAcceptance[];
}
export async function sendPrincipalInvoiceCommand(company: string, locator: PrincipalInvoiceLocator, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!id(locator.invoiceId) || !id(locator.key) || !integer(locator.invoiceVersion) || locator.invoiceVersion < 1) throw invalid();
  if (locator.operation === "DecideReview" || locator.operation === "IssueAction") throw invalid();
  const path = locator.operation === "Map" ? `${invoicePath(locator.invoiceId)}/principal-matching/mappings`
    : locator.operation === "OpenReview" ? `${invoicePath(locator.invoiceId)}/principal-unit-reviews`
      : `${invoicePath(locator.invoiceId)}/principal-matching/comparisons`;
  return validateReceipt(await call(company, path, { method: "POST", headers: { "Idempotency-Key": locator.key }, body: JSON.stringify(body) }), locator);
}
export async function recoverPrincipalInvoiceCommand(company: string, locator: PrincipalInvoiceLocator): Promise<Record<string, unknown>> {
  if (!id(locator.invoiceId) || !id(locator.key)) throw invalid();
  if (locator.operation === "DecideReview" || locator.operation === "IssueAction") throw invalid();
  const path = locator.operation === "Map" ? `${invoicePath(locator.invoiceId)}/principal-matching/commands/${locator.key}`
    : locator.operation === "OpenReview" ? `/principal-unit-reviews/${locator.reviewId}/commands/${locator.key}`
      : `${invoicePath(locator.invoiceId)}/principal-matching/comparisons/commands/${locator.key}`;
  if (locator.operation === "OpenReview" && !id(locator.reviewId)) throw invalid();
  return validateReceipt(await call(company, path), locator);
}
function validateReceipt(value: unknown, locator: PrincipalInvoiceLocator): Record<string, unknown> {
  if (!record(value) || value.invoiceId !== locator.invoiceId || value.invoiceVersion !== locator.invoiceVersion
    || value.commandKey !== locator.key || value.sourceSchemaVersion !== 2 || value.canPostToFinance !== false) throw invalid();
  if (locator.operation === "Map" && (value.state !== "Mapped" || !id(value.mappingVersionId)
    || value.mappingRevision !== locator.mappingRevision + 1 || value.matchingAuthorityAvailable !== false || value.canAllocate !== false)) throw invalid();
  if (locator.operation === "OpenReview" && (value.state !== "Pending" || !id(value.reviewId)
    || value.isUnitVerified !== false || value.canCompare !== false)) throw invalid();
  if (locator.operation === "Compare") {
    if (value.mappingVersionId !== locator.mappingVersionId || value.financePostingId !== null) throw invalid();
    if (value.state === "Compared") {
      if (!id(value.comparisonId) || value.commercialClaimRecorded !== true) throw invalid();
    } else if (value.state === "ComparisonBlocked") {
      if (value.comparisonId !== null || value.commercialClaimRecorded !== false
        || !Array.isArray(value.issues) || value.issues.length === 0
        || value.issues.some((issue: unknown) => !record(issue) || !id(issue.issueId)
          || typeof issue.code !== "string" || !(issue.invoiceLineId === null || id(issue.invoiceLineId))
          || issue.state !== "Open")) throw invalid();
    } else throw invalid();
  }
  return value;
}

export type PrincipalReviewTask = { reviewId: string; invoiceId: string; mappingVersionId: string;
  branchId: string; openedAt: string; sourceSchemaVersion: 2; canPostToFinance: false };
export type PrincipalReviewPage = { items: PrincipalReviewTask[]; total: number; page: number; pageSize: number };
export type PrincipalReviewDetail = { reviewId: string; invoiceId: string; invoiceVersion: number;
  mappingVersionId: string; sourceSchemaVersion: 2; coreCaseId: string; caseVersion: number;
  caseState: string; reviewState: string; originalDigestCurrent: boolean; currentMapping: boolean;
  original: null | { invoiceNumber: string; invoiceDate: string; currencyCode: string;
    netAmount: string; taxAmount: string; grossAmount: string;
    lines: { id: string; lineNumber: number; description: string; quantity: string; unitPrice: string; taxAmount: string }[] };
  originalDocumentLines: { invoiceLineId: string; documentVersionId: string; documentSha256: string;
    documentLineReference: string; unitCode: string }[];
  blockers: string[]; assignments: { assignmentId: string; assignmentVersion: number }[];
  actionCandidates: ("Approve" | "Return" | "Reject")[]; attestation: "OriginalDocumentUnitsConfirmed";
  canPostToFinance: false };
export type PrincipalPinnedDocument = { documentId: string; versionId: string; versionNumber: number;
  fileName: string; mediaType: string; sizeBytes: number; sha256: string; scanState: string; canDownload: boolean };
export async function listPrincipalReviewTasks(company: string, page: number, signal?: AbortSignal): Promise<PrincipalReviewPage> {
  if (!integer(page) || page < 1 || page > 100000) throw invalid();
  const body = await call(company, `/principal-unit-reviews/tasks?page=${page}&pageSize=20`, { signal });
  if (!record(body) || body.page !== page || body.pageSize !== 20 || !integer(body.total)
    || body.availabilityMeaning !== "CurrentActiveAssignmentsOnly" || body.canPostToFinance !== false
    || !Array.isArray(body.items) || body.items.length > 20
    || body.items.some((row: unknown) => !record(row) || ![row.reviewId, row.invoiceId, row.mappingVersionId, row.branchId].every(id)
      || typeof row.openedAt !== "string" || row.sourceSchemaVersion !== 2 || row.canPostToFinance !== false)) throw invalid();
  return body as unknown as PrincipalReviewPage;
}
export async function getPrincipalReviewDetail(company: string, review: string, signal?: AbortSignal): Promise<PrincipalReviewDetail> {
  if (!id(review)) throw invalid();
  const body = await call(company, `/principal-unit-reviews/${review}`, { signal });
  if (!record(body) || body.reviewId !== review || ![body.invoiceId, body.mappingVersionId, body.coreCaseId].every(id)
    || !integer(body.invoiceVersion) || body.invoiceVersion < 1 || body.sourceSchemaVersion !== 2
    || !integer(body.caseVersion) || body.caseVersion < 1 || typeof body.caseState !== "string"
    || typeof body.reviewState !== "string" || typeof body.currentMapping !== "boolean"
    || typeof body.originalDigestCurrent !== "boolean" || body.attestation !== "OriginalDocumentUnitsConfirmed"
    || body.canPostToFinance !== false || !Array.isArray(body.blockers) || body.blockers.some(x => typeof x !== "string")
    || !Array.isArray(body.assignments) || body.assignments.some(x => !record(x) || !id(x.assignmentId)
      || !integer(x.assignmentVersion) || x.assignmentVersion < 1)
    || !Array.isArray(body.actionCandidates) || body.actionCandidates.some(x => !["Approve", "Return", "Reject"].includes(x))
    || !Array.isArray(body.originalDocumentLines) || body.originalDocumentLines.some(x => !record(x)
      || !id(x.invoiceLineId) || !id(x.documentVersionId) || typeof x.documentSha256 !== "string"
      || !/^[a-f0-9]{64}$/i.test(x.documentSha256) || typeof x.documentLineReference !== "string"
      || typeof x.unitCode !== "string")) throw invalid();
  if (body.original === null) { if (body.originalDigestCurrent || body.actionCandidates.length) throw invalid(); }
  else {
    const original = body.original;
    if (!record(original) || !body.originalDigestCurrent || typeof original.invoiceNumber !== "string"
      || typeof original.invoiceDate !== "string" || typeof original.currencyCode !== "string"
      || ![original.netAmount, original.taxAmount, original.grossAmount].every(exact)
      || !Array.isArray(original.lines) || original.lines.some(x => !record(x) || !id(x.id)
        || !integer(x.lineNumber) || x.lineNumber < 1 || typeof x.description !== "string"
        || ![x.quantity, x.unitPrice, x.taxAmount].every(exact))) throw invalid();
  }
  if ((!body.currentMapping || !body.originalDigestCurrent || body.blockers.length > 0)
    && (body.assignments.length || body.actionCandidates.length)) throw invalid();
  return body as unknown as PrincipalReviewDetail;
}
export async function listPrincipalReviewDocuments(company: string, detail: PrincipalReviewDetail, signal?: AbortSignal): Promise<PrincipalPinnedDocument[]> {
  const body = await call(company, `/principal-unit-reviews/${detail.reviewId}/documents`, { signal });
  if (!record(body) || body.reviewId !== detail.reviewId || body.invoiceId !== detail.invoiceId
    || body.availabilityMeaning !== "PinnedOriginalDocumentVersionsOnly" || body.canPostToFinance !== false
    || !Array.isArray(body.items) || body.items.some(x => !record(x) || !id(x.documentId) || !id(x.versionId)
      || !integer(x.versionNumber) || x.versionNumber < 1 || typeof x.fileName !== "string"
      || typeof x.mediaType !== "string" || !integer(x.sizeBytes) || x.sizeBytes < 1
      || typeof x.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(x.sha256)
      || x.scanState !== "Available" || x.canDownload !== true)) throw invalid();
  const expected = new Map(detail.originalDocumentLines.map(line => [line.documentVersionId, line.documentSha256.toLowerCase()]));
  if (expected.size === 0 || body.items.length !== expected.size || body.items.some(x => expected.get(x.versionId) !== x.sha256.toLowerCase())) throw invalid();
  return body.items as PrincipalPinnedDocument[];
}
export async function downloadPrincipalReviewDocument(company: string, detail: PrincipalReviewDetail, version: string): Promise<Blob> {
  if (!id(version) || !detail.originalDocumentLines.some(line => line.documentVersionId === version)) throw invalid();
  const headers = new Headers(procurementScopeHeaders(company));
  const response = await fetch(`/api/procurement/v1/principal-unit-reviews/${detail.reviewId}/documents/${version}/download`,
    { headers, credentials: "include", cache: "no-store" });
  if (!response.ok) throw new PrincipalInvoiceError(response.status, "The pinned original document is unavailable. Refresh the assigned review.");
  return response.blob();
}
export async function decidePrincipalReview(company: string, detail: PrincipalReviewDetail, assignmentId: string,
  assignmentVersion: number, action: "Approve" | "Return" | "Reject", reason: string | null,
  attested: boolean, key: string): Promise<Record<string, unknown>> {
  if (!id(key) || !id(assignmentId) || !integer(assignmentVersion) || assignmentVersion < 1
    || !detail.assignments.some(x => x.assignmentId === assignmentId && x.assignmentVersion === assignmentVersion)
    || !detail.actionCandidates.includes(action) || action === "Approve" && !attested
    || action !== "Approve" && !reason?.trim() || reason !== null && reason.length > 2000) throw invalid();
  const body = await call(company, `/principal-unit-reviews/${detail.reviewId}/assignments/${assignmentId}/decisions`,
    { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ invoiceVersion: detail.invoiceVersion,
      caseVersion: detail.caseVersion, assignmentVersion, action, reason,
      attestation: action === "Approve" ? "OriginalDocumentUnitsConfirmed" : null }) });
  return reviewDecisionReceipt(body, detail, key);
}
export async function recoverPrincipalReviewDecision(company: string, locator: PrincipalInvoiceLocator): Promise<Record<string, unknown>> {
  if (locator.operation !== "DecideReview" || !id(locator.key) || !id(locator.reviewId)
    || !integer(locator.expectedCaseVersion) || !integer(locator.invoiceVersion)) throw invalid();
  const value = await call(company, `/principal-unit-reviews/${locator.reviewId}/commands/${locator.key}`);
  if (!record(value) || value.reviewId !== locator.reviewId || value.invoiceId !== locator.invoiceId
    || value.invoiceVersion !== locator.invoiceVersion || value.commandKey !== locator.key
    || value.sourceSchemaVersion !== 2 || !id(value.decisionId)
    || value.caseVersion !== Number(locator.expectedCaseVersion) + 1
    || value.canPostToFinance !== false) throw invalid();
  return value;
}
function reviewDecisionReceipt(value: unknown, detail: PrincipalReviewDetail, key: string): Record<string, unknown> {
  if (!record(value) || value.reviewId !== detail.reviewId || value.invoiceId !== detail.invoiceId
    || value.invoiceVersion !== detail.invoiceVersion || value.coreCaseId !== detail.coreCaseId
    || value.commandKey !== key || value.sourceSchemaVersion !== 2 || !id(value.decisionId)
    || !(value.outcomeId === null || id(value.outcomeId)) || !integer(value.caseVersion)
    || value.caseVersion !== detail.caseVersion + 1 || !["Pending", "Approved", "Returned", "Rejected"].includes(String(value.caseState))
    || !["Pending", "Verified", "Returned", "Rejected"].includes(String(value.reviewState))
    || value.canPostToFinance !== false || value.isUnitVerified !== (value.reviewState === "Verified")) throw invalid();
  return value;
}

export type PrincipalInvoiceIssue = { issueId: string; supplierInvoiceLineId: string | null;
  mappingVersionId: string; code: string; state: string; ownerPrincipalId: string;
  version: number; openedAt: string; dueAt: string | null; resolvedAt: string | null;
  resolutionReference: string | null; history: { actionId: string; action: string;
    actorPrincipalId: string; reason: string; evidenceReference: string | null; at: string }[] };
export type PrincipalInvoiceIssuePage = { invoiceId: string; invoiceVersion: number;
  items: PrincipalInvoiceIssue[]; total: number; page: number; pageSize: number };
export async function listPrincipalInvoiceIssues(company: string, invoice: string, page = 1,
  signal?: AbortSignal): Promise<PrincipalInvoiceIssuePage> {
  if (!integer(page) || page < 1 || page > 100000) throw invalid();
  const value = await call(company, `${invoicePath(invoice)}/principal-matching/exceptions?page=${page}&pageSize=20`, { signal });
  if (!record(value) || value.invoiceId !== invoice || !integer(value.invoiceVersion)
    || value.sourceSchemaVersion !== 2 || value.page !== page || value.pageSize !== 20
    || !integer(value.total) || value.canPostToFinance !== false
    || !Array.isArray(value.items) || value.items.length > 20) throw invalid();
  for (const issue of value.items) {
    if (!record(issue) || !id(issue.issueId) || !id(issue.mappingVersionId)
      || !nullableId(issue.supplierInvoiceLineId) || typeof issue.code !== "string"
      || !["Open", "InReview", "AwaitingCorrection", "ReadyToRetry", "Resolved", "CancelledWithReason"].includes(String(issue.state))
      || !id(issue.ownerPrincipalId) || !integer(issue.version) || issue.version < 1
      || typeof issue.openedAt !== "string" || !Array.isArray(issue.history)
      || issue.history.some((row: unknown) => !record(row) || !id(row.actionId)
        || !id(row.actorPrincipalId) || typeof row.action !== "string"
        || typeof row.reason !== "string" || typeof row.at !== "string")) throw invalid();
  }
  return value as unknown as PrincipalInvoiceIssuePage;
}
export async function sendPrincipalIssueAction(company: string, locator: PrincipalInvoiceLocator,
  action: "Comment" | "CorrectionRequested" | "ReadyToRetry" | "Assign", reason: string,
  evidenceReference: string | null = null, newOwnerPrincipalId: string | null = null): Promise<Record<string, unknown>> {
  if (locator.operation !== "IssueAction" || !id(locator.issueId)
    || !integer(locator.expectedIssueVersion) || Number(locator.expectedIssueVersion) < 1
    || !reason.trim() || reason.length > 2000 || evidenceReference !== null && evidenceReference.length > 200
    || action === "Assign" && !id(newOwnerPrincipalId)
    || action !== "Assign" && newOwnerPrincipalId !== null) throw invalid();
  const value = await call(company, `${invoicePath(locator.invoiceId)}/principal-matching/exceptions/${locator.issueId}/actions`,
    { method: "POST", headers: { "Idempotency-Key": locator.key }, body: JSON.stringify({
      expectedVersion: locator.expectedIssueVersion, action, reason: reason.trim(), evidenceReference, newOwnerPrincipalId }) });
  return issueActionReceipt(value, locator);
}
export async function recoverPrincipalIssueAction(company: string, locator: PrincipalInvoiceLocator): Promise<Record<string, unknown>> {
  if (locator.operation !== "IssueAction" || !id(locator.issueId)) throw invalid();
  return issueActionReceipt(await call(company, `${invoicePath(locator.invoiceId)}/principal-matching/exceptions/commands/${locator.key}`), locator);
}
function issueActionReceipt(value: unknown, locator: PrincipalInvoiceLocator): Record<string, unknown> {
  if (!record(value) || value.invoiceId !== locator.invoiceId || value.issueId !== locator.issueId
    || !id(value.actionId) || value.commandKey !== locator.key
    || value.invoiceVersion !== locator.invoiceVersion || value.sourceSchemaVersion !== 2
    || !id(value.ownerPrincipalId) || !integer(value.issueVersion)
    || !["Open", "InReview", "AwaitingCorrection", "ReadyToRetry"].includes(String(value.issueState))
    || value.canPostToFinance !== false) throw invalid();
  return value;
}
