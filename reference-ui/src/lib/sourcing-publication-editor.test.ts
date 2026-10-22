import { describe, expect, it } from "vitest";
import { emptySourcingRow, parseSourcingPolicy, serializeSourcingPolicy } from "./sourcing-publication-editor";

const reviewer = "11111111-1111-4111-8111-111111111111";
function complete() {
  const row = emptySourcingRow();
  row.code = "RFQ_GOODS"; row.priority = "10"; row.minimum = "90071992547409.1250";
  row.companyWide = true; row.purchaseType = "GOODS";
  row.minimumQuoteCount = "3"; row.minimumInvitedSuppliers = "4";
  row.requirementsPackRequired = true; row.evaluationCriteriaRequired = true;
  row.closingDateRequired = false; row.stages = [{ code: "REVIEW", mode: "One", principalIds: [reviewer] }];
  return row;
}

describe("owned sourcing publication editor", () => {
  it("preserves large 18,4 thresholds as JSON number tokens, not rounded JavaScript numbers", () => {
    const row = complete();
    const json = serializeSourcingPolicy("ZMW", [row]);
    expect(json).toContain('"minimumAmountInclusive":90071992547409.1250');
    expect(parseSourcingPolicy(json, "ZMW")).toEqual([row]);
  });
  it("needs explicit company scope, named reviewer, decision rule and every publication control", () => {
    const row = complete(); row.companyWide = null;
    expect(() => serializeSourcingPolicy("ZMW", [row])).toThrow();
    row.companyWide = true; row.stages[0].principalIds = [];
    expect(() => serializeSourcingPolicy("ZMW", [row])).toThrow();
    row.stages[0].principalIds = [reviewer]; row.closingDateRequired = null;
    expect(() => serializeSourcingPolicy("ZMW", [row])).toThrow();
  });
  it("keeps schema 2 audience and branch-scoped rules read-only", () => {
    const json = serializeSourcingPolicy("ZMW", [complete()]);
    expect(parseSourcingPolicy(json.replace('"schemaVersion":1', '"schemaVersion":2'), "ZMW")).toBeNull();
    expect(parseSourcingPolicy(json.replace('"branchIds":[]', '"branchIds":["22222222-2222-4222-8222-222222222222"]'), "ZMW")).toBeNull();
    expect(parseSourcingPolicy(json.replace('"requirementsPackRequired":true', '"requirementsPackRequired":"true"'), "ZMW")).toBeNull();
  });
});
