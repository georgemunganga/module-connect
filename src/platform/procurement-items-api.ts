/** Draft item stewardship. Catalog publication and eligibility are separate workflows. */
export type ItemDraft = {
  code: string; name: string; kind: string; categoryCode: string; unitCode: string;
  description?: string | null; taxCodeRef?: string | null;
  purchaseUnitCode?: string | null; purchaseUnitConversion?: number | null;
  brand?: string | null; manufacturer?: string | null; manufacturerPartNumber?: string | null;
  leadTimeDays?: number | null; minimumOrderQuantity?: number | null;
  expenseAccountRef?: string | null; isStockItem: boolean; isAsset: boolean;
  inspectionRequired: boolean;
};
export type ItemSummary = Pick<ItemDraft, "code" | "name" | "kind" | "categoryCode" | "unitCode" | "description" | "brand" | "leadTimeDays" | "isStockItem" | "isAsset"> & {
  id: string; status: string; isPurchasable: boolean; version: number;
};
export type ItemDetail = ItemSummary & ItemDraft;
export type ItemPage = { items: ItemSummary[]; total: number; page: number; pageSize: number };

export class ItemApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function request<T>(companyId: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!guid.test(companyId)) throw new ItemApiError(0, "Choose an ERP company before opening items.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Shell-Entity", companyId);
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/items${path}`, { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new ItemApiError(0, "Item records are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let reason = "";
    try { const body: unknown = await response.json(); if (object(body)) reason = String(body.message ?? body.detail ?? ""); }
    catch { /* A non-JSON error still gets a useful message. */ }
    throw new ItemApiError(response.status, response.status === 403 ? "You do not have access to items for this company."
      : response.status === 401 ? "Sign in to ERP to manage items."
      : reason || (response.status === 409 ? "This item changed. Refresh and compare before saving." : "The item action failed."));
  }
  try { return await response.json() as T; }
  catch { throw new ItemApiError(0, "The ERP returned an invalid item response."); }
}

function validItem(value: unknown): value is ItemSummary {
  return object(value) && guid.test(String(value.id)) && typeof value.code === "string"
    && typeof value.name === "string" && typeof value.status === "string"
    && typeof value.version === "number" && typeof value.isPurchasable === "boolean";
}

export async function listItemDrafts(companyId: string, options: { search?: string; page?: number; signal?: AbortSignal } = {}): Promise<ItemPage> {
  const query = new URLSearchParams({ page: String(options.page ?? 1), pageSize: "25" });
  if (options.search) query.set("search", options.search);
  const body: unknown = await request(companyId, `?${query}`, { signal: options.signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(validItem)
    || typeof body.total !== "number" || typeof body.page !== "number" || typeof body.pageSize !== "number")
    throw new ItemApiError(0, "The ERP returned an invalid item list.");
  return body as unknown as ItemPage;
}

export async function getItemDraft(companyId: string, id: string, signal?: AbortSignal): Promise<ItemDetail> {
  if (!guid.test(id)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${id}`, { signal });
  if (!validItem(body)) throw new ItemApiError(0, "The ERP returned invalid item details.");
  return body as ItemDetail;
}

export async function createItemDraft(companyId: string, draft: ItemDraft): Promise<ItemSummary> {
  const body: unknown = await request(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!validItem(body)) throw new ItemApiError(0, "The ERP did not confirm the saved item. Refresh before retrying.");
  return body;
}

export async function updateItemDraft(companyId: string, id: string, version: number, draft: ItemDraft): Promise<ItemSummary> {
  if (!guid.test(id)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${id}`, { method: "PUT", body: JSON.stringify({ version, item: draft }) });
  if (!validItem(body)) throw new ItemApiError(0, "The ERP did not confirm the item update. Refresh before retrying.");
  return body;
}

export async function deactivateItem(companyId: string, id: string, version: number): Promise<ItemSummary> {
  if (!guid.test(id)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/deactivate`, { method: "POST", body: JSON.stringify({ version }) });
  if (!validItem(body)) throw new ItemApiError(0, "The ERP did not confirm the item change. Refresh before retrying.");
  return body;
}
