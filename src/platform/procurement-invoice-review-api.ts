import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Read-only invoice evidence. No approval, comparison execution, handoff or payment command. */
export type InvoiceReviewLine = { invoiceLineId: string; method: "TwoWay" | "ThreeWay"; quantity: string; netAmount: string; taxAmount: string; expectedUnitPrice: string };
export type InvoiceReviewSummary = { outcome: string; discrepancies: { invoiceLineId: string | null; code: string }[]; lines: InvoiceReviewLine[] };
export type InvoiceFinanceReadiness = { invoiceId: string; invoiceVersion: number; invoiceStatus: string; state: "Blocked"; canPrepareHandoff: false;
  evidence: { matchingSchemaAvailable: boolean; mappingState: string; mappingVersionId: string | null; mappingRevision: number | null;
    mappingOriginalCurrent: boolean | null; comparisonId: string | null; comparisonInvoiceVersion: number | null; comparisonOriginalCurrent: boolean | null;
    recordedComparison: InvoiceReviewSummary | null; unresolvedExceptionCount: number | null; comparisonCurrentness: "NotRevalidated" };
  blockers: { code: string; message: string }[]; nextSteps: { code: string; message: string }[] };
export type InvoiceMatchingHistory = { invoiceId: string; version: number; currentMappingVersionId: string | null; original: { netAmount: string; taxAmount: string; grossAmount: string; currencyCode: string;
  lines: { id: string; lineNumber: number; description: string; quantity: string; unitPrice: string; taxAmount: string }[] };
  mappings: { id: string; mappingRevision: number; verificationState: string; originalDigestCurrent: boolean; reviewedAt: string; sourceSchemaVersion: 3 | null }[];
  comparisons: { id: string; outcome: string; matchedAt: string; invoiceVersion: number; hasHeldCapacityClaim: boolean; comparison: InvoiceReviewSummary }[];
  exceptions: { id: string; invoiceLineId: string | null; type: string; status: string; dueAt: string | null; resolution: string | null }[] };
export class InvoiceReviewError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exact = (value: unknown): value is string => typeof value === "string" && /^-?(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(value);
const text = (value: unknown): value is string => typeof value === "string";
const optionalId = (value: unknown): value is string | null => value === null || typeof value === "string" && uuid.test(value);
const optionalInteger = (value: unknown): value is number | null => value === null || integer(value);
const optionalBoolean = (value: unknown): value is boolean | null => value === null || typeof value === "boolean";
const invalid = () => new InvoiceReviewError(0, "Invoice review information is incomplete. Refresh the invoice before continuing.");
async function read(company: string, invoice: string, path: string, signal?: AbortSignal): Promise<unknown> {
  if (!uuid.test(company) || !uuid.test(invoice)) throw invalid();
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/invoices/${invoice}/${path}`, { method: "GET", credentials: "include", cache: "no-store", signal, headers: procurementScopeHeaders(company) }); }
  catch { throw new InvoiceReviewError(0, "Invoice review information could not be loaded. Try refreshing the invoice."); }
  if (!response.ok) throw new InvoiceReviewError(response.status, response.status === 401 ? "Sign in to ERP to review this invoice."
    : response.status === 403 ? "You do not have access to this invoice review."
      : response.status === 404 ? "Invoice review information is not available for this record."
        : response.status === 409 ? "The invoice changed. Refresh it to load the latest review information."
          : "Invoice review is not available yet. The recorded invoice and documents remain available.");
  try { return await response.json(); } catch { throw invalid(); }
}
function summary(value: unknown, ownLines: ReadonlySet<string>): InvoiceReviewSummary {
  if (!object(value) || !text(value.outcome) || !Array.isArray(value.discrepancies) || !Array.isArray(value.lines)) throw invalid();
  const discrepancies = value.discrepancies.map((row) => {
    if (!object(row) || !optionalId(row.invoiceLineId) || row.invoiceLineId !== null && !ownLines.has(row.invoiceLineId) || !text(row.code)) throw invalid();
    return { invoiceLineId: row.invoiceLineId, code: row.code };
  });
  const lines = value.lines.map((row): InvoiceReviewLine => {
    if (!object(row) || !text(row.invoiceLineId) || !ownLines.has(row.invoiceLineId)
      || ![row.quantity, row.netAmount, row.taxAmount, row.expectedUnitPrice].every(exact)) throw invalid();
    const method = row.method === 0 || row.method === "TwoWay" ? "TwoWay" : row.method === 1 || row.method === "ThreeWay" ? "ThreeWay" : null;
    if (!method) throw invalid();
    return { invoiceLineId: row.invoiceLineId, method, quantity: row.quantity as string, netAmount: row.netAmount as string, taxAmount: row.taxAmount as string, expectedUnitPrice: row.expectedUnitPrice as string };
  });
  return { outcome: value.outcome, discrepancies, lines };
}
export async function getInvoiceFinanceReadiness(company: string, id: string, version: number, lineIds: ReadonlySet<string>, signal?: AbortSignal): Promise<InvoiceFinanceReadiness> {
  const body = await read(company, id, "finance-readiness", signal);
  if (!object(body) || body.invoiceId !== id || !integer(body.invoiceVersion) || !text(body.invoiceStatus)
    || body.state !== "Blocked" || body.canPrepareHandoff !== false || !object(body.evidence) || !Array.isArray(body.blockers) || !Array.isArray(body.nextSteps)) throw invalid();
  if (body.invoiceVersion !== version) throw new InvoiceReviewError(409, "The invoice changed. Refresh it to load matching review information.");
  const e = body.evidence;
  if (typeof e.matchingSchemaAvailable !== "boolean" || !text(e.mappingState) || !optionalId(e.mappingVersionId) || !optionalInteger(e.mappingRevision)
    || !optionalBoolean(e.mappingOriginalCurrent) || !optionalId(e.comparisonId) || !optionalInteger(e.comparisonInvoiceVersion)
    || !optionalBoolean(e.comparisonOriginalCurrent) || !optionalInteger(e.unresolvedExceptionCount) || e.comparisonCurrentness !== "NotRevalidated"
    || !e.matchingSchemaAvailable && (e.recordedComparison !== null || e.unresolvedExceptionCount !== null)) throw invalid();
  const messages = (items: unknown[]) => items.map((item) => { if (!object(item) || !text(item.code) || !text(item.message)) throw invalid(); return { code: item.code, message: item.message }; });
  const blockers = messages(body.blockers);
  if (!blockers.some((b) => b.code === "InvoiceValidationAuthorityUnavailable") || !blockers.some((b) => b.code === "FinanceReceiverUnavailable")) throw invalid();
  return { invoiceId: id, invoiceVersion: body.invoiceVersion, invoiceStatus: body.invoiceStatus, state: "Blocked", canPrepareHandoff: false,
    evidence: { matchingSchemaAvailable: e.matchingSchemaAvailable, mappingState: e.mappingState, mappingVersionId: e.mappingVersionId, mappingRevision: e.mappingRevision,
      mappingOriginalCurrent: e.mappingOriginalCurrent, comparisonId: e.comparisonId, comparisonInvoiceVersion: e.comparisonInvoiceVersion,
      comparisonOriginalCurrent: e.comparisonOriginalCurrent, recordedComparison: e.recordedComparison === null ? null : summary(e.recordedComparison, lineIds),
      unresolvedExceptionCount: e.unresolvedExceptionCount, comparisonCurrentness: "NotRevalidated" }, blockers, nextSteps: messages(body.nextSteps) };
}
export async function getInvoiceMatchingHistory(company: string, id: string, version: number, lineIds: ReadonlySet<string>, signal?: AbortSignal): Promise<InvoiceMatchingHistory> {
  const body = await read(company, id, "matching", signal);
  if (!object(body) || body.invoiceId !== id || !integer(body.version) || body.canPostToFinance !== false || body.isInvoiceApproval !== false
    || body.matchingStateIsRecordedResult !== true || !object(body.original) || !Array.isArray(body.original.lines)
    || body.currentMappingVersionId !== undefined && !optionalId(body.currentMappingVersionId)
    || ![body.original.netAmount, body.original.taxAmount, body.original.grossAmount].every(exact) || !text(body.original.currencyCode)
    || !Array.isArray(body.mappings) || !Array.isArray(body.comparisons) || !Array.isArray(body.exceptions)) throw invalid();
  if (body.version !== version) throw new InvoiceReviewError(409, "The invoice changed. Refresh it to load matching review information.");
  const originalLines = body.original.lines.map((row) => { if (!object(row) || !text(row.id) || !lineIds.has(row.id) || !integer(row.lineNumber)
    || !text(row.description) || ![row.quantity, row.unitPrice, row.taxAmount].every(exact)) throw invalid();
    return { id: row.id, lineNumber: row.lineNumber, description: row.description, quantity: row.quantity as string, unitPrice: row.unitPrice as string, taxAmount: row.taxAmount as string }; });
  if (originalLines.length !== lineIds.size || new Set(originalLines.map((line) => line.id)).size !== lineIds.size) throw invalid();
  const mappings = body.mappings.map((row) => { if (!object(row) || !text(row.id) || !uuid.test(row.id) || !integer(row.mappingRevision)
    || !text(row.verificationState) || typeof row.originalDigestCurrent !== "boolean" || !text(row.reviewedAt)
    || ![undefined, null, 3].includes(row.sourceSchemaVersion as number | null | undefined)
    || row.sourceSchemaVersion === 3 && (!object(row.snapshot) || row.snapshot.schemaVersion !== 3)
    || row.sourceSchemaVersion === undefined && object(row.snapshot) && row.snapshot.schemaVersion === 3) throw invalid();
    return { id: row.id, mappingRevision: row.mappingRevision, verificationState: row.verificationState,
      originalDigestCurrent: row.originalDigestCurrent, reviewedAt: row.reviewedAt,
      sourceSchemaVersion: row.sourceSchemaVersion === 3 ? 3 as const : null }; });
  const comparisons = body.comparisons.map((row) => { if (!object(row) || !text(row.id) || !uuid.test(row.id) || !text(row.outcome) || !text(row.matchedAt)
    || !integer(row.invoiceVersion) || typeof row.hasHeldCapacityClaim !== "boolean" || row.recordedHistoricalResult !== true || row.isCurrentApproval !== false || row.canPostToFinance !== false) throw invalid();
    return { id: row.id, outcome: row.outcome, matchedAt: row.matchedAt, invoiceVersion: row.invoiceVersion, hasHeldCapacityClaim: row.hasHeldCapacityClaim, comparison: summary(row.comparison, lineIds) }; });
  const exceptions = body.exceptions.map((row) => { if (!object(row) || !text(row.id) || !uuid.test(row.id) || !optionalId(row.supplierInvoiceLineId)
    || row.supplierInvoiceLineId !== null && !lineIds.has(row.supplierInvoiceLineId) || !text(row.type) || !text(row.status)
    || row.dueAt !== null && !text(row.dueAt) || row.resolution !== null && !text(row.resolution)) throw invalid();
    return { id: row.id, invoiceLineId: row.supplierInvoiceLineId, type: row.type, status: row.status, dueAt: row.dueAt, resolution: row.resolution }; });
  return { invoiceId: id, version: body.version, currentMappingVersionId: body.currentMappingVersionId as string | null ?? null,
    original: { netAmount: body.original.netAmount as string, taxAmount: body.original.taxAmount as string,
    grossAmount: body.original.grossAmount as string, currencyCode: body.original.currencyCode, lines: originalLines }, mappings, comparisons, exceptions };
}
