import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Invoice-purpose contracts: source facts are never allocation/payment authority. */
export type InvoiceSource = { orderId: string; orderNumber: string; issuedVersionId: string; purchaseOrderLineId: string; description: string;
  sourceState: "VerifiedIssued" | "Unavailable"; blocker: string | null; unitCode?: string; quantity?: string; unitPrice?: string; taxAmount?: string;
  categoryCode?: string; method?: "TwoWay" | "ThreeWay" | null; acceptanceKind?: "Goods" | "Service" | null };
export type InvoiceSourcePage = { invoiceId: string; invoiceVersion: number; policyVersionId: string; items: InvoiceSource[]; total: number; page: number; pageSize: number };
export type InvoiceAcceptance = { id: string; reference: string; kind: "Goods" | "Service"; sourceVersion: number; goodsReceiptLineId: string | null;
  serviceAcceptanceId: string | null; acceptedQuantity: string; returnedQuantity: string; historicalNetQuantity: string; acceptedNetAmount: string;
  returnedNetAmount: string; historicalNetAmount: string; acceptedAt: string };
export type InvoiceAcceptancePage = { invoiceId: string; invoiceVersion: number; orderId: string; issuedVersionId: string; purchaseOrderLineId: string;
  policyVersionId: string; method: "TwoWay" | "ThreeWay"; state: "VerifiedHistorical" | "NoRecordedAcceptance" | "Unavailable";
  blocker: string | null; items: InvoiceAcceptance[]; total: number | null; page: number; pageSize: number };
export type InvoiceMappingLine = { invoiceLineId: string; purchaseOrderLineId: string; goodsReceiptLineId: string | null; serviceAcceptanceId: string | null;
  invoiceUnitCode: string; documentVersionId: string; documentLineReference: string };
export type InvoiceMappingInput = { version: number; purchaseOrderId: string; issuedVersionId: string; lines: InvoiceMappingLine[] };
export type InvoiceCompareInput = { version: number; mappingVersionId: string; reason: string | null };
export type InvoiceMatchingCommand = { operation: "InvoiceMapping" | "InvoiceCompare"; invoiceId: string; key: string; body: string; ownLineIds: string[] };
export type InvoiceMatchingReply = { invoiceId: string; key: string; operation: InvoiceMatchingCommand["operation"]; id: string; version: number;
  outcome: "MappingUnverified" | "Blocked" | "Compared"; mappingRevision?: number; issues: { invoiceLineId: string | null; code: string }[] };
export class InvoiceMatchingError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (x: unknown): x is string => typeof x === "string" && guid.test(x) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(x);
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === "string";
const int = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const exact = (x: unknown): x is string => typeof x === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,8})?$/.test(x);
const nullableId = (x: unknown): x is string | null => x === null || id(x);
const invalid = () => new InvoiceMatchingError(0, "ERP did not confirm the invoice information. Refresh or check the saved result before continuing.");
async function request(company: string, invoice: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company) || !id(invoice)) throw invalid();
  const headers = new Headers(init.headers); Object.entries(procurementScopeHeaders(company)).forEach(([k, v]) => headers.set(k, v));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/invoices/${invoice}/matching${path}`, { ...init, method: init.method ?? "GET", headers, credentials: "include", cache: "no-store" }); }
  catch { throw new InvoiceMatchingError(0, "The response was interrupted. Check the saved result before another change."); }
  let body: unknown; try { body = await response.json(); } catch { if (response.ok) throw invalid(); }
  if (!response.ok) throw new InvoiceMatchingError(response.status, response.status === 401 ? "Sign in to ERP before continuing."
    : response.status === 403 ? "You do not have access to this invoice action."
      : response.status === 404 ? "This invoice source or saved result is not available in your current access."
        : response.status === 409 ? "The invoice, rules or source changed. Refresh and review before continuing."
          : response.status === 422 ? "Check the invoice link details before saving."
            : "Invoice comparison is not available yet. Check the saved result if you submitted a change.");
  return body;
}
function pageQuery(page: number, q: string) {
  if (!int(page) || page < 1 || page > 100000 || q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  return `?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}
function pagePins(x: unknown, invoice: string, version: number, page: number): asserts x is Record<string, unknown> {
  if (!object(x) || x.invoiceId !== invoice || !int(x.invoiceVersion) || !id(x.policyVersionId) || x.isAuthority !== false
    || x.canPostToFinance !== false || x.page !== page || !int(x.pageSize) || x.pageSize < 1 || x.pageSize > 25 || !Array.isArray(x.items) || x.items.length > x.pageSize) throw invalid();
  if (x.invoiceVersion !== version) throw new InvoiceMatchingError(409, "The invoice changed. Refresh it before choosing its source.");
}
export async function listInvoiceSources(company: string, invoice: string, version: number, page = 1, q = "", signal?: AbortSignal): Promise<InvoiceSourcePage> {
  const body = await request(company, invoice, `/sources${pageQuery(page, q)}`, { signal }); pagePins(body, invoice, version, page);
  if (!int(body.total)) throw invalid();
  const items = (body.items as unknown[]).map((row): InvoiceSource => {
    if (!object(row) || !id(row.orderId) || !text(row.orderNumber) || !id(row.issuedVersionId) || !id(row.purchaseOrderLineId)
      || !text(row.description) || !["VerifiedIssued", "Unavailable"].includes(String(row.sourceState)) || row.canAllocate !== false || row.canPostToFinance !== false) throw invalid();
    const base = { orderId: row.orderId, orderNumber: row.orderNumber, issuedVersionId: row.issuedVersionId, purchaseOrderLineId: row.purchaseOrderLineId, description: row.description };
    if (row.sourceState === "Unavailable") {
      if (row.blocker !== "IssuedEvidenceUnavailable") throw invalid();
      return { ...base, sourceState: "Unavailable", blocker: row.blocker };
    }
    if (!text(row.unitCode) || ![row.quantity, row.unitPrice, row.taxAmount].every(exact) || !text(row.categoryCode)
      || !["TwoWay", "ThreeWay", null].includes(row.method as string | null) || !["Goods", "Service", null].includes(row.acceptanceKind as string | null)
      || ![null, "MatchingCategoryUnavailable"].includes(row.blocker as string | null)) throw invalid();
    if (row.method === null && row.blocker !== "MatchingCategoryUnavailable") throw invalid();
    return { ...base, sourceState: "VerifiedIssued", blocker: row.blocker as string | null, unitCode: row.unitCode, quantity: row.quantity as string,
      unitPrice: row.unitPrice as string, taxAmount: row.taxAmount as string, categoryCode: row.categoryCode, method: row.method as InvoiceSource["method"], acceptanceKind: row.acceptanceKind as InvoiceSource["acceptanceKind"] };
  });
  return { invoiceId: invoice, invoiceVersion: version, policyVersionId: body.policyVersionId as string, items, total: body.total, page, pageSize: body.pageSize as number };
}
export async function listInvoiceAcceptances(company: string, invoice: string, version: number, policy: string, source: InvoiceSource, page = 1, q = "", signal?: AbortSignal): Promise<InvoiceAcceptancePage> {
  if (![source.orderId, source.purchaseOrderLineId, source.issuedVersionId, policy].every(id) || source.sourceState !== "VerifiedIssued" || !source.method) throw invalid();
  const body = await request(company, invoice, `/sources/${source.orderId}/lines/${source.purchaseOrderLineId}/acceptances${pageQuery(page, q)}`, { signal }); pagePins(body, invoice, version, page);
  if (body.orderId !== source.orderId || body.issuedVersionId !== source.issuedVersionId || body.purchaseOrderLineId !== source.purchaseOrderLineId
    || body.policyVersionId !== policy || body.method !== source.method || body.canAllocate !== false || body.availabilityMeaning !== "HistoricalPhysicalFactsOnly"
    || !["VerifiedHistorical", "NoRecordedAcceptance", "Unavailable"].includes(String(body.state))) throw invalid();
  if (body.state === "Unavailable" ? body.total !== null || (body.items as unknown[]).length !== 0 || body.blocker !== "AcceptanceHistoryUnavailable"
    : !int(body.total) || body.blocker !== null || body.state === "NoRecordedAcceptance" && (body.total !== 0 || (body.items as unknown[]).length !== 0)) throw invalid();
  const items = (body.items as unknown[]).map((row): InvoiceAcceptance => {
    if (!object(row) || !id(row.id) || !text(row.reference) || !["Goods", "Service"].includes(String(row.kind)) || !int(row.sourceVersion)
      || !nullableId(row.goodsReceiptLineId) || !nullableId(row.serviceAcceptanceId)
      || row.kind === "Goods" && (row.goodsReceiptLineId !== row.id || row.serviceAcceptanceId !== null)
      || row.kind === "Service" && (row.serviceAcceptanceId !== row.id || row.goodsReceiptLineId !== null)
      || source.acceptanceKind && row.kind !== source.acceptanceKind || !text(row.acceptedAt)
      || ![row.acceptedQuantity, row.returnedQuantity, row.historicalNetQuantity, row.acceptedNetAmount, row.returnedNetAmount, row.historicalNetAmount].every(exact)
      || row.canAllocate !== false || row.canPostToFinance !== false) throw invalid();
    return { id: row.id, reference: row.reference, kind: row.kind as InvoiceAcceptance["kind"], sourceVersion: row.sourceVersion,
      goodsReceiptLineId: row.goodsReceiptLineId, serviceAcceptanceId: row.serviceAcceptanceId,
      acceptedQuantity: row.acceptedQuantity as string, returnedQuantity: row.returnedQuantity as string, historicalNetQuantity: row.historicalNetQuantity as string,
      acceptedNetAmount: row.acceptedNetAmount as string, returnedNetAmount: row.returnedNetAmount as string, historicalNetAmount: row.historicalNetAmount as string, acceptedAt: row.acceptedAt };
  });
  return { invoiceId: invoice, invoiceVersion: version, orderId: source.orderId, issuedVersionId: source.issuedVersionId,
    purchaseOrderLineId: source.purchaseOrderLineId, policyVersionId: policy, method: source.method,
    state: body.state as InvoiceAcceptancePage["state"], blocker: body.blocker as string | null, items, total: body.total as number | null, page, pageSize: body.pageSize as number };
}
export function invoiceMappingCommand(invoice: string, ownLines: readonly string[], input: InvoiceMappingInput, key: string): InvoiceMatchingCommand {
  if (![invoice, key, input.purchaseOrderId, input.issuedVersionId].every(id) || !int(input.version) || input.lines.length === 0 || input.lines.length > 200
    || new Set(ownLines).size !== ownLines.length || ownLines.length !== input.lines.length || !ownLines.every(id)
    || new Set(input.lines.map((line) => line.invoiceLineId)).size !== ownLines.length
    || input.lines.some((line) => !ownLines.includes(line.invoiceLineId) || !id(line.purchaseOrderLineId) || !id(line.documentVersionId)
      || !nullableId(line.goodsReceiptLineId) || !nullableId(line.serviceAcceptanceId) || line.goodsReceiptLineId !== null && line.serviceAcceptanceId !== null
      || !line.invoiceUnitCode || line.invoiceUnitCode.length > 20 || line.invoiceUnitCode !== line.invoiceUnitCode.trim()
      || !line.documentLineReference.trim() || line.documentLineReference.length > 200)) throw invalid();
  return { invoiceId: invoice, operation: "InvoiceMapping", key, body: JSON.stringify(input), ownLineIds: [...ownLines] };
}
export function invoiceCompareCommand(invoice: string, ownLines: readonly string[], input: InvoiceCompareInput, key: string): InvoiceMatchingCommand {
  if (![invoice, key, input.mappingVersionId].every(id) || !int(input.version) || !ownLines.every(id) || input.reason !== null && input.reason.length > 2000) throw invalid();
  return { invoiceId: invoice, operation: "InvoiceCompare", key, body: JSON.stringify(input), ownLineIds: [...ownLines] };
}
function reply(body: unknown, command: InvoiceMatchingCommand): InvoiceMatchingReply {
  const permission = command.operation === "InvoiceMapping" ? "procurement-invoice-capture" : "procurement-invoice-match";
  if (!object(body) || body.invoiceId !== command.invoiceId || body.commandKey !== command.key || body.commandPermission !== permission
    || body.commandSchemaVersion !== 1 || body.recordedHistoricalResult !== true || body.isCurrentApproval !== false || body.canPostToFinance !== false || !object(body.result)) throw invalid();
  const r = body.result;
  if (!id(r.id) || !int(r.version)) throw invalid();
  if (command.operation === "InvoiceMapping") {
    if (r.verificationState !== "Unverified" || !int(r.mappingRevision) || !text(r.mappingSha256) || !/^[a-f0-9]{64}$/i.test(r.mappingSha256)) throw invalid();
    return { invoiceId: command.invoiceId, key: command.key, operation: command.operation, id: r.id, version: r.version, outcome: "MappingUnverified", mappingRevision: r.mappingRevision, issues: [] };
  }
  if (!["Blocked", "Compared"].includes(String(r.outcome)) || !Array.isArray(r.discrepancies) || typeof r.hasCapacityClaim !== "boolean"
    || r.canPostToFinance !== false || !text(r.matchingState)) throw invalid();
  const issues = r.discrepancies.map((row) => {
    if (!object(row) || !nullableId(row.invoiceLineId) || row.invoiceLineId !== null && !command.ownLineIds.includes(row.invoiceLineId) || !text(row.code)) throw invalid();
    return { invoiceLineId: row.invoiceLineId, code: row.code };
  });
  return { invoiceId: command.invoiceId, key: command.key, operation: command.operation, id: r.id, version: r.version, outcome: r.outcome as "Blocked" | "Compared", issues };
}
export async function sendInvoiceMatching(company: string, command: InvoiceMatchingCommand): Promise<InvoiceMatchingReply> {
  return reply(await request(company, command.invoiceId, command.operation === "InvoiceMapping" ? "/mappings" : "/compare",
    { method: "POST", headers: { "Idempotency-Key": command.key }, body: command.body }), command);
}
export async function recoverInvoiceMatching(company: string, command: InvoiceMatchingCommand): Promise<InvoiceMatchingReply> {
  const body = await request(company, command.invoiceId, `/commands/${command.key}?operation=${command.operation}`);
  if (!object(body) || body.operation !== command.operation || body.commandKey !== command.key || body.recordedHistoricalResult !== true
    || body.isCurrentReplayAuthorization !== false || body.canPostToFinance !== false || !int(body.currentInvoiceVersion)) throw invalid();
  return reply(body.recordedResult, command);
}
