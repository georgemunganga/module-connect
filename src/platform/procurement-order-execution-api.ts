import { procurementScopeHeaders } from "../../shared/shell-scope";

export type WorklistView = "buyer" | "finance" | "dispatch";
export type OrderAction = "Finance" | "DraftFinanceRelease" | "FinanceRelease" | "Submit" | "Issue" | "Delivery";
export type ExecutionOrderSummary = { id: string; number: string; supplierId: string; supplierName: string | null; branchRef: string | null;
  status: string; currencyCode: string; version: number; currentRevision: number; expectedDeliveryOn: string | null };
export type ExecutionOrderPage = { items: ExecutionOrderSummary[]; total: number; page: number; pageSize: number; view: WorklistView };
export type ExecutionLine = { id: string; lineNumber: number; description: string; unitCode: string; quantity: string; unitPrice: string;
  taxAmount: string; acceptedQuantity: string; invoicedQuantity: string; sourcePurchaseRequestLineId: string; costCenterRef?: string | null; projectRef?: string | null; expectedDeliveryOn?: string | null };
export type OrderCandidate = { code: string; permission: string; canStart: boolean; blockers: string[]; requiresCommandValidation: true };
export type FinanceEvidence = { id: string; commitmentReference: string; evidenceReference: string; confirmedGrossAmount: string;
  currencyCode: string; commercialRevision: number; confirmedAt: string; releaseConfirmed: boolean; evidenceMode: string };
export type ExecutionOrderDetail = {
  order: ExecutionOrderSummary & { total: string; shipToRef: string | null; billToRef: string | null; paymentTermRef: string | null; lines: ExecutionLine[] };
  totals: { lineBaseAmount: string; grossAmount: string }; nextCommercialRevision: number; financeStatus: string;
  sourceReservationReferences: string[]; financeEvidence: FinanceEvidence[];
  financeResolutions: { id: string; outcome: string; releasedGrossAmount: string; currencyCode: string; evidenceReference: string; confirmedAt: string; reason: string }[];
  submissions: { id: string; commercialRevision: number; submittedAt: string; coreApprovalCaseId: string }[];
  cases: { id: string; state: string; sourceVersion: number; version: number; stages: { id: string; code: string; state: string;
    assignments: { id: string; state: string; version: number; assignedToMe: boolean }[] }[] }[];
  decisions: { id: string; action: string; reason: string | null; decidedAt: string }[];
  issued: { id: string; revisionNumber: number; authorizedAt: string }[];
  deliveries: { id: string; outcome: string; channel: string; evidenceReference: string; observedAt: string }[];
  actionCandidates: OrderCandidate[]; configuredDeliveryChannels: string[]; commandValidationRequired: true;
};
export type OrderCommandOperation = OrderAction | "Convert" | "SourceEdit" | "Decide";
export type OrderCommand = { orderId: string | null; operation: OrderCommandOperation; key: string; body: string; assignmentId?: string };
export type OrderExecutionReply = { id: string; status: string; version: number; nextStep: string };
export class OrderExecutionError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const exact = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(value);
const int = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const invalid = () => new OrderExecutionError(0, "ERP returned incomplete order execution details. Refresh before taking an action.");
async function call(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!uuid.test(company)) throw new OrderExecutionError(0, "Choose an ERP company first.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/orders${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new OrderExecutionError(0, "The response was interrupted. Check the saved result before trying another action."); }
  let body: unknown; try { body = await response.json(); } catch { if (response.ok) throw invalid(); }
  if (!response.ok) throw new OrderExecutionError(response.status, response.status === 403 ? "You do not have access to this order action."
    : response.status === 404 ? "The order or saved command result is unavailable in your current scope."
    : response.status === 409 ? "The order or its buying controls changed. Refresh and review before continuing."
    : object(body) && typeof body.message === "string" ? body.message : "Order execution is unavailable. Try again later.");
  return body;
}
function summary(value: unknown): value is ExecutionOrderSummary & Record<string, unknown> {
  return object(value) && uuid.test(String(value.id)) && typeof value.number === "string" && typeof value.status === "string"
    && typeof value.currencyCode === "string" && int(value.version) && int(value.currentRevision);
}
export async function listOrderExecution(company: string, view: WorklistView, page: number, status: string, signal?: AbortSignal): Promise<ExecutionOrderPage> {
  const body = await call(company, `/execution-worklist?view=${view}&page=${page}&pageSize=25${status ? `&status=${encodeURIComponent(status)}` : ""}`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(summary) || body.view !== view || !int(body.total) || !int(body.page) || !int(body.pageSize)) throw invalid();
  return body as unknown as ExecutionOrderPage;
}
export async function getOrderExecution(company: string, id: string, signal?: AbortSignal): Promise<ExecutionOrderDetail> {
  if (!uuid.test(id)) throw invalid();
  const body = await call(company, `/${id}/execution-detail`, { signal });
  if (!object(body) || !summary(body.order) || body.order.id !== id || !object(body.totals)
    || !exact(body.totals.lineBaseAmount) || !exact(body.totals.grossAmount) || !exact(body.order.total)
    || !Array.isArray(body.order.lines) || !body.order.lines.every((line) => object(line) && uuid.test(String(line.id))
      && typeof line.description === "string" && typeof line.unitCode === "string" && exact(line.quantity) && exact(line.unitPrice)
      && exact(line.taxAmount) && exact(line.acceptedQuantity) && exact(line.invoicedQuantity))
    || !["CommitmentHeld", "NoConfirmedCommitmentHeld"].includes(String(body.financeStatus))
    || !strings(body.sourceReservationReferences) || !strings(body.configuredDeliveryChannels) || !int(body.nextCommercialRevision)
    || body.commandValidationRequired !== true || !Array.isArray(body.actionCandidates)
    || !body.actionCandidates.every((action) => object(action) && typeof action.code === "string" && typeof action.permission === "string"
      && typeof action.canStart === "boolean" && strings(action.blockers) && action.requiresCommandValidation === true)
    || !Array.isArray(body.financeEvidence) || !body.financeEvidence.every((row) => object(row) && uuid.test(String(row.id))
      && exact(row.confirmedGrossAmount) && typeof row.commitmentReference === "string" && typeof row.releaseConfirmed === "boolean"
      && typeof row.currencyCode === "string" && typeof row.evidenceReference === "string")
    || !["financeResolutions", "submissions", "cases", "decisions", "issued", "deliveries"].every((key) => Array.isArray(body[key]) && body[key].every(object))) throw invalid();
  for (const row of body.cases as Record<string, unknown>[]) if (!Array.isArray(row.stages) || !row.stages.every((stage) => object(stage)
    && typeof stage.id === "string" && typeof stage.code === "string" && typeof stage.state === "string"
    && Array.isArray(stage.assignments) && stage.assignments.every((assignment) => object(assignment) && uuid.test(String(assignment.id))
      && typeof assignment.state === "string" && int(assignment.version) && typeof assignment.assignedToMe === "boolean")) || !int(row.version)) throw invalid();
  for (const row of body.issued as Record<string, unknown>[]) if (!uuid.test(String(row.id)) || !int(row.revisionNumber) || typeof row.authorizedAt !== "string") throw invalid();
  // Financial output never passes through Number; wider products retain every decimal.
  for (const resolution of body.financeResolutions as Record<string, unknown>[]) if (!exact(resolution.releasedGrossAmount)) throw invalid();
  return body as unknown as ExecutionOrderDetail;
}
const paths: Record<OrderCommandOperation, string> = { Decide: "", Convert: "from-approved-sources", SourceEdit: "source-draft", Finance: "finance-confirmations", DraftFinanceRelease: "draft-finance-release-confirmations",
  FinanceRelease: "finance-release-confirmations", Submit: "submit", Issue: "issue", Delivery: "delivery-confirmations" };
/** Encode only validated exact monetary tokens as JSON numbers, without IEEE754 conversion.
 * The existing server command contracts bind decimal JSON numbers (not strings). */
export function orderCommandBody(fields: Record<string, unknown>, decimalFields: Record<string, string> = {}): string {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  for (const [key, value] of Object.entries(decimalFields)) {
    if (!exact(value) || Object.hasOwn(fields, key)) throw new OrderExecutionError(0, "The order amount could not be represented exactly.");
    entries.push(`${JSON.stringify(key)}:${value}`);
  }
  return `{${entries.join(",")}}`;
}
export async function sendOrderCommand(company: string, command: OrderCommand): Promise<OrderExecutionReply> {
  if ((command.operation !== "Convert" && (!command.orderId || !uuid.test(command.orderId))) || !uuid.test(command.key)) throw invalid();
  if (command.operation === "Decide" && !uuid.test(command.assignmentId ?? "")) throw invalid();
  const path = command.operation === "Convert" ? `/${paths.Convert}` : command.operation === "Decide"
    ? `/${command.orderId}/assignments/${command.assignmentId}/decisions` : `/${command.orderId}/${paths[command.operation]}`;
  const body = await call(company, path, { method: command.operation === "SourceEdit" ? "PUT" : "POST", headers: { "Idempotency-Key": command.key }, body: command.body });
  if (!object(body) || !uuid.test(String(body.id)) || (command.orderId !== null && body.id !== command.orderId) || typeof body.status !== "string" || !int(body.version)) throw invalid();
  return body as unknown as OrderExecutionReply;
}
export async function recoverOrderCommand(company: string, command: OrderCommand) {
  const body = await call(company, `/command-receipts/${command.operation}/${command.key}${command.orderId ? `?orderId=${command.orderId}` : ""}`);
  if (!object(body) || body.state !== "RecordedHistoricalOutcome" || !uuid.test(String(body.purchaseOrderId)) || (command.orderId !== null && body.purchaseOrderId !== command.orderId)
    || body.commandKey !== command.key || body.operation !== command.operation || body.replayAuthorized !== false
    || !object(body.recordedResult) || body.recordedResult.id !== body.purchaseOrderId || typeof body.recordedResult.status !== "string"
    || !int(body.currentOrderVersion) || typeof body.currentOrderStatus !== "string") throw invalid();
  return { orderId: String(body.purchaseOrderId), historicalStatus: String(body.recordedResult.status), currentStatus: body.currentOrderStatus };
}

export type ApprovedOrderSource = { requestId: string; requestNumber: string; lineId: string; eligibility: string; blocker?: string | null;
  requestVersion?: number; description?: string; unitCode?: string; categoryCode?: string; branchRef?: string | null;
  availableQuantityExact?: string; approvedUnitPriceExact?: string; currencyCode?: string };
export type ApprovedOrderSourcePage = { items: ApprovedOrderSource[]; total: number; page: number; pageSize: number };
export async function listApprovedOrderSources(company: string, page = 1, signal?: AbortSignal): Promise<ApprovedOrderSourcePage> {
  const body = await call(company, `/approved-sources?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !int(body.total) || !int(body.page) || !int(body.pageSize)
    || !body.items.every((row) => object(row) && uuid.test(String(row.requestId)) && uuid.test(String(row.lineId)) && typeof row.requestNumber === "string"
      && typeof row.eligibility === "string" && (row.eligibility !== "Available" && row.eligibility !== "FullyAllocated" || int(row.requestVersion)
        && exact(row.availableQuantityExact) && exact(row.approvedUnitPriceExact) && typeof row.description === "string" && typeof row.unitCode === "string" && typeof row.currencyCode === "string"))) throw invalid();
  return body as unknown as ApprovedOrderSourcePage;
}
export type ExactOrderDraftLine = { id?: string; description: string; unitCode: string; quantity: string; unitPrice: string; taxAmount: string;
  costCenterRef?: string | null; projectRef?: string | null; expectedDeliveryOn?: string | null };
export type ExactOrderDraft = { supplierId: string; currencyCode: string; shipToRef: string; billToRef: string; paymentTermRef: string;
  expectedDeliveryOn: string | null; lines: ExactOrderDraftLine[] };
export function encodeExactOrderDraft(draft: ExactOrderDraft): string {
  const { lines, ...fields } = draft;
  const encoded = lines.map(({ quantity, unitPrice, taxAmount, ...rest }) => {
    if (![quantity, unitPrice, taxAmount].every((value) => /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value)))
      throw new OrderExecutionError(0, "Use exact quantities and prices with up to four decimal places.");
    return orderCommandBody(rest, { quantity, unitPrice, taxAmount });
  });
  return `{${Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(",")},"lines":[${encoded.join(",")}]}`;
}
export function sourceOrderCommandBody(draft: ExactOrderDraft, sourceOrVersion: ApprovedOrderSource[] | number, reason = ""): string {
  const encoded = encodeExactOrderDraft(draft);
  if (typeof sourceOrVersion === "number" && !int(sourceOrVersion)) throw invalid();
  if (typeof sourceOrVersion === "number") return `{"expectedOrderVersion":${sourceOrVersion},"reason":${JSON.stringify(reason.trim())},"draft":${encoded}}`;
  if (sourceOrVersion.length !== draft.lines.length) throw new OrderExecutionError(0, "Every order line must retain an approved request source.");
  const sources = sourceOrVersion.map((row, draftLineIndex) => {
    if (!uuid.test(row.requestId) || !uuid.test(row.lineId) || !int(row.requestVersion)) throw invalid();
    return { draftLineIndex, purchaseRequestId: row.requestId, purchaseRequestLineId: row.lineId, expectedRequestVersion: row.requestVersion };
  });
  return `{"draft":${encoded},"sources":${JSON.stringify(sources)}}`;
}

export type AssignedOrderApproval = { assignmentId: string; caseId: string; orderId: string; assignmentVersion: number; caseVersion: number;
  code: string; openedAt: string; number: string; orderVersion: number; status: string; currencyCode: string };
export type AssignedOrderApprovalPage = { items: AssignedOrderApproval[]; total: number; page: number; pageSize: number };
export async function listAssignedOrderApprovals(company: string, page = 1, signal?: AbortSignal): Promise<AssignedOrderApprovalPage> {
  const body = await call(company, `/assigned-approvals?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !int(body.total) || !int(body.page) || !int(body.pageSize)
    || !body.items.every((row) => object(row) && uuid.test(String(row.assignmentId)) && uuid.test(String(row.caseId)) && uuid.test(String(row.orderId))
      && int(row.assignmentVersion) && int(row.caseVersion) && int(row.orderVersion) && typeof row.number === "string"
      && typeof row.code === "string" && typeof row.openedAt === "string" && typeof row.currencyCode === "string" && typeof row.status === "string")) throw invalid();
  return body as unknown as AssignedOrderApprovalPage;
}
