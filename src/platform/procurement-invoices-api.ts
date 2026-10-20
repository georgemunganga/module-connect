import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Manual invoice intake only. Finance owns posting and payment. */
export type InvoiceLineInput = {
  description: string; quantity: number; unitPrice: number; taxAmount: number;
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
  grossAmount: number; status: "Received"; intakeChannel: string;
  version: number; createdAt: string;
};
export type InvoiceDetail = InvoiceSummary & {
  purchaseOrderId?: string | null; dueDate?: string | null;
  netAmount: number; taxAmount: number; nextStep: string;
  lines: (InvoiceLineInput & { id: string; lineNumber: number })[];
};
export type InvoicePage = { items: InvoiceSummary[]; total: number; page: number; pageSize: number };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class InvoiceIntakeError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request(legalEntityId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(legalEntityId)) throw new InvoiceIntakeError(0, "Choose an ERP company first.");
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(legalEntityId)).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
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
  try { return await response.json(); }
  catch { throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice response."); }
}

export async function listInvoiceIntake(legalEntityId: string, page = 1, signal?: AbortSignal): Promise<InvoicePage> {
  const body = await request(legalEntityId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || typeof body.total !== "number"
    || typeof body.page !== "number" || typeof body.pageSize !== "number"
    || !body.items.every((row: unknown) => object(row) && guid.test(String(row.id))
      && typeof row.invoiceNumber === "string" && row.status === "Received"))
    throw new InvoiceIntakeError(0, "The ERP returned an invalid invoice list.");
  return body as unknown as InvoicePage;
}

export async function getInvoiceIntake(legalEntityId: string, id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  if (!guid.test(id)) throw new InvoiceIntakeError(0, "Invoice reference is invalid.");
  const body = await request(legalEntityId, `/${id}`, { signal });
  if (!object(body) || body.id !== id || body.status !== "Received" || !Array.isArray(body.lines))
    throw new InvoiceIntakeError(0, "The ERP returned invalid invoice details.");
  return body as unknown as InvoiceDetail;
}

export async function captureInvoiceIntake(legalEntityId: string, input: InvoiceIntakeInput): Promise<{ id: string }> {
  const body = await request(legalEntityId, "", { method: "POST", body: JSON.stringify(input) });
  if (!object(body) || !guid.test(String(body.id)) || body.status !== "Received")
    throw new InvoiceIntakeError(0, "The ERP did not confirm this invoice. Check the list before retrying.");
  return body as { id: string };
}
