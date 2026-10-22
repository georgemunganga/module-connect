import { afterEach, describe, expect, it, vi } from "vitest";
import { invoiceMappingCommand, invoiceCompareCommand, invoiceMatchingRecovery, listInvoiceSources, listInvoiceAcceptances, sendInvoiceMatching, recoverInvoiceMatching,
  type InvoiceMappingInput, type InvoiceSource, type InvoiceMatchingCommand } from "../../src/platform/procurement-invoice-matching-api";
const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const line = "33333333-3333-4333-8333-333333333333", order = "44444444-4444-4444-8444-444444444444";
const issued = "55555555-5555-4555-8555-555555555555", poLine = "66666666-6666-4666-8666-666666666666";
const policy = "77777777-7777-4777-8777-777777777777", receipt = "88888888-8888-4888-8888-888888888888";
const doc = "99999999-9999-4999-8999-999999999999", key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = (): InvoiceMappingInput => ({ version: 3, purchaseOrderId: order, issuedVersionId: issued, lines: [{ invoiceLineId: line, purchaseOrderLineId: poLine,
  goodsReceiptLineId: receipt, serviceAcceptanceId: null, invoiceUnitCode: "EACH", documentVersionId: doc, documentLineReference: "Page 1 line 1" }] });
const source = (): InvoiceSource => ({ orderId: order, orderNumber: "PO-1", issuedVersionId: issued, purchaseOrderLineId: poLine, description: "Own supplies",
  sourceState: "VerifiedIssued", blocker: null, unitCode: "EACH", quantity: "99999999999999.9999", unitPrice: "0.00010001", taxAmount: "0", categoryCode: "OFFICE", method: "ThreeWay", acceptanceKind: "Goods" });
const page = () => ({ invoiceId: invoice, invoiceVersion: 3, policyVersionId: policy, items: [{ ...source(), canAllocate: false, canPostToFinance: false }], total: 1, page: 1, pageSize: 25, isAuthority: false, canPostToFinance: false });
function respond(body: unknown) { const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))); vi.stubGlobal("fetch", fetch); return fetch; }
const envelope = (command: InvoiceMatchingCommand) => ({ invoiceId: invoice, commandKey: command.key,
  commandPermission: command.operation === "InvoiceMapping" ? "procurement-invoice-capture" : "procurement-invoice-match", commandSchemaVersion: 1,
  recordedHistoricalResult: true, isCurrentApproval: false, canPostToFinance: false,
  result: command.operation === "InvoiceMapping" ? { id: doc, version: 4, mappingRevision: 1, mappingSha256: "a".repeat(64), verificationState: "Unverified" }
    : { id: doc, version: 4, outcome: "Blocked", matchingState: "ComparisonBlocked", hasCapacityClaim: false, canPostToFinance: false,
      discrepancies: [{ invoiceLineId: line, code: "OwnerHistoryUnavailable" }], sourceBlockers: ["private-owner-details"] } });
afterEach(() => vi.unstubAllGlobals());
describe("invoice matching adapter", () => {
  it("loads bounded scoped source hints with exact strings, no broad PO access or authority", async () => {
    const fetch = respond(page()); const result = await listInvoiceSources(company, invoice, 3, 1, "A & B");
    expect(result.items[0].quantity).toBe("99999999999999.9999"); expect(result.items[0].unitPrice).toBe("0.00010001");
    expect(fetch.mock.calls[0][0]).toContain(`/invoices/${invoice}/matching/sources?page=1&pageSize=25&q=A%20%26%20B`);
    expect(fetch.mock.calls[0][1].method).toBe("GET"); expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    respond({ ...page(), invoiceVersion: 4 }); await expect(listInvoiceSources(company, invoice, 3)).rejects.toThrow("changed");
    const wrongMoney = page(); (wrongMoney.items[0] as unknown as Record<string, unknown>).unitPrice = 0.00010001;
    respond(wrongMoney); await expect(listInvoiceSources(company, invoice, 3)).rejects.toThrow("confirm");
  });
  it("keeps unavailable facts unavailable and never converts unknown receipt history into zero", async () => {
    respond({ ...page(), items: [{ orderId: order, orderNumber: "PO-1", issuedVersionId: issued, purchaseOrderLineId: poLine, description: "Own",
      sourceState: "Unavailable", blocker: "IssuedEvidenceUnavailable", canAllocate: false, canPostToFinance: false }] });
    expect((await listInvoiceSources(company, invoice, 3)).items[0].quantity).toBeUndefined();
    const history = { ...page(), orderId: order, issuedVersionId: issued, purchaseOrderLineId: poLine, method: "ThreeWay", state: "Unavailable", blocker: "AcceptanceHistoryUnavailable",
      availabilityMeaning: "HistoricalPhysicalFactsOnly", canAllocate: false, items: [], total: null };
    respond(history); expect((await listInvoiceAcceptances(company, invoice, 3, policy, source())).total).toBeNull();
    respond({ ...history, total: 0 }); await expect(listInvoiceAcceptances(company, invoice, 3, policy, source())).rejects.toThrow("confirm");
    respond({ ...history, policyVersionId: doc }); await expect(listInvoiceAcceptances(company, invoice, 3, policy, source())).rejects.toThrow("confirm");
  });
  it("binds receipt kinds, identities, exact historical values and source version", async () => {
    const body = { ...page(), orderId: order, issuedVersionId: issued, purchaseOrderLineId: poLine, method: "ThreeWay", state: "VerifiedHistorical", blocker: null,
      availabilityMeaning: "HistoricalPhysicalFactsOnly", canAllocate: false, items: [{ id: receipt, reference: "GRN-1", kind: "Goods", sourceVersion: 2,
        goodsReceiptLineId: receipt, serviceAcceptanceId: null, acceptedQuantity: "1", returnedQuantity: "0", historicalNetQuantity: "1",
        acceptedNetAmount: "0.00010001", returnedNetAmount: "0.00000002", historicalNetAmount: "0.00009999", acceptedAt: "2026-10-20T10:00:00Z", canAllocate: false, canPostToFinance: false }] };
    respond(body); expect((await listInvoiceAcceptances(company, invoice, 3, policy, source())).items[0].historicalNetAmount).toBe("0.00009999");
    respond({ ...body, items: [{ ...body.items[0], serviceAcceptanceId: doc }] }); await expect(listInvoiceAcceptances(company, invoice, 3, policy, source())).rejects.toThrow("confirm");
  });
  it("requires every original line, valid document link and one receipt kind before sending", () => {
    const command = invoiceMappingCommand(invoice, [line], input(), key); expect(JSON.parse(command.body)).toEqual(input());
    const twoKinds = input(); twoKinds.lines[0].serviceAcceptanceId = doc;
    expect(() => invoiceMappingCommand(invoice, [line], twoKinds, key)).toThrow();
    expect(() => invoiceMappingCommand(invoice, [line, doc], input(), key)).toThrow();
    const noDoc = input(); noDoc.lines[0].documentVersionId = ""; expect(() => invoiceMappingCommand(invoice, [line], noDoc, key)).toThrow();
    const noRef = input(); noRef.lines[0].documentLineReference = " "; expect(() => invoiceMappingCommand(invoice, [line], noRef, key)).toThrow();
  });
  it("sends the exact stable command once and accepts only unverified mapping confirmation", async () => {
    const command = invoiceMappingCommand(invoice, [line], input(), key), fetch = respond(envelope(invoiceMappingCommand(invoice, [line], input(), key)));
    expect(invoiceMatchingRecovery(command)).toEqual({ operation: "InvoiceMapping", invoiceId: invoice, key, expectedVersion: 3, ownLineIds: [line] });
    expect((await sendInvoiceMatching(company, command)).outcome).toBe("MappingUnverified");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].body).toBe(command.body);
    expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    respond({ ...envelope(command), isCurrentApproval: true }); await expect(sendInvoiceMatching(company, command)).rejects.toThrow("confirm");
    const old = envelope(command); respond({ ...old, result: { ...old.result, version: 3 } });
    await expect(sendInvoiceMatching(company, command)).rejects.toThrow("confirm");
  });
  it("treats Blocked comparison as a recorded outcome and excludes private source blockers", async () => {
    const command = invoiceCompareCommand(invoice, [line], { version: 3, mappingVersionId: doc, reason: null }, key);
    respond(envelope(command)); const result = await sendInvoiceMatching(company, command);
    expect(result.outcome).toBe("Blocked"); expect(result.issues).toEqual([{ invoiceLineId: line, code: "OwnerHistoryUnavailable" }]);
    expect(JSON.stringify(result)).not.toContain("private-owner-details");
  });
  it("does not retry an uncertain POST and recovers only the original operation/key via GET", async () => {
    const command = invoiceMappingCommand(invoice, [line], input(), key); const fetch = vi.fn().mockRejectedValue(new TypeError("lost")); vi.stubGlobal("fetch", fetch);
    await expect(sendInvoiceMatching(company, command)).rejects.toThrow("interrupted"); expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(JSON.stringify({ operation: "InvoiceMapping", commandKey: key, recordedHistoricalResult: true, isCurrentReplayAuthorization: false,
      currentInvoiceVersion: 4, canPostToFinance: false, recordedResult: envelope(command) })));
    expect((await recoverInvoiceMatching(company, invoiceMatchingRecovery(command))).id).toBe(doc); expect(fetch.mock.calls[1][1].method).toBe("GET");
    expect(fetch.mock.calls[1][0]).toContain(`/commands/${key}?operation=InvoiceMapping`);
    respond({ operation: "InvoiceCompare", commandKey: key }); await expect(recoverInvoiceMatching(company, invoiceMatchingRecovery(command))).rejects.toThrow("confirm");
  });
});
