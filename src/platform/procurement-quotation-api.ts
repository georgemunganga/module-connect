import { procurementScopeHeaders } from "../../shared/shell-scope";
import { invoiceDecimal } from "../../shared/procurement-decimal";

export type QuotationSourceLine = { id: string; description: string; unitCode: string; quantity: string; categoryCode?: string | null; approvedUnitEstimate?: string; estimatedValue?: string; allocationState?: string };
export type QuotationSource = { id: string; number: string; title: string; status: string; version: number; branchId: string | null; currency: string; lines?: QuotationSourceLine[] };
export type QuotationInvitation = { id: string; supplierId: string; supplierNumber: string; supplierName: string; status: string; version: number; manualContactId: string | null; allowedActions: string[] };
export type QuotationList = { source: QuotationSource; invitations: QuotationInvitation[]; items: { id: string; supplierId: string; supplierName: string; supplierQuoteReference: string | null; status: string; version: number; lastRecordedAt: string }[] };
export type QuotationOffer = { supplierQuoteReference: string | null; quoteDate: string | null; validity: "Unspecified" | "Fixed" | "OpenEnded"; validUntil: string | null; paymentTerms: { code: string | null; text: string | null } | null; warrantyText: string | null; deliveryTermsText: string | null; deliveryDate: string | null; documents: unknown[] };
export type QuotationLine = { sourcingLineId: string; quantity: string; unitPrice: string; discount: "None" | "Amount" | "Percent"; discountValue: string; taxTreatment: "Exclusive" | "Inclusive"; quotedTaxAmount: string; deliveryAmount: string; supplierOfferedTaxCode: string | null; leadTimeText: string | null; notes: string | null };
export type QuotationSnapshot = { schemaVersion: 3; header: { id: string; sourcingEventId: string; invitationId: string; bidVersion: number; status: string; currencyCode: string; receivedAt: string | null; correctionReason: string | null; offer: Omit<QuotationOffer, "validity"> & { validity: number } }; lines: (Omit<QuotationLine, "discount"> & { id: string; discountKind: QuotationLine["discount"] })[]; documentPins: unknown[]; totals: Record<string, string> };
export type QuotationDetail = { id: string; sourceId: string; sourceNumber: string; sourceVersion: number; invitationId: string; invitationVersion: number; supplierId: string; supplierNumber: string; supplierName: string; status: string; version: number; allowedActions: string[]; snapshot: QuotationSnapshot; history: { id: string; version: number; operation: string; recordedAt: string; actorPrincipalId: string; snapshotSha256: string }[]; historyTotal: number; historyHasMore: boolean; oldestShownVersion: number | null };
export type QuotationReference = { key: string; eventId: string; action: "Contact" | "Create" | "Revise" | "Cancel"; targetId: string };
export type QuotationCommand = QuotationReference & { body: string };
export type QuotationReply = { commandKey: string; eventId: string; status: string; quotationId?: string; version?: number; invitationId?: string; invitationVersion?: number };
export class QuotationApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export const quotationGuid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v) && v !== "00000000-0000-0000-0000-000000000000";
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const label = (v: unknown): v is string => str(v) && !!v.trim() && !quotationGuid(v);
const pos = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nullableText = (v: unknown) => v === null || str(v);
const fail = () => new QuotationApiError(0, "ERP did not confirm the quotation information. Keep the original save reference and check its result.");
function actions(value: unknown, allowed: string[]): asserts value is string[] { if (!Array.isArray(value) || value.some(x => !allowed.includes(x)) || new Set(value).size !== value.length) throw fail(); }
export function quotationReference(value: unknown): QuotationReference {
  if (!obj(value) || !quotationGuid(value.key) || !quotationGuid(value.eventId) || !quotationGuid(value.targetId) || !["Contact", "Create", "Revise", "Cancel"].includes(value.action)
    || Object.keys(value).some(x => !["key", "eventId", "action", "targetId"].includes(x))) throw fail();
  return { key: value.key, eventId: value.eventId, action: value.action, targetId: value.targetId };
}
async function request(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!quotationGuid(company)) throw fail();
  const headers = new Headers(init.headers); Object.entries(procurementScopeHeaders(company)).forEach(([k, v]) => headers.set(k, v));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/sourcing${path}`, { ...init, method: init.method ?? "GET", headers, credentials: "include", cache: "no-store" }); }
  catch { throw new QuotationApiError(0, "The save response was interrupted. Check the original saved result before another change."); }
  if (!response.ok) throw new QuotationApiError(response.status, response.status === 403 ? "You do not have access to this quotation action in the selected scope."
    : response.status === 401 ? "Sign in to ERP to continue." : response.status === 409 ? "The quotation or source changed. Refresh and review before saving."
      : response.status === 422 ? "Check the quotation terms, dates and exact quantities before saving."
        : response.status === 404 ? "The record or original saved result is unavailable in your current access. Keep the original reference; this does not authorize another save."
          : "Quotations are unavailable or the save could not be confirmed. Check the original saved result.");
  try { return await response.json(); } catch { throw fail(); }
}
function source(value: unknown): asserts value is QuotationSource {
  if (!obj(value) || !quotationGuid(value.id) || !label(value.number) || !label(value.title) || !["Published", "Cancelled"].includes(value.status)
    || !pos(value.version) || !(value.branchId === null || quotationGuid(value.branchId)) || !/^[A-Z]{3}$/.test(value.currency)) throw fail();
  if (value.lines !== undefined && (!Array.isArray(value.lines) || value.lines.length > 200 || value.lines.some((x: unknown) => !obj(x) || !quotationGuid(x.id) || !label(x.description) || !label(x.unitCode) || !str(x.quantity)))) throw fail();
  if (Array.isArray(value.lines)) { if (new Set(value.lines.map(x => x.id)).size !== value.lines.length) throw fail(); for (const line of value.lines) { invoiceDecimal(line.quantity, true); if ([line.approvedUnitEstimate, line.estimatedValue].some(x => x !== undefined && !str(x))) throw fail(); } }
}
export async function listQuotationSources(company: string, signal?: AbortSignal): Promise<{ items: QuotationSource[]; hasMore: boolean }> {
  const body = await request(company, "/quotation-sources", { signal });
  if (!obj(body) || !Array.isArray(body.items) || body.items.length > 100 || typeof body.hasMore !== "boolean") throw fail();
  body.items.forEach(source); return body as { items: QuotationSource[]; hasMore: boolean };
}
export async function getQuotationList(company: string, eventId: string, signal?: AbortSignal): Promise<QuotationList> {
  if (!quotationGuid(eventId)) throw fail(); const body = await request(company, `/${eventId}/quotation-drafts`, { signal });
  if (!obj(body)) throw fail(); source(body.source);
  if (body.source.id !== eventId || !Array.isArray(body.invitations) || !Array.isArray(body.items) || body.invitations.length > 100 || body.items.length > 100) throw fail();
  for (const x of body.invitations) { if (!obj(x) || !quotationGuid(x.id) || !quotationGuid(x.supplierId) || !label(x.supplierNumber) || !label(x.supplierName) || !str(x.status) || !pos(x.version) || !(x.manualContactId === null || quotationGuid(x.manualContactId))) throw fail(); actions(x.allowedActions, ["RecordOutsideContact", "CreateDraft"]); }
  for (const x of body.items) if (!obj(x) || !quotationGuid(x.id) || !quotationGuid(x.supplierId) || !label(x.supplierName) || !nullableText(x.supplierQuoteReference) || !["Draft", "Cancelled"].includes(x.status) || !pos(x.version) || !str(x.lastRecordedAt)) throw fail();
  return body as QuotationList;
}
export function retainedQuotation(snapshot: unknown): { offer: QuotationOffer; lines: QuotationLine[]; receivedAt: string | null } {
  if (!obj(snapshot) || snapshot.schemaVersion !== 3 || !obj(snapshot.header) || !obj(snapshot.header.offer) || !Array.isArray(snapshot.lines) || !Array.isArray(snapshot.documentPins) || !obj(snapshot.totals)) throw fail();
  if (!quotationGuid(snapshot.header.id) || !quotationGuid(snapshot.header.sourcingEventId) || !pos(snapshot.header.bidVersion) || !/^[A-Z]{3}$/.test(snapshot.header.currencyCode)) throw fail();
  const totalKeys = ["goodsBeforeDiscount", "discountAmount", "goodsAfterDiscount", "netGoods", "quotedTax", "delivery", "payable"];
  if (totalKeys.some(key => !str(snapshot.totals[key]) || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:E[+-]?\d+)?$/i.test(snapshot.totals[key]))) throw fail();
  const offer = snapshot.header.offer;
  if (![0, 1, 2].includes(offer.validity) || !Array.isArray(offer.documents)) throw fail();
  for (const field of ["supplierQuoteReference", "quoteDate", "validUntil", "warrantyText", "deliveryTermsText", "deliveryDate"]) if (!nullableText(offer[field])) throw fail();
  if (!(offer.paymentTerms === null || obj(offer.paymentTerms) && nullableText(offer.paymentTerms.code) && nullableText(offer.paymentTerms.text)) || !nullableText(snapshot.header.receivedAt)) throw fail();
  const lines = snapshot.lines.map((x: unknown): QuotationLine => {
    if (!obj(x) || !quotationGuid(x.sourcingLineId) || !["None", "Amount", "Percent"].includes(x.discountKind) || !["Exclusive", "Inclusive"].includes(x.taxTreatment)) throw fail();
    for (const field of ["quantity", "unitPrice", "discountValue", "quotedTaxAmount", "deliveryAmount"]) { if (!str(x[field])) throw fail(); invoiceDecimal(x[field], field === "quantity"); }
    if (![x.supplierOfferedTaxCode, x.leadTimeText, x.notes].every(nullableText)) throw fail();
    return { sourcingLineId: x.sourcingLineId, quantity: x.quantity, unitPrice: x.unitPrice, discount: x.discountKind, discountValue: x.discountValue, taxTreatment: x.taxTreatment, quotedTaxAmount: x.quotedTaxAmount, deliveryAmount: x.deliveryAmount, supplierOfferedTaxCode: x.supplierOfferedTaxCode, leadTimeText: x.leadTimeText, notes: x.notes };
  });
  return { offer: { supplierQuoteReference: offer.supplierQuoteReference, quoteDate: offer.quoteDate, validity: (["Unspecified", "Fixed", "OpenEnded"] as const)[offer.validity as number], validUntil: offer.validUntil, paymentTerms: offer.paymentTerms, warrantyText: offer.warrantyText, deliveryTermsText: offer.deliveryTermsText, deliveryDate: offer.deliveryDate, documents: offer.documents }, lines, receivedAt: snapshot.header.receivedAt };
}
export async function getQuotation(company: string, eventId: string, bidId: string, signal?: AbortSignal): Promise<QuotationDetail> {
  if (!quotationGuid(eventId) || !quotationGuid(bidId)) throw fail(); const body = await request(company, `/${eventId}/quotation-drafts/${bidId}`, { signal });
  if (!obj(body) || body.id !== bidId || body.sourceId !== eventId || !label(body.sourceNumber) || !pos(body.sourceVersion) || !quotationGuid(body.invitationId) || !pos(body.invitationVersion) || !quotationGuid(body.supplierId) || !label(body.supplierName) || !label(body.supplierNumber) || !pos(body.version) || !["Draft", "Cancelled"].includes(body.status) || !Array.isArray(body.history) || body.history.length > 50 || !pos(body.historyTotal) || typeof body.historyHasMore !== "boolean") throw fail();
  actions(body.allowedActions, ["ReviseDraft", "CancelDraft"]); retainedQuotation(body.snapshot);
  if (body.snapshot.header.id !== bidId || body.snapshot.header.sourcingEventId !== eventId || body.snapshot.header.bidVersion !== body.version || body.snapshot.header.status !== body.status || body.historyHasMore !== (body.historyTotal > body.history.length)) throw fail();
  for (const row of body.history) if (!obj(row) || !pos(row.version) || !str(row.operation) || !str(row.recordedAt) || !str(row.actorPrincipalId) || !str(row.snapshotSha256)) throw fail();
  return body as QuotationDetail;
}
export async function getQuotationVersion(company: string, eventId: string, bidId: string, version: number, signal?: AbortSignal): Promise<QuotationSnapshot> {
  if (!quotationGuid(eventId) || !quotationGuid(bidId) || !pos(version)) throw fail(); const body = await request(company, `/${eventId}/quotation-drafts/${bidId}/versions/${version}`, { signal });
  if (!obj(body) || body.id !== bidId || body.sourceId !== eventId || body.version !== version) throw fail(); retainedQuotation(body.snapshot); if (body.snapshot.header.id !== bidId || body.snapshot.header.sourcingEventId !== eventId || body.snapshot.header.bidVersion !== version) throw fail(); return body.snapshot;
}
export function quotationCommand(reference: QuotationReference, input: unknown): QuotationCommand {
  const ref = quotationReference(reference); if (!obj(input)) throw fail();
  if (ref.action === "Cancel") { if (!pos(input.expectedBidVersion) || !str(input.reason) || !input.reason.trim()) throw fail(); return { ...ref, body: JSON.stringify({ expectedEventVersion: 0, expectedInvitationVersion: 0, expectedBidVersion: input.expectedBidVersion, reason: input.reason }) }; }
  if (!pos(input.expectedEventVersion) || !pos(input.expectedInvitationVersion)) throw fail();
  if (ref.action === "Contact") {
    if (!["EmailOutsideSystem", "Physical", "Telephone", "Other"].includes(input.channel) || !str(input.reference) || !input.reference.trim() || input.reference.length > 200 || !str(input.reportedAt) || !Number.isFinite(Date.parse(input.reportedAt))) throw fail();
    return { ...ref, body: JSON.stringify({ expectedEventVersion: input.expectedEventVersion, expectedInvitationVersion: input.expectedInvitationVersion, channel: input.channel, reference: input.reference, reportedAt: input.reportedAt }) };
  }
  if (input.receivedAt !== null && input.receivedAt !== undefined && (!str(input.receivedAt) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input.receivedAt) || !Number.isFinite(Date.parse(input.receivedAt)))) throw new QuotationApiError(422, "Enter a valid offer receipt time, including its time zone.");
  if (!obj(input.offer) || !Array.isArray(input.offer.documents) || input.offer.documents.length || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200 || new Set(input.lines.map(x => x.sourcingLineId)).size !== input.lines.length) throw new QuotationApiError(422, "Select at least one offered line. Document attachments are not available for quotation saves yet.");
  const offer = input.offer;
  if (!["Unspecified", "Fixed", "OpenEnded"].includes(offer.validity) || offer.validity === "Fixed" && !offer.validUntil || offer.validity !== "Fixed" && offer.validUntil !== null) throw new QuotationApiError(422, "Check the offered validity and expiry date.");
  const lines = input.lines.map((line: QuotationLine) => {
    if (![line.quantity, line.unitPrice, line.discountValue, line.quotedTaxAmount, line.deliveryAmount].every(str) || !quotationGuid(line.sourcingLineId) || !["None", "Amount", "Percent"].includes(line.discount) || !["Exclusive", "Inclusive"].includes(line.taxTreatment)) throw fail();
    return { sourcingLineId: line.sourcingLineId, quantity: invoiceDecimal(line.quantity, true), unitPrice: invoiceDecimal(line.unitPrice), discount: line.discount, discountValue: invoiceDecimal(line.discountValue), taxTreatment: line.taxTreatment, quotedTaxAmount: invoiceDecimal(line.quotedTaxAmount), deliveryAmount: invoiceDecimal(line.deliveryAmount), supplierOfferedTaxCode: line.supplierOfferedTaxCode, leadTimeText: line.leadTimeText, notes: line.notes };
  });
  if (ref.action === "Revise" && (!pos(input.expectedBidVersion) || !str(input.reason) || !input.reason.trim())) throw new QuotationApiError(422, "Give a reason for the full quotation revision.");
  return { ...ref, body: JSON.stringify({ expectedEventVersion: input.expectedEventVersion, expectedInvitationVersion: input.expectedInvitationVersion, ...(ref.action === "Revise" ? { expectedBidVersion: input.expectedBidVersion, reason: input.reason } : {}), receivedAt: input.receivedAt ?? null, offer: { supplierQuoteReference: offer.supplierQuoteReference, quoteDate: offer.quoteDate, validity: offer.validity, validUntil: offer.validUntil, paymentTerms: offer.paymentTerms, warrantyText: offer.warrantyText, deliveryTermsText: offer.deliveryTermsText, deliveryDate: offer.deliveryDate, documents: [] }, lines }) };
}
function reply(value: unknown, ref: QuotationReference): QuotationReply {
  if (!obj(value) || value.schemaVersion !== 2 || value.commandKey !== ref.key || value.eventId !== ref.eventId || value.emailSentBySystem !== false) throw fail();
  if (ref.action === "Contact") { if (value.invitationId !== ref.targetId || !quotationGuid(value.manualContactId) || value.status !== "ManualContactRecorded" || !pos(value.invitationVersion)) throw fail(); }
  else if (!quotationGuid(value.quotationId) || !pos(value.version) || value.operation !== ref.action || value.supplierSubmitted !== false || value.status !== (ref.action === "Cancel" ? "Cancelled" : "Draft") || ref.action !== "Create" && value.quotationId !== ref.targetId) throw fail();
  return value as QuotationReply;
}
export async function sendQuotation(company: string, command: QuotationCommand, signal?: AbortSignal): Promise<QuotationReply> {
  const { body, ...raw } = command; const ref = quotationReference(raw);
  const path = ref.action === "Contact" || ref.action === "Create" ? `/${ref.eventId}/invitations/${ref.targetId}/${ref.action === "Contact" ? "manual-contact" : "quotation-drafts"}` : `/${ref.eventId}/quotation-drafts/${ref.targetId}/${ref.action.toLowerCase()}`;
  return reply(await request(company, path, { method: "POST", headers: { "Idempotency-Key": ref.key }, body, signal }), ref);
}
export async function recoverQuotation(company: string, reference: QuotationReference, signal?: AbortSignal): Promise<QuotationReply> {
  const ref = quotationReference(reference); return reply(await request(company, `/quotation-commands/${ref.key}`, { signal }), ref);
}
