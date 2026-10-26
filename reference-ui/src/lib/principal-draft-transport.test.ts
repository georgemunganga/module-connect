import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmPrincipalCommand, createPrincipalBody, getPrincipalOrder, listPrincipalSuppliers,
  recoverPrincipalCommand, sendPrincipalCommand, type PrincipalCommand, type PrincipalReply } from "../../../src/platform/procurement-principal-drafts-api";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sha = "a".repeat(64);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } });
const draft = { supplierId: id(4), currencyCode: "ZMW", shipToRef: "", billToRef: "",
  paymentTermRef: "", expectedDeliveryOn: null,
  lines: [{ description: "Laptop", unitCode: "each", quantity: "1.0001",
    unitPrice: "1.0001", taxAmount: "0.0001" }] };
const sources = [{ canSelect: true, purchaseRequestId: id(5),
  purchaseRequestLineId: id(6), expectedRequestVersion: 3 }];
const command: PrincipalCommand = { operation: "Create", key: id(1), orderId: null,
  body: createPrincipalBody(draft, sources), draft, sources };
const ack: PrincipalReply = { orderId: id(7), number: "PO-001", status: "Draft", version: 1,
  originalDirectSourceSha256: sha, commandKey: id(1), recordedHistoricalResult: true,
  canSubmit: false, canIssue: false, financeReservationChanged: false };
const receipt = (saved: PrincipalReply, operation: "Create" | "Cancel" = "Create") => ({
  operation, commandKey: saved.commandKey, originalStatusCode: operation === "Create" ? 201 : 200,
  responseJson: JSON.stringify(saved), recordedHistoricalResult: true,
  canSubmit: false, canIssue: false,
});
const detail = { id: id(7), number: "PO-001", supplierId: id(4), branchRef: id(8),
  supplierDisplayName: "Supplier A", branchDisplayName: "HQ", currencyCode: "ZMW",
  status: "Draft", version: 1, createdAt: "2026-10-26T00:00:00Z",
  originalDirectSourceSha256: sha, shipToRef: null, billToRef: null,
  paymentTermRef: null, expectedDeliveryOn: null, closureReason: null,
  canSubmit: false, canIssue: false, financeReservationChanged: false,
  lines: [{ id: id(9), lineNumber: 1, description: "Laptop", unitCode: "EACH", quantity: "1.0001",
    unitPrice: "1.0001", taxAmount: "0.0001", purchaseRequestId: id(5),
    purchaseRequestLineId: id(6), allocationStatus: "Reserved" }] };
afterEach(() => vi.unstubAllGlobals());
describe("principal approved request order adapter", () => {
  it("sends exact decimal literals and one immutable source per draft line", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response(ack, 201)); vi.stubGlobal("fetch", fetcher);
    expect(command.body).toContain('"quantity":1.0001');
    expect(command.body).toContain('"unitPrice":1.0001');
    expect((await sendPrincipalCommand(id(2), command)).orderId).toBe(id(7));
    expect(String(fetcher.mock.calls[0][0])).toContain("/from-approved-principal-direct-sources");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(command.body);
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(id(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a substituted acknowledgement and never retries a POST", async () => {
    const fetcher = vi.fn(async () => response({ ...ack, commandKey: id(99) }, 201));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendPrincipalCommand(id(2), command)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recovers the original saved acknowledgement then binds it to durable draft and source", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(receipt(ack)))
      .mockResolvedValueOnce(response(detail));
    vi.stubGlobal("fetch", fetcher);
    const recovered = await recoverPrincipalCommand(id(2), command);
    expect((await confirmPrincipalCommand(id(2), command, recovered)).lines[0].quantity).toBe("1.0001");
    expect(String(fetcher.mock.calls[0][0])).toContain(`/principal-direct-command-receipts/Create/${id(1)}`);
    expect(fetcher.mock.calls.every((call: unknown[]) => (call[1] as RequestInit | undefined)?.method !== "POST")).toBe(true);
  });
  it("rejects a receipt with another operation, command key or saved status", async () => {
    for (const wrong of [
      { ...receipt(ack), operation: "Cancel" },
      { ...receipt(ack), commandKey: id(99) },
      { ...receipt(ack), originalStatusCode: 200 },
      { ...receipt(ack), responseJson: JSON.stringify({ ...ack, commandKey: id(99) }) },
      { ...receipt(ack), responseJson: "{" },
    ]) {
      const fetcher = vi.fn(async () => response(wrong)); vi.stubGlobal("fetch", fetcher);
      await expect(recoverPrincipalCommand(id(2), command)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("recovers a cancelled order from the saved 200 receipt wrapper", async () => {
    const cancelCommand: PrincipalCommand = { operation: "Cancel", key: id(10), orderId: id(7),
      body: JSON.stringify({ expectedOrderVersion: 1, originalDirectSourceSha256: sha, reason: "Private test" }) };
    const cancelled: PrincipalReply = { ...ack, status: "Cancelled", version: 2, commandKey: id(10) };
    const fetcher = vi.fn(async () => response(receipt(cancelled, "Cancel")));
    vi.stubGlobal("fetch", fetcher);
    expect(await recoverPrincipalCommand(id(2), cancelCommand)).toEqual(cancelled);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains the journal on a wrong saved quantity or missing source binding", async () => {
    const fetcher = vi.fn(async () => response({ ...detail,
      lines: [{ ...detail.lines[0], quantity: "1.0002" }] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(confirmPrincipalCommand(id(2), command, ack)).rejects.toThrow();
  });
  it("uses the bounded same-permission supplier discovery endpoint", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response({ items: [{ id: id(4), number: "SUP-1", displayName: "Supplier A" }],
      total: 1, page: 1, pageSize: 25 })); vi.stubGlobal("fetch", fetcher);
    expect((await listPrincipalSuppliers(id(2), 1, "Supplier")).items[0].displayName).toBe("Supplier A");
    expect(String(fetcher.mock.calls[0][0])).toContain("/principal-direct-suppliers?");
  });
  it("refuses detail metadata that implies submission or Finance effect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...detail, canIssue: true })));
    await expect(getPrincipalOrder(id(2), id(7))).rejects.toThrow();
  });
});
