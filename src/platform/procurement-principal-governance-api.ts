import { procurementScopeHeaders } from "../../shared/shell-scope";

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/i;
const lineMoney = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const grossMoney = /^(?:0|[1-9]\d{0,29})(?:\.\d{1,8})?$/;
const operations = ["Funding", "Submit", "Decide", "Issue", "Ack", "ReleaseRequest", "ReleaseConfirm"] as const;
const statuses = ["Draft", "PendingApproval", "Approved", "Returned", "Rejected", "IssuePending",
  "Issued", "Disputed", "ReleasePending", "Cancelled"] as const;
export type GovernanceOperation = typeof operations[number];
export type GovernanceStatus = "Draft" | "PendingApproval" | "Approved" | "Returned" | "Rejected"
  | "IssuePending" | "Issued" | "Disputed" | "ReleasePending" | "Cancelled";
export type GovernanceCommand = { operation: GovernanceOperation; key: string; orderId: string;
  assignmentId: string | null; expectedOriginalDirectSourceSha256: string; body: string };
export type GovernanceReply = { schemaVersion: 2; operation: GovernanceOperation; orderId: string;
  number: string; status: GovernanceStatus; version: number; originalDirectSourceSha256: string;
  commandKey: string; evidenceId: string; recordedHistoricalResult: true;
  manualFundingOnly: true; financeReservationChanged: false; supplierSendPerformed: false };
export type GovernedOrderLine = { id: string; lineNumber: number; description: string; unitCode: string;
  quantity: string; unitPrice: string; taxAmount: string; purchaseRequestId: string;
  purchaseRequestLineId: string; allocationStatus: "Reserved" | "Ordered" | "Released" };
export type GovernedOrderSummary = { id: string; number: string; supplierId: string; branchRef: string;
  currencyCode: string; status: GovernanceStatus; version: number; currentRevision: number;
  createdAt: string; originalDirectSourceSha256: string };
export type GovernedOrderPage = { items: GovernedOrderSummary[]; total: number; page: number;
  pageSize: number; schemaVersion: 2; readOnlyPreview: true };
export type GovernanceOperationWork = "Issue" | "Ack";
export type GovernanceOperationWorkItem = { id: string; number: string; supplierId: string;
  branchRef: string; currencyCode: string; status: "Approved" | "IssuePending";
  version: number; currentRevision: 1 };
export type GovernanceOperationWorkPage = { items: GovernanceOperationWorkItem[]; total: number;
  page: number; pageSize: number; operation: GovernanceOperationWork;
  detailEligibilityRequired: true; readOnlyPreview: true };
export type GovernedBuyerOrder = { schemaVersion: 2; id: string; number: string; status: GovernanceStatus;
  version: number; currentRevision: number; originalDirectSourceSha256: string;
  supplierId: string; supplierDisplayName: string | null; branchRef: string;
  branchDisplayName: string | null; currencyCode: string; grossAmountExact: string;
  lines: GovernedOrderLine[]; funding: { id: string; manualCommitmentReference: string;
    externalEvidenceReference: string; approvedManualPolicyReference: string; observedAt: string } | null;
  submission: { id: string; coreApprovalCaseId: string; submittedAt: string;
    caseState: string; caseVersion: number } | null;
  issuedVersion: { id: string; authorizedAt: string } | null;
  acknowledgment: { id: string; outcome: string; channel: string; supplierReference: string;
    observedAt: string } | null;
  release: { id: string; reason: string; requestedAt: string; confirmed: boolean } | null;
  canSubmit: boolean; canIssue: boolean; canCancelDraft: boolean; canRequestRelease: boolean;
  canRecordAcknowledgment: boolean; allowedDeliveryChannels: string[];
  actionEligibilityIsCurrentPreview: true; actionsRevalidatedOnSave: true;
  manualExternalEvidenceOnly: true; financeLedgerChanged: false; supplierSendPerformed: false };
export type FinanceWorkItem = { id: string; number: string; supplierId: string; branchRef: string;
  currencyCode: string; status: "Draft" | "ReleasePending"; version: number;
  grossAmountExact: string; releaseRequestId: string | null; task: string;
  externalFinanceEvidenceRequired: true; previewOnly: true };
export type FinanceWorkPage = { items: FinanceWorkItem[]; total: number; page: number;
  pageSize: number; manualExternalEvidenceOnly: true; financeLedgerChanged: false };
export type FinanceOrderDetail = { id: string; number: string; status: "Draft" | "ReleasePending";
  version: number; branchRef: string; currencyCode: string; originalDirectSourceSha256: string;
  grossAmountExact: string; sourceReservationReferences: string[]; canRecordFunding: boolean;
  canConfirmRelease: boolean; previewOnly: true; financeLedgerChanged: false;
  funding: { id: string; manualCommitmentReference: string; externalEvidenceReference: string;
    approvedManualPolicyReference: string; observedAt: string; attestedGrossAmountExact: string } | null;
  release: { id: string; reason: string; requestedAt: string;
    requestedByPrincipalId: string; originalDirectSourceSha256: string } | null };
export type AssignedOrderReview = { orderId: string; number: string; status: "PendingApproval";
  version: number; branchRef: string; assignmentId: string; assignmentVersion: number;
  caseId: string; caseVersion: number; openedAt: string; grossAmountExact: string };
export type AssignedOrderReviewPage = { items: AssignedOrderReview[]; total: number; page: number;
  pageSize: number; assignedToCurrentPrincipal: true; financePostingCreated: false;
  supplierSendPerformed: false };
export type OrderReviewDetail = { id: string; number: string; status: GovernanceStatus;
  version: number; originalDirectSourceSha256: string;
  assignmentId: string; assignmentVersion: number;
  coreCaseId: string; caseVersion: number; caseState: string;
  canApprove: boolean; canReturn: boolean; canReject: boolean;
  approvalNeedsReview: boolean; financePostingCreated: false; supplierSendPerformed: false };

export type FundingInput = { expectedOrderVersion: number; manualCommitmentReference: string;
  externalEvidenceReference: string; currencyCode: string; attestedGrossAmount: string;
  sourceReservationReferences: string[]; observedAt: string };
export type VersionInput = { expectedOrderVersion: number };
export type DecisionInput = { action: "Approve" | "Return" | "Reject"; reason: string | null;
  expectedOrderVersion: number; expectedCaseVersion: number; expectedAssignmentVersion: number };
export type AcknowledgmentInput = { expectedOrderVersion: number; issuedVersionId: string;
  outcome: "Accepted" | "Rejected"; channel: string; supplierReference: string;
  evidenceReference: string; observedAt: string };
export type ReleaseRequestInput = { expectedOrderVersion: number; originalDirectSourceSha256: string;
  reason: string };
export type ReleaseConfirmationInput = { expectedOrderVersion: number; releaseRequestId: string;
  externalReleaseEvidenceReference: string; currencyCode: string; releasedGrossAmount: string;
  restoredSourceReservationReferences: string[]; confirmedAt: string };
export type GovernanceInput = FundingInput | VersionInput | DecisionInput | AcknowledgmentInput
  | ReleaseRequestInput | ReleaseConfirmationInput;

export class GovernanceApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && guid.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const positiveVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const exactNonnegativeGross = (value: unknown): value is string => typeof value === "string"
  && grossMoney.test(value);
const text = (value: unknown, max: number) => typeof value === "string"
  && value.trim() === value && value.length > 0 && value.length <= max;
const iso = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const currency = (value: unknown) => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const nullableLabel = (value: unknown) => value === null || typeof value === "string";
const references = (value: unknown) => Array.isArray(value) && value.length > 0
  && value.length <= 100 && value.every(row => text(row, 200))
  && new Set(value).size === value.length
  && value.every((row, index) => index === 0 || value[index - 1] < row);
const invalid = () => new GovernanceApiError(0, "The ERP returned an invalid governed order response. Keep the original command key.");
const inputKeys: Record<GovernanceOperation, readonly string[]> = {
  Funding: ["expectedOrderVersion", "manualCommitmentReference", "externalEvidenceReference",
    "currencyCode", "attestedGrossAmount", "sourceReservationReferences", "observedAt"],
  Submit: ["expectedOrderVersion"], Decide: ["action", "reason", "expectedOrderVersion",
    "expectedCaseVersion", "expectedAssignmentVersion"], Issue: ["expectedOrderVersion"],
  Ack: ["expectedOrderVersion", "issuedVersionId", "outcome", "channel", "supplierReference",
    "evidenceReference", "observedAt"],
  ReleaseRequest: ["expectedOrderVersion", "originalDirectSourceSha256", "reason"],
  ReleaseConfirm: ["expectedOrderVersion", "releaseRequestId", "externalReleaseEvidenceReference",
    "currencyCode", "releasedGrossAmount", "restoredSourceReservationReferences", "confirmedAt"],
};

function inputValid(operation: GovernanceOperation, value: unknown): boolean {
  if (!object(value) || !positiveVersion(value.expectedOrderVersion)
    || Object.keys(value).sort().join("|") !== [...inputKeys[operation]].sort().join("|")) return false;
  switch (operation) {
    case "Funding": return text(value.manualCommitmentReference, 200)
      && text(value.externalEvidenceReference, 500) && currency(value.currencyCode)
      && exactNonnegativeGross(value.attestedGrossAmount) && references(value.sourceReservationReferences)
      && iso(value.observedAt);
    case "Submit": case "Issue": return Object.keys(value).length === 1;
    case "Decide": return (value.action === "Approve" || value.action === "Return" || value.action === "Reject")
      && positiveVersion(value.expectedCaseVersion) && positiveVersion(value.expectedAssignmentVersion)
      && (value.action === "Approve" ? value.reason === null || value.reason === ""
          || text(value.reason, 2000)
        : text(value.reason, 2000));
    case "Ack": return id(value.issuedVersionId) && (value.outcome === "Accepted" || value.outcome === "Rejected")
      && text(value.channel, 100) && text(value.supplierReference, 200)
      && text(value.evidenceReference, 500) && iso(value.observedAt);
    case "ReleaseRequest": return typeof value.originalDirectSourceSha256 === "string"
      && digest.test(value.originalDirectSourceSha256) && text(value.reason, 2000);
    case "ReleaseConfirm": return id(value.releaseRequestId)
      && text(value.externalReleaseEvidenceReference, 500) && currency(value.currencyCode)
      && exactNonnegativeGross(value.releasedGrossAmount) && references(value.restoredSourceReservationReferences)
      && iso(value.confirmedAt);
  }
}

export function encodeGovernanceBody(operation: "Funding", input: FundingInput): string;
export function encodeGovernanceBody(operation: "Submit" | "Issue", input: VersionInput): string;
export function encodeGovernanceBody(operation: "Decide", input: DecisionInput): string;
export function encodeGovernanceBody(operation: "Ack", input: AcknowledgmentInput): string;
export function encodeGovernanceBody(operation: "ReleaseRequest", input: ReleaseRequestInput): string;
export function encodeGovernanceBody(operation: "ReleaseConfirm", input: ReleaseConfirmationInput): string;
export function encodeGovernanceBody(operation: GovernanceOperation, input: GovernanceInput): string {
  if (!inputValid(operation, input)) throw invalid();
  return JSON.stringify(input);
}

export function validGovernanceCommand(value: unknown): value is GovernanceCommand {
  if (!object(value) || !operations.includes(value.operation as GovernanceOperation)
    || !id(value.key) || !id(value.orderId)
    || typeof value.expectedOriginalDirectSourceSha256 !== "string"
    || !digest.test(value.expectedOriginalDirectSourceSha256)
    || (value.operation === "Decide" ? !id(value.assignmentId) : value.assignmentId !== null)
    || typeof value.body !== "string" || value.body.length > 20_000) return false;
  try {
    const parsed: unknown = JSON.parse(value.body);
    return inputValid(value.operation as GovernanceOperation, parsed)
      && (value.operation !== "ReleaseRequest" || object(parsed)
        && parsed.originalDirectSourceSha256 === value.expectedOriginalDirectSourceSha256)
      && JSON.stringify(parsed) === value.body;
  } catch { return false; }
}

function route(command: GovernanceCommand): string {
  const root = `/${command.orderId}`;
  switch (command.operation) {
    case "Funding": return root + "/principal-funding";
    case "Submit": return root + "/principal-submit";
    case "Decide": return root + `/principal-decisions/${command.assignmentId}`;
    case "Issue": return root + "/principal-issue";
    case "Ack": return root + "/principal-acknowledgment";
    case "ReleaseRequest": return root + "/principal-release-request";
    case "ReleaseConfirm": return root + "/principal-release-confirmation";
  }
}
const allowedStatus: Record<GovernanceOperation, readonly GovernanceStatus[]> = {
  Funding: ["Draft"], Submit: ["PendingApproval"],
  Decide: ["PendingApproval", "Approved", "Returned", "Rejected"],
  Issue: ["IssuePending"], Ack: ["Issued", "Disputed"],
  ReleaseRequest: ["ReleasePending"], ReleaseConfirm: ["Cancelled"],
};
const originalStatus = (operation: GovernanceOperation) => operation === "Submit" || operation === "Issue" ? 201 : 200;

async function call(company: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  if (!id(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/orders${path}`,
    { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new GovernanceApiError(0, "The response was interrupted. Check the original command key."); }
  let body: unknown;
  try { body = await response.json(); } catch { throw invalid(); }
  if (!response.ok) throw new GovernanceApiError(response.status,
    response.status === 403 ? "You do not have access to this governed order action."
      : response.status === 404 ? "This governed order or command is unavailable to this actor."
        : object(body) && typeof body.message === "string" ? body.message : "The governed order action was not confirmed.");
  return { status: response.status, body };
}

function reply(value: unknown, command: GovernanceCommand): value is GovernanceReply {
  return object(value) && Object.keys(value).length === 13 && value.schemaVersion === 2
    && value.operation === command.operation && value.orderId === command.orderId
    && text(value.number, 100) && allowedStatus[command.operation].includes(value.status as GovernanceStatus)
    && positiveVersion(value.version) && typeof value.originalDirectSourceSha256 === "string"
    && value.originalDirectSourceSha256 === command.expectedOriginalDirectSourceSha256
    && value.commandKey === command.key
    && id(value.evidenceId) && value.recordedHistoricalResult === true
    && value.manualFundingOnly === true && value.financeReservationChanged === false
    && value.supplierSendPerformed === false;
}

/** One POST only. The caller must claim the durable journal before calling this. */
export async function sendGovernanceCommand(company: string, command: GovernanceCommand): Promise<GovernanceReply> {
  if (!validGovernanceCommand(command)) throw invalid();
  const { status, body } = await call(company, route(command), { method: "POST", body: command.body,
    headers: { "Idempotency-Key": command.key } });
  if (status !== originalStatus(command.operation) || !reply(body, command)) throw invalid();
  return body;
}

/** Read only: this never resends the original business command. */
export async function recoverGovernanceCommand(company: string, command: GovernanceCommand): Promise<GovernanceReply> {
  if (!validGovernanceCommand(command)) throw invalid();
  const { status, body } = await call(company,
    `/principal-governance-command-receipts/${command.operation}/${command.key}`);
  if (status !== 200 || !object(body) || Object.keys(body).length !== 8
    || body.operation !== command.operation || body.commandKey !== command.key
    || body.originalStatusCode !== originalStatus(command.operation)
    || body.recordedHistoricalResult !== true || body.historicalOnly !== true
    || body.financeReservationChanged !== false || body.supplierSendPerformed !== false
    || typeof body.responseJson !== "string") throw invalid();
  let historical: unknown;
  try { historical = JSON.parse(body.responseJson); } catch { throw invalid(); }
  if (!reply(historical, command)) throw invalid();
  return historical;
}

function summary(value: unknown): value is GovernedOrderSummary {
  return object(value) && id(value.id) && text(value.number, 100) && id(value.supplierId)
    && id(value.branchRef) && currency(value.currencyCode)
    && typeof value.status === "string" && statuses.includes(value.status as GovernanceStatus)
    && positiveVersion(value.version) && Number.isSafeInteger(value.currentRevision)
    && Number(value.currentRevision) >= 0 && iso(value.createdAt)
    && typeof value.originalDirectSourceSha256 === "string"
    && digest.test(value.originalDirectSourceSha256);
}

export async function listGovernedBuyerOrders(company: string, page: number,
  state?: GovernanceStatus, signal?: AbortSignal): Promise<GovernedOrderPage> {
  if (!positiveVersion(page) || state !== undefined && !statuses.includes(state)) throw invalid();
  const query = `?page=${page}&pageSize=25${state ? `&state=${state}` : ""}`;
  const { body } = await call(company, `/principal-governed-orders${query}`, { signal });
  if (!object(body) || body.schemaVersion !== 2 || body.readOnlyPreview !== true
    || !Array.isArray(body.items) || !body.items.every(summary)
    || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || body.page !== page || !positiveVersion(body.pageSize)) throw invalid();
  return body as unknown as GovernedOrderPage;
}

/** Issue and acknowledgment actors get their own scoped task directory. */
export async function listGovernanceOperationWork(company: string, operation: GovernanceOperationWork,
  page: number, signal?: AbortSignal): Promise<GovernanceOperationWorkPage> {
  if (!positiveVersion(page) || (operation !== "Issue" && operation !== "Ack")) throw invalid();
  const { body } = await call(company,
    `/principal-operation-work?operation=${operation}&page=${page}&pageSize=25`, { signal });
  if (!pageValid(body, page) || body.operation !== operation
    || body.detailEligibilityRequired !== true || body.readOnlyPreview !== true
    || !(body.items as unknown[]).every(row => object(row) && id(row.id)
      && text(row.number, 100) && id(row.supplierId) && id(row.branchRef)
      && currency(row.currencyCode) && row.status === (operation === "Issue" ? "Approved" : "IssuePending")
      && positiveVersion(row.version) && row.currentRevision === 1)) throw invalid();
  return body as unknown as GovernanceOperationWorkPage;
}

function pageValid(value: unknown, page: number): value is Record<string, unknown> {
  return object(value) && Array.isArray(value.items) && !value.items.some(row => !object(row))
    && Number.isSafeInteger(value.total) && Number(value.total) >= 0
    && value.page === page && positiveVersion(value.pageSize);
}

/** Purpose-only Finance queue; it does not require buyer PO read. */
export async function listPrincipalFinanceWork(company: string, page: number,
  signal?: AbortSignal): Promise<FinanceWorkPage> {
  if (!positiveVersion(page)) throw invalid();
  const { body } = await call(company, `/principal-finance-work?page=${page}&pageSize=25`, { signal });
  if (!pageValid(body, page) || body.manualExternalEvidenceOnly !== true
    || body.financeLedgerChanged !== false || !(body.items as unknown[]).every(row => object(row)
      && id(row.id) && text(row.number, 100) && id(row.branchRef)
      && (row.status === "Draft" || row.status === "ReleasePending")
      && positiveVersion(row.version) && typeof row.grossAmountExact === "string"
      && grossMoney.test(row.grossAmountExact)
      && (row.releaseRequestId === null || id(row.releaseRequestId))
      && row.externalFinanceEvidenceRequired === true && row.previewOnly === true)) throw invalid();
  return body as unknown as FinanceWorkPage;
}

export async function getPrincipalFinanceDetail(company: string, orderId: string,
  signal?: AbortSignal): Promise<FinanceOrderDetail> {
  if (!id(orderId)) throw invalid();
  const { body } = await call(company, `/${orderId}/principal-finance-detail`, { signal });
  if (!object(body) || body.id !== orderId || !text(body.number, 100)
    || (body.status !== "Draft" && body.status !== "ReleasePending")
    || !positiveVersion(body.version) || !id(body.branchRef) || !currency(body.currencyCode)
    || typeof body.originalDirectSourceSha256 !== "string" || !digest.test(body.originalDirectSourceSha256)
    || typeof body.grossAmountExact !== "string" || !grossMoney.test(body.grossAmountExact)
    || !references(body.sourceReservationReferences)
    || typeof body.canRecordFunding !== "boolean"
    || typeof body.canConfirmRelease !== "boolean"
    || body.canRecordFunding && body.status !== "Draft"
    || body.canConfirmRelease && body.status !== "ReleasePending"
    || body.previewOnly !== true || body.financeLedgerChanged !== false
    || !(body.funding === null || object(body.funding) && id(body.funding.id)
      && text(body.funding.manualCommitmentReference, 200)
      && text(body.funding.externalEvidenceReference, 500)
      && typeof body.funding.attestedGrossAmountExact === "string"
      && grossMoney.test(body.funding.attestedGrossAmountExact))
    || !(body.release === null || object(body.release) && id(body.release.id)
      && text(body.release.reason, 2000) && id(body.release.requestedByPrincipalId))) throw invalid();
  return body as unknown as FinanceOrderDetail;
}

/** The named Core assignment, not a broad order directory, drives reviewer entry. */
export async function listPrincipalAssignedReviews(company: string, page: number,
  signal?: AbortSignal): Promise<AssignedOrderReviewPage> {
  if (!positiveVersion(page)) throw invalid();
  const { body } = await call(company, `/principal-assigned-reviews?page=${page}&pageSize=25`, { signal });
  if (!pageValid(body, page) || body.assignedToCurrentPrincipal !== true
    || body.financePostingCreated !== false || body.supplierSendPerformed !== false
    || !(body.items as unknown[]).every(row => object(row) && id(row.orderId)
      && text(row.number, 100) && row.status === "PendingApproval"
      && positiveVersion(row.version) && id(row.branchRef) && id(row.assignmentId)
      && positiveVersion(row.assignmentVersion) && id(row.caseId)
      && positiveVersion(row.caseVersion) && iso(row.openedAt)
      && typeof row.grossAmountExact === "string" && grossMoney.test(row.grossAmountExact)))
    throw invalid();
  return body as unknown as AssignedOrderReviewPage;
}

export async function getPrincipalReview(company: string, orderId: string, assignmentId: string,
  signal?: AbortSignal): Promise<OrderReviewDetail> {
  if (!id(orderId) || !id(assignmentId)) throw invalid();
  const { body } = await call(company, `/${orderId}/principal-review/${assignmentId}`, { signal });
  if (!object(body) || body.id !== orderId || body.assignmentId !== assignmentId
    || !text(body.number, 100) || !positiveVersion(body.version)
    || typeof body.originalDirectSourceSha256 !== "string"
    || !digest.test(body.originalDirectSourceSha256)
    || typeof body.status !== "string" || !statuses.includes(body.status as GovernanceStatus)
    || !id(body.coreCaseId) || !positiveVersion(body.caseVersion)
    || !positiveVersion(body.assignmentVersion)
    || !["canApprove", "canReturn", "canReject", "approvalNeedsReview"]
      .every(field => typeof body[field] === "boolean")
    || body.financePostingCreated !== false || body.supplierSendPerformed !== false) throw invalid();
  return body as unknown as OrderReviewDetail;
}

function governedOrderDetail(body: unknown, orderId: string): GovernedBuyerOrder {
  if (!object(body) || body.schemaVersion !== 2 || body.id !== orderId || !positiveVersion(body.version)
    || typeof body.status !== "string" || !statuses.includes(body.status as GovernanceStatus)
    || !text(body.number, 100) || !Number.isSafeInteger(body.currentRevision)
    || Number(body.currentRevision) < 0 || !id(body.supplierId) || !id(body.branchRef)
    || !nullableLabel(body.supplierDisplayName) || !nullableLabel(body.branchDisplayName)
    || !currency(body.currencyCode) || typeof body.grossAmountExact !== "string"
    || !grossMoney.test(body.grossAmountExact)
    || typeof body.originalDirectSourceSha256 !== "string" || !digest.test(body.originalDirectSourceSha256)
    || !Array.isArray(body.lines) || body.lines.length === 0
    || !body.lines.every(line => object(line) && id(line.id) && positiveVersion(line.lineNumber)
      && id(line.purchaseRequestId) && id(line.purchaseRequestLineId)
      && text(line.description, 500) && text(line.unitCode, 50)
      && typeof line.quantity === "string" && lineMoney.test(line.quantity)
      && typeof line.unitPrice === "string" && lineMoney.test(line.unitPrice)
      && typeof line.taxAmount === "string" && lineMoney.test(line.taxAmount)
      && (line.allocationStatus === "Reserved" || line.allocationStatus === "Ordered"
        || line.allocationStatus === "Released"))
    || !(body.funding === null || object(body.funding) && id(body.funding.id)
      && text(body.funding.manualCommitmentReference, 200)
      && text(body.funding.externalEvidenceReference, 500)
      && text(body.funding.approvedManualPolicyReference, 500) && iso(body.funding.observedAt))
    || !(body.submission === null || object(body.submission) && id(body.submission.id)
      && id(body.submission.coreApprovalCaseId) && iso(body.submission.submittedAt)
      && typeof body.submission.caseState === "string" && positiveVersion(body.submission.caseVersion))
    || !(body.issuedVersion === null || object(body.issuedVersion)
      && id(body.issuedVersion.id) && iso(body.issuedVersion.authorizedAt))
    || !(body.acknowledgment === null || object(body.acknowledgment)
      && id(body.acknowledgment.id) && (body.acknowledgment.outcome === "Accepted"
        || body.acknowledgment.outcome === "Rejected")
      && text(body.acknowledgment.channel, 100)
      && text(body.acknowledgment.supplierReference, 200) && iso(body.acknowledgment.observedAt))
    || !(body.release === null || object(body.release) && id(body.release.id)
      && text(body.release.reason, 2000) && iso(body.release.requestedAt)
      && typeof body.release.confirmed === "boolean")
    || !Array.isArray(body.allowedDeliveryChannels)
    || !body.allowedDeliveryChannels.every(channel => text(channel, 100))
    || !["canSubmit", "canIssue", "canCancelDraft", "canRequestRelease", "canRecordAcknowledgment"]
      .every(field => typeof body[field] === "boolean")
    || body.actionEligibilityIsCurrentPreview !== true || body.actionsRevalidatedOnSave !== true
    || body.manualExternalEvidenceOnly !== true || body.financeLedgerChanged !== false
    || body.supplierSendPerformed !== false) throw invalid();
  return body as unknown as GovernedBuyerOrder;
}

export async function getGovernedBuyerOrder(company: string, orderId: string,
  signal?: AbortSignal): Promise<GovernedBuyerOrder> {
  if (!id(orderId)) throw invalid();
  const { body } = await call(company, `/${orderId}/principal-governed-detail`, { signal });
  return governedOrderDetail(body, orderId);
}

/** Task detail uses the same owned order evidence without granting buyer PO read. */
export async function getGovernanceOperationDetail(company: string, orderId: string,
  operation: GovernanceOperationWork, signal?: AbortSignal): Promise<GovernedBuyerOrder> {
  if (!id(orderId) || (operation !== "Issue" && operation !== "Ack")) throw invalid();
  const { body } = await call(company,
    `/${orderId}/principal-operation-detail?operation=${operation}`, { signal });
  const detail = governedOrderDetail(body, orderId);
  if (detail.status !== (operation === "Issue" ? "Approved" : "IssuePending")) throw invalid();
  return detail;
}
