import { procurementScopeHeaders } from "../../shared/shell-scope";

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
export type CatalogPriceDraft = {
  supplierId: string; currencyCode: string; unitCode: string; unitPrice: number | string;
  effectiveFrom: string; effectiveTo?: string | null;
  taxBasis?: string | null; minimumQuantity?: number | string | null;
  maximumQuantity?: number | string | null; audienceCode?: string | null;
};
export type CatalogPrice = Omit<CatalogPriceDraft, "supplierId"> & {
  id: string; catalogItemId: string; supplierId: string | null;
  status: string; version: number;
  catalogEditVersion?: number;
  exactAmounts?: { unitPrice: string; minimumQuantity: string | null; maximumQuantity: string | null };
};
export type CatalogPriceEdit = Omit<CatalogPriceDraft, "supplierId" | "unitPrice" | "minimumQuantity" | "maximumQuantity"> & {
  supplierId: string | null; unitPrice: string; minimumQuantity: string | null; maximumQuantity: string | null;
};

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
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
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
export async function activateItem(companyId: string, id: string, version: number,
  reason: string): Promise<ItemSummary> {
  if (!guid.test(id)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${id}/activate`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validItem(body) || body.status !== "Active" || !body.isPurchasable)
    throw new ItemApiError(0, "The ERP did not confirm item activation. Refresh before retrying.");
  return body;
}
function validPrice(value: unknown): value is CatalogPrice {
  return object(value) && guid.test(String(value.id)) && guid.test(String(value.catalogItemId))
    && typeof value.status === "string" && typeof value.version === "number"
    && (typeof value.unitPrice === "number" || typeof value.unitPrice === "string");
}
export async function listCatalogPrices(companyId: string, itemId: string,
  signal?: AbortSignal): Promise<CatalogPrice[]> {
  if (!guid.test(itemId)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${itemId}/catalog-entries`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(validPrice))
    throw new ItemApiError(0, "The ERP returned an invalid catalog price list.");
  return body.items;
}
export async function addCatalogPrice(companyId: string, itemId: string,
  draft: CatalogPriceDraft): Promise<CatalogPrice> {
  if (!guid.test(itemId)) throw new ItemApiError(0, "The item reference is invalid.");
  const body: unknown = await request(companyId, `/${itemId}/catalog-entries`,
    { method: "POST", body: JSON.stringify(draft) });
  if (!validPrice(body) || body.status !== "Draft")
    throw new ItemApiError(0, "The ERP did not confirm the saved catalog price. Refresh before retrying.");
  return body;
}
export async function publishCatalogPrice(companyId: string, itemId: string,
  priceId: string, version: number, reason: string): Promise<CatalogPrice> {
  if (!guid.test(itemId) || !guid.test(priceId)) throw new ItemApiError(0, "The catalog price reference is invalid.");
  const body: unknown = await request(companyId, `/${itemId}/catalog-entries/${priceId}/publish`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validPrice(body) || body.status !== "Published")
    throw new ItemApiError(0, "The ERP did not confirm publication. Refresh before retrying.");
  return body;
}
export async function withdrawCatalogPrice(companyId: string, itemId: string,
  priceId: string, version: number, reason: string): Promise<CatalogPrice> {
  if (!guid.test(itemId) || !guid.test(priceId)) throw new ItemApiError(0, "The catalog price reference is invalid.");
  const body: unknown = await request(companyId, `/${itemId}/catalog-entries/${priceId}/withdraw`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!validPrice(body) || body.status !== "Withdrawn")
    throw new ItemApiError(0, "The ERP did not confirm withdrawal. Refresh before retrying.");
  return body;
}

/** Completeness marker is additive. Older DTOs remain readable, never editable by guessing hidden terms. */
export function catalogPriceEditDraft(price: CatalogPrice): CatalogPriceEdit {
  const amounts = price.exactAmounts;
  const exact = (value: unknown): value is string => typeof value === "string"
    && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value);
  if (price.catalogEditVersion !== 1 || price.status !== "Draft" || !Number.isSafeInteger(price.version) || price.version < 1
    || !guid.test(price.id) || !guid.test(price.catalogItemId) || price.supplierId !== null && !guid.test(price.supplierId)
    || !Object.prototype.hasOwnProperty.call(price, "taxBasis") || !Object.prototype.hasOwnProperty.call(price, "audienceCode")
    || price.taxBasis !== null && typeof price.taxBasis !== "string" || price.audienceCode !== null && typeof price.audienceCode !== "string"
    || !amounts || !exact(amounts.unitPrice) || amounts.minimumQuantity !== null && !exact(amounts.minimumQuantity)
    || amounts.maximumQuantity !== null && !exact(amounts.maximumQuantity)
    || typeof price.currencyCode !== "string" || typeof price.unitCode !== "string"
    || typeof price.effectiveFrom !== "string" || !Number.isFinite(Date.parse(price.effectiveFrom))
    || price.effectiveTo != null && !Number.isFinite(Date.parse(price.effectiveTo)))
    throw new ItemApiError(0, "Exact catalog price details are unavailable. Refresh before editing; no saved terms were guessed.");
  return { supplierId: price.supplierId, currencyCode: price.currencyCode, unitCode: price.unitCode,
    unitPrice: amounts.unitPrice, minimumQuantity: amounts.minimumQuantity, maximumQuantity: amounts.maximumQuantity,
    taxBasis: price.taxBasis, audienceCode: price.audienceCode, effectiveFrom: price.effectiveFrom, effectiveTo: price.effectiveTo ?? null };
}
export function catalogPriceCanEdit(price: CatalogPrice): boolean {
  try { catalogPriceEditDraft(price); return true; } catch { return false; }
}
export async function updateCatalogPrice(companyId: string, itemId: string, priceId: string,
  version: number, entry: CatalogPriceEdit): Promise<CatalogPrice> {
  if (!guid.test(itemId) || !guid.test(priceId) || !Number.isSafeInteger(version) || version < 1)
    throw new ItemApiError(0, "Refresh the catalog price before editing.");
  const body: unknown = await request(companyId, `/${itemId}/catalog-entries/${priceId}`,
    { method: "PUT", body: JSON.stringify({ version, entry }) });
  if (!validPrice(body) || body.id !== priceId || body.catalogItemId !== itemId || body.version !== version + 1
    || !catalogPriceCanEdit(body))
    throw new ItemApiError(0, "The ERP did not confirm this catalog price correction. Check its saved details before trying again.");
  return body;
}
