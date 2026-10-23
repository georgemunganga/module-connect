import { describe, expect, it } from "vitest";
import { parseCoreWorkspaceChoices } from "./core-workspace-choices";

const person = "11111111-1111-4111-8111-111111111111";
const a = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const branchC = "55555555-5555-4555-8555-555555555555";
const payload = { schemaVersion: 1, tenantId: "tenant-a", principalId: person,
  organisationWide: false,
  companies: [
    { id: a, code: "A", registeredName: "Company A", currency: "ZMW", isDefault: false },
    { id: c, code: "C", registeredName: "Company C", currency: "ZMW", isDefault: true },
  ],
  branches: [
    { id: branchA, code: "A1", name: "Company A branch", legalEntityId: a },
    { id: branchC, code: "C1", name: "Company C branch", legalEntityId: c },
  ],
};

describe("Core self-service workspace choices", () => {
  it("retains both authorized companies, their branch links and the actual default", () => {
    const choices = parseCoreWorkspaceChoices(payload, person);
    expect(choices.companies.map(company => company.id)).toEqual([a, c]);
    expect(choices.companies.find(company => company.isDefault)?.id).toBe(c);
    expect(choices.branches.find(branch => branch.id === branchA)?.legalEntityId).toBe(a);
  });
  it("rejects a different account, orphan branch, duplicate company or multiple defaults", () => {
    expect(() => parseCoreWorkspaceChoices(payload, branchA)).toThrow();
    expect(() => parseCoreWorkspaceChoices({ ...payload, branches: [
      { ...payload.branches[0], legalEntityId: branchC }] }, person)).toThrow();
    expect(() => parseCoreWorkspaceChoices({ ...payload, companies: [payload.companies[0],
      payload.companies[0]] }, person)).toThrow();
    expect(() => parseCoreWorkspaceChoices({ ...payload, companies: payload.companies.map(company =>
      ({ ...company, isDefault: true })) }, person)).toThrow();
  });
});
