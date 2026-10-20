import { afterEach, describe, expect, it, vi } from "vitest";
import { getReceipt, receivingCommandPath, receivingQuantity, recoverReceiving, sendReceiving, type ReceivingCommand } from "../../src/platform/procurement-receiving-api";
const company = "11111111-1111-4111-8111-111111111111", order = "22222222-2222-4222-8222-222222222222", target = "33333333-3333-4333-8333-333333333333", line = "44444444-4444-4444-8444-444444444444", key = "55555555-5555-4555-8555-555555555555";
const command = (operation: ReceivingCommand["operation"] = "ReceivingAccept"): ReceivingCommand => ({ operation, orderId: order, targetId: target, lineId: line, key, method: "POST", body: '{"quantity":"99999999999999.9999","version":2,"sourceVersion":4,"evidenceReference":"EVIDENCE"}' });
afterEach(() => vi.unstubAllGlobals());
describe("receiving exact values and command contracts", () => {
  it("preserves every valid digit and refuses unsupported quantities rather than rounding", () => {
    expect(receivingQuantity("99999999999999.9999")).toBe("99999999999999.9999");
    expect(receivingQuantity("0.0001")).toBe("0.0001");
    for (const value of ["0.00001", "100000000000000", "NaN", "1e4", "-1", "1.0evil"]) expect(() => receivingQuantity(value)).toThrow();
  });
  it("distinguishes goods record, per-line inspection and acceptance from service certification", () => {
    expect(receivingCommandPath(command())).toBe(`/receipts/${target}/lines/${line}/accept`);
    expect(receivingCommandPath(command("ReceivingInspect"))).toBe(`/receipts/${target}/lines/${line}/inspect`);
    expect(receivingCommandPath(command("ReceivingRecord"))).toBe(`/receipts/${target}/record`);
    expect(receivingCommandPath(command("ServiceCertify"))).toBe(`/service-acceptances/${target}/certify`);
    expect(receivingCommandPath({ ...command("ServiceDraft"), targetId: null })).toBe("/service-acceptances/drafts");
    expect(() => receivingCommandPath({ ...command(), lineId: "not-a-line" })).toThrow();
  });
  it("sends the exact original string payload and key without automatic retry after response loss", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetch);
    const pending = command(); await expect(sendReceiving(company, pending)).rejects.toThrow("interrupted");
    expect(fetch).toHaveBeenCalledTimes(1); const [path, init] = fetch.mock.calls[0];
    expect(path).toBe(`/api/procurement/v1/receipts/${target}/lines/${line}/accept`); expect(init.body).toBe(pending.body);
    expect(init.headers.get("Idempotency-Key")).toBe(key);
  });
  it("recovers unknown creation by original order/key and refuses a substituted target", async () => {
    const pending = { ...command("ReceivingDraft"), targetId: null };
    const reply = { state: "RecordedHistoricalOutcome", purchaseOrderId: order, commandKey: key, operation: pending.operation, replayAuthorized: false,
      recordedResult: { id: target }, currentTargetVersion: 4, currentTargetStatus: "Recorded" };
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(reply))); vi.stubGlobal("fetch", fetch);
    expect(await recoverReceiving(company, pending)).toEqual({ id: target, status: "Recorded" });
    expect(fetch.mock.calls[0][0]).toContain(`/orders/command-receipts/ReceivingDraft/${key}?orderId=${order}`);
    await expect(recoverReceiving(company, { ...pending, targetId: line })).rejects.toThrow("incomplete");
    expect(fetch.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
  });
  it("refuses numeric financial data instead of certifying a rounded receipt read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: target, version: 1, executionVersion: 1, status: "Held", matchingAuthorityAvailable: false,
      draftActionCandidates: [], lineReadiness: [], lines: [{ id: line, version: 1, sourceVersion: 1, receivedQuantity: 99999999999999.9999, initiallyRejectedQuantity: "0", rejectedQuantity: "0", acceptedQuantity: "0", unacceptedHeldQuantity: "1" }] }))));
    await expect(getReceipt(company, target, false)).rejects.toThrow("incomplete");
  });
});
