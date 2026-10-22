export type ShellSelection = { entityId?: string; branch?: string };

export type ProcurementCapability =
  | "vendorDraft" | "itemDraft" | "requestDraft" | "approvals" | "sourcing"
  | "contracts" | "orders" | "orderDraft" | "receiving" | "invoiceIntake" | "invoiceDocuments" | "invoiceValidation" | "financeHandoff" | "supplierPortal"
  | "planningDraft" | "configurationDraft" | "contractDraft" | "recurringPurchaseDraft" | "sourcingDraft" | "sourcingSourceDrafts" | "vendorCreditDraft" | "receivingDrafts" | "receivingGoods" | "receivingInspection" | "receivingServices" | "invoiceComparison" | "invoiceOriginalUnitReview";

export type ProcurementReadiness = {
  tenantId: string;
  legalEntityId: string;
  workerId: string | null;
  adminViewOnly?: boolean;
  defaultCurrencyCode: string;
  schemaReady: boolean;
  permissions: string[];
  capabilities: Record<ProcurementCapability, boolean>;
};

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const capabilityKeys: ProcurementCapability[] = [
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "recurringPurchaseDraft", "sourcingDraft", "sourcingSourceDrafts", "vendorCreditDraft", "receivingDrafts", "receivingGoods", "receivingInspection", "receivingServices", "invoiceComparison", "invoiceOriginalUnitReview",
];
const optionalCapability = (key: ProcurementCapability) => key === "recurringPurchaseDraft" || key === "invoiceComparison" || key === "invoiceOriginalUnitReview" || key === "sourcingSourceDrafts" || key === "invoiceIntake" || key === "orderDraft" || key === "invoiceDocuments" || key === "vendorCreditDraft" || (key.startsWith("receiving") && key !== "receiving");
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class ProcurementLiveError extends Error {
  constructor(public readonly code: "sign-in" | "access" | "unavailable" | "invalid-response") {
    super(code === "sign-in" ? "Sign in to ERP to open Procurement."
      : code === "access" ? "Your account does not have Procurement access for this company."
      : code === "invalid-response" ? "The ERP returned an invalid Procurement response."
      : "Procurement data is not ready. Please try again later.");
  }
}

function scopeHeaders(selection: ShellSelection): HeadersInit {
  const headers: Record<string, string> = {};
  if (selection.entityId && guid.test(selection.entityId)) headers["X-Shell-Entity"] = selection.entityId;
  if (selection.branch && guid.test(selection.branch)) headers["X-Shell-Location"] = selection.branch;
  return headers;
}

/** Checks the same ERP session, company scope and migration gate used by the API. */
export async function fetchProcurementReadiness(
  selection: ShellSelection,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ProcurementReadiness> {
  const common: RequestInit = { credentials: "include", cache: "no-store", signal };
  let auth: Response;
  try { auth = await fetcher("/api/hrm/auth/me", common); }
  catch { throw new ProcurementLiveError("unavailable"); }
  if (!auth.ok) throw new ProcurementLiveError(auth.status === 401 ? "sign-in" : "unavailable");
  let authBody: unknown;
  try { authBody = await auth.json(); }
  catch { throw new ProcurementLiveError("invalid-response"); }
  if (!object(authBody) || typeof authBody.authenticated !== "boolean")
    throw new ProcurementLiveError("invalid-response");
  if (!authBody.authenticated) throw new ProcurementLiveError("sign-in");
  if (!object(authBody.user) || authBody.user.isActive !== true)
    throw new ProcurementLiveError("access");

  const headers = scopeHeaders(selection);
  const scoped: RequestInit = { ...common, headers };
  let contextResponse: Response;
  try { contextResponse = await fetcher("/api/procurement/v1/context", scoped); }
  catch { throw new ProcurementLiveError("unavailable"); }
  if (!contextResponse.ok) throw new ProcurementLiveError(contextResponse.status === 403 ? "access" : "unavailable");
  let context: unknown;
  try { context = await contextResponse.json(); }
  catch { throw new ProcurementLiveError("invalid-response"); }
  const adminViewOnly = object(context) && context.adminViewOnly === true && context.workerId === null
    && Array.isArray(authBody.user.roles) && authBody.user.roles.includes("erp_admin");
  if (!object(context) || !guid.test(String(context.legalEntityId))
    || (!guid.test(String(context.workerId)) && !adminViewOnly)
    || (context.adminViewOnly === true && !adminViewOnly)
    || typeof context.tenantId !== "string" || !object(context.company)
    || context.company.id !== context.legalEntityId
    || typeof context.company.currencyCode !== "string"
    || !/^[a-z]{3}$/i.test(context.company.currencyCode))
    throw new ProcurementLiveError("invalid-response");

  let metaResponse: Response;
  try { metaResponse = await fetcher("/api/procurement/v1/meta", scoped); }
  catch { throw new ProcurementLiveError("unavailable"); }
  if (!metaResponse.ok) throw new ProcurementLiveError(metaResponse.status === 403 ? "access" : "unavailable");
  let meta: unknown;
  try { meta = await metaResponse.json(); }
  catch { throw new ProcurementLiveError("invalid-response"); }
  const resolvedCapabilities = object(meta) && object(meta.capabilities) ? meta.capabilities : null;
  if (!object(meta) || meta.tenantId !== context.tenantId || meta.legalEntityId !== context.legalEntityId
    || meta.schemaReady !== true || !resolvedCapabilities
    || !capabilityKeys.every((key) => optionalCapability(key)
      || typeof resolvedCapabilities[key] === "boolean"))
    throw new ProcurementLiveError("unavailable");

  return {
    tenantId: context.tenantId,
    legalEntityId: context.legalEntityId as string,
    workerId: context.workerId as string | null,
    adminViewOnly,
    defaultCurrencyCode: (context.company.currencyCode as string).toUpperCase(),
    schemaReady: true,
    permissions: Array.isArray(context.permissions)
      ? context.permissions.filter((permission): permission is string => typeof permission === "string"
        && (!adminViewOnly || permission === "procurement-access" || permission.endsWith("-read")
          || permission === "procurement-receipt-view")) : [],
    capabilities: Object.fromEntries(capabilityKeys.map((key) =>
      [key, optionalCapability(key)
        ? resolvedCapabilities[key] === true : resolvedCapabilities[key]])) as Record<ProcurementCapability, boolean>,
  };
}
