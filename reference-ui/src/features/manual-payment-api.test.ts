import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureManualPaymentScope, getManualPayment, listManualPayments, lookupManualPaymentAssignees,
  lookupManualPaymentInvoices, manualPaymentActionAvailability, ManualPaymentApiError,
  recoverManualPaymentCreate, sendManualPaymentCommand, type ManualPaymentIdentity,
} from "../../../src/platform/procurement-manual-payments-api";
import { createManualPaymentRecoveryJournal } from "../lib/manual-payment-command-journal";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const principal = "33333333-3333-4333-8333-333333333333";
const invoice = "44444444-4444-4444-8444-444444444444";
const payment = "55555555-5555-4555-8555-555555555555";
const approver = "66666666-6666-4666-8666-666666666666";
const recorder = "77777777-7777-4777-8777-777777777777";
const confirmer = "88888888-8888-4888-8888-888888888888";
const supplier = "99999999-9999-4999-8999-999999999999";
const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nonce = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const at = "2026-10-23T12:00:00Z";
const summary = { id: payment, version: 1, status: "Draft", title: "External payment",
  branchId: branch, supplierInvoiceId: invoice, supplierId: supplier, invoiceNumber: "BILL-1042",
  supplierDisplayName: "Northwind Devices", currencyCode: "ZMW",
  amountExact: "99999999999999.9999", creatorPrincipalId: principal, approverPrincipalId: approver,
  recorderPrincipalId: recorder, confirmerPrincipalId: confirmer, createdAt: at, updatedAt: null };
const detail = { request: { ...summary, purpose: "Supplier transfer", approvedAmountExact: null,
  recordedAmountExact: null, paidOn: null, externalMethod: null, externalReference: null,
  approvedByPrincipalId: null, recordedByPrincipalId: null, confirmedByPrincipalId: null,
  closureReason: null }, transitions: [], coreCases: [], coreDecisions: [] };
let identity: ManualPaymentIdentity;
function scope() {
  identity = { tenantId: "test-tenant", legalEntityId: company, principalId: principal, branchId: branch, authEpoch: 1 };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch }) });
  return captureManualPaymentScope(identity, () => identity);
}
afterEach(() => vi.unstubAllGlobals());

describe("manual payment API client", () => {
  it("reads a scoped server page with exact amount strings and no Finance Paid status", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [summary], total: 1, page: 1, pageSize: 25 }));
    vi.stubGlobal("fetch", fetcher);
    const page = await listManualPayments(captured, 1, { status: "Draft" });
    expect(page.items[0].amountExact).toBe("99999999999999.9999");
    expect(fetcher.mock.calls[0][0]).toBe("/api/procurement/v1/manual-payments?page=1&pageSize=25&status=Draft");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(fetcher.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    expect(fetcher.mock.calls[0][1].headers.get("X-Shell-Location")).toBe(branch);
    fetcher.mockResolvedValue(Response.json({ items: [{ ...summary, status: "Paid" }], total: 1, page: 1, pageSize: 25 }));
    await expect(listManualPayments(captured)).rejects.toMatchObject({ status: 0 });
  });

  it("sends exactly one Create with an explicit key and exact string, without bank fields", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: payment, version: 1, status: "Draft",
      action: "Create", commandKey: key, amountExact: "99999999999999.9999" }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const saved = await sendManualPaymentCommand(captured, { action: "Create", key,
      input: { branchId: branch, invoiceId: invoice, amountExact: "99999999999999.9999",
        approverPrincipalId: approver, recorderPrincipalId: recorder, confirmerPrincipalId: confirmer,
        purpose: "Supplier transfer", title: "External payment" } });
    expect(saved.amountExact).toBe("99999999999999.9999");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ branchId: branch, invoiceId: invoice,
      amount: "99999999999999.9999", approverPrincipalId: approver, recorderPrincipalId: recorder,
      confirmerPrincipalId: confirmer, purpose: "Supplier transfer", title: "External payment" });
  });

  it("recovers a lost Create only by actor/key GET, then fetches current detail", async () => {
    const captured = scope();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: payment, version: 1, status: "Draft", action: "Create", commandKey: key }))
      .mockResolvedValueOnce(Response.json(detail));
    vi.stubGlobal("fetch", fetcher);
    const recovered = await recoverManualPaymentCreate(captured, key);
    expect(recovered.receipt.id).toBe(payment);
    expect(recovered.detail.request.supplierInvoiceId).toBe(invoice);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/procurement/v1/manual-payments/commands/${key}`,
      `/api/procurement/v1/manual-payments/${payment}`,
    ]);
    expect(fetcher.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
  });

  it("uses optional Core people and company clock facts while accepting older detail hosts", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...detail, people: [
      { principalId: approver, displayName: "Current approval officer" }],
      companyClock: { date: "2026-10-23", timeZoneId: "Africa/Lusaka", observedAtUtc: at } }))
      .mockResolvedValueOnce(Response.json(detail));
    vi.stubGlobal("fetch", fetcher);
    const named = await getManualPayment(captured, payment);
    expect(named.people).toEqual([{ principalId: approver, displayName: "Current approval officer" }]);
    expect(named.companyClock?.date).toBe("2026-10-23");
    const older = await getManualPayment(captured, payment);
    expect(older.people).toEqual([]);
    expect(older.companyClock).toBeNull();
  });

  it("does not retry an interrupted mutation or invent a saved result", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetcher);
    await expect(sendManualPaymentCommand(captured, { action: "Submit", id: payment, key,
      input: { expectedVersion: 1 } })).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends Record evidence with a string amount and no upload or Finance Paid claim", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: payment, version: 4,
      status: "PaymentRecorded", action: "Record", commandKey: key, amountExact: "0.0001" }));
    vi.stubGlobal("fetch", fetcher);
    await sendManualPaymentCommand(captured, { action: "Record", id: payment, key,
      input: { expectedVersion: 3, paidOn: "2026-10-23", externalMethod: "External transfer",
        externalReference: "BANK-REF-1", amountExact: "0.0001" } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedVersion: 3,
      paidOn: "2026-10-23", externalMethod: "External transfer", externalReference: "BANK-REF-1",
      amount: "0.0001", evidenceDocumentRefId: null });
  });

  it("invalidates a late response after account or selected branch changes", async () => {
    const captured = scope();
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    const read = getManualPayment(captured, payment);
    identity = { ...identity, principalId: approver, authEpoch: 2 };
    resolve(Response.json(detail));
    await expect(read).rejects.toThrow(/context changed/);
  });

  it("keeps recovery metadata only and blocks another write until a bound receipt clears it", () => {
    const captured = scope();
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    const journal = createManualPaymentRecoveryJournal(captured, store, nonce);
    const locator = { action: "Create" as const, key, id: null };
    expect(journal.claim(locator)).toBe(true);
    expect(journal.claim(locator)).toBe(false);
    expect([...map.values()].join(" ")).not.toMatch(/supplier|transfer|amount|reason|bank/i);
    const receipt = { id: payment, version: 1, status: "Draft" as const, action: "Create" as const, commandKey: key };
    expect(journal.confirm({ ...locator, key: payment }, receipt)).toBe(false);
    expect(journal.confirm(locator, { ...receipt, commandKey: payment })).toBe(false);
    expect(journal.confirm(locator, receipt)).toBe(true);
    expect(journal.state().blocked).toBe(false);
    identity = { ...identity, authEpoch: 2 };
    expect(journal.state().blocked).toBe(true);
  });

  it("clears a journal only for a definite received rejection of the same command", () => {
    const captured = scope();
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    const journal = createManualPaymentRecoveryJournal(captured, store, nonce);
    const locator = { action: "Create" as const, key, id: null };
    expect(journal.claim(locator)).toBe(true);
    expect(journal.reject(locator, new ManualPaymentApiError(0, "Interrupted"))).toBe(false);
    expect(journal.state().blocked).toBe(true);
    expect(journal.reject(locator, new ManualPaymentApiError(422, "Invalid amount"))).toBe(true);
    expect(journal.state().blocked).toBe(false);
  });

  it("rejects imprecise inputs and exposes unavailable execution actions honestly", async () => {
    const captured = scope();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(sendManualPaymentCommand(captured, { action: "Create", key,
      input: { branchId: branch, invoiceId: invoice, amountExact: "1.00001",
        approverPrincipalId: approver, recorderPrincipalId: recorder, confirmerPrincipalId: confirmer,
        purpose: null, title: null } })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(manualPaymentActionAvailability("bank-execution")).toMatchObject({ supported: false });
    expect(manualPaymentActionAvailability("batch-payment")).toMatchObject({ supported: false });
    expect(manualPaymentActionAvailability("payment-upload")).toMatchObject({ supported: false });
  });

  it("uses payment-scoped bill lookup and never calls generic vendor or invoice search", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [{ invoiceId: invoice,
      invoiceNumber: "BILL-1042", supplierId: supplier, supplierDisplayName: "Northwind Devices",
      currencyCode: "ZMW", grossExact: "99999999999999.9999", invoiceDate: "2026-10-20", branchId: branch }],
      nextCursor: null, hasMore: false, previewOnly: true }));
    vi.stubGlobal("fetch", fetcher);
    const choices = await lookupManualPaymentInvoices(captured, { branchId: branch, invoiceId: invoice });
    expect(choices.items[0].grossExact).toBe("99999999999999.9999");
    expect(fetcher.mock.calls[0][0]).toContain(`/manual-payments/lookups/invoices?branchId=${branch}`);
    expect(fetcher.mock.calls[0][0]).toContain(`invoiceId=${invoice}`);
    expect(fetcher.mock.calls[0][0]).not.toContain("/api/procurement/v1/invoices");
    fetcher.mockResolvedValue(Response.json({ items: [{ ...choices.items[0], grossExact: "1.00001" }],
      nextCursor: null, hasMore: false, previewOnly: true }));
    await expect(lookupManualPaymentInvoices(captured, { branchId: branch })).rejects.toMatchObject({ status: 0 });
  });

  it("accepts only current named assignee IDs and never employee identifiers", async () => {
    const captured = scope();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [{ principalId: confirmer,
      displayName: "Finance reviewer" }], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", fetcher);
    const people = await lookupManualPaymentAssignees(captured, { role: "confirm", branchId: branch,
      recorderPrincipalId: recorder });
    expect(people.items[0].principalId).toBe(confirmer);
    expect(fetcher.mock.calls[0][0]).toContain(`recorderPrincipalId=${recorder}`);
    await expect(lookupManualPaymentAssignees(captured, { role: "confirm", branchId: branch }))
      .rejects.toMatchObject({ status: 422 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
