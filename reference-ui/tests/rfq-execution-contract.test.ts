import { afterEach, describe, expect, it, vi } from "vitest";
import { createRfqCommand, cancelRfqCommand, getGovernedRfq, listGovernedRfq, listRfqSources, recoverRfqCommand, rfqQuantityFits, sendRfqCommand,
  type RfqCommand, type RfqDetail, type RfqSource } from "../../src/platform/procurement-sourcing-execution-api";
const company = "11111111-1111-4111-8111-111111111111", request = "22222222-2222-4222-8222-222222222222", line = "33333333-3333-4333-8333-333333333333";
const event = "44444444-4444-4444-8444-444444444444", pin = "55555555-5555-4555-8555-555555555555", key = "66666666-6666-4666-8666-666666666666";
function source(): RfqSource { return { purchaseRequestId: request, purchaseRequestLineId: line, requestNumber: "PR-1", state: "Available", canSelect: true,
  branchRef: null, description: "Office supplies", unitCode: "EACH", categoryCode: "OFFICE", expectedRequestVersion: 4, sourceLineVersion: 2,
  availableQuantity: "99999999999999.9999", approvedUnitEstimate: "0.0001", currencyCode: "ZMW", minimumQuoteCount: 3,
  sourceSubmissionId: pin, sourceCaseId: pin, methodId: pin, methodRevision: 1 }; }
function page(row: unknown = { ...source(), canPublish: false }) { return { items: [row], candidateTotal: 1, page: 1, pageSize: 25, eligibilityMeaning: "CurrentPreviewOnly", canPublish: false }; }
function respond(body: unknown) { const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))); vi.stubGlobal("fetch", fetch); return fetch; }
function reply(command: RfqCommand) { return { eventId: event, number: "RF-1", status: command.operation === "Create" ? "Draft" : "Cancelled", version: 5,
  originalDraftFingerprint: "a".repeat(64), commandKey: key, recordedHistoricalResult: true, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false }; }
afterEach(() => vi.unstubAllGlobals());
describe("governed quote draft adapter", () => {
  it("loads exact source strings by scoped readonly bounded literal search", async () => {
    const fetch = respond(page()); const value = await listRfqSources(company, 1, "50% & _");
    expect(value.items[0].availableQuantity).toBe("99999999999999.9999");
    expect(fetch.mock.calls[0][0]).toContain("/approved-sources?page=1&pageSize=25&q=50%25%20%26%20_");
    expect(fetch.mock.calls[0][1].method).toBe("GET"); expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
  });
  it("requires actual branch presence, safe CAS and exact decimal strings", async () => {
    const missing = { ...source(), canPublish: false }; delete missing.branchRef;
    respond(page(missing)); await expect(listRfqSources(company)).rejects.toThrow("confirm");
    respond(page({ ...source(), canPublish: false, expectedRequestVersion: 9007199254740992 })); await expect(listRfqSources(company)).rejects.toThrow("confirm");
    respond(page({ ...source(), canPublish: false, availableQuantity: 12345678901234.568 })); await expect(listRfqSources(company)).rejects.toThrow("confirm");
  });
  it("does not retain private failed-proof properties or reinterpret candidates as eligible", async () => {
    respond(page({ purchaseRequestId: request, purchaseRequestLineId: line, requestNumber: "PR-1", state: "Unavailable", canSelect: false, canPublish: false,
      availableQuantity: "99", privateOwnerReference: "secret", branchRef: pin }));
    const result = await listRfqSources(company); expect(result.candidateTotal).toBe(1);
    expect(result.items[0]).not.toHaveProperty("availableQuantity"); expect(result.items[0]).not.toHaveProperty("branchRef");
  });
  it("holds no quantity before explicit create and preserves wide four-place outbound values", async () => {
    const fetch = respond({}); const command = createRfqCommand("  Office    supplies ", [{ source: source(), quantity: "12345678901234.5678" }], key);
    expect(fetch).not.toHaveBeenCalled(); expect(JSON.parse(command.body).sources[0].quantity).toBe("12345678901234.5678");
    expect(rfqQuantityFits("99999999999999.9999", "99999999999999.9998")).toBe(false);
    for (const quantity of ["0", "0.0000", "0.00001", "-1"])
      expect(() => createRfqCommand("Office", [{ source: source(), quantity }], key)).toThrow();
    respond(reply(command)); await sendRfqCommand(company, command);
  });
  it("blocks mixed currency/branch, stale same-request versions and duplicate source lines before transport", () => {
    const another = { ...source(), purchaseRequestLineId: pin };
    for (const changed of [{ ...another, currencyCode: "USD" }, { ...another, branchRef: pin }, { ...another, expectedRequestVersion: 5 }, source()])
      expect(() => createRfqCommand("Office", [{ source: source(), quantity: "1" }, { source: changed, quantity: "1" }], key)).toThrow();
    expect(() => createRfqCommand("Office", [{ source: source(), quantity: "100000000000000" }], key)).toThrow();
  });
  it("supports consolidated distinct PRs only with exact common scope and currency", () => {
    const second = { ...source(), purchaseRequestId: pin, purchaseRequestLineId: pin, expectedRequestVersion: 7 };
    expect(JSON.parse(createRfqCommand("Office", [{ source: source(), quantity: "1.0001" }, { source: second, quantity: "2" }], key).body).sources).toHaveLength(2);
  });
  it("recovers interrupted commands only by GET with original UUID/operation and validates historical response", async () => {
    const command = createRfqCommand("Office", [{ source: source(), quantity: "1" }], key);
    const fetch = vi.fn().mockRejectedValue(new TypeError("Disconnected")); vi.stubGlobal("fetch", fetch);
    await expect(sendRfqCommand(company, command)).rejects.toThrow("interrupted"); expect(fetch).toHaveBeenCalledTimes(1);
    const recovery = respond({ operation: "Create", commandKey: key, originalStatusCode: 201, responseJson: JSON.stringify(reply(command)), recordedHistoricalResult: true, canPublish: false });
    expect((await recoverRfqCommand(company, command)).eventId).toBe(event);
    expect(recovery.mock.calls[0][1].method).toBe("GET"); expect(recovery.mock.calls[0][0]).toContain(`/command-receipts/Create/${key}`);
    respond({ operation: "Cancel", commandKey: key }); await expect(recoverRfqCommand(company, command)).rejects.toThrow("confirm");
  });
  it("retains own cancelled history and never activates publication from response flags", async () => {
    respond({ items: [{ id: event, number: "RF-1", state: "VerifiedRetainedDraft", title: "Own", currencyCode: "ZMW", status: "Cancelled", version: 2, originalDraftFingerprint: "a".repeat(64), canPublish: false }], total: 1, page: 1, pageSize: 25, canPublish: false });
    expect((await listGovernedRfq(company)).items[0].status).toBe("Cancelled");
    respond({ ...page(), canPublish: true }); await expect(listRfqSources(company)).rejects.toThrow("confirm");
  });
  it("requires cancel reason/version/fingerprint and binds returned actual target", async () => {
    const record = { id: event, status: "Draft", version: 4, originalDraftFingerprint: "a".repeat(64) } as RfqDetail;
    expect(() => cancelRfqCommand(record, " ", key)).toThrow();
    const command = cancelRfqCommand(record, "No longer needed", key); expect(JSON.parse(command.body).expectedEventVersion).toBe(4);
    const fetch = respond(reply(command)); await sendRfqCommand(company, command);
    expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    respond({ ...reply(command), eventId: pin }); await expect(sendRfqCommand(company, command)).rejects.toThrow("confirm");
    respond({ ...reply(command), version: 4 }); await expect(sendRfqCommand(company, command)).rejects.toThrow("confirm");
  });
  it("rejects oversized search before transport and invalid detail allocations", async () => {
    const fetch = respond({}); await expect(listRfqSources(company, 1, "x".repeat(101))).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    respond({ id: event, number: "RF-1", title: "Own", method: "RFQ", currencyCode: "ZMW", status: "Draft", version: 1,
      originalDraftFingerprint: "a".repeat(64), cancellationReason: null, canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false,
      lines: [{ id: pin, purchaseRequestId: request, purchaseRequestLineId: line, description: "Own", unitCode: "EACH", categoryCode: null,
        quantity: "1", approvedUnitEstimate: "0.0001", estimatedValue: "0.0001", allocationState: "Released" }] });
    await expect(getGovernedRfq(company, event)).rejects.toThrow("confirm");
  });
});
