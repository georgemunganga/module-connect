import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Manual invoice intake only. Finance owns posting and payment. */
export type InvoiceLineInput = {
  description: string; quantity: number | string; unitPrice: number | string; taxAmount: number | string;
  taxCodeRef?: string | null; costCenterRef?: string | null;
};
export type InvoiceIntakeInput = {
  supplierId: string; purchaseOrderId?: string | null; invoiceNumber: string;
  invoiceDate: string; dueDate?: string | null; currencyCode: string;
  lines: InvoiceLineInput[];
  intakeSchemaVersion?: 1 | 2; expectedCurrencyReferenceId?: string;
  expectedCurrencyRevision?: number; expectedCalculationSha256?: string;
};
export type InvoiceAmountLine = { lineNumber: number; quantity: string; unitPrice: string; rawNet: string;
  net: string; tax: string; gross: string; adjustment: string };
export type InvoiceAmountCalculation = { schemaVersion: 2; precision: { currencyCode: string;
  referenceId: string; revision: number; minorUnits: number; rounding: "ToEven" | "AwayFromZero";
  payloadSha256: string; publishedAtUtc: string; observedAtUtc: string };
  amounts: { rawNet: string; net: string; tax: string; gross: string; adjustment: string;
    lines: InvoiceAmountLine[] }; previewSha256?: string; calculationId?: string;
  calculationSha256?: string; invoiceId?: string };
export type InvoiceSummary = {
  id: string; supplierId: string; branchRef?: string | null; supplierName?: string | null;
  invoiceNumber: string; invoiceDate: string; currencyCode: string;
  grossAmount: number | string; status: "Received" | "Cancelled"; intakeChannel: string;
  version: number; createdAt: string;
};
export type InvoiceDetail = InvoiceSummary & {
  purchaseOrderId?: string | null; dueDate?: string | null;
  netAmount: number | string; taxAmount: number | string; nextStep: string;
  intakeCrudVersion?: number; allowedActions?: string[];
  exactAmounts?: { netAmount: string; taxAmount: string; grossAmount: string };
  lines: (InvoiceLineInput & { id: string; lineNumber: number; exactAmounts?: { quantity: string; unitPrice: string; taxAmount: string } })[];
};
export type InvoicePage = { items: InvoiceSummary[]; total: number; page: number; pageSize: number };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class InvoiceIntakeError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

async function request(legalEntityId: string, path: string, init: RequestInit = {}, binary = false): Promise<unknown> {
  if (!guid.test(legalEntityId)) throw new InvoiceIntakeError(0, "Choose an ERP company first.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(legalEntityId)).forEach(([key, value]) => headers.set(key, value));
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/invoices${path}`, {
      ...init, headers, credentials: "include", cache: "no-store",
    });
  } catch {
    throw new InvoiceIntakeError(0, "Invoice intake is unavailable. Your changes were not confirmed.");
  }
  if (!response.ok) {
    let reason = ""; let code: string | undefined;
    try {
      const body: unknown = await response.json();
      if (object(body)) { reason = String(body.message ?? body.detail ?? body.title ?? "");
        if (typeof body.code === "string") code = body.code; }
    } catch { /* Keep a useful fallback for non-JSON errors. */ }
    throw new InvoiceIntakeError(response.status,
      response.status === 401 ? "Sign in to ERP to open invoices."
        : response.status === 403 ? "You do not have invoice access for this company."
          : reason || (response.status === 404 ? "Invoice not found."
            : response.status === 409 ? "This invoice is already recorded. Search the invoice list before trying again."
              : "The invoice action could not be completed."), code);
  }
  if (binary) return response.blob();
  try { return await response.json(); }
  catch { throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice response."); }
}

const exactAmount = (value: unknown): value is string => typeof value === "string"
  && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
function readCalculation(value: unknown, kind: "preview" | "saved", expectedInvoice?: string): InvoiceAmountCalculation {
  if (!object(value) || value.schemaVersion !== 2 || !object(value.precision) || !object(value.amounts))
    throw new InvoiceIntakeError(0, "The ERP returned an invalid currency calculation.");
  const p = value.precision, a = value.amounts;
  if (!guid.test(String(p.referenceId)) || typeof p.revision !== "number" || !Number.isSafeInteger(p.revision) || p.revision < 1
    || typeof p.minorUnits !== "number" || !Number.isInteger(p.minorUnits) || p.minorUnits < 0 || p.minorUnits > 4
    || !["ToEven", "AwayFromZero"].includes(String(p.rounding)) || !/^[A-Z]{3}$/.test(String(p.currencyCode))
    || !/^[0-9a-f]{64}$/i.test(String(p.payloadSha256))
    || typeof p.publishedAtUtc !== "string" || typeof p.observedAtUtc !== "string"
    || ![a.rawNet, a.net, a.tax, a.gross, a.adjustment].every(exactAmount)
    || !Array.isArray(a.lines) || !a.lines.length || !a.lines.every((line: unknown, index: number) =>
      object(line) && line.lineNumber === index + 1 && [line.quantity, line.unitPrice, line.rawNet,
        line.net, line.tax, line.gross, line.adjustment].every(exactAmount))
    || (kind === "preview" ? !/^[0-9a-f]{64}$/i.test(String(value.previewSha256))
      : !guid.test(String(value.calculationId)) || value.invoiceId !== expectedInvoice
        || !/^[0-9a-f]{64}$/i.test(String(value.calculationSha256))))
    throw new InvoiceIntakeError(0, "The ERP returned an invalid currency calculation.");
  return value as unknown as InvoiceAmountCalculation;
}
export async function previewInvoiceCalculation(company: string, input: InvoiceIntakeInput,
  signal?: AbortSignal): Promise<InvoiceAmountCalculation> {
  return readCalculation(await request(company, "/calculation-preview", { method: "POST", body: JSON.stringify(input), signal }), "preview");
}
export async function getInvoiceAmountCalculation(company: string, invoiceId: string,
  signal?: AbortSignal): Promise<InvoiceAmountCalculation | null> {
  if (!guid.test(invoiceId)) throw new InvoiceIntakeError(0, "Invoice reference is invalid.");
  try { return readCalculation(await request(company, `/${invoiceId}/amount-calculation`, { signal }), "saved", invoiceId); }
  catch (cause) { if (cause instanceof InvoiceIntakeError && cause.status === 404 && cause.code === "legacy-invoice-calculation") return null;
    throw cause; }
}

export async function listInvoiceIntake(legalEntityId: string, page = 1, signal?: AbortSignal): Promise<InvoicePage> {
  const body = await request(legalEntityId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || typeof body.total !== "number"
    || typeof body.page !== "number" || typeof body.pageSize !== "number"
    || !body.items.every((row: unknown) => object(row) && guid.test(String(row.id))
      && typeof row.invoiceNumber === "string" && ["Received", "Cancelled"].includes(String(row.status))))
    throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice list.");
  return body as unknown as InvoicePage;
}

export async function getInvoiceIntake(legalEntityId: string, id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  if (!guid.test(id)) throw new InvoiceIntakeError(0, "Invoice reference is invalid.");
  const body = await request(legalEntityId, `/${id}`, { signal });
  if (!object(body) || body.id !== id || !["Received", "Cancelled"].includes(String(body.status)) || !Array.isArray(body.lines))
    throw new InvoiceIntakeError(0, "The ERP returned invalid invoice details.");
  return body as unknown as InvoiceDetail;
}

export type InvoiceCaptureResult = { id: string; status: "Received"; intakeSchemaVersion?: number; calculationId?: string };
function readCaptureResult(body: unknown, v2: boolean): InvoiceCaptureResult {
  if (!object(body) || !guid.test(String(body.id)) || body.status !== "Received")
    throw new InvoiceIntakeError(0, "The ERP did not confirm this invoice. Check the list before retrying.");
  if (v2 && (body.intakeSchemaVersion !== 2 || !guid.test(String(body.calculationId))
    || !object(body.amounts) || ![body.amounts.rawNet, body.amounts.net, body.amounts.tax,
      body.amounts.gross, body.amounts.adjustment].every(exactAmount)))
    throw new InvoiceIntakeError(0, "The ERP did not confirm the saved currency calculation. Check the invoice list before retrying.");
  return body as InvoiceCaptureResult;
}
export async function captureInvoiceIntake(legalEntityId: string, input: InvoiceIntakeInput,
  commandKey?: string): Promise<InvoiceCaptureResult> {
  if (input.intakeSchemaVersion === 2 && (!commandKey || !guid.test(commandKey)))
    throw new InvoiceIntakeError(0, "Save the original invoice command key before recording this bill.");
  const body = await request(legalEntityId, "", { method: "POST", body: JSON.stringify(input),
    headers: commandKey ? { "Idempotency-Key": commandKey } : undefined });
  return readCaptureResult(body, input.intakeSchemaVersion === 2);
}
export async function recoverInvoiceCapture(legalEntityId: string, commandKey: string): Promise<InvoiceCaptureResult> {
  if (!guid.test(commandKey)) throw new InvoiceIntakeError(0, "Saved invoice command reference is invalid.");
  return readCaptureResult(await request(legalEntityId, `/capture-commands/${commandKey}`), true);
}

export function invoiceAllows(invoice: InvoiceDetail, action: "Edit" | "Cancel"): boolean {
  return invoice.intakeCrudVersion === 1 && invoice.status === "Received"
    && Number.isSafeInteger(invoice.version) && invoice.version > 0
    && Array.isArray(invoice.allowedActions) && invoice.allowedActions.includes(action);
}
export function invoiceEditInput(invoice: InvoiceDetail): InvoiceIntakeInput {
  if (!invoiceAllows(invoice, "Edit") || !invoice.lines.length || invoice.lines.some(line => !line.exactAmounts
    || ![line.exactAmounts.quantity, line.exactAmounts.unitPrice, line.exactAmounts.taxAmount].every(value =>
      typeof value === "string" && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value))))
    throw new InvoiceIntakeError(0, "Exact invoice details are unavailable. Refresh the invoice before editing.");
  return { supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
    invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, currencyCode: invoice.currencyCode,
    lines: invoice.lines.map(line => ({ description: line.description, ...line.exactAmounts!,
      taxCodeRef: line.taxCodeRef, costCenterRef: line.costCenterRef })) };
}
export async function updateInvoiceIntake(company: string, id: string, version: number, draft: InvoiceIntakeInput, reason: string): Promise<InvoiceDetail> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !reason.trim() || reason.trim().length > 1000)
    throw new InvoiceIntakeError(422, "Refresh the invoice and add a reason for the change.");
  const result = await request(company, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft, reason: reason.trim() }) });
  if (!object(result) || result.id !== id || result.status !== "Received") throw new InvoiceIntakeError(0, "Invoice changes were not confirmed. Check the saved invoice.");
  return result as unknown as InvoiceDetail;
}
export async function cancelInvoiceIntake(company: string, id: string, version: number, reason: string): Promise<void> {
  if (!guid.test(id) || !Number.isSafeInteger(version) || version < 1 || !reason.trim() || reason.trim().length > 1000)
    throw new InvoiceIntakeError(422, "Refresh the invoice and add a cancellation reason.");
  const result = await request(company, `/${id}/cancel`, { method: "POST", body: JSON.stringify({ version, reason: reason.trim() }) });
  if (!object(result) || result.id !== id || result.status !== "Cancelled") throw new InvoiceIntakeError(0, "Cancellation was not confirmed. Check the saved invoice.");
}

export type InvoiceDocument = {
  documentId: string; versionId: string; versionNumber: number; fileName: string;
  mediaType: string; sizeBytes: number; sha256: string;
  scanState: "Quarantined" | "Scanning" | "Available" | "Rejected" | "ScanFailed";
  failureCode?: string | null; canDownload: boolean;
};
function documentPath(invoiceId: string, versionId?: string): string {
  if (!guid.test(invoiceId) || (versionId && !guid.test(versionId)))
    throw new InvoiceIntakeError(0, "Document reference is invalid.");
  return `/${invoiceId}/documents${versionId ? `/${versionId}` : ""}`;
}
function readDocument(value: unknown): InvoiceDocument {
  if (!object(value) || !guid.test(String(value.documentId)) || !guid.test(String(value.versionId))
    || typeof value.fileName !== "string" || typeof value.sizeBytes !== "number" || value.sizeBytes < 1
    || typeof value.versionNumber !== "number" || typeof value.mediaType !== "string"
    || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.sha256)
    || !["Quarantined", "Scanning", "Available", "Rejected", "ScanFailed"].includes(String(value.scanState))
    || typeof value.canDownload !== "boolean" || (value.canDownload && value.scanState !== "Available"))
    throw new InvoiceIntakeError(0, "The ERP returned invalid document details.");
  return value as unknown as InvoiceDocument;
}
export type InvoiceDocuments = { items: InvoiceDocument[]; limits: { maxFileBytes: number; maxOwnerFiles: number } };
export async function listInvoiceDocuments(company: string, invoiceId: string, signal?: AbortSignal): Promise<InvoiceDocuments> {
  const result = await request(company, documentPath(invoiceId), { signal });
  if (!object(result) || !Array.isArray(result.items) || !object(result.limits)
    || typeof result.limits.maxFileBytes !== "number" || result.limits.maxFileBytes < 1 || result.limits.maxFileBytes > 100 * 1024 * 1024
    || typeof result.limits.maxOwnerFiles !== "number" || result.limits.maxOwnerFiles < 1 || result.limits.maxOwnerFiles > 100)
    throw new InvoiceIntakeError(0, "Documents could not be loaded.");
  return { items: result.items.map(readDocument), limits: result.limits as InvoiceDocuments["limits"] };
}
export async function uploadInvoiceDocument(company: string, invoiceId: string, file: File, uploadKey: string): Promise<InvoiceDocument> {
  if (!guid.test(uploadKey)) throw new InvoiceIntakeError(0, "Choose the file again before uploading.");
  if (!file.size || file.size > 100 * 1024 * 1024) throw new InvoiceIntakeError(0, "Choose a file within the allowed size that is not empty.");
  return readDocument(await request(company, documentPath(invoiceId), { method: "POST", body: file,
    headers: { "Content-Type": "application/octet-stream", "X-Document-Name": encodeURIComponent(file.name), "Idempotency-Key": uploadKey } }));
}
export async function retryInvoiceDocumentScan(company: string, invoiceId: string, versionId: string): Promise<InvoiceDocument> {
  return readDocument(await request(company, documentPath(invoiceId, versionId) + "/retry-scan", { method: "POST" }));
}
export async function downloadInvoiceDocument(company: string, invoiceId: string, versionId: string): Promise<Blob> {
  return await request(company, documentPath(invoiceId, versionId) + "/download", {}, true) as Blob;
}
