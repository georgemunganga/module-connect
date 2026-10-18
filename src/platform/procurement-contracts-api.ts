/** Commercial contract drafts. Review, signature, activation and drawdowns are separate workflows. */
export type ContractDraft = {
  supplierId: string; title: string; contractType: string; currencyCode: string;
  ceilingAmount: number; effectiveFrom: string | null; expiresOn: string | null;
  renewalNoticeOn: string | null;
};
export type ContractSummary = ContractDraft & {
  id: string; number: string; status: string; version: number;
};
export type ContractDetail = ContractSummary & {
  terminationReason?: string | null; createdAt?: string;
  draftVersion?: { id: string; revisionNumber: number; status: string; version: number } | null;
};
export type ContractPage = { items: ContractSummary[]; total: number; page: number; pageSize: number };
export class ContractApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

async function call(companyId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new ContractApiError(0, "Choose an ERP company before opening contracts.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Shell-Entity", companyId);
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch(`/api/procurement/v1/contracts${path}`,
      { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new ContractApiError(0, "Contracts are unavailable. Your changes were not confirmed."); }
  if (!response.ok) {
    let detail = "";
    try {
      const body: unknown = await response.json();
      if (object(body)) detail = String(body.message ?? body.detail ?? "");
    } catch { /* Use status-based message. */ }
    throw new ContractApiError(response.status,
      response.status === 403 ? "You do not have access to contracts for this company."
        : response.status === 401 ? "Sign in to ERP to manage contracts."
          : response.status === 409 ? detail || "This contract changed. Refresh and compare before saving."
            : detail || "The contract action failed.");
  }
  try { return await response.json() as unknown; }
  catch { throw new ContractApiError(0, "The ERP returned an invalid contract response."); }
}
function summary(value: unknown): value is ContractSummary {
  return object(value) && guid.test(String(value.id)) && guid.test(String(value.supplierId))
    && typeof value.number === "string" && typeof value.title === "string"
    && typeof value.contractType === "string" && typeof value.currencyCode === "string"
    && typeof value.ceilingAmount === "number" && typeof value.status === "string"
    && typeof value.version === "number";
}
function detail(value: unknown): value is ContractDetail { return summary(value); }
export async function listOwnContractDrafts(companyId: string, page = 1,
  signal?: AbortSignal): Promise<ContractPage> {
  const body = await call(companyId, `?page=${page}&pageSize=25`, { signal });
  if (!object(body) || !Array.isArray(body.items) || !body.items.every(summary)
    || typeof body.total !== "number" || typeof body.page !== "number"
    || typeof body.pageSize !== "number")
    throw new ContractApiError(0, "The ERP returned an invalid contract list.");
  return body as ContractPage;
}
export async function getOwnContractDraft(companyId: string, id: string,
  signal?: AbortSignal): Promise<ContractDetail> {
  if (!guid.test(id)) throw new ContractApiError(0, "The contract reference is invalid.");
  const body = await call(companyId, `/${id}`, { signal });
  if (!detail(body)) throw new ContractApiError(0, "The ERP returned invalid contract details.");
  return body;
}
export async function createOwnContractDraft(companyId: string, draft: ContractDraft): Promise<ContractDetail> {
  const body = await call(companyId, "", { method: "POST", body: JSON.stringify(draft) });
  if (!detail(body)) throw new ContractApiError(0, "The ERP did not confirm the saved contract. Refresh before retrying.");
  return body;
}
export async function updateOwnContractDraft(companyId: string, id: string,
  version: number, draft: ContractDraft): Promise<ContractDetail> {
  if (!guid.test(id)) throw new ContractApiError(0, "The contract reference is invalid.");
  const body = await call(companyId, `/${id}`, { method: "PUT", body: JSON.stringify({ version, draft }) });
  if (!detail(body)) throw new ContractApiError(0, "The ERP did not confirm the contract update. Refresh before retrying.");
  return body;
}
export async function cancelOwnContractDraft(companyId: string, id: string,
  version: number, reason: string): Promise<ContractDetail> {
  if (!guid.test(id)) throw new ContractApiError(0, "The contract reference is invalid.");
  const body = await call(companyId, `/${id}/cancel`, { method: "POST", body: JSON.stringify({ version, reason }) });
  if (!detail(body) || body.status !== "Cancelled")
    throw new ContractApiError(0, "The ERP did not confirm cancellation. Refresh before retrying.");
  return body;
}
