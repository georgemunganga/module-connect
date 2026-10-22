import { invoiceDecimal } from "../../shared/procurement-decimal";
import { procurementScopeHeaders } from "../../shared/shell-scope";

/** Published catalog prices available to an employee in the selected ERP company. */
export type PublishedCatalogPrice = {
  entryId: string; itemId: string; code: string; name: string; kind: string;
  description?: string | null; categoryCode: string; unitCode: string;
  estimatedUnitPrice: number; exactEstimatedUnitPrice?: string; currencyCode: string; supplierId: string;
  supplierName: string; priceValidUntil?: string | null; publishedVersion: number;
};
export type PublishedCatalogPage = { items: PublishedCatalogPrice[]; total: number; page: number; pageSize: number };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Only an explicit exact owner companion may be labelled as a price. Legacy numeric
 * wire stays compatible for old callers; this helper never derives exactness from it. */
export function catalogExactUnitPrice(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return invoiceDecimal(value); } catch { return undefined; }
}

function validPrice(value: unknown): value is PublishedCatalogPrice {
  return object(value) && guid.test(String(value.entryId)) && guid.test(String(value.itemId))
    && guid.test(String(value.supplierId)) && typeof value.name === "string"
    && typeof value.code === "string" && typeof value.categoryCode === "string"
    && typeof value.unitCode === "string" && typeof value.currencyCode === "string"
    && typeof value.estimatedUnitPrice === "number" && value.estimatedUnitPrice >= 0
    && typeof value.publishedVersion === "number" && value.publishedVersion > 0;
}

export async function listPublishedCatalog(companyId: string, search = "", signal?: AbortSignal, page = 1): Promise<PublishedCatalogPage> {
  if (!guid.test(companyId)) throw new Error("Choose an ERP company before searching the catalog.");
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Choose a valid catalog page.");
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (search.trim()) query.set("search", search.trim());
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/catalog?${query}`, {
      credentials: "include", cache: "no-store", signal, headers: procurementScopeHeaders(companyId),
    });
  } catch {
    throw new Error("The buying catalog is unavailable. You can still enter a non-catalog item.");
  }
  if (!response.ok) throw new Error(response.status === 403 ? "You cannot view this company's catalog."
    : response.status === 401 ? "Sign in to ERP to view the catalog."
    : "The buying catalog is unavailable. You can still enter a non-catalog item.");
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error("The ERP returned an invalid buying catalog."); }
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(validPrice)
    || typeof body.total !== "number" || typeof body.page !== "number" || typeof body.pageSize !== "number")
    throw new Error("The ERP returned an invalid buying catalog.");
  return { ...body, items: body.items.map(item => ({ ...item,
    exactEstimatedUnitPrice: catalogExactUnitPrice(item.exactEstimatedUnitPrice),
  })) } as PublishedCatalogPage;
}
