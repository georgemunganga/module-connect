/** Internal PO drafts. Approval, issue, commitment and supplier dispatch are separate gates. */
export type OrderDraftLine = {
  id?: string | null; description: string; unitCode: string; quantity: number;
  unitPrice: number; taxAmount: number; costCenterRef?: string | null;
  projectRef?: string | null; expectedDeliveryOn?: string | null;
};
export type OrderDraftInput = {
  supplierId: string; currencyCode: string; shipToRef?: string | null;
  billToRef?: string | null; paymentTermRef?: string | null;
  expectedDeliveryOn?: string | null; lines: OrderDraftLine[];
};
export type OrderSummary = {
  id: string; number: string; supplierId: string; supplierName?: string | null;
  currencyCode: string; status: "Draft" | "Cancelled";
  expectedDeliveryOn?: string | null; version: number; createdAt: string;
};
export type OrderDetail = OrderSummary & {
  buyerSubjectId: string; shipToRef?: string | null; billToRef?: string | null;
  paymentTermRef?: string | null; closureReason?: string | null; total: number;
  lines: (OrderDraftLine & { id: string; lineNumber: number })[]; nextStep: string;
};
export type OrderPage = { items: OrderSummary[]; total: number; page: number; pageSize: number };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class OrderDraftError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request(legalEntityId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(legalEntityId)) throw new OrderDraftError(0, "Choose an ERP company first.");
  const headers = new Headers(init.headers);
  headers.set("X-Shell-Entity", legalEntityId);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/orders${path}`, {
      ...init, headers, credentials: "include", cache: "no-store",
    });
  } catch {
    throw new OrderDraftError(0, "Purchase orders are unavailable. Your changes were not confirmed.");
  }
  if (!response.ok) {
    let reason = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) reason = String(body.message ?? body.detail ?? body.title ?? "");
    } catch { /* Keep a useful fallback. */ }
    throw new OrderDraftError(response.status,
      response.status === 401 ? "Sign in to ERP to open purchase orders."
        : response.status === 403 ? "You do not have purchase order access for this company."
          : reason || "The order action could not be completed.");
  }
  try { return await response.json(); }
  catch { throw new OrderDraftError(0, "The ERP returned an invalid order response."); }
}

export async function listOwnOrderDrafts(legalEntityId: string, page = 1, signal?: AbortSignal): Promise<OrderPage> {
  const body = await request(legalEntityId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || typeof body.total !== "number"
    || typeof body.page !== "number" || typeof body.pageSize !== "number"
    || !body.items.every((row: unknown) => object(row) && guid.test(String(row.id))
      && typeof row.number === "string" && typeof row.status === "string"))
    throw new OrderDraftError(0, "The ERP returned an invalid order list.");
  return body as unknown as OrderPage;
}

export async function getOwnOrderDraft(legalEntityId: string, id: string, signal?: AbortSignal): Promise<OrderDetail> {
  if (!guid.test(id)) throw new OrderDraftError(0, "Order reference is invalid.");
  const body = await request(legalEntityId, `/${id}`, { signal });
  if (!object(body) || body.id !== id || !Array.isArray(body.lines)
    || typeof body.version !== "number" || typeof body.total !== "number")
    throw new OrderDraftError(0, "The ERP returned invalid order details.");
  return body as unknown as OrderDetail;
}

export async function createOwnOrderDraft(legalEntityId: string, draft: OrderDraftInput): Promise<OrderDetail> {
  const body = await request(legalEntityId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!object(body) || !guid.test(String(body.id)) || body.status !== "Draft")
    throw new OrderDraftError(0, "The ERP did not confirm this draft. Check the order list before retrying.");
  return body as unknown as OrderDetail;
}

export async function updateOwnOrderDraft(legalEntityId: string, id: string,
  version: number, draft: OrderDraftInput, reason?: string): Promise<OrderDetail> {
  const body = await request(legalEntityId, `/${id}`, {
    method: "PUT", body: JSON.stringify({ version, reason, draft }),
  });
  if (!object(body) || body.id !== id || body.status !== "Draft" || typeof body.version !== "number")
    throw new OrderDraftError(0, "The ERP did not confirm this update. Refresh before retrying.");
  return body as unknown as OrderDetail;
}

export async function cancelOwnOrderDraft(legalEntityId: string, id: string,
  version: number, reason: string): Promise<OrderDetail> {
  const body = await request(legalEntityId, `/${id}/cancel`, {
    method: "POST", body: JSON.stringify({ version, reason }),
  });
  if (!object(body) || body.id !== id || body.status !== "Cancelled")
    throw new OrderDraftError(0, "The ERP did not confirm cancellation. Refresh before retrying.");
  return body as unknown as OrderDetail;
}
