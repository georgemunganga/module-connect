import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Internal review of principal RFQ drafts; no supplier delivery operation exists here. */
export type PublicationStatus = "Draft" | "PublicationReview" | "Published" | "Cancelled";
export type PublicationRow = { id: string; number: string; state: "VerifiedRetainedSourcing" | "Unavailable";
  title?: string; currencyCode?: string; status?: PublicationStatus; version?: number; originalDraftFingerprint?: string };
export type PublicationPage = { items: PublicationRow[]; total: number; page: number; pageSize: number };
export type PublicationAssignment = { id: string; version: number; state: string; permissionKey: string };
export type PublicationDetail = { id: string; number: string; title: string; method: string; currencyCode: string;
  status: PublicationStatus; version: number; originalDraftFingerprint: string; cancellationReason?: string | null;
  lines: { id: string; purchaseRequestId: string; purchaseRequestLineId: string; description: string;
    unitCode: string; categoryCode: string | null; quantity: string; approvedUnitEstimate: string;
    estimatedValue: string; allocationState: "Reserved" | "Released" }[];
  publication?: { openingId: string; coreCaseId: string; caseState: string; coreCaseVersion: number;
    policyVersionId: string; policyVersionNumber: number; reviewer: boolean; assignments: PublicationAssignment[] };
  invitations: { id: string; supplierId: string; status: "ReadyForManualDelivery"; version: number }[] };
export type AssignedReview = { eventId: string; caseId: string; state: "VerifiedAssignedReview" | "Unavailable";
  number?: string; title?: string; assignments?: { id: string; version: number; state: string }[] };
export type SupplierChoice = { supplierId: string; displayName: string; number: string };
export type PublicationCommand = { action: "open" | "decide"; key: string; eventId: string; targetId?: string };
export class PublicationApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  && v !== "00000000-0000-0000-0000-000000000000";
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sha = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const decimal = (v: unknown): v is string => typeof v === "string" && /^\d+(?:\.\d{1,8})?$/.test(v);
const invalid = () => new PublicationApiError(0, "ERP could not confirm this RFQ result. Check its original save reference.");
async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/sourcing${path}`, { ...init, headers,
    credentials: "include", cache: "no-store", method: init.method ?? "GET" }); }
  catch { throw new PublicationApiError(0, "The response was interrupted. Check the original save reference."); }
  if (!response.ok) throw new PublicationApiError(response.status, response.status === 401 ? "Sign in to ERP before continuing."
    : response.status === 403 ? "You do not have access to this RFQ action."
      : response.status === 404 ? "This RFQ is unavailable in your current company or branch."
        : response.status === 409 ? "The RFQ, policy, source or review changed. Refresh before continuing."
          : "This RFQ action is not ready or was not confirmed.");
  try { return await response.json(); } catch { throw invalid(); }
}
const query = (page: number, q = "", state = "") => {
  if (!positive(page) || page > 100000 || q.length > 100 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  return `?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
};
export async function listPublications(company: string, page = 1, q = "", state = "", signal?: AbortSignal): Promise<PublicationPage> {
  if (state && !["Draft", "PublicationReview", "Published", "Cancelled"].includes(state)) throw invalid();
  const body = await call(company, `/principal-publications${query(page, q, state)}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !nonnegative(body.total) || body.page !== page
    || !positive(body.pageSize) || body.pageSize > 25 || body.scope !== "OwnCurrentCompany") throw invalid();
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
  const body = await call(company, `/principal-publication-reviews/assigned${query(page)}`, { signal });
  if (!object(body) || body.scope !== "CurrentCoreAssignment" || !Array.isArray(body.items)
    || !nonnegative(body.total) || body.page !== page || !positive(body.pageSize)) throw invalid();
  const items = body.items.map((value): AssignedReview => {
    if (!object(value) || !id(value.eventId) || !id(value.caseId)) throw invalid();
    if (value.state === "Unavailable") return { eventId: value.eventId, caseId: value.caseId, state: "Unavailable" };
    if (value.state !== "VerifiedAssignedReview" || value.status !== "PublicationReview"
      || typeof value.number !== "string" || typeof value.title !== "string" || !Array.isArray(value.assignments)
      || !value.assignments.length) throw invalid();
    const assignments = value.assignments.map(x => {
      if (!object(x) || !id(x.id) || !positive(x.version) || x.state !== "Pending") throw invalid();
      return { id: x.id, version: x.version, state: x.state };
    });
    return { eventId: value.eventId, caseId: value.caseId, state: "VerifiedAssignedReview", number: value.number,
      title: value.title, assignments };
  });
  return { items, total: body.total, pageSize: body.pageSize };
}
export async function getPublication(company: string, eventId: string, signal?: AbortSignal): Promise<PublicationDetail> {
  if (!id(eventId)) throw invalid();
  const body = await call(company, `/${eventId}/principal-publication`, { signal });
  if (!object(body) || body.id !== eventId || typeof body.number !== "string" || typeof body.title !== "string"
    || typeof body.method !== "string" || typeof body.currencyCode !== "string"
    || !["Draft", "PublicationReview", "Published", "Cancelled"].includes(String(body.status))
    || !positive(body.version) || !sha(body.originalDraftFingerprint) || !Array.isArray(body.lines)
    || body.lines.length < 1 || body.lines.length > 200 || body.canPublish !== false
    || body.financeReservationChanged !== false) throw invalid();
  const status = body.status as PublicationStatus;
  const lines = body.lines.map(value => {
    if (!object(value) || !id(value.id) || !id(value.purchaseRequestId) || !id(value.purchaseRequestLineId)
      || typeof value.description !== "string" || typeof value.unitCode !== "string"
      || !(value.categoryCode === null || typeof value.categoryCode === "string")
      || !decimal(value.quantity) || !decimal(value.approvedUnitEstimate) || !decimal(value.estimatedValue)
      || value.allocationState !== (status === "Cancelled" ? "Released" : "Reserved")) throw invalid();
    return value as PublicationDetail["lines"][number];
  });
  if (status === "Draft" || status === "Cancelled") {
    if (body.supplierDeliveryState !== "NotStarted"
      || !(body.cancellationReason === null || typeof body.cancellationReason === "string")) throw invalid();
    return { id: eventId, number: body.number, title: body.title, method: body.method,
      currencyCode: body.currencyCode, status, version: body.version,
      originalDraftFingerprint: body.originalDraftFingerprint, cancellationReason: body.cancellationReason as string | null,
      lines, invitations: [] };
  }
  if (!object(body.publication) || !id(body.publication.openingId) || !id(body.publication.coreCaseId)
    || !id(body.publication.policyVersionId) || !positive(body.publication.policyVersionNumber)
    || !positive(body.publication.coreCaseVersion) || body.publication.caseState !== (status === "Published" ? "Approved" : "Pending")
    || body.publication.supplierDeliveryState !== "PerInvitation" || typeof body.publication.reviewer !== "boolean"
    || !Array.isArray(body.publication.assignments) || !Array.isArray(body.invitations)
    || status === "Published" && (body.invitations.length < 1 || body.invitations.length > 100)
    || status === "PublicationReview" && body.invitations.length !== 0) throw invalid();
  const assignments = body.publication.assignments.map(value => {
    if (!object(value) || !id(value.id) || !positive(value.version) || typeof value.state !== "string"
      || value.permissionKey !== "procurement-sourcing-publish") throw invalid();
    return value as PublicationAssignment;
  });
  const invitations = body.invitations.map(value => {
    if (!object(value) || !id(value.id) || !id(value.supplierId) || !positive(value.version)
      || value.status !== "ReadyForManualDelivery" || value.contactRecorded !== false) throw invalid();
    return { id: value.id, supplierId: value.supplierId, status: "ReadyForManualDelivery" as const, version: value.version };
  });
  return { id: eventId, number: body.number, title: body.title, method: body.method,
    currencyCode: body.currencyCode, status, version: body.version,
    originalDraftFingerprint: body.originalDraftFingerprint, lines, invitations,
    publication: { openingId: body.publication.openingId, coreCaseId: body.publication.coreCaseId,
      caseState: status === "Published" ? "Approved" : "Pending", coreCaseVersion: body.publication.coreCaseVersion,
      policyVersionId: body.publication.policyVersionId, policyVersionNumber: body.publication.policyVersionNumber,
      reviewer: body.publication.reviewer, assignments } };
}
export async function searchPublicationSuppliers(company: string, eventId: string, q: string, page = 1, signal?: AbortSignal): Promise<{ items: SupplierChoice[]; total: number; pageSize: number }> {
  if (!id(eventId) || q.trim().length < 2 || q.length > 100 || !positive(page) || page > 20) throw invalid();
  const body = await call(company, `/${eventId}/principal-publication-suppliers?q=${encodeURIComponent(q.trim())}&page=${page}`, { signal });
  if (!object(body) || body.eventId !== eventId || body.eligibilityMeaning !== "CurrentApprovedPreviewOnly"
    || !Array.isArray(body.items) || !nonnegative(body.total) || body.page !== page || body.pageSize !== 25) throw invalid();
  return { items: body.items.map(value => {
    if (!object(value) || !id(value.supplierId) || typeof value.displayName !== "string" || typeof value.number !== "string") throw invalid();
    return { supplierId: value.supplierId, displayName: value.displayName, number: value.number };
  }), total: body.total, pageSize: body.pageSize };
}
async function write(company: string, path: string, body: object, key: string) {
  if (!id(key)) throw invalid();
  return call(company, path, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
}
function confirmed(raw: unknown, action: PublicationCommand["action"], eventId: string, key: string) {
  if (!object(raw) || raw.eventId !== eventId || raw.commandKey !== key || !positive(raw.version)
    || !id(raw.publicationReviewId) || !id(raw.coreCaseId) || !positive(raw.coreCaseVersion)
    || raw.financeReservationChanged !== false) throw invalid();
  if (action === "open" && (raw.status !== "PublicationReview" || raw.supplierDeliveryState !== "NotStarted")) throw invalid();
  if (action === "decide" && (!id(raw.coreDecisionId)
    || !((raw.caseState === "Pending" && raw.status === "PublicationReview")
      || (raw.caseState === "Approved" && raw.status === "Published")
      || ((raw.caseState === "Returned" || raw.caseState === "Rejected") && raw.status === "Draft"))
    || raw.supplierDeliveryState !== (raw.status === "Published" ? "ReadyForManualDelivery" : "NotStarted"))) throw invalid();
  return raw;
}
export async function openPublicationReview(company: string, detail: PublicationDetail, supplierIds: string[], key: string) {
  if (detail.status !== "Draft" || !positive(detail.version) || !sha(detail.originalDraftFingerprint)
    || !supplierIds.length || supplierIds.length > 100 || supplierIds.some(x => !id(x))
    || new Set(supplierIds).size !== supplierIds.length) throw invalid();
  return confirmed(await write(company, `/${detail.id}/principal-publication-reviews`, {
    expectedEventVersion: detail.version, originalDraftFingerprint: detail.originalDraftFingerprint, supplierIds }, key), "open", detail.id, key);
}
export async function decidePublicationReview(company: string, detail: PublicationDetail, assignment: PublicationAssignment,
  action: "Approve" | "Return" | "Reject", reason: string, key: string) {
  const pin = detail.publication;
  if (!pin || detail.status !== "PublicationReview" || pin.caseState !== "Pending" || !pin.reviewer
    || assignment.state !== "Pending" || !id(assignment.id) || !positive(assignment.version)
    || !["Approve", "Return", "Reject"].includes(action) || reason.trim().length > 2000
    || action !== "Approve" && !reason.trim()) throw invalid();
  return confirmed(await write(company, `/${detail.id}/principal-publication-reviews/${pin.coreCaseId}/assignments/${assignment.id}/decisions`, {
    expectedEventVersion: detail.version, expectedCaseVersion: pin.coreCaseVersion,
    expectedAssignmentVersion: assignment.version, action, reason: reason.trim() }, key), "decide", detail.id, key);
}
export async function recoverPublicationCommand(company: string, reference: PublicationCommand) {
  if (!id(reference.key) || !id(reference.eventId) || reference.action === "decide" && !id(reference.targetId)) throw invalid();
  return confirmed(await call(company, `/principal-publication-commands/${reference.key}`), reference.action, reference.eventId, reference.key);
}
