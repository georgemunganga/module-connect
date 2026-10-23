import { procurementScopeHeaders } from "../../shared/shell-scope";
import { invoiceDecimal } from "../../shared/procurement-decimal";

/** Procurement records an externally reported payment; Finance still owns posting and Paid. */
export type ManualPaymentStatus = "Draft" | "PendingApproval" | "Approved" | "PaymentRecorded"
  | "ConfirmedManually" | "Rejected" | "Cancelled" | "Disputed";
export type ManualPaymentAction = "Create" | "Revise" | "Submit" | "Approve" | "Return"
  | "Reject" | "Record" | "Confirm" | "Dispute" | "Cancel";
export type ManualPaymentIdentity = { tenantId: string; legalEntityId: string; principalId: string;
  branchId: string | null; authEpoch: string | number };
export type ManualPaymentScope = { readonly identity: ManualPaymentIdentity;
  readonly headers: Readonly<Record<string, string>>; current(): boolean; assertCurrent(): void };
export type ManualPaymentSummary = { id: string; version: number; status: ManualPaymentStatus;
  title: string | null; branchId: string; supplierInvoiceId: string; supplierId: string;
  invoiceNumber: string; supplierDisplayName: string;
  currencyCode: string; amountExact: string; creatorPrincipalId: string;
  approverPrincipalId: string; recorderPrincipalId: string; confirmerPrincipalId: string;
  createdAt: string; updatedAt: string | null };
export type ManualPaymentPage = { items: ManualPaymentSummary[]; total: number; page: number; pageSize: number };
export type ManualPaymentDetail = { request: ManualPaymentSummary & { purpose: string | null;
  approvedAmountExact: string | null; recordedAmountExact: string | null; paidOn: string | null;
  externalMethod: string | null; externalReference: string | null; approvedByPrincipalId: string | null;
  recordedByPrincipalId: string | null; confirmedByPrincipalId: string | null; closureReason: string | null };
  transitions: { id: string; action: ManualPaymentAction; fromStatus: string; toStatus: string;
    fromVersion: number; toVersion: number; actorPrincipalId: string; occurredAt: string; reason: string | null }[];
  coreCases: { id: string; purpose: "Approval" | "Confirmation"; openedRequestVersion: number;
    coreApprovalCaseId: string; coreApprovalStageId: string; coreApprovalAssignmentId: string;
    assigneePrincipalId: string; policyVersionId: string; policyVersionNumber: number;
    openedAt: string; state: string; version: number }[];
  coreDecisions: { id: string; manualPaymentDecisionId: string; coreApprovalDecisionId: string;
    manualAction: ManualPaymentAction; actorPrincipalId: string; decidedAt: string; coreAction: string }[];
  people: { principalId: string; displayName: string }[];
  companyClock: { date: string; timeZoneId: string; observedAtUtc: string } | null;
  sourceInvoice: { invoiceId: string; invoiceNumber: string; supplierId: string;
    displayName: string; currencyCode: string; grossExact: string; invoiceDate: string; branchId: string } | null };
export type ManualPaymentReceipt = { id: string; version: number; status: ManualPaymentStatus;
  action: ManualPaymentAction; commandKey: string };
export type ManualPaymentCommandResult = ManualPaymentReceipt & { amountExact: string };
export type ManualPaymentCreate = { branchId: string; invoiceId: string; amountExact: string;
  approverPrincipalId: string; recorderPrincipalId: string; confirmerPrincipalId: string;
  purpose: string | null; title: string | null };
export type ManualPaymentRevise = Omit<ManualPaymentCreate, "branchId" | "invoiceId"> & { expectedVersion: number };
export type ManualPaymentTransition = { expectedVersion: number; reason?: string | null;
  paidOn?: string; externalMethod?: string; externalReference?: string; amountExact?: string };
export type ManualPaymentCommand =
  | { action: "Create"; key: string; input: ManualPaymentCreate }
  | { action: "Revise"; key: string; id: string; input: ManualPaymentRevise }
  | { action: Exclude<ManualPaymentAction, "Create" | "Revise">; key: string; id: string; input: ManualPaymentTransition };
export type ManualPaymentAssignee = { principalId: string; displayName: string };
export type ManualPaymentAssigneePage = { items: ManualPaymentAssignee[]; nextCursor: string | null; hasMore: boolean };
export type ManualPaymentBranch = { id: string; code: string; name: string };
export type ManualPaymentInvoiceChoice = { invoiceId: string; invoiceNumber: string; supplierId: string;
  supplierDisplayName: string; currencyCode: string; grossExact: string; invoiceDate: string; branchId: string };
export type ManualPaymentInvoiceChoices = { items: ManualPaymentInvoiceChoice[];
  nextCursor: string | null; hasMore: boolean; previewOnly: true };

export class ManualPaymentApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** Only a known pre-commit rejection permits the UI to offer a new command key. */
export function isDefiniteManualPaymentRejection(error: unknown): error is ManualPaymentApiError {
  return error instanceof ManualPaymentApiError && [400, 401, 403, 404, 409, 422].includes(error.status);
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (x: unknown): x is string => typeof x === "string" && guid.test(x)
  && x.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const version = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0;
const count = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const iso = (x: unknown): x is string => typeof x === "string" && Number.isFinite(Date.parse(x));
const optionalText = (x: unknown): x is string | null => x === null || typeof x === "string";
const optionalId = (x: unknown): x is string | null => x === null || id(x);
const statuses: readonly string[] = ["Draft", "PendingApproval", "Approved", "PaymentRecorded",
  "ConfirmedManually", "Rejected", "Cancelled", "Disputed"];
const actions: readonly string[] = ["Create", "Revise", "Submit", "Approve", "Return", "Reject",
  "Record", "Confirm", "Dispute", "Cancel"];
const validStatus = (x: unknown): x is ManualPaymentStatus => typeof x === "string" && statuses.includes(x);
const validAction = (x: unknown): x is ManualPaymentAction => typeof x === "string" && actions.includes(x);
const exact = (x: unknown, positive = false): x is string => {
  if (typeof x !== "string") return false;
  try { invoiceDecimal(x, positive); return true; } catch { return false; }
};
const optionalExact = (x: unknown): x is string | null => x === null || exact(x, true);
const invalid = () => new ManualPaymentApiError(0,
  "The payment response was incomplete. Check the saved request and command result before another action.");

/** Capture the Core identity and shell selection when a request starts. The caller's
 * current() must read its live shell/auth epoch, never return this captured object. */
export function captureManualPaymentScope(identity: ManualPaymentIdentity,
  current: () => ManualPaymentIdentity | null): ManualPaymentScope {
  if (!id(identity.legalEntityId) || !id(identity.principalId)
    || typeof identity.tenantId !== "string" || !identity.tenantId.trim()
    || identity.tenantId.length > 300 || /[\x00-\x1f\x7f]/.test(identity.tenantId)
    || identity.branchId !== null && !id(identity.branchId)
    || !(typeof identity.authEpoch === "number" && Number.isSafeInteger(identity.authEpoch)
      || typeof identity.authEpoch === "string" && identity.authEpoch.length > 0 && identity.authEpoch.length <= 100)) throw invalid();
  const headers = procurementScopeHeaders(identity.legalEntityId);
  if ((headers["X-Shell-Location"] ?? null) !== identity.branchId) throw new ManualPaymentApiError(0,
    "The selected branch changed. Refresh the payment workspace.");
  const snapshot = JSON.stringify([identity.tenantId, identity.legalEntityId, identity.principalId,
    identity.branchId, identity.authEpoch, headers]);
  const check = () => {
    const latest = current();
    if (!latest) return false;
    try {
      const liveHeaders = procurementScopeHeaders(identity.legalEntityId);
      return JSON.stringify([latest.tenantId, latest.legalEntityId, latest.principalId,
        latest.branchId, latest.authEpoch, liveHeaders]) === snapshot;
    } catch { return false; }
  };
  return { identity: { ...identity }, headers: { ...headers }, current: check,
    assertCurrent() { if (!check()) throw new ManualPaymentApiError(0,
      "Your account or company context changed. Refresh the payment workspace."); } };
}

async function request(scope: ManualPaymentScope, path: string, init: RequestInit = {}): Promise<unknown> {
  scope.assertCurrent();
  if (init.signal?.aborted) throw new ManualPaymentApiError(0, "The payment request was cancelled after the view changed.");
  const headers = new Headers();
  Object.entries(scope.headers).forEach(([key, value]) => headers.set(key, value));
  for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/manual-payments${path}`,
      { ...init, headers, credentials: "include", cache: "no-store" });
  } catch {
    scope.assertCurrent();
    throw new ManualPaymentApiError(0, "The payment response was interrupted. Check the command result before another action.");
  }
  scope.assertCurrent();
  if (init.signal?.aborted) throw new ManualPaymentApiError(0, "The payment request was cancelled after the view changed.");
  let body: unknown;
  try { body = await response.json(); }
  catch { if (response.ok) throw invalid(); }
  scope.assertCurrent();
  if (init.signal?.aborted) throw new ManualPaymentApiError(0, "The payment request was cancelled after the view changed.");
  if (!response.ok) throw new ManualPaymentApiError(response.status,
    response.status === 401 ? "Sign in to ERP before opening payments."
      : response.status === 403 ? "Your current account cannot access this payment."
        : response.status === 404 ? "The payment or saved command is unavailable in this scope."
          : response.status === 409 ? "The payment or approval task changed. Refresh and review it."
            : response.status === 422 ? "Check the payment details and exact amounts."
              : response.status === 503 ? "The outcome is uncertain. Check the saved command before trying another action."
                : "The payment action could not be confirmed.");
  return body;
}

function summary(x: unknown): ManualPaymentSummary {
  if (!obj(x) || !id(x.id) || !version(x.version) || !validStatus(x.status)
    || !optionalText(x.title) || !id(x.branchId) || !id(x.supplierInvoiceId) || !id(x.supplierId)
    || typeof x.currencyCode !== "string" || !/^[A-Z]{3}$/.test(x.currencyCode)
    || !exact(x.amountExact, true) || !id(x.creatorPrincipalId) || !id(x.approverPrincipalId)
    || !id(x.recorderPrincipalId) || !id(x.confirmerPrincipalId) || !iso(x.createdAt)
    || x.updatedAt !== null && !iso(x.updatedAt)
    || typeof x.invoiceNumber !== "string" || typeof x.supplierDisplayName !== "string") throw invalid();
  return x as unknown as ManualPaymentSummary;
}

export async function listManualPayments(scope: ManualPaymentScope, page = 1,
  filters: { search?: string; status?: ManualPaymentStatus; invoiceId?: string; supplierId?: string } = {}, signal?: AbortSignal): Promise<ManualPaymentPage> {
  if (!version(page) || page > 100000 || filters.search && (filters.search.length > 100 || /[\x00-\x1f\x7f]/.test(filters.search))
    || filters.status && !validStatus(filters.status) || filters.invoiceId && !id(filters.invoiceId)
    || filters.supplierId && !id(filters.supplierId)) throw new ManualPaymentApiError(422, "Choose valid payment filters.");
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (filters.search?.trim()) query.set("q", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.invoiceId) query.set("invoiceId", filters.invoiceId);
  if (filters.supplierId) query.set("supplierId", filters.supplierId);
  const body = await request(scope, `?${query}`, { signal });
  if (!obj(body) || !Array.isArray(body.items) || !count(body.total) || body.page !== page
    || body.pageSize !== 25 || body.items.length > 25
    || body.items.length > Math.max(0, body.total - (page - 1) * 25)) throw invalid();
  const items = body.items.map(summary);
  if (new Set(items.map(item => item.id)).size !== items.length) throw invalid();
  return { items, total: body.total, page, pageSize: 25 };
}

/** Current Core accounts eligible for one named payment assignment in an explicit company branch.
 * A choice is only a preview; create/revise/submit revalidate it server-side. */
export async function lookupManualPaymentAssignees(scope: ManualPaymentScope, input: {
  role: "approve" | "record" | "confirm"; branchId: string; q?: string; cursor?: string;
  limit?: number; recorderPrincipalId?: string;
}, signal?: AbortSignal): Promise<ManualPaymentAssigneePage> {
  if (!id(input.branchId) || !["approve", "record", "confirm"].includes(input.role)
    || input.cursor !== undefined && !id(input.cursor)
    || input.limit !== undefined && (!version(input.limit) || input.limit > 50)
    || input.q && (input.q.length > 100 || /[\x00-\x1f\x7f]/.test(input.q))
    || (input.role === "confirm" ? !id(input.recorderPrincipalId) : input.recorderPrincipalId !== undefined))
    throw new ManualPaymentApiError(422, "Choose a branch and valid payment role.");
  const query = new URLSearchParams({ role: input.role, branchId: input.branchId, limit: String(input.limit ?? 25) });
  if (input.q?.trim()) query.set("q", input.q.trim());
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.recorderPrincipalId) query.set("recorderPrincipalId", input.recorderPrincipalId);
  const body = await request(scope, `/lookups/assignees?${query}`, { signal });
  if (!obj(body) || !Array.isArray(body.items) || body.items.length > (input.limit ?? 25)
    || typeof body.hasMore !== "boolean" || body.nextCursor !== null && !id(body.nextCursor)
    || body.hasMore !== (body.nextCursor !== null)
    || !body.items.every(item => obj(item) && id(item.principalId)
      && typeof item.displayName === "string" && item.displayName.length <= 300)
    || new Set(body.items.map(item => (item as ManualPaymentAssignee).principalId)).size !== body.items.length)
    throw invalid();
  return body as unknown as ManualPaymentAssigneePage;
}

/** Core transaction branches authorized for this payment actor and current header scope. */
export async function lookupManualPaymentBranches(scope: ManualPaymentScope,
  signal?: AbortSignal): Promise<ManualPaymentBranch[]> {
  const body = await request(scope, "/lookups/branches", { signal });
  if (!obj(body) || !Array.isArray(body.items) || body.items.length > 10000
    || !body.items.every(row => obj(row) && id(row.id)
      && typeof row.code === "string" && row.code.length <= 100
      && typeof row.name === "string" && row.name.trim().length > 0 && row.name.length <= 300)
    || new Set(body.items.map(row => (row as ManualPaymentBranch).id)).size !== body.items.length)
    throw invalid();
  return body.items as ManualPaymentBranch[];
}

/** Payment-scoped invoice picker. Gross is informational, never remaining capacity. */
export async function lookupManualPaymentInvoices(scope: ManualPaymentScope, input: {
  branchId: string; q?: string; cursor?: string; limit?: number; invoiceId?: string;
}, signal?: AbortSignal): Promise<ManualPaymentInvoiceChoices> {
  if (!id(input.branchId) || input.cursor !== undefined
    && (!/^(0|[1-9]\d*)$/.test(input.cursor) || !Number.isSafeInteger(Number(input.cursor)))
    || input.invoiceId !== undefined && !id(input.invoiceId)
    || input.limit !== undefined && (!version(input.limit) || input.limit > 50)
    || input.q && (input.q.length > 100 || /[\x00-\x1f\x7f]/.test(input.q)))
    throw new ManualPaymentApiError(422, "Choose a branch and valid invoice search.");
  const query = new URLSearchParams({ branchId: input.branchId, limit: String(input.limit ?? 25) });
  if (input.q?.trim()) query.set("q", input.q.trim());
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  if (input.invoiceId) query.set("invoiceId", input.invoiceId);
  const body = await request(scope, `/lookups/invoices?${query}`, { signal });
  if (!obj(body) || body.previewOnly !== true || !Array.isArray(body.items)
    || body.items.length > (input.limit ?? 25) || typeof body.hasMore !== "boolean"
    || body.nextCursor !== null && (typeof body.nextCursor !== "string"
      || !/^(0|[1-9]\d*)$/.test(body.nextCursor) || !Number.isSafeInteger(Number(body.nextCursor)))
    || body.hasMore !== (body.nextCursor !== null)
    || !body.items.every(row => obj(row) && id(row.invoiceId) && id(row.supplierId)
      && id(row.branchId) && row.branchId === input.branchId
      && typeof row.invoiceNumber === "string" && typeof row.supplierDisplayName === "string"
      && typeof row.currencyCode === "string" && /^[A-Z]{3}$/.test(row.currencyCode)
      && exact(row.grossExact, true) && typeof row.invoiceDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(row.invoiceDate)) || new Set(body.items.map(row =>
        (row as ManualPaymentInvoiceChoice).invoiceId)).size !== body.items.length) throw invalid();
  return body as unknown as ManualPaymentInvoiceChoices;
}

export async function getManualPayment(scope: ManualPaymentScope, requestId: string,
  signal?: AbortSignal): Promise<ManualPaymentDetail> {
  if (!id(requestId)) throw new ManualPaymentApiError(422, "Choose a saved payment request.");
  const body = await request(scope, `/${requestId}`, { signal });
  if (!obj(body) || !obj(body.request) || !Array.isArray(body.transitions)
    || !Array.isArray(body.coreCases) || !Array.isArray(body.coreDecisions)) throw invalid();
  const requestRow = summary(body.request);
  if (requestRow.id !== requestId || !optionalText(body.request.purpose)
    || !optionalExact(body.request.approvedAmountExact) || !optionalExact(body.request.recordedAmountExact)
    || body.request.paidOn !== null && (typeof body.request.paidOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.request.paidOn))
    || !optionalText(body.request.externalMethod) || !optionalText(body.request.externalReference)
    || !optionalId(body.request.approvedByPrincipalId) || !optionalId(body.request.recordedByPrincipalId)
    || !optionalId(body.request.confirmedByPrincipalId) || !optionalText(body.request.closureReason)) throw invalid();
  if (!body.transitions.every(row => obj(row) && id(row.id) && validAction(row.action)
    && typeof row.fromStatus === "string" && typeof row.toStatus === "string"
    && count(row.fromVersion) && version(row.toVersion) && id(row.actorPrincipalId)
    && iso(row.occurredAt) && optionalText(row.reason))) throw invalid();
  if (!body.coreCases.every(row => obj(row) && id(row.id) && ["Approval", "Confirmation"].includes(String(row.purpose))
    && version(row.openedRequestVersion) && id(row.coreApprovalCaseId) && id(row.coreApprovalStageId)
    && id(row.coreApprovalAssignmentId) && id(row.assigneePrincipalId) && id(row.policyVersionId)
    && version(row.policyVersionNumber) && iso(row.openedAt) && typeof row.state === "string"
    && version(row.version))) throw invalid();
  if (!body.coreDecisions.every(row => obj(row) && id(row.id) && id(row.manualPaymentDecisionId)
    && id(row.coreApprovalDecisionId) && validAction(row.manualAction) && id(row.actorPrincipalId)
    && iso(row.decidedAt) && ["Approve", "Return", "Reject", "Cancel"].includes(String(row.coreAction)))) throw invalid();
  if (body.people !== undefined && (!Array.isArray(body.people)
    || !body.people.every(row => obj(row) && id(row.principalId)
      && typeof row.displayName === "string" && row.displayName.trim().length > 0
      && row.displayName.length <= 300)
    || new Set(body.people.map(row => (row as { principalId: string }).principalId)).size !== body.people.length)) throw invalid();
  if (body.companyClock !== undefined && body.companyClock !== null
    && (!obj(body.companyClock) || typeof body.companyClock.date !== "string" || !date(body.companyClock.date)
      || typeof body.companyClock.timeZoneId !== "string"
      || !body.companyClock.timeZoneId.trim() || body.companyClock.timeZoneId.length > 100
      || !iso(body.companyClock.observedAtUtc))) throw invalid();
  if (body.sourceInvoice !== undefined && body.sourceInvoice !== null
    && (!obj(body.sourceInvoice) || !id(body.sourceInvoice.invoiceId)
      || body.sourceInvoice.invoiceId !== requestRow.supplierInvoiceId
      || !id(body.sourceInvoice.supplierId) || body.sourceInvoice.supplierId !== requestRow.supplierId
      || !id(body.sourceInvoice.branchId) || body.sourceInvoice.branchId !== requestRow.branchId
      || typeof body.sourceInvoice.invoiceNumber !== "string"
      || typeof body.sourceInvoice.displayName !== "string"
      || body.sourceInvoice.currencyCode !== requestRow.currencyCode
      || !exact(body.sourceInvoice.grossExact, true)
      || typeof body.sourceInvoice.invoiceDate !== "string" || !date(body.sourceInvoice.invoiceDate))) throw invalid();
  return { ...body, people: body.people ?? [], companyClock: body.companyClock ?? null,
    sourceInvoice: body.sourceInvoice ?? null } as unknown as ManualPaymentDetail;
}

function statusAfter(action: ManualPaymentAction): ManualPaymentStatus {
  switch (action) {
    case "Create": case "Revise": case "Return": return "Draft";
    case "Submit": return "PendingApproval";
    case "Approve": return "Approved";
    case "Reject": return "Rejected";
    case "Record": return "PaymentRecorded";
    case "Confirm": return "ConfirmedManually";
    case "Dispute": return "Disputed";
    case "Cancel": return "Cancelled";
  }
}
function cleanOptional(value: string | null, limit: number, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ManualPaymentApiError(422, `Enter a valid ${label}.`);
  if (!value.trim()) return null;
  if (value.trim().length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
    throw new ManualPaymentApiError(422, `Enter a valid ${label}.`);
  return value.trim();
}
function paymentAmount(value: string): string {
  if (typeof value !== "string") throw new ManualPaymentApiError(422, "Enter an exact amount as text.");
  try { return invoiceDecimal(value, true); }
  catch { throw new ManualPaymentApiError(422, "Enter a positive exact amount with up to four decimal places."); }
}
function assigned(draft: Pick<ManualPaymentCreate, "approverPrincipalId" | "recorderPrincipalId" | "confirmerPrincipalId">) {
  if (!id(draft.approverPrincipalId) || !id(draft.recorderPrincipalId) || !id(draft.confirmerPrincipalId)
    || draft.recorderPrincipalId === draft.confirmerPrincipalId)
    throw new ManualPaymentApiError(422, "Choose three valid payment participants.");
}
function draftBody(input: ManualPaymentCreate | ManualPaymentRevise) {
  assigned(input);
  const amount = paymentAmount(input.amountExact);
  return { amount, approverPrincipalId: input.approverPrincipalId,
    recorderPrincipalId: input.recorderPrincipalId, confirmerPrincipalId: input.confirmerPrincipalId,
    purpose: cleanOptional(input.purpose, 1000, "purpose"), title: cleanOptional(input.title, 200, "title") };
}
function date(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function transitionBody(action: Exclude<ManualPaymentAction, "Create" | "Revise">, input: ManualPaymentTransition) {
  if (!version(input.expectedVersion) || !Number.isSafeInteger(input.expectedVersion + 1))
    throw new ManualPaymentApiError(422, "Refresh this payment before changing it.");
  if (action === "Record") {
    if (!input.paidOn || !date(input.paidOn) || !input.externalMethod?.trim()
      || !input.externalReference?.trim() || !input.amountExact || input.reason != null
      || input.externalMethod.trim().length > 100 || input.externalReference.trim().length > 200)
      throw new ManualPaymentApiError(422, "Enter the external payment date, method, reference and exact amount.");
    return { expectedVersion: input.expectedVersion, paidOn: input.paidOn,
      externalMethod: input.externalMethod.trim(), externalReference: input.externalReference.trim(),
      amount: paymentAmount(input.amountExact), evidenceDocumentRefId: null };
  }
  if (input.paidOn !== undefined || input.externalMethod !== undefined
    || input.externalReference !== undefined || input.amountExact !== undefined)
    throw new ManualPaymentApiError(422, "This action does not accept payment execution details.");
  const requiresReason = ["Return", "Reject", "Dispute", "Cancel"].includes(action);
  const reason = input.reason?.trim() ?? null;
  if (requiresReason ? !reason || reason.length > 1000 : reason !== null)
    throw new ManualPaymentApiError(422, "Enter a reason for this payment action.");
  return { expectedVersion: input.expectedVersion, reason };
}
function commandPath(command: ManualPaymentCommand): { path: string; method: "POST" | "PUT"; body: string } {
  if (!id(command.key)) throw new ManualPaymentApiError(422, "Start a new payment command with a valid key.");
  if (command.action === "Create") {
    if (!id(command.input.branchId) || !id(command.input.invoiceId))
      throw new ManualPaymentApiError(422, "Choose an invoice and receiving branch.");
    return { path: "", method: "POST", body: JSON.stringify({ branchId: command.input.branchId,
      invoiceId: command.input.invoiceId, ...draftBody(command.input) }) };
  }
  if (!id(command.id)) throw new ManualPaymentApiError(422, "Choose a saved payment request.");
  if (command.action === "Revise") {
    if (!version(command.input.expectedVersion) || !Number.isSafeInteger(command.input.expectedVersion + 1))
      throw new ManualPaymentApiError(422, "Refresh this payment before editing it.");
    return { path: `/${command.id}`, method: "PUT", body: JSON.stringify({ expectedVersion: command.input.expectedVersion,
      ...draftBody(command.input) }) };
  }
  return { path: `/${command.id}/${command.action.toLowerCase()}`, method: "POST",
    body: JSON.stringify(transitionBody(command.action, command.input)) };
}

/** Send once for this user action. The caller retains the key and uses GET recovery if
 * the response is interrupted; this function never retries a mutation automatically. */
export async function sendManualPaymentCommand(scope: ManualPaymentScope,
  command: ManualPaymentCommand): Promise<ManualPaymentCommandResult> {
  const { path, method, body: payload } = commandPath(command);
  const response = await request(scope, path, { method, headers: { "Idempotency-Key": command.key }, body: payload });
  if (!obj(response) || !id(response.id) || !version(response.version)
    || !validStatus(response.status) || response.status !== statusAfter(command.action)
    || response.action !== command.action || response.commandKey !== command.key
    || !exact(response.amountExact, true)
    || command.action !== "Create" && (response.id !== command.id
      || response.version !== command.input.expectedVersion + 1)
    || command.action === "Create" && response.version !== 1) throw invalid();
  return response as ManualPaymentCommandResult;
}

/** Actor-owned GET receipt recovery. The returned status is historical, not Finance Paid. */
export async function recoverManualPaymentCommand(scope: ManualPaymentScope,
  locator: { key: string; action: ManualPaymentAction; id?: string }, signal?: AbortSignal): Promise<ManualPaymentReceipt> {
  if (!id(locator.key) || !validAction(locator.action)
    || (locator.action === "Create" ? locator.id !== undefined : !id(locator.id)))
    throw new ManualPaymentApiError(422, "Choose the original payment command key.");
  const path = locator.id ? `/${locator.id}/commands/${locator.key}` : `/commands/${locator.key}`;
  const body = await request(scope, path, { signal });
  if (!obj(body) || !id(body.id) || !version(body.version) || !validStatus(body.status)
    || body.status !== statusAfter(locator.action)
    || body.action !== locator.action || body.commandKey !== locator.key
    || locator.id && body.id !== locator.id) throw invalid();
  return body as ManualPaymentReceipt;
}

/** Lost Create response: recover by actor/key first, then fetch the current owning record.
 * The detail may have advanced beyond the historical Draft receipt. */
export async function recoverManualPaymentCreate(scope: ManualPaymentScope, key: string,
  signal?: AbortSignal): Promise<{ receipt: ManualPaymentReceipt; detail: ManualPaymentDetail }> {
  const receipt = await recoverManualPaymentCommand(scope, { key, action: "Create" }, signal);
  if (receipt.version !== 1 || receipt.status !== "Draft") throw invalid();
  const detail = await getManualPayment(scope, receipt.id, signal);
  if (detail.request.version < receipt.version) throw invalid();
  return { receipt, detail };
}

export type UnsupportedManualPaymentAction = "bank-execution" | "batch-payment" | "payment-upload";
export function manualPaymentActionAvailability(action: UnsupportedManualPaymentAction):
  { supported: false; reason: string } {
  return { supported: false, reason: action === "payment-upload"
    ? "Payment evidence upload is not connected yet. Record a reference instead."
    : action === "batch-payment" ? "Batch payments are not available in Procurement."
      : "Bank payment execution belongs to Finance and is not available here." };
}
