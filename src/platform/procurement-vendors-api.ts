/** Supplier intake and review API. Finance retains payment-detail verification. */
export interface VendorContactDraft {
  name: string;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  workPhone?: string | null;
  mobilePhone?: string | null;
  languageCode?: string | null;
  isPrimary: boolean;
}

export interface VendorSiteDraft {
  kind: string;
  addressLine1: string;
  countryCode: string;
  label?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  isPrimary: boolean;
  isServiceSite: boolean;
}

export interface VendorQualificationDraft {
  qualificationType: string;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  evidenceDocumentRefId?: string | null;
}

export interface VendorDraft {
  legalName: string;
  displayName: string;
  countryCode: string;
  registrationNumber?: string | null;
  tradingName?: string | null;
  website?: string | null;
  companyIdType?: string | null;
  taxIdentifierRef?: string | null;
  supplierType?: string | null;
  categoryCode?: string | null;
  currencyCode?: string | null;
  paymentTermRef?: string | null;
  taxCategoryRef?: string | null;
  languageCode?: string | null;
  remarks?: string | null;
  isLocal: boolean;
  portalAccessRequested: boolean;
  primaryContact?: VendorContactDraft | null;
  contacts?: VendorContactDraft[];
  sites?: VendorSiteDraft[];
  qualifications?: VendorQualificationDraft[];
  attributes?: { kind: "CustomField" | "ReportingTag"; key: string; value?: string | null }[];
}

export interface VendorSummary {
  id: string;
  number: string;
  displayName: string;
  legalName: string;
  countryCode: string;
  status: string;
  isOrderable: boolean;
  version: number;
  createdAt: string;
}

export interface VendorPage {
  items: VendorSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type VendorOpenOrders = { supplierId: string; count: number;
  items: Array<{ id: string; number: string; status: string; currencyCode: string;
    issuedAt?: string | null }> };

export interface VendorDetail extends VendorSummary {
  canReturnForInformation?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canSuspend?: boolean;
  canReactivate?: boolean;
  isLocal?: boolean;
  portalAccessState?: string | null;
  registrationNumber?: string | null;
  categoryCode?: string | null;
  statusReason?: string | null;
  statusDecidedAt?: string | null;
  defaultCurrencyCode?: string | null;
  paymentTermRef?: string | null;
  taxCategoryRef?: string | null;
  languageCode?: string | null;
  remarks?: string | null;
  contacts?: (VendorContactDraft & { id: string })[];
  sites?: (VendorSiteDraft & { id: string })[];
  qualifications?: (VendorQualificationDraft & { id: string; reviewStatus: string })[];
}

export class VendorApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function verifyScope(legalEntityId: string) {
  if (!guid.test(legalEntityId)) throw new VendorApiError(0, "Choose an ERP company before opening vendors.");
  return { "X-Shell-Entity": legalEntityId };
}

async function request<T>(legalEntityId: string, path: string, init: RequestInit = {}): Promise<T> {
  const scope = verifyScope(legalEntityId);
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Shell-Entity", scope["X-Shell-Entity"]);
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/vendors${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers,
    });
  } catch {
    throw new VendorApiError(0, "Vendor records are unavailable. Try again; your changes were not confirmed.");
  }
  if (!response.ok) {
    let reason = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) reason = String(body.detail ?? body.title ?? body.message ?? "");
    } catch { /* A non-JSON response still needs a useful error. */ }
    throw new VendorApiError(response.status, response.status === 403
      ? "You do not have access to this vendor or company."
      : response.status === 401 ? "Sign in to ERP to manage vendors." : reason || (
      response.status === 404 ? "This vendor is no longer available to you."
        : response.status === 409 ? "The vendor changed while you were editing. Refresh and compare before saving."
        : "The vendor action could not be completed."
    ));
  }
  try { return await response.json() as T; }
  catch { throw new VendorApiError(0, "The ERP returned an invalid vendor response."); }
}

export async function listVendorDrafts(
  legalEntityId: string,
  options: { search?: string; status?: string; page?: number; pageSize?: number; signal?: AbortSignal } = {},
): Promise<VendorPage> {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.status) query.set("status", options.status);
  query.set("page", String(options.page ?? 1));
  query.set("pageSize", String(options.pageSize ?? 25));
  const body = await request<unknown>(legalEntityId, `?${query}`, { signal: options.signal });
  if (!object(body) || !Array.isArray(body.items) || typeof body.total !== "number" ||
      typeof body.page !== "number" || typeof body.pageSize !== "number" ||
      !body.items.every((row: unknown) => object(row) && guid.test(String(row.id)) &&
        typeof row.displayName === "string" && typeof row.status === "string" &&
        typeof row.isOrderable === "boolean" && typeof row.version === "number"))
    throw new VendorApiError(0, "The ERP returned an invalid vendor list.");
  return body as unknown as VendorPage;
}

export async function getVendorDraft(legalEntityId: string, id: string, signal?: AbortSignal): Promise<VendorDetail> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}`, { signal });
  if (!object(body) || body.id !== id || typeof body.version !== "number")
    throw new VendorApiError(0, "The ERP returned invalid vendor details.");
  return body as unknown as VendorDetail;
}

export async function addVendorContact(legalEntityId: string, id: string, version: number, contact: VendorContactDraft): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  await request<unknown>(legalEntityId, `/${id}/contacts`, { method: "POST", body: JSON.stringify({ version, contact }) });
}

export async function addVendorSite(legalEntityId: string, id: string, version: number, site: VendorSiteDraft): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  await request<unknown>(legalEntityId, `/${id}/sites`, { method: "POST", body: JSON.stringify({ version, site }) });
}

export async function addVendorQualification(legalEntityId: string, id: string, version: number,
  qualification: VendorQualificationDraft): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  await request<unknown>(legalEntityId, `/${id}/qualifications`,
    { method: "POST", body: JSON.stringify({ version, qualification }) });
}

export async function createVendorDraft(legalEntityId: string, draft: VendorDraft): Promise<{ id: string; number: string; version: number; possibleDuplicate: boolean }> {
  const body = await request<unknown>(legalEntityId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!object(body) || !guid.test(String(body.id)) || typeof body.version !== "number")
    throw new VendorApiError(0, "The ERP did not confirm the saved vendor. Refresh the list before trying again.");
  return body as { id: string; number: string; version: number; possibleDuplicate: boolean };
}

export async function updateVendorDraft(legalEntityId: string, id: string, version: number, draft: VendorDraft): Promise<{ id: string; version: number; status: string }> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!object(body) || body.id !== id || typeof body.version !== "number")
    throw new VendorApiError(0, "The ERP did not confirm the vendor update. Refresh before trying again.");
  return body as { id: string; version: number; status: string };
}

export async function withdrawVendorDraft(legalEntityId: string, id: string, version: number, reason: string): Promise<{ id: string; version: number; status: string }> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/withdraw`, { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!object(body) || body.id !== id || body.status !== "Withdrawn")
    throw new VendorApiError(0, "The ERP did not confirm the withdrawal. Refresh before trying again.");
  return body as { id: string; version: number; status: string };
}

export async function submitVendorForReview(legalEntityId: string, id: string, version: number,
  businessReason: string): Promise<{ id: string; version: number; status: string; isOrderable: boolean }> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/submit`,
    { method: "POST", body: JSON.stringify({ version, businessReason }) });
  if (!object(body) || body.id !== id || body.status !== "Submitted"
    || body.isOrderable !== false || typeof body.version !== "number")
    throw new VendorApiError(0, "The ERP did not confirm submission. Refresh before retrying.");
  return body as { id: string; version: number; status: string; isOrderable: boolean };
}

export async function returnVendorForInformation(legalEntityId: string, id: string, version: number,
  reason: string): Promise<{ id: string; version: number; status: string; isOrderable: boolean }> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/return`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!object(body) || body.id !== id || body.status !== "More Information Required"
    || body.isOrderable !== false || typeof body.version !== "number")
    throw new VendorApiError(0, "The ERP did not confirm the review decision. Refresh before retrying.");
  return body as { id: string; version: number; status: string; isOrderable: boolean };
}

export async function approveVendor(legalEntityId: string, id: string, version: number,
  reason: string, duplicatesReviewed: boolean): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/approve`,
    { method: "POST", body: JSON.stringify({ version, reason, duplicatesReviewed }) });
  if (!object(body) || body.id !== id || body.status !== "Active" || body.isOrderable !== true)
    throw new VendorApiError(0, "The ERP did not confirm vendor approval. Refresh before retrying.");
}

export async function rejectVendor(legalEntityId: string, id: string, version: number,
  reason: string): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/reject`,
    { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!object(body) || body.id !== id || body.status !== "Rejected" || body.isOrderable !== false)
    throw new VendorApiError(0, "The ERP did not confirm vendor rejection. Refresh before retrying.");
}

export async function suspendVendor(legalEntityId: string, id: string, version: number,
  reason: string, existingOrdersReviewed: boolean): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  if (!reason.trim() || reason.trim().length > 1000)
    throw new VendorApiError(0, "Explain why this vendor must be placed on hold.");
  const body = await request<unknown>(legalEntityId, `/${id}/suspend`,
    { method: "POST", body: JSON.stringify({ version, reason: reason.trim(), existingOrdersReviewed }) });
  if (!object(body) || body.id !== id || body.status !== "Suspended" || body.isOrderable !== false)
    throw new VendorApiError(0, "The ERP did not confirm the hold. Refresh before retrying.");
}

export async function reactivateVendor(legalEntityId: string, id: string, version: number,
  reason: string, dueDiligenceReviewed: boolean): Promise<void> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  if (!reason.trim() || reason.trim().length > 1000)
    throw new VendorApiError(0, "Explain how the vendor issue was resolved.");
  const body = await request<unknown>(legalEntityId, `/${id}/reactivate`,
    { method: "POST", body: JSON.stringify({ version, reason: reason.trim(), dueDiligenceReviewed }) });
  if (!object(body) || body.id !== id || body.status !== "Active" || body.isOrderable !== true)
    throw new VendorApiError(0, "The ERP did not confirm reactivation. Refresh before retrying.");
}

export async function getVendorOpenOrders(legalEntityId: string, id: string,
  signal?: AbortSignal): Promise<VendorOpenOrders> {
  if (!guid.test(id)) throw new VendorApiError(0, "The vendor reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/open-orders`, { signal });
  if (!object(body) || body.supplierId !== id || typeof body.count !== "number"
    || !Array.isArray(body.items) || body.items.some((item: unknown) => !object(item)
      || !guid.test(String(item.id)) || typeof item.number !== "string" || typeof item.status !== "string"))
    throw new VendorApiError(0, "The ERP returned an invalid open-order list.");
  return body as VendorOpenOrders;
}

export async function reviewVendorQualification(legalEntityId: string, id: string,
  qualificationId: string, version: number, decision: "Verified" | "Rejected", reason: string): Promise<void> {
  if (!guid.test(id) || !guid.test(qualificationId))
    throw new VendorApiError(0, "The qualification reference is invalid.");
  const body = await request<unknown>(legalEntityId, `/${id}/qualifications/${qualificationId}/review`,
    { method: "POST", body: JSON.stringify({ version, decision, reason }) });
  if (!object(body) || body.id !== qualificationId || body.reviewStatus !== decision)
    throw new VendorApiError(0, "The ERP did not confirm the qualification review. Refresh before retrying.");
}
