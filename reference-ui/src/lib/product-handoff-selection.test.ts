import { expect, it } from "vitest";
import { productHandoffSelection, type CoreWorkspaceChoices } from "./core-workspace-choices";
const company = "11111111-1111-1111-1111-111111111111", oldCompany = "22222222-2222-2222-2222-222222222222";
const branch = "33333333-3333-3333-3333-333333333333";
const choices: CoreWorkspaceChoices = { tenantId: "selected", principalId: oldCompany, organisationWide: true, coreActions: [],
  companies: [{ id: company, code: "CO", registeredName: "Selected company", currency: "ZMW", isDefault: true }],
  branches: [{ id: branch, legalEntityId: company, code: "HQ", name: "Head office", type: "headquarters" }] };
it("uses the server-selected company after a Kuubu handoff, clearing an old All preference", () => {
  expect(productHandoffSelection(choices, { entityId: oldCompany })).toEqual({ entityId: company, branch, branchScope: undefined });
});
it("preserves this company's branch preference and rejects an ambiguous company response", () => {
  expect(productHandoffSelection(choices, { entityId: company })).toBeNull();
  expect(() => productHandoffSelection({ ...choices, companies: [...choices.companies, { ...choices.companies[0], id: oldCompany }] }, {})).toThrow();
});
