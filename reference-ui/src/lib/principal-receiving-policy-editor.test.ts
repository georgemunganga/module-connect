import { describe, expect, it } from "vitest";
import { emptyPrincipalReceivingRow, parsePrincipalReceivingPolicy, serializePrincipalReceivingPolicy, type PrincipalReceivingRow } from "./principal-receiving-policy-editor";
import { parseReceivingPolicy } from "./receiving-policy-editor";

const site = "11111111-1111-4111-8111-111111111111";
const inspector = "22222222-2222-4222-8222-222222222222";
const acceptor = "33333333-3333-4333-8333-333333333333";
function goods(): PrincipalReceivingRow {
  return { ...emptyPrincipalReceivingRow(), code: "GOODS_IT", categoryCode: "IT", purchaseType: "GOODS",
    kind: "Goods" as const, siteIds: [site], inspectionRequired: true, checklistReference: "IT-CHECK",
    inspectorPrincipalIds: [inspector], acceptorPrincipalIds: [acceptor], allowRequesterCertification: false,
    allowBuyerCertification: false, allowReceiverCertification: true, requireIndependentInspector: true,
    evidenceMode: "ControlledManualReference" as const, evidenceReferencePrefix: "DELIVERY:" };
}
describe("principal receiving policy editor", () => {
  it("round trips schema 2 named Core accounts without worker IDs or inferred authority", () => {
    const row = goods(), withLegacyFields = { ...row, inspectorWorkerIds: [inspector] };
    const json = serializePrincipalReceivingPolicy("ZMW", [withLegacyFields]);
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: 2, transactionType: "Receiving",
      rules: [{ inspectorPrincipalIds: [inspector], acceptorPrincipalIds: [acceptor], serviceOwnerPrincipalIds: [] }] });
    expect(json).not.toContain("WorkerId");
    expect(parsePrincipalReceivingPolicy(json, "ZMW")).toEqual([row]);
    expect(parseReceivingPolicy(json, "ZMW")).toBeNull();
  });
  it("requires a named goods acceptor and keeps service owners distinct", () => {
    const row = goods(); row.acceptorPrincipalIds = [];
    expect(() => serializePrincipalReceivingPolicy("ZMW", [row])).toThrow();
    row.kind = "Service"; row.inspectionRequired = false; row.inspectorPrincipalIds = []; row.checklistReference = "";
    row.serviceOwnerPrincipalIds = [acceptor];
    expect(parsePrincipalReceivingPolicy(serializePrincipalReceivingPolicy("ZMW", [row]), "ZMW")).toEqual([row]);
  });
  it("keeps unknown, worker, duplicate and malformed principal rules read-only", () => {
    const row = goods(), json = serializePrincipalReceivingPolicy("ZMW", [row]);
    expect(parsePrincipalReceivingPolicy(json.replace('"schemaVersion":2', '"schemaVersion":1'), "ZMW")).toBeNull();
    expect(parsePrincipalReceivingPolicy(json.replace('"acceptorPrincipalIds"', '"acceptorWorkerIds"'), "ZMW")).toBeNull();
    expect(parsePrincipalReceivingPolicy(json.replace('"inspectionRequired":true', '"inspectionRequired":"true"'), "ZMW")).toBeNull();
    row.acceptorPrincipalIds = [acceptor, acceptor];
    expect(() => serializePrincipalReceivingPolicy("ZMW", [row])).toThrow();
    row.acceptorPrincipalIds = ["not-a-core-principal"];
    expect(() => serializePrincipalReceivingPolicy("ZMW", [row])).toThrow();
  });
});
