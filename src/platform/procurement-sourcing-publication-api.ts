import { procurementScopeHeaders } from "../../shared/shell-scope";
import { invoiceDecimal } from "../../shared/procurement-decimal";

/** Principal schema-2 RFQ publication and buyer-entered quote Drafts only. */
export type PublicationStatus = "Draft" | "PublicationReview" | "Published" | "Cancelled";
export type PublicationRow = { id: string; number: string; state: "VerifiedRetainedSourcing" | "Unavailable";
  title?: string; currencyCode?: string; status?: PublicationStatus; version?: number; originalDraftFingerprint?: string };
export type PublicationPage = { items: PublicationRow[]; total: number; page: number; pageSize: number };
export type PublicationLine = { id: string; purchaseRequestId: string; purchaseRequestLineId: string;
  description: string; unitCode: string; categoryCode: string | null; quantity: string;
  approvedUnitEstimate: string; estimatedValue: string; allocationState: "Reserved" | "Released" };
export type PublicationAssignment = { id: string; version: number; state: string; permissionKey: string };
export type PublicationInvitation = { id: string; supplierId: string;
  status: "ReadyForManualDelivery" | "ManualContactRecorded"; version: number; contactRecorded: boolean };
export type PublicationDetail = { id: string; number: string; title: string; method: string;
  currencyCode: string; status: PublicationStatus; version: number; originalDraftFingerprint: string;
  cancellationReason?: string | null; lines: PublicationLine[];
  publication?: { openingId: string; coreCaseId: string; caseState: string; coreCaseVersion: number;
    policyVersionId: string; policyVersionNumber: number; supplierDeliveryState: "PerInvitation";
    reviewer: boolean; assignments: PublicationAssignment[] }; invitations: PublicationInvitation[] };
export type AssignedReview = { eventId: string; caseId: string; state: "VerifiedAssignedReview" | "Unavailable";
  number?: string; title?: string; currencyCode?: string; status?: "PublicationReview";
  eventVersion?: number; caseVersion?: number; assignments?: { id: string; version: number; state: string }[] };
export type SupplierChoice = { supplierId: string; displayName: string; number: string };
export type QuoteLineInput = { sourcingLineId: string; quantity: string; unitPrice: string;
  taxAmount: string; deliveryAmount: string; leadTimeText?: string; notes?: string };
export type QuoteDraft = { eventId: string; bidId: string; supplierId: string;
  invitationId: string; status: "Draft" | "Cancelled"; bidVersion: number; draftRevision: number;
  sourceChannel: "Manual"; supplierSubmitted: false; totalExact: string;
  lines: QuoteLineInput[]; commandKey: string };
export class PublicationApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  && v !== "00000000-0000-0000-0000-000000000000";
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const exact = (v: unknown, scale = 4, whole = 14): v is string => typeof v === "string"
  && new RegExp(`^(?:0|[1-9]\\d{0,${whole - 1}})(?:\\.\\d{1,${scale}})?$`).test(v);
const sha = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const invalid = () => new PublicationApiError(0, "ERP could not confirm this quote record. Refresh or check the saved result.");
function validCompany(company: string) { if (!id(company)) throw invalid(); }
async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  validCompany(company);
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/sourcing${path}`, {
    ...init, headers, credentials: "include", cache: "no-store", method: init.method ?? "GET",
  }); } catch { throw new PublicationApiError(0, "The response was interrupted. Check its original save reference."); }
  if (!response.ok) throw new PublicationApiError(response.status, response.status === 401 ? "Sign in to ERP before continuing."
    : response.status === 403 ? "You do not have access to this quote action."
      : response.status === 404 ? "This quote is unavailable in your current company or branch."
        : response.status === 409 ? "The quote or approval changed. Refresh before continuing."
          : response.status === 422 ? "Check the quote details, supplier and amounts."
            : "This quote action is not ready, or the save could not be confirmed.");
  try { return await response.json(); } catch { throw invalid(); }
}
const pageQuery = (page: number, q = "", state = "") => {
  if (!positive(page) || page > 100000 || q.length > 100 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  return `?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
};
export async function listPublications(company: string, page = 1, q = "", state = "", signal?: AbortSignal): Promise<PublicationPage> {
  if (state && !["Draft", "PublicationReview", "Published", "Cancelled"].includes(state)) throw invalid();
  const body = await call(company, `/principal-publications${pageQuery(page, q, state)}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !nonnegative(body.total)
    || body.page !== page || !positive(body.pageSize) || body.pageSize > 25
    || body.items.length > body.pageSize || body.scope !== "OwnCurrentCompany") throw invalid();
  const items = body.items.map((value): PublicationRow => {
    if (!object(value) || !id(value.id) || typeof value.number !== "string") throw invalid();
    if (value.state === "Unavailable") return { id: value.id, number: value.number, state: "Unavailable" };
    if (value.state !== "VerifiedRetainedSourcing" || typeof value.title !== "string"
      || typeof value.currencyCode !== "string" || !["Draft", "PublicationReview", "Published", "Cancelled"].includes(String(value.status))
      || !positive(value.version) || !sha(value.originalDraftFingerprint)) throw invalid();
    return { id: value.id, number: value.number, state: "VerifiedRetainedSourcing", title: value.title,
      currencyCode: value.currencyCode, status: value.status as PublicationStatus, version: value.version,
      originalDraftFingerprint: value.originalDraftFingerprint };
  });
  return { items, total: body.total, page, pageSize: body.pageSize };
}
export async function listAssignedPublicationReviews(company: string, page = 1, signal?: AbortSignal): Promise<{ items: AssignedReview[]; total: number; pageSize: number }> {
  const body = await call(company, `/principal-publication-reviews/assigned${pageQuery(page)}`, { signal });
  if (!object(body) || body.scope !== "CurrentCoreAssignment" || !Array.isArray(body.items)
    || !nonnegative(body.total) || body.page !== page || !positive(body.pageSize) || body.pageSize > 25) throw invalid();
  return { items: body.items.map(value => {
    if (!object(value) || !id(value.eventId) || !id(value.caseId)) throw invalid();
    if (value.state === "Unavailable") return { eventId: value.eventId, caseId: value.caseId, state: "Unavailable" };
    if (value.state !== "VerifiedAssignedReview" || value.status !== "PublicationReview"
      || typeof value.number !== "string" || typeof value.title !== "string"
      || !positive(value.eventVersion) || !positive(value.caseVersion)
      || !Array.isArray(value.assignments) || !value.assignments.length) throw invalid();
    const assignments = value.assignments.map(x => {
      if (!object(x) || !id(x.id) || !positive(x.version) || x.state !== "Pending") throw invalid();
      return { id: x.id, version: x.version, state: x.state };
    });
    return { eventId: value.eventId, caseId: value.caseId, state: "VerifiedAssignedReview" as const,
      number: value.number, title: value.title, currencyCode: String(value.currencyCode ?? ""),
      status: "PublicationReview" as const, eventVersion: value.eventVersion,
      caseVersion: value.caseVersion, assignments };
  }), total: body.total, pageSize: body.pageSize };
}
export async function getPublication(company: string, eventId: string, signal?: AbortSignal): Promise<PublicationDetail> {
  if (!id(eventId)) throw invalid();
  const body = await call(company, `/${eventId}/principal-publication`, { signal });
  if (!object(body) || body.id !== eventId || typeof body.number !== "string"
    || typeof body.title !== "string" || typeof body.method !== "string" || typeof body.currencyCode !== "string"
    || !["Draft", "PublicationReview", "Published", "Cancelled"].includes(String(body.status))
    || !positive(body.version) || !sha(body.originalDraftFingerprint) || !Array.isArray(body.lines)
    || body.lines.length < 1 || body.lines.length > 200 || body.canPublish !== false
    || body.financeReservationChanged !== false) throw invalid();
  const status = body.status as PublicationStatus;
  const lines = body.lines.map(value => {
    if (!object(value) || !id(value.id) || !id(value.purchaseRequestId) || !id(value.purchaseRequestLineId)
      || typeof value.description !== "string" || typeof value.unitCode !== "string"
      || !(value.categoryCode === null || typeof value.categoryCode === "string")
      || !exact(value.quantity) || !exact(value.approvedUnitEstimate)
      || !exact(value.estimatedValue, 8, 30)
      || value.allocationState !== (status === "Cancelled" ? "Released" : "Reserved")) throw invalid();
    return value as PublicationLine;
  });
  if (status === "Draft" || status === "Cancelled") {
    if (body.supplierDeliveryState !== "NotStarted") throw invalid();
    return { id: eventId, number: body.number, title: body.title, method: body.method,
      currencyCode: body.currencyCode, status, version: body.version,
      originalDraftFingerprint: body.originalDraftFingerprint, cancellationReason: body.cancellationReason as string | null,
      lines, invitations: [] };
  }
  if (!object(body.publication) || !id(body.publication.openingId) || !id(body.publication.coreCaseId)
    || !id(body.publication.policyVersionId) || !positive(body.publication.policyVersionNumber)
    || !positive(body.publication.coreCaseVersion)
    || body.publication.caseState !== (status === "Published" ? "Approved" : "Pending")
    || body.publication.supplierDeliveryState !== "PerInvitation"
    || typeof body.publication.reviewer !== "boolean" || !Array.isArray(body.publication.assignments)
    || !Array.isArray(body.invitations)) throw invalid();
  const assignments = body.publication.assignments.map(value => {
    if (!object(value) || !id(value.id) || !positive(value.version)
      || typeof value.state !== "string" || value.permissionKey !== "procurement-sourcing-publish") throw invalid();
    return value as PublicationAssignment;
  });
  const invitations = body.invitations.map(value => {
    if (!object(value) || !id(value.id) || !id(value.supplierId) || !positive(value.version)
      || !["ReadyForManualDelivery", "ManualContactRecorded"].includes(String(value.status))
      || value.contactRecorded !== (value.status === "ManualContactRecorded")) throw invalid();
    return value as PublicationInvitation;
  });
  return { id: eventId, number: body.number, title: body.title, method: body.method,
    currencyCode: body.currencyCode, status, version: body.version,
    originalDraftFingerprint: body.originalDraftFingerprint, lines, invitations,
    publication: { openingId: body.publication.openingId, coreCaseId: body.publication.coreCaseId,
      caseState: body.publication.caseState, coreCaseVersion: body.publication.coreCaseVersion,
      policyVersionId: body.publication.policyVersionId, policyVersionNumber: body.publication.policyVersionNumber,
      supplierDeliveryState: "PerInvitation", reviewer: body.publication.reviewer, assignments } };
}
export async function searchPublicationSuppliers(company: string, eventId: string, q: string, page = 1, signal?: AbortSignal): Promise<{ items: SupplierChoice[]; total: number; pageSize: number }> {
  if (!id(eventId) || q.trim().length < 2 || q.length > 100 || !positive(page) || page > 20) throw invalid();
  const body = await call(company, `/${eventId}/principal-publication-suppliers?q=${encodeURIComponent(q.trim())}&page=${page}`, { signal });
  if (!object(body) || body.eventId !== eventId || body.eligibilityMeaning !== "CurrentApprovedPreviewOnly"
    || !Array.isArray(body.items) || !nonnegative(body.total) || body.page !== page || body.pageSize !== 25) throw invalid();
  return { items: body.items.map(value => {
    if (!object(value) || !id(value.supplierId) || typeof value.displayName !== "string"
      || typeof value.number !== "string") throw invalid();
    return { supplierId: value.supplierId, displayName: value.displayName, number: value.number };
  }), total: body.total, pageSize: 25 };
}
function quoteLine(value: QuoteLineInput): QuoteLineInput {
  if (!id(value.sourcingLineId)) throw invalid();
  return { ...value, quantity: invoiceDecimal(value.quantity, true), unitPrice: invoiceDecimal(value.unitPrice),
    taxAmount: invoiceDecimal(value.taxAmount), deliveryAmount: invoiceDecimal(value.deliveryAmount) };
}
export function quoteInput(lines: QuoteLineInput[]): QuoteLineInput[] {
  if (lines.length < 1 || lines.length > 200 || new Set(lines.map(x => x.sourcingLineId)).size !== lines.length) throw invalid();
  return lines.map(quoteLine);
}
function quoteReply(raw: unknown, key?: string): QuoteDraft {
  if (!object(raw) || !id(raw.eventId) || !id(raw.bidId) || !id(raw.supplierId) || !id(raw.invitationId)
    || !["Draft", "Cancelled"].includes(String(raw.status)) || !positive(raw.bidVersion)
    || !positive(raw.draftRevision) || raw.sourceChannel !== "Manual" || raw.supplierSubmitted !== false
    || !exact(raw.totalExact, 8, 30) || !Array.isArray(raw.lines) || !id(raw.commandKey)
    || key && raw.commandKey !== key) throw invalid();
  return { eventId: raw.eventId, bidId: raw.bidId, supplierId: raw.supplierId,
    invitationId: raw.invitationId, status: raw.status as "Draft" | "Cancelled",
    bidVersion: raw.bidVersion, draftRevision: raw.draftRevision, sourceChannel: "Manual",
    supplierSubmitted: false, totalExact: raw.totalExact,
    lines: raw.lines.map(value => {
      if (!object(value) || !id(value.sourcingLineId) || !exact(value.quantityExact)
        || !exact(value.unitPriceExact) || !exact(value.taxAmountExact)
        || !exact(value.deliveryAmountExact)) throw invalid();
      return { sourcingLineId: value.sourcingLineId, quantity: value.quantityExact,
        unitPrice: value.unitPriceExact, taxAmount: value.taxAmountExact,
        deliveryAmount: value.deliveryAmountExact,
        leadTimeText: typeof value.leadTimeText === "string" ? value.leadTimeText : "",
        notes: typeof value.notes === "string" ? value.notes : "" };
    }), commandKey: raw.commandKey };
}
export async function listManualQuotes(company: string, eventId: string, cursor = 0, signal?: AbortSignal): Promise<{ items: { bidId: string; supplierId: string; invitationId: string; status: "Draft" | "Cancelled"; bidVersion: number }[]; nextCursor: number | null }> {
  if (!id(eventId) || !nonnegative(cursor) || cursor > 1000000) throw invalid();
  const raw = await call(company, `/${eventId}/principal-manual-quotes?cursor=${cursor}&limit=25`, { signal });
  if (!object(raw) || !Array.isArray(raw.items) || typeof raw.hasMore !== "boolean"
    || !(raw.nextCursor === null || nonnegative(raw.nextCursor))) throw invalid();
  return { items: raw.items.map(value => {
    if (!object(value) || !id(value.bidId) || !id(value.supplierId) || !id(value.invitationId)
      || !["Draft", "Cancelled"].includes(String(value.status)) || !positive(value.bidVersion)
      || value.supplierSubmitted !== false) throw invalid();
    return { bidId: value.bidId, supplierId: value.supplierId, invitationId: value.invitationId,
      status: value.status as "Draft" | "Cancelled", bidVersion: value.bidVersion };
  }), nextCursor: raw.nextCursor };
}
export async function getManualQuote(company: string, eventId: string, bidId: string, signal?: AbortSignal): Promise<QuoteDraft> {
  if (!id(eventId) || !id(bidId)) throw invalid();
  const reply = quoteReply(await call(company, `/${eventId}/principal-manual-quotes/${bidId}`, { signal }));
  if (reply.eventId !== eventId || reply.bidId !== bidId) throw invalid();
  return reply;
}
async function write(company: string, path: string, body: object, key: string, method = "POST") {
  if (!id(key)) throw invalid();
  return call(company, path, { method, headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
}
export async function openPublicationReview(company: string, detail: PublicationDetail, supplierIds: string[], key: string) {
  if (detail.status !== "Draft" || !positive(detail.version) || !sha(detail.originalDraftFingerprint)
    || supplierIds.length < 1 || supplierIds.length > 100 || supplierIds.some(x => !id(x))
    || new Set(supplierIds).size !== supplierIds.length) throw invalid();
  const raw = await write(company, `/${detail.id}/principal-publication-reviews`, {
    expectedEventVersion: detail.version, originalDraftFingerprint: detail.originalDraftFingerprint,
    supplierIds }, key);
  if (!object(raw) || raw.eventId !== detail.id || raw.commandKey !== key
    || raw.status !== "PublicationReview" || !positive(raw.version)
    || !id(raw.coreCaseId) || !id(raw.publicationReviewId)
    || raw.supplierDeliveryState !== "NotStarted" || raw.financeReservationChanged !== false) throw invalid();
  return raw;
}
export async function decidePublicationReview(company: string, detail: PublicationDetail,
  assignment: PublicationAssignment, action: "Approve" | "Return" | "Reject", reason: string, key: string) {
  const pin = detail.publication;
  if (!pin || detail.status !== "PublicationReview" || pin.caseState !== "Pending"
    || !pin.reviewer || assignment.state !== "Pending" || !id(assignment.id)
    || !positive(assignment.version) || action !== "Approve" && !reason.trim()) throw invalid();
  const raw = await write(company, `/${detail.id}/principal-publication-reviews/${pin.coreCaseId}/assignments/${assignment.id}/decisions`, {
    expectedEventVersion: detail.version, expectedCaseVersion: pin.coreCaseVersion,
    expectedAssignmentVersion: assignment.version, action, reason: reason.trim() }, key);
  if (!object(raw) || raw.eventId !== detail.id || raw.commandKey !== key
    || !positive(raw.version) || !id(raw.coreDecisionId)
    || !["Pending", "Approved", "Returned", "Rejected"].includes(String(raw.caseState))
    || raw.financeReservationChanged !== false) throw invalid();
  return raw;
}
export async function recordManualContact(company: string, eventId: string,
  invitation: PublicationInvitation, channel: string, reference: string, reportedContactAt: string, key: string) {
  if (!id(eventId) || invitation.status !== "ReadyForManualDelivery"
    || !["EmailOutsideSystem", "Physical", "Telephone", "Other"].includes(channel)
    || !reference.trim() || reference.length > 200 || !Number.isFinite(Date.parse(reportedContactAt))) throw invalid();
  const raw = await write(company, `/${eventId}/principal-invitations/${invitation.id}/manual-contact`, {
    channel, reference: reference.trim(), reportedContactAt }, key);
  if (!object(raw) || raw.eventId !== eventId || raw.invitationId !== invitation.id
    || raw.commandKey !== key || raw.status !== "ManualContactRecorded"
    || raw.supplierDeliveryReported !== true || raw.emailSentBySystem !== false) throw invalid();
  return raw;
}
export async function createManualQuote(company: string, eventId: string, invitationId: string,
  lines: QuoteLineInput[], key: string): Promise<QuoteDraft> {
  if (!id(eventId) || !id(invitationId)) throw invalid();
  const raw = await write(company, `/${eventId}/principal-manual-quotes`, {
    invitationId, lines: quoteInput(lines) }, key);
  const reply = quoteReply(raw, key);
  if (reply.eventId !== eventId || reply.invitationId !== invitationId || reply.status !== "Draft") throw invalid();
  return reply;
}
export async function reviseManualQuote(company: string, existing: QuoteDraft,
  lines: QuoteLineInput[], key: string): Promise<QuoteDraft> {
  if (existing.status !== "Draft") throw invalid();
  const raw = await write(company, `/${existing.eventId}/principal-manual-quotes/${existing.bidId}`,
    { expectedBidVersion: existing.bidVersion, lines: quoteInput(lines) }, key, "PUT");
  const reply = quoteReply(raw, key);
  if (reply.bidId !== existing.bidId || reply.bidVersion <= existing.bidVersion
    || reply.draftRevision <= existing.draftRevision || reply.status !== "Draft") throw invalid();
  return reply;
}
export async function cancelManualQuote(company: string, existing: QuoteDraft, key: string): Promise<QuoteDraft> {
  if (existing.status !== "Draft") throw invalid();
  const raw = await write(company, `/${existing.eventId}/principal-manual-quotes/${existing.bidId}/cancel`,
    { expectedBidVersion: existing.bidVersion }, key);
  const reply = quoteReply(raw, key);
  if (reply.bidId !== existing.bidId || reply.bidVersion <= existing.bidVersion || reply.status !== "Cancelled") throw invalid();
  return reply;
}
export async function recoverPublicationCommand(company: string, reference: {
  type: "publication" | "contact" | "quote";
  action: "open" | "decide" | "contact" | "quote-create" | "quote-revise" | "quote-cancel";
  key: string; eventId: string; targetId?: string;
}) {
  if (!id(reference.key) || !id(reference.eventId)
    || reference.type === "publication" && !["open", "decide"].includes(reference.action)
    || reference.type === "contact" && reference.action !== "contact"
    || reference.type === "quote" && !["quote-create", "quote-revise", "quote-cancel"].includes(reference.action)
    || ["decide", "contact", "quote-revise", "quote-cancel"].includes(reference.action) && !id(reference.targetId)) throw invalid();
  const path = reference.type === "publication" ? "principal-publication-commands"
    : reference.type === "contact" ? "principal-manual-contact-commands" : "principal-manual-quote-commands";
  const raw = await call(company, `/${path}/${reference.key}`);
  if (!object(raw) || raw.commandKey !== reference.key || raw.eventId !== reference.eventId) throw invalid();
  if (reference.type === "quote") {
    const result = quoteReply(raw, reference.key);
    if (reference.action !== "quote-create" && result.bidId !== reference.targetId
      || result.status !== (reference.action === "quote-cancel" ? "Cancelled" : "Draft")) throw invalid();
    return result;
  }
  if (reference.type === "contact" && (reference.action !== "contact"
    || raw.invitationId !== reference.targetId || raw.status !== "ManualContactRecorded"
    || raw.supplierDeliveryReported !== true || raw.emailSentBySystem !== false)) throw invalid();
  if (reference.type === "publication" && (reference.action === "open"
    ? raw.status !== "PublicationReview" || !id(raw.coreCaseId)
    : reference.action !== "decide" || !id(raw.coreDecisionId)
      || !["Pending", "Approved", "Returned", "Rejected"].includes(String(raw.caseState)))) throw invalid();
  return raw;
}
