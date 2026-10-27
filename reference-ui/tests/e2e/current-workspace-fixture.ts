/** Synthetic Core workspace choices for ordinary business-screen mock tests.
 * Keep denial, missing-branch, and legacy-selector cases on their explicit fixtures. */
export const fixturePrincipal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const fixtureBranch = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Choice = { companyId: string; branchId: string; code?: string; name?: string;
  branchName?: string; branchCode?: string };
export function currentWorkspaceFixture(tenantId: string, principalId: string,
  choices: Choice[], organisationWide = false) {
  return { schemaVersion: 1, tenantId, principalId, organisationWide,
    companies: choices.map((choice, index) => ({ id: choice.companyId,
      code: choice.code ?? "TEST", registeredName: choice.name ?? "Synthetic company",
      currency: "ZMW", isDefault: index === 0 })),
    branches: choices.map(choice => ({ id: choice.branchId, code: choice.branchCode ?? "HQ",
      name: choice.branchName ?? "Synthetic branch", legalEntityId: choice.companyId,
      type: "Headquarters" })) };
}
