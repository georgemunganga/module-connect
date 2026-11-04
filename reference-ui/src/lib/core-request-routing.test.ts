import { describe, expect, it } from "vitest";
import { emptyRule, fromRuleJson, toRuleJson } from "./buying-rule-editor";
import { moveCoreStep, newCoreStep, parseCoreSteps, parseRequesterRoles, serializeCoreSteps } from "./core-request-routing";

const person = "11111111-1111-4111-8111-111111111111";
const rule = () => ({ ...emptyRule(), minimum: "99999999999999.1234", branchIds: ["55555555-5555-4555-8555-555555555555"], departmentIds: ["66666666-6666-4666-8666-666666666666"], requesterRoles: ["supervisor"],
  coreSteps: [{ code: "EXECUTIVE", mode: "One" as const, binding: { kind: "CoreUser" as const, key: person } }] });

describe("Core request routing in the preserved Buying Rules form", () => {
  it("round-trips named people, role filters and exact large policy amounts", () => {
    const row = rule(); const json = toRuleJson("PURCHASE_REQUEST", "ZMW", [row], 2);
    expect(json).toContain('"minimumAmountInclusive": 99999999999999.1234');
    const parsed = fromRuleJson(json, "PURCHASE_REQUEST", "ZMW");
    expect(parsed?.[0].minimum).toBe(row.minimum);
    expect(parsed?.[0].branchIds).toEqual(row.branchIds);
    expect(parsed?.[0].departmentIds).toEqual(row.departmentIds);
    expect(parsed?.[0].requesterRoles).toEqual(["supervisor"]);
    expect(parsed?.[0].coreSteps).toEqual(row.coreSteps);
    expect(toRuleJson("PURCHASE_REQUEST", "ZMW", parsed!, 2)).toBe(json);
  });
  it("retains legacy assignments without inventing a Core binding", () => {
    const json = toRuleJson("PURCHASE_REQUEST", "ZMW", [emptyRule()]);
    expect(json).not.toContain('"binding"'); expect(json).not.toContain('"requesterRoleKeys"');
    const parsed = fromRuleJson(json, "PURCHASE_REQUEST", "ZMW");
    expect(parsed?.[0].lineManager).toBe(true);
    expect(toRuleJson("PURCHASE_REQUEST", "ZMW", parsed!)).toBe(json);
    expect(fromRuleJson(json, "PURCHASE_ORDER", "ZMW")).toBeNull();
  });
  it("does not silently discard unknown routing fields", () => {
    const root = JSON.parse(toRuleJson("PURCHASE_REQUEST", "ZMW", [rule()], 2));
    root.rules[0].result.approvalStages[0].binding.extra = true;
    expect(fromRuleJson(JSON.stringify(root), "PURCHASE_REQUEST", "ZMW")).toBeNull();
    delete root.rules[0].result.approvalStages[0].binding;
    expect(fromRuleJson(JSON.stringify(root), "PURCHASE_REQUEST", "ZMW")).toBeNull();
    const invalidDepartment = JSON.parse(toRuleJson("PURCHASE_REQUEST", "ZMW", [rule()], 2));
    invalidDepartment.rules[0].when.departmentIds = null;
    expect(fromRuleJson(JSON.stringify(invalidDepartment), "PURCHASE_REQUEST", "ZMW")).toBeNull();
  });
  it.each(["", "CEO", " super visor", "supervisor,executive"])("rejects a noncanonical Core role %j", key => {
    expect(parseRequesterRoles([key])).toBeNull();
    expect(parseCoreSteps([{ code: "EXEC", assignee: "ProcurementManager", mode: "One", binding: { kind: "CoreRole", key } }])).toBeNull();
  });
  it("reorders complete steps without losing their people or changing the original", () => {
    const a = { ...newCoreStep(), binding: { kind: "CoreUser" as const, key: person } };
    const b = { ...newCoreStep(1), binding: { kind: "CoreRole" as const, key: "executive" } };
    const original = [a,b]; const next = moveCoreStep(original, 1, 0);
    expect(next).toEqual([b,a]); expect(original).toEqual([a,b]);
    expect(parseCoreSteps(serializeCoreSteps(next))).toEqual(next);
  });
  it("rejects duplicate role conditions, duplicate step codes and missing bindings", () => {
    expect(parseRequesterRoles(["supervisor", "supervisor"])).toBeNull();
    const stage = serializeCoreSteps(rule().coreSteps)[0];
    expect(parseCoreSteps([stage,stage])).toBeNull();
    expect(parseCoreSteps([{ ...stage, binding: null }])).toBeNull();
  });
});
