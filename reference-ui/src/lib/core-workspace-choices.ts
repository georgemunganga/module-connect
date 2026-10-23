import { canonicalScopeId } from "./legacy-branch-selection";

export type CoreWorkspaceChoices = {
  tenantId: string;
  principalId: string;
  organisationWide: boolean;
  companies: { id: string; code: string; registeredName: string; currency: string; isDefault: boolean }[];
  branches: { id: string; code: string; name: string; legalEntityId: string }[];
};

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const label = (value: unknown): value is string => typeof value === "string"
  && value.trim().length > 0 && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value);

/** Core is the source for allowed company/branch choices. Reject partial or
 * account-mismatched responses instead of widening the shell to admin lists. */
export function parseCoreWorkspaceChoices(value: unknown, currentPrincipalId: string): CoreWorkspaceChoices {
  if (!object(value) || value.schemaVersion !== 1 || !label(value.tenantId)
    || !canonicalScopeId(currentPrincipalId) || value.principalId !== currentPrincipalId
    || typeof value.organisationWide !== "boolean"
    || !Array.isArray(value.companies) || !Array.isArray(value.branches)
    || value.companies.length > 10_000 || value.branches.length > 100_000)
    throw new Error("ERP organisation choices could not be verified.");
  const companies = value.companies;
  const branches = value.branches;
  if (!companies.every(company => object(company) && canonicalScopeId(company.id)
      && label(company.code) && label(company.registeredName)
      && typeof company.currency === "string" && /^[A-Z]{3}$/.test(company.currency)
      && typeof company.isDefault === "boolean")
    || !branches.every(branch => object(branch) && canonicalScopeId(branch.id)
      && label(branch.code) && label(branch.name) && canonicalScopeId(branch.legalEntityId))
    throw new Error("ERP organisation choices could not be verified.");
  const companyIds = new Set(companies.map(company => company.id));
  if (companyIds.size !== companies.length || companies.filter(company => company.isDefault).length > 1
    || new Set(branches.map(branch => branch.id)).size !== branches.length
    || branches.some(branch => !companyIds.has(branch.legalEntityId)))
    throw new Error("ERP organisation choices could not be verified.");
  return value as CoreWorkspaceChoices;
}
