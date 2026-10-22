/** A display-only projection of the selected, server-verified Procurement context. */
export type VerifiedOrganisationContext = {
  company: { id: string; code: string; name: string };
  branch: { id: string; name: string; legalEntityId: string } | null;
};
type Selection = { entityId?: string; branch?: string };
const guid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const label = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
  && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value);
function invalid(): never { throw new Error("The selected organisation context could not be verified."); }
export function verifiedOrganisationContext(value: unknown, selection: Selection): VerifiedOrganisationContext {
  if (!object(value) || !guid(value.principalId) || !label(value.tenantId)
    || !guid(value.legalEntityId) || !object(value.company) || value.company.id !== value.legalEntityId
    || !label(value.company.name) || !label(value.company.code)
    || typeof value.company.currencyCode !== "string" || !/^[a-z]{3}$/i.test(value.company.currencyCode)
    || selection.entityId && (!guid(selection.entityId) || selection.entityId !== value.legalEntityId)
    || !Array.isArray(value.permissions) || !value.permissions.every(permission => typeof permission === "string")
    || !value.permissions.includes("procurement-access")) invalid();
  const company = { id: value.legalEntityId, code: value.company.code, name: value.company.name };
  if (value.branch === null) {
    if (selection.branch) invalid();
    return { company, branch: null };
  }
  if (!object(value.branch) || !guid(value.branch.id) || !label(value.branch.name) || !label(value.branch.code)
    || selection.branch && (!guid(selection.branch) || selection.branch !== value.branch.id)) invalid();
  return { company, branch: { id: value.branch.id, name: value.branch.name, legalEntityId: company.id } };
}
export async function fetchVerifiedOrganisationContext(selection: Selection, signal: AbortSignal,
  fetcher: typeof fetch = fetch, token?: string | null): Promise<VerifiedOrganisationContext> {
  if (selection.entityId && !guid(selection.entityId) || selection.branch && !guid(selection.branch)) invalid();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (selection.entityId) headers["X-Shell-Entity"] = selection.entityId;
  if (selection.branch) headers["X-Shell-Location"] = selection.branch;
  const response = await fetcher("/api/procurement/v1/context", {
    headers, signal, credentials: "include", cache: "no-store",
  });
  if (!response.ok) invalid();
  return verifiedOrganisationContext(await response.json() as unknown, selection);
}
