import { describe, expect, it } from "vitest";
import { resolveLegacyBranchSelection } from "./legacy-branch-selection";
const company = "11111111-1111-4111-8111-111111111111", otherCompany = "22222222-2222-4222-8222-222222222222";
const branch = "33333333-3333-4333-8333-333333333333", otherBranch = "44444444-4444-4444-8444-444444444444";
const core = [{ id: branch, name: "Lusaka (Main)", legalEntityId: company }];
describe("saved HRM branch name resolution", () => {
  it("resolves a unique exact authorized same-company label to its actual ID", () => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: "Lusaka (Main)" }, core, "ready"))
      .toEqual({ kind: "canonicalize", branchId: branch });
  });
  it("waits before the current Core read completes", () => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: "Lusaka (Main)" }, [], "loading")).toEqual({ kind: "waiting" });
  });
  it.each(["lusaka (Main)", " Lusaka (Main)", "Unknown", "Lusaka (Main) "])("never guesses a similar name %s", name => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: name }, core, "ready")).toEqual({ kind: "selection-required", reason: "unknown" });
  });
  it("does not use a branch from another company", () => {
    expect(resolveLegacyBranchSelection({ entityId: otherCompany, branch: "Lusaka (Main)" }, core, "ready")).toEqual({ kind: "selection-required", reason: "unknown" });
  });
  it("does not pick the first ambiguous branch", () => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: "Lusaka (Main)" }, [...core, { ...core[0], id: otherBranch }], "ready"))
      .toEqual({ kind: "selection-required", reason: "ambiguous" });
  });
  it.each([undefined, "", "company-name"])("does not infer a missing company %s", entityId => {
    expect(resolveLegacyBranchSelection({ entityId, branch: "Lusaka (Main)" }, core, "ready")).toEqual({ kind: "selection-required", reason: "company" });
  });
  it("does not treat unavailable lookup as an empty/default branch", () => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: "Lusaka (Main)" }, core, "unavailable"))
      .toEqual({ kind: "selection-required", reason: "unavailable" });
  });
  it("preserves valid IDs and an explicit company-only selection", () => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch }, [], "loading")).toEqual({ kind: "ready" });
    expect(resolveLegacyBranchSelection({ entityId: company, branch: "" }, [], "loading")).toEqual({ kind: "ready" });
  });
  it.each([{}, ["Lusaka"], 2, "bad\nbranch"])("rejects invalid label %#", value => {
    expect(resolveLegacyBranchSelection({ entityId: company, branch: value }, core, "ready")).toEqual({ kind: "selection-required", reason: "invalid" });
  });
});
