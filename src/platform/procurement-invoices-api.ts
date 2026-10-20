import { invoiceDecimal, invoiceTotals } from "./procurement-invoice-exact";
import { parseInvoiceOriginalJson } from "./procurement-invoice-json";
import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Manual invoice intake only. Finance owns posting and payment. */
export type InvoiceLineInput = {
  description: string; quantity: string; unitPrice: string; taxAmount: string;
  taxCodeRef?: string | null; costCenterRef?: string | null;
};
export type InvoiceIntakeInput = {
  supplierId: string; purchaseOrderId?: string | null; invoiceNumber: string;
  invoiceDate: string; dueDate?: string | null; currencyCode: string;
  lines: InvoiceLineInput[];
};
export type InvoiceSummary = {
  id: string; supplierId: string; branchRef?: string | null; supplierName?: string | null;
  invoiceNumber: string; invoiceDate: string; currencyCode: string;
  grossAmount: string; status: "Received"; intakeChannel: string;
  version: number; createdAt: string;
};
export type InvoiceDetail = InvoiceSummary & {
  purchaseOrderId?: string | null; dueDate?: string | null;
  netAmount: string; taxAmount: string; nextStep: string;
  lines: (InvoiceLineInput & { id: string; lineNumber: number })[];
};
export type InvoicePage = { items: InvoiceSummary[]; total: number; page: number; pageSize: number };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class InvoiceIntakeError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
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
    let reason = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) reason = String(body.message ?? body.detail ?? body.title ?? "");
    } catch { /* Keep a useful fallback for non-JSON errors. */ }
    throw new InvoiceIntakeError(response.status,
      response.status === 401 ? "Sign in to ERP to open invoices."
        : response.status === 403 ? "You do not have invoice access for this company."
          : reason || (response.status === 404 ? "Invoice not found."
            : response.status === 409 ? "This invoice is already recorded. Search the invoice list before trying again."
              : "The invoice action could not be completed."));
  }
  if (binary) return response.blob();
  try { return parseInvoiceOriginalJson(await response.text()); }
  catch { throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice response."); }
}

export async function listInvoiceIntake(legalEntityId: string, page = 1, signal?: AbortSignal): Promise<InvoicePage> {
  const body = await request(legalEntityId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || typeof body.total !== "number"
    || !Number.isSafeInteger(body.total) || typeof body.page !== "number" || !Number.isSafeInteger(body.page)
    || typeof body.pageSize !== "number" || !Number.isSafeInteger(body.pageSize)
    || !body.items.every((row: unknown) => object(row) && guid.test(String(row.id))
      && typeof row.invoiceNumber === "string" && row.status === "Received" && typeof row.grossAmount === "string"))
    throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice list.");
  return body as unknown as InvoicePage;
}

export async function getInvoiceIntake(legalEntityId: string, id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  if (!guid.test(id)) throw new InvoiceIntakeError(0, "Invoice reference is invalid.");
  const body = await request(legalEntityId, `/${id}`, { signal });
  if (!object(body) || body.id !== id || body.status !== "Received" || !Array.isArray(body.lines)
    || ![body.netAmount, body.taxAmount, body.grossAmount].every((amount) => typeof amount === "string")
    || !Number.isSafeInteger(body.version)
    || !body.lines.every((line: unknown) => object(line) && typeof line.quantity === "string"
      && typeof line.unitPrice === "string" && typeof line.taxAmount === "string"))
    throw new InvoiceIntakeError(0, "The ERP returned invalid invoice details.");
  return body as unknown as InvoiceDetail;
}

export async function captureInvoiceIntake(legalEntityId: string, input: InvoiceIntakeInput): Promise<{ id: string }> {
  // Reject already-rounded number inputs, validate all lines/totals before issuing any request.
  const lines = input.lines.map((line) => ({ ...line, quantity: invoiceDecimal(line.quantity),
    unitPrice: invoiceDecimal(line.unitPrice), taxAmount: invoiceDecimal(line.taxAmount) }));
  const totals = invoiceTotals(lines);
  Object.values(totals).forEach(invoiceDecimal); // Stored original headers require18,4 too; never round.
  const body = await request(legalEntityId, "", { method: "POST", body: JSON.stringify({ ...input, lines }) });
  if (!object(body) || !guid.test(String(body.id)) || body.status !== "Received")
    throw new InvoiceIntakeError(0, "The ERP did not confirm this invoice. Check the list before retrying.");
  return body as { id: string };
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
