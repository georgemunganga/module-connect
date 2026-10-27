export type ShellSelection = { entityId?: string; branch?: string; branchScope?: "all" };

export type ProcurementCapability =
  | "vendorDraft" | "itemDraft" | "requestDraft" | "approvals" | "principalApprovals" | "sourcing"
  | "contracts" | "orders" | "orderDraft" | "receiving" | "invoiceIntake" | "invoiceDocuments" | "invoiceValidation" | "financeHandoff" | "supplierPortal"
  | "planningDraft" | "configurationDraft" | "contractDraft" | "recurringPurchaseDraft" | "sourcingDraft" | "sourcingSourceDrafts" | "principalSourcingSourceDrafts" | "principalSourcingPublication" | "principalSourcingPublicationRead" | "principalDirectOrderDrafts" | "principalOrderGovernanceRead" | "principalOrderGovernance" | "vendorCreditDraft" | "receivingDrafts" | "receivingGoods" | "receivingInspection" | "receivingServices" | "invoiceComparison" | "invoiceOriginalUnitReview" | "manualPaymentWorkflow";

export type ProcurementReadiness = {
  tenantId: string;
  legalEntityId: string;
  principalId: string;
  workerId: string | null;
  /** Server effective branch; undefined means an older context did not expose it. */
  effectiveBranchId?: string | null;
  adminViewOnly?: boolean;
  defaultCurrencyCode: string;
  schemaReady: boolean;
  permissions: string[];
  capabilities: Record<ProcurementCapability, boolean>;
};

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const capabilityKeys: ProcurementCapability[] = [
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "principalApprovals", "sourcing", "contracts",
  "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "recurringPurchaseDraft", "sourcingDraft", "sourcingSourceDrafts", "principalSourcingSourceDrafts", "principalSourcingPublication", "principalSourcingPublicationRead", "principalDirectOrderDrafts", "principalOrderGovernanceRead", "principalOrderGovernance", "vendorCreditDraft", "receivingDrafts", "receivingGoods", "receivingInspection", "receivingServices", "invoiceComparison", "invoiceOriginalUnitReview", "manualPaymentWorkflow",
];
const optionalCapability = (key: ProcurementCapability) => key === "manualPaymentWorkflow" || key === "principalApprovals" || key === "recurringPurchaseDraft" || key === "invoiceComparison" || key === "invoiceOriginalUnitReview" || key === "sourcingSourceDrafts" || key === "principalSourcingSourceDrafts" || key === "principalSourcingPublication" || key === "principalSourcingPublicationRead" || key === "principalDirectOrderDrafts" || key === "principalOrderGovernanceRead" || key === "principalOrderGovernance" || key === "invoiceIntake" || key === "orderDraft" || key === "invoiceDocuments" || key === "vendorCreditDraft" || (key.startsWith("receiving") && key !== "receiving");
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class ProcurementLiveError extends Error {
  constructor(public readonly code: "sign-in" | "access" | "unavailable" | "invalid-response" | "invalid-scope") {
    super(code === "sign-in" ? "Sign in to ERP to open Procurement."
      : code === "access" ? "Your account does not have Procurement access for this company."
      : code === "invalid-scope" ? "Choose your company and branch from Organisation context before continuing."
      : code === "invalid-response" ? "The ERP returned an invalid Procurement response."
      : "Procurement data is not ready. Please try again later.");
  }
}

function scopeHeaders(selection: ShellSelection): HeadersInit {
  if (selection.entityId && !guid.test(selection.entityId) || selection.branch && !guid.test(selection.branch))
    throw new ProcurementLiveError("invalid-scope");
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
  _paymentPath = false,
): Promise<ProcurementReadiness> {
  const headers = scopeHeaders(selection);
  if (selection.branchScope !== undefined && selection.branchScope !== "all"
    || selection.branchScope === "all" && (!selection.entityId || selection.branch))
    throw new ProcurementLiveError("invalid-scope");
  const contextHeaders = selection.branchScope === "all"
    ? { ...headers, "X-Shell-Branch-Scope": "all" } : headers;
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

  const scoped: RequestInit = { ...common, headers: contextHeaders };
  let contextResponse: Response;
  try { contextResponse = await fetcher("/api/procurement/v1/context", scoped); }
  catch { throw new ProcurementLiveError("unavailable"); }
  if (!contextResponse.ok) throw new ProcurementLiveError(contextResponse.status === 403 ? "access" : "unavailable");
  let context: unknown;
  try { context = await contextResponse.json(); }
  catch { throw new ProcurementLiveError("invalid-response"); }
  if (!object(context) || !guid.test(String(context.legalEntityId))
    || !guid.test(String(context.principalId)) || context.principalId === "00000000-0000-0000-0000-000000000000"
    || !(context.workerId === null || guid.test(String(context.workerId)))
    || typeof context.tenantId !== "string" || !context.tenantId.trim() || !object(context.company)
    || context.company.id !== context.legalEntityId
    || selection.entityId && selection.entityId !== context.legalEntityId
    || typeof context.company.currencyCode !== "string"
    || !/^[a-z]{3}$/i.test(context.company.currencyCode)
    || !Array.isArray(context.permissions) || !context.permissions.every(permission => typeof permission === "string")
    || !context.permissions.includes("procurement-access"))
    throw new ProcurementLiveError("invalid-response");

  let effectiveBranchId: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(context, "branch")) {
    if (context.branch === null) {
      if (selection.branch) throw new ProcurementLiveError("invalid-response");
      effectiveBranchId = null;
    } else {
      if (!object(context.branch) || !guid.test(String(context.branch.id))
        || context.branch.id === "00000000-0000-0000-0000-000000000000"
        || selection.branch && selection.branch !== context.branch.id)
        throw new ProcurementLiveError("invalid-response");
      effectiveBranchId = context.branch.id as string;
    }
  }
  if (selection.branchScope === "all" && effectiveBranchId !== null)
    throw new ProcurementLiveError("invalid-response");

  let metaResponse: Response;
  try { metaResponse = await fetcher("/api/procurement/v1/meta", { ...common, headers: contextHeaders }); }
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
    principalId: context.principalId as string,
    workerId: context.workerId as string | null,
    effectiveBranchId,
    adminViewOnly: false,
    defaultCurrencyCode: (context.company.currencyCode as string).toUpperCase(),
    schemaReady: true,
    permissions: [...new Set(context.permissions as string[])],
    capabilities: Object.fromEntries(capabilityKeys.map((key) =>
      [key, optionalCapability(key)
        ? resolvedCapabilities[key] === true : resolvedCapabilities[key]])) as Record<ProcurementCapability, boolean>,
  };
}
