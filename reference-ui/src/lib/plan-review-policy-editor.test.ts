import { describe, expect, it } from "vitest";
import { emptyPlanPolicy, parsePlanPolicy, serializePlanPolicy, type PlanPolicyDraft } from "./plan-review-policy-editor";
import { policyInstantIsAfter, selectedPolicyInstant } from "./policy-effective-instant";
const reviewer = "11111111-1111-4111-8111-111111111111", final = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const valid = (): PlanPolicyDraft => [{ purpose: "Review", mode: "Any", requiredApprovals: "1", principalIds: [reviewer] },
  { purpose: "Final", mode: "All", requiredApprovals: "1", principalIds: [final] }];
describe("typed Plan policy editor", () => {
  it("starts with structural stages but no approved people, modes or quorum", () => {
    expect(emptyPlanPolicy()).toEqual([{ purpose: "Review", mode: "", requiredApprovals: "", principalIds: [] }, { purpose: "Final", mode: "", requiredApprovals: "", principalIds: [] }]);
    expect(() => serializePlanPolicy(emptyPlanPolicy())).toThrow();
  });
  it("round-trips the exact two-stage schema without a currency or spending threshold", () => {
    const wire = serializePlanPolicy(valid()); expect(parsePlanPolicy(wire)).toEqual(valid());
    expect(JSON.parse(wire)).toEqual({ schemaVersion: 2, stages: [{ purpose: "Review", mode: "Any", requiredApprovals: 1, assigneePrincipalIds: [reviewer] }, { purpose: "Final", mode: "All", requiredApprovals: 1, assigneePrincipalIds: [final] }] });
    expect(wire).not.toMatch(/currency|amount|worker|threshold/i);
  });
  it("supports explicit finite quorum and All without inventing a default", () => {
    const value = valid(); value[0] = { purpose: "Review", mode: "Quorum", requiredApprovals: "2", principalIds: [reviewer, other] };
    expect(parsePlanPolicy(serializePlanPolicy(value))).toEqual(value);
    value[0].mode = "All"; value[0].requiredApprovals = "1"; expect(() => serializePlanPolicy(value)).toThrow();
    value[0].requiredApprovals = "2"; expect(() => serializePlanPolicy(value)).not.toThrow();
  });
  it.each(["0", "21", "1.5", "1e1", "", " 1", "01"])("rejects invalid required approvals %s", count => {
    const value = valid(); value[0].requiredApprovals = count; expect(() => serializePlanPolicy(value)).toThrow();
  });
  it("rejects shared Review/Final identities but has no policy-creator exclusion", () => {
    expect(() => serializePlanPolicy(valid())).not.toThrow(); // Either named person may configure policies for another plan maker.
    const value = valid(); value[1].principalIds = [reviewer]; expect(() => serializePlanPolicy(value)).toThrow("independent");
    value[1].principalIds = [final, final]; expect(() => serializePlanPolicy(value)).toThrow();
  });
  it.each(["currency", "schema", "extra-stage", "unknown-field", "reordered"])("keeps unsupported saved %s documents read-only", change => {
    const document = JSON.parse(serializePlanPolicy(valid()));
    if (change === "currency") document.currencyCode = "ZMW";
    if (change === "schema") document.schemaVersion = 1;
    if (change === "extra-stage") document.stages.push(document.stages[0]);
    if (change === "unknown-field") document.stages[0].employeeId = reviewer;
    if (change === "reordered") document.stages.reverse();
    expect(parsePlanPolicy(JSON.stringify(document))).toBeNull();
  });
  it("preserves untouched fractional effective instants and compares them exactly", () => {
    const start = "2026-11-03T10:00:00.123456Z", end = "2026-11-03T10:00:00.123457Z";
    expect(selectedPolicyInstant("2026-11-03", start)).toBe(start);
    expect(selectedPolicyInstant("2026-11-03", end)).toBe(end);
    expect(policyInstantIsAfter(end, start)).toBe(true); expect(policyInstantIsAfter(start, end)).toBe(false);
  });
});
