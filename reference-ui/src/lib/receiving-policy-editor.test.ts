import { describe, expect, it } from "vitest";
import { emptyReceivingRow, parseReceivingPolicy, serializeReceivingPolicy } from "./receiving-policy-editor";

const site = "11111111-1111-4111-8111-111111111111";
const inspector = "22222222-2222-4222-8222-222222222222";
function goods() {
  const row = emptyReceivingRow();
  row.code = "GOODS_IT"; row.categoryCode = "IT"; row.purchaseType = "GOODS"; row.kind = "Goods";
  row.siteIds = [site]; row.inspectionRequired = true; row.checklistReference = "IT-CHECK";
  row.inspectorWorkerIds = [inspector]; row.allowRequesterCertification = false;
  row.allowBuyerCertification = false; row.allowReceiverCertification = true;
  row.requireIndependentInspector = true; row.evidenceMode = "ControlledManualReference";
  row.evidenceReferencePrefix = "DELIVERY:";
  return row;
}

describe("receiving owner policy editor", () => {
  it("round trips every supported goods control and canonical site/worker ID", () => {
    const row = goods(); const json = serializeReceivingPolicy("ZMW", [row]);
    expect(parseReceivingPolicy(json, "ZMW")).toEqual([row]);
  });
  it("requires explicit service owner and no hidden service inspection default", () => {
    const row = goods(); row.kind = "Service"; row.inspectionRequired = false;
    row.checklistReference = ""; row.inspectorWorkerIds = [];
    expect(() => serializeReceivingPolicy("ZMW", [row])).toThrow();
    row.serviceOwnerWorkerIds = [inspector];
    expect(parseReceivingPolicy(serializeReceivingPolicy("ZMW", [row]), "ZMW")).toEqual([row]);
  });
  it("does not rewrite an unknown schema, omitted choice or arbitrary worker ID", () => {
    const json = serializeReceivingPolicy("ZMW", [goods()]);
    expect(parseReceivingPolicy(json.replace('"schemaVersion":1', '"schemaVersion":2'), "ZMW")).toBeNull();
    expect(parseReceivingPolicy(json.replace('"inspectionRequired":true', '"inspectionRequired":"true"'), "ZMW")).toBeNull();
    const row = goods(); row.inspectorWorkerIds = ["not-a-worker"];
    expect(() => serializeReceivingPolicy("ZMW", [row])).toThrow();
  });
});
