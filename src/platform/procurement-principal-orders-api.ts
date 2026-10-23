import { procurementScopeHeaders } from "../../shared/shell-scope";
import { encodeExactOrderDraft, type ExactOrderDraft } from "./procurement-order-execution-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact = /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/;
const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positiveInt = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const invalid = () => new PrincipalOrderError(0, "ERP returned incomplete order details. Refresh before taking an action.");
export class PrincipalOrderError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export type PrincipalOrderSummary = { id: string; number: string; status: string; version: number; supplierId: string;
  branchRef: string; currencyCode: string; supplierDisplayName?: string; branchDisplayName?: string;
  originalDirectSourceSha256?: string; issuedVersionId?: string | null };
export type PrincipalOrderPage = { items: PrincipalOrderSummary[]; total: number; page: number; pageSize: number };
export type PrincipalDisplayLine = { id: string; lineNumber: number; description: string; unitCode: string;
  quantity: string; unitPrice: string; taxAmount: string };
export type PrincipalOrderLine = PrincipalDisplayLine & { purchaseRequestId: string; allocationStatus: string };
export type PrincipalOrderDetail = PrincipalOrderSummary & { originalDirectSourceSha256: string;
  shipToRef: string | null; billToRef: string | null; paymentTermRef: string | null;
  expectedDeliveryOn: string | null; fundingRecorded: boolean; lines: PrincipalOrderLine[];
  release: { id: string; reason: string; state: string; requestedAt: string } | null;
  releaseConfirmation: { id: string; externalReleaseEvidenceReference: string; releasedGrossAmountExact: string; confirmedAt: string } | null };
export type PrincipalSource = { purchaseRequestId: string; purchaseRequestLineId: string; requestNumber: string;
  branchRef?: string | null; expectedRequestVersion?: number; description?: string; unitCode?: string;
  availableQuantity?: string; approvedUnitEstimate?: string; currencyCode?: string; canSelect: boolean; state?: string };
export type PrincipalSourcePage = { items: PrincipalSource[]; candidateTotal: number; page: number; pageSize: number };
export type PrincipalSupplier = { id: string; displayName: string; number: string };
export type PrincipalSupplierPage = { items: PrincipalSupplier[]; candidateTotal: number; page: number; pageSize: number;
  nextPage: number | null; previewOnly: true };
export type PrincipalFinanceDetail = PrincipalOrderSummary & { originalDirectSourceSha256: string;
  grossAmountExact: string; sourceReservationReferences: string[]; lines: PrincipalDisplayLine[];
  funding: { id: string; manualCommitmentReference: string; externalEvidenceReference: string;
    attestedGrossAmountExact: string; observedAt: string } | null;
  release: { id: string; reason: string; requestedAt: string } | null;
  canRecordFunding: boolean; canConfirmRelease: boolean };
export type PrincipalReview = PrincipalOrderSummary & { grossAmountExact: string;
  lineBaseAmountExact: string; commercialSnapshotJson: string; lines: PrincipalDisplayLine[];
  manualCommitmentReference: string;
  externalEvidenceReference: string; approvedManualPolicyReference: string;
  caseVersion: number; assignmentId: string; assignmentVersion: number; canDecide: boolean };
export type PrincipalApprovalSummary = PrincipalOrderSummary & { orderId: string; assignmentId: string;
  assignmentVersion: number; caseVersion: number; grossAmountExact: string; openedAt: string };
export type PrincipalFulfilmentDetail = PrincipalOrderSummary & { grossAmountExact: string;
  lines: PrincipalDisplayLine[];
  issuedVersionId: string | null; issuedAuthorizedAt: string | null;
  allowedManualResponseChannels: string[]; canIssue: boolean; canRecordSupplierResponse: boolean };
export type PrincipalOperation = "Create" | "Cancel" | "Funding" | "Submit" | "Decide" | "Issue" | "Ack" | "ReleaseRequest" | "ReleaseConfirm";
export type PrincipalCommand = { operation: PrincipalOperation; key: string; orderId: string | null; assignmentId?: string; body: string };
export type PrincipalReply = { orderId: string; number: string; status: string; version: number;
  originalDirectSourceSha256: string; commandKey: string; recordedHistoricalResult: true };

async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!uuid.test(company)) throw invalid();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/orders${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new PrincipalOrderError(0, "The response was interrupted. Check the command reference before trying again."); }
  let body: unknown;
  try { body = await response.json(); } catch { throw invalid(); }
  if (!response.ok) throw new PrincipalOrderError(response.status, response.status === 403 ? "You do not have access to this order action."
    : response.status === 404 ? "This order or task is not available in your current company and branch."
    : response.status === 409 ? "The order or its source evidence changed. Refresh and review it."
    : obj(body) && typeof body.message === "string" ? body.message : "This order action is unavailable.");
  return body;
}
function summary(value: unknown): value is PrincipalOrderSummary & Record<string, unknown> {
  return obj(value) && uuid.test(String(value.id)) && typeof value.number === "string"
    && typeof value.status === "string" && positiveInt(value.version) && uuid.test(String(value.supplierId))
    && uuid.test(String(value.branchRef)) && typeof value.currencyCode === "string";
}
function page(value: unknown): value is PrincipalOrderPage {
  return obj(value) && Array.isArray(value.items) && value.items.every(summary)
    && Number.isSafeInteger(value.total) && Number(value.total) >= 0
    && positiveInt(value.page) && positiveInt(value.pageSize);
}
function displayLines(value: unknown): value is PrincipalDisplayLine[] {
  return Array.isArray(value)&&value.length>0&&value.every(line=>obj(line)
    &&uuid.test(String(line.id))&&positiveInt(line.lineNumber)
    &&typeof line.description==="string"&&typeof line.unitCode==="string"
    &&exact.test(String(line.quantity))&&exact.test(String(line.unitPrice))&&exact.test(String(line.taxAmount)));
}
function orderLines(value: unknown): value is PrincipalOrderLine[] {
  return displayLines(value) && value.every(line => obj(line)
    && uuid.test(String(line.purchaseRequestId)) && typeof line.allocationStatus === "string");
}
export async function listPrincipalOrders(company: string, pageNumber: number, state: string, signal?: AbortSignal): Promise<PrincipalOrderPage> {
  const value = await call(company, `/principal-direct-drafts?page=${pageNumber}&pageSize=25${state ? `&state=${encodeURIComponent(state)}` : ""}`, { signal });
  if (!page(value)) throw invalid(); return value;
}
export async function listPrincipalFinanceWork(company: string, pageNumber: number, signal?: AbortSignal): Promise<PrincipalOrderPage> {
  const value = await call(company, `/principal-finance-work?page=${pageNumber}&pageSize=25`, { signal });
  if (!page(value)) throw invalid(); return value;
}
export async function listPrincipalFulfilmentWork(company: string, view: "issue" | "ack", pageNumber: number, signal?: AbortSignal): Promise<PrincipalOrderPage> {
  const value = await call(company, `/principal-fulfilment-work?view=${view}&page=${pageNumber}&pageSize=25`, { signal });
  if (!page(value)) throw invalid(); return value;
}
export async function listPrincipalApprovals(company: string, pageNumber: number, signal?: AbortSignal): Promise<{ items: PrincipalApprovalSummary[]; total: number; page: number; pageSize: number }> {
  const value = await call(company, `/principal-assigned-reviews?page=${pageNumber}&pageSize=25`, { signal });
  if (!obj(value) || !Array.isArray(value.items) || !value.items.every(row => obj(row) && uuid.test(String(row.orderId))
    && uuid.test(String(row.assignmentId)) && positiveInt(row.assignmentVersion) && positiveInt(row.caseVersion)
    && uuid.test(String(row.supplierId)) && uuid.test(String(row.branchRef)) && positiveInt(row.version)
    && typeof row.currencyCode === "string" && exact.test(String(row.grossAmountExact))
    && typeof row.number === "string" && typeof row.status === "string")
    || !Number.isSafeInteger(value.total) || Number(value.total)<0
    || !positiveInt(value.page) || !positiveInt(value.pageSize)) throw invalid();
  const rows = value as unknown as { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
  return { ...rows, items: rows.items.map(row => ({ ...row, id: row.orderId })) as unknown as PrincipalApprovalSummary[] };
}
export async function listPrincipalSources(company: string, pageNumber: number, signal?: AbortSignal): Promise<PrincipalSourcePage> {
  const value = await call(company, `/approved-principal-direct-sources?page=${pageNumber}&pageSize=25`, { signal });
  if (!obj(value) || !Array.isArray(value.items) || !value.items.every(row => obj(row)
    && uuid.test(String(row.purchaseRequestId)) && uuid.test(String(row.purchaseRequestLineId))
    && typeof row.requestNumber === "string" && typeof row.canSelect === "boolean"
    && (!row.canSelect || positiveInt(row.expectedRequestVersion) && exact.test(String(row.availableQuantity))
      && exact.test(String(row.approvedUnitEstimate)) && typeof row.currencyCode === "string"))
    || !Number.isSafeInteger(value.candidateTotal) || !positiveInt(value.page) || !positiveInt(value.pageSize)) throw invalid();
  return value as PrincipalSourcePage;
}
export async function listPrincipalSuppliers(company: string, pageNumber: number, search: string, signal?: AbortSignal): Promise<PrincipalSupplierPage> {
  const value=await call(company, `/principal-direct-suppliers?page=${pageNumber}&pageSize=25${search?`&q=${encodeURIComponent(search)}`:""}`, { signal });
  if(!obj(value)||!Array.isArray(value.items)||!value.items.every(row=>obj(row)&&uuid.test(String(row.id))
    &&typeof row.displayName==="string"&&typeof row.number==="string")
    ||!Number.isSafeInteger(value.candidateTotal)||Number(value.candidateTotal)<0
    ||!positiveInt(value.page)||!positiveInt(value.pageSize)
    ||!(value.nextPage===null||positiveInt(value.nextPage))||value.previewOnly!==true)throw invalid();
  return value as PrincipalSupplierPage;
}
export async function getPrincipalOrder(company: string, id: string, signal?: AbortSignal): Promise<PrincipalOrderDetail> {
  if (!uuid.test(id)) throw invalid();
  const value = await call(company, `/${id}/principal-direct-draft`, { signal });
  if (!summary(value) || value.id !== id || typeof value.supplierDisplayName !== "string"
    || typeof value.branchDisplayName !== "string" || !orderLines(value.lines)
    || typeof value.fundingRecorded !== "boolean") throw invalid();
  return value as PrincipalOrderDetail;
}
export async function getPrincipalFinanceDetail(company: string, id: string, signal?: AbortSignal): Promise<PrincipalFinanceDetail> {
  const value = await call(company, `/${id}/principal-finance-detail`, { signal });
  if (!summary(value) || value.id !== id || typeof value.supplierDisplayName !== "string"
    || typeof value.branchDisplayName !== "string" || !exact.test(String(value.grossAmountExact))
    || !displayLines(value.lines)
    || !stringList(value.sourceReservationReferences) || !obj(value.funding) && value.funding !== null
    || !obj(value.release) && value.release !== null || typeof value.canRecordFunding !== "boolean"
    || typeof value.canConfirmRelease !== "boolean") throw invalid();
  return value as PrincipalFinanceDetail;
}
export async function getPrincipalReview(company: string, id: string, assignmentId: string, signal?: AbortSignal): Promise<PrincipalReview> {
  const value = await call(company, `/${id}/principal-review/${assignmentId}`, { signal });
  if (!summary(value) || value.id !== id || value.assignmentId !== assignmentId
    || typeof value.supplierDisplayName !== "string" || typeof value.branchDisplayName !== "string"
    || !displayLines(value.lines)
    || !positiveInt(value.caseVersion) || !positiveInt(value.assignmentVersion)
    || !exact.test(String(value.grossAmountExact)) || typeof value.commercialSnapshotJson !== "string"
    || typeof value.canDecide !== "boolean") throw invalid();
  return value as PrincipalReview;
}
export async function getPrincipalFulfilmentDetail(company: string, id: string, view: "issue" | "ack", signal?: AbortSignal): Promise<PrincipalFulfilmentDetail> {
  const value = await call(company, `/${id}/principal-fulfilment-detail?view=${view}`, { signal });
  if (!summary(value) || value.id !== id || typeof value.supplierDisplayName !== "string"
    || typeof value.branchDisplayName !== "string" || !exact.test(String(value.grossAmountExact))
    || !displayLines(value.lines)
    || !stringList(value.allowedManualResponseChannels) || typeof value.canIssue !== "boolean"
    || typeof value.canRecordSupplierResponse !== "boolean"
    || view === "ack" && !uuid.test(String(value.issuedVersionId))) throw invalid();
  return value as PrincipalFulfilmentDetail;
}
export function exactJson(fields: Record<string, unknown>, amounts: Record<string, string>): string {
  const entries = Object.entries(fields).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  for (const [key, amount] of Object.entries(amounts)) {
    if (!exact.test(amount) || Object.hasOwn(fields, key)) throw invalid();
    entries.push(`${JSON.stringify(key)}:${amount}`);
  }
  return `{${entries.join(",")}}`;
}
export function createPrincipalBody(draft: ExactOrderDraft, sources: PrincipalSource[]): string {
  if (!sources.length || sources.length !== draft.lines.length) throw invalid();
  const selected = sources.map((source, draftLineIndex) => {
    if (!source.canSelect || !uuid.test(source.purchaseRequestId) || !uuid.test(source.purchaseRequestLineId)
      || !positiveInt(source.expectedRequestVersion)) throw invalid();
    return { draftLineIndex, purchaseRequestId: source.purchaseRequestId,
      purchaseRequestLineId: source.purchaseRequestLineId, expectedRequestVersion: source.expectedRequestVersion };
  });
  return `{"draft":${encodeExactOrderDraft(draft)},"sources":${JSON.stringify(selected)}}`;
}
const routes: Record<PrincipalOperation, (command: PrincipalCommand) => string> = {
  Create: () => "/from-approved-principal-direct-sources",
  Cancel: command => `/${command.orderId}/principal-direct-cancel`,
  Funding: command => `/${command.orderId}/principal-funding`,
  Submit: command => `/${command.orderId}/principal-submit`,
  Decide: command => `/${command.orderId}/principal-decisions/${command.assignmentId}`,
  Issue: command => `/${command.orderId}/principal-issue`,
  Ack: command => `/${command.orderId}/principal-acknowledgment`,
  ReleaseRequest: command => `/${command.orderId}/principal-release-request`,
  ReleaseConfirm: command => `/${command.orderId}/principal-release-confirmation`,
};
function reply(value: unknown, command: PrincipalCommand): PrincipalReply {
  if (!obj(value) || !uuid.test(String(value.orderId)) || !positiveInt(value.version)
    || value.commandKey !== command.key || value.recordedHistoricalResult !== true
    || typeof value.number !== "string" || typeof value.status !== "string"
    || typeof value.originalDirectSourceSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(value.originalDirectSourceSha256)
    || command.orderId !== null && value.orderId !== command.orderId) throw invalid();
  return value as PrincipalReply;
}
export async function sendPrincipalCommand(company: string, command: PrincipalCommand): Promise<PrincipalReply> {
  if (!uuid.test(command.key) || command.operation !== "Create" && !uuid.test(command.orderId ?? "")
    || command.operation === "Decide" && !uuid.test(command.assignmentId ?? "")) throw invalid();
  return reply(await call(company, routes[command.operation](command), {
    method: "POST", headers: { "Idempotency-Key": command.key }, body: command.body,
  }), command);
}
export async function recoverPrincipalCommand(company: string, command: PrincipalCommand): Promise<PrincipalReply> {
  const value = await call(company, `/principal-direct-command-receipts/${command.operation}/${command.key}`);
  if (!obj(value) || value.operation !== command.operation || value.commandKey !== command.key
    || value.recordedHistoricalResult !== true || typeof value.responseJson !== "string"
    || value.originalStatusCode !== (["Create","Submit","Issue"].includes(command.operation)?201:200)) throw invalid();
  let historic: unknown; try { historic = JSON.parse(value.responseJson); } catch { throw invalid(); }
  return reply(historic, command);
}
