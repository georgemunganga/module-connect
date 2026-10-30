import { afterEach, describe, expect, it, vi } from "vitest";
import { captureInvoiceIntake, getInvoiceAmountCalculation, previewInvoiceCalculation, InvoiceIntakeError,
  recoverInvoiceCapture, type InvoiceIntakeInput } from "../../src/platform/procurement-invoices-api";
import { invoiceCaptureJournal, type InvoiceCaptureScope } from "../src/lib/invoice-capture-command-journal";

const company = "11111111-1111-4111-8111-111111111111";
const invoice = "22222222-2222-4222-8222-222222222222";
const reference = "33333333-3333-4333-8333-333333333333";
const hash = "a".repeat(64);
const commandKey = "44444444-4444-4444-8444-444444444444";
const amounts = { rawNet: "5.12391234", net: "5.12390000", tax: "0.00000000", gross: "5.12390000", adjustment: "-0.00001234",
  lines: [{ lineNumber: 1, quantity: "1.00010000", unitPrice: "5.12340000", rawNet: "5.12391234",
    net: "5.12390000", tax: "0.00000000", gross: "5.12390000", adjustment: "-0.00001234" }] };
const precision = { currencyCode: "ZMW", referenceId: reference, revision: 2, minorUnits: 4,
  rounding: "ToEven", payloadSha256: hash, publishedAtUtc: "2026-10-30T00:00:00Z",
  observedAtUtc: "2026-10-30T01:00:00Z" };
const input: InvoiceIntakeInput = { supplierId: reference, invoiceNumber: "INV-1", invoiceDate: "2026-10-30",
  currencyCode: "ZMW", lines: [{ description: "Service", quantity: "1.0001", unitPrice: "5.1234", taxAmount: "0" }] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
afterEach(() => vi.unstubAllGlobals());

describe("invoice currency calculation adapter", () => {
  it("retains exact source precision and amounts in preview without local rounding", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ schemaVersion: 2, precision, amounts, previewSha256: hash }));
    vi.stubGlobal("fetch", fetch);
    const result = await previewInvoiceCalculation(company, input);
    expect(result.amounts.rawNet).toBe("5.12391234");
    expect(result.amounts.net).toBe("5.12390000");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/procurement/v1/invoices/calculation-preview");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    fetch.mockResolvedValueOnce(reply({ schemaVersion: 2, precision, amounts: { ...amounts, net: 5.1239 }, previewSha256: hash }));
    await expect(previewInvoiceCalculation(company, input)).rejects.toThrow("invalid currency calculation");
  });

  it("requires a confirmed v2 capture and keeps an unconfirmed response uncertain", async () => {
    const draft: InvoiceIntakeInput = { ...input, intakeSchemaVersion: 2, expectedCurrencyReferenceId: reference,
      expectedCurrencyRevision: 2, expectedCalculationSha256: hash };
    const fetch = vi.fn().mockResolvedValue(reply({ id: invoice, status: "Received", intakeSchemaVersion: 2,
      calculationId: reference, amounts }, 201));
    vi.stubGlobal("fetch", fetch);
    expect(await captureInvoiceIntake(company, draft, commandKey)).toMatchObject({ id: invoice });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(draft);
    expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(commandKey);
    fetch.mockResolvedValueOnce(reply({ id: invoice, status: "Received" }, 201));
    await expect(captureInvoiceIntake(company, draft, commandKey)).rejects.toMatchObject({ status: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValueOnce(reply({ id: invoice, status: "Received", intakeSchemaVersion: 2,
      calculationId: reference, amounts }, 201));
    expect(await recoverInvoiceCapture(company, commandKey)).toMatchObject({ id: invoice });
    expect(fetch.mock.calls[2][0]).toBe(`/api/procurement/v1/invoices/capture-commands/${commandKey}`);
    expect(fetch.mock.calls[2][1].method).toBeUndefined();
  });

  it("treats only the typed legacy 404 as normal while retaining a stale-preview code", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply({ code: "legacy-invoice-calculation" }, 404))
      .mockResolvedValueOnce(reply({ code: "other-not-found" }, 404))
      .mockResolvedValueOnce(reply({ code: "invoice-calculation-changed", message: "Review the calculation." }, 409));
    vi.stubGlobal("fetch", fetch);
    expect(await getInvoiceAmountCalculation(company, invoice)).toBeNull();
    await expect(getInvoiceAmountCalculation(company, invoice)).rejects.toMatchObject({ status: 404, code: "other-not-found" });
    try { await captureInvoiceIntake(company, input); throw new Error("Expected a stale preview response"); }
    catch (cause) { expect(cause).toBeInstanceOf(InvoiceIntakeError);
      expect(cause).toMatchObject({ status: 409, code: "invoice-calculation-changed" }); }
  });
});

describe("v2 invoice capture journal", () => {
  const scope: InvoiceCaptureScope = { tenantId: "private-tenant", companyId: company,
    branchId: invoice, principalId: reference };
  function store() {
    const values = new Map<string, string>();
    return { values, getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); } } as unknown as Storage & { values: Map<string, string> };
  }
  const draft: InvoiceIntakeInput = { ...input, intakeSchemaVersion: 2, expectedCurrencyReferenceId: reference,
    expectedCurrencyRevision: 2, expectedCalculationSha256: hash };
  const pending = { operation: "CaptureV2" as const, key: commandKey, body: JSON.stringify(draft) };

  it("retains exact key and body across reload and blocks a fresh command", () => {
    const storage = store();
    expect(invoiceCaptureJournal.claim(scope, pending, storage)).toBe(true);
    expect(invoiceCaptureJournal.read(scope, storage)).toEqual({ pending, blocked: true });
    expect(invoiceCaptureJournal.claim(scope, { ...pending, key: reference }, storage)).toBe(false);
    expect(invoiceCaptureJournal.read({ ...scope, principalId: commandKey }, storage)).toEqual({ pending: null, blocked: false });
    expect(invoiceCaptureJournal.clear(scope, { ...pending, body: "{}" }, storage)).toBe(false);
    expect(invoiceCaptureJournal.clear(scope, pending, storage)).toBe(true);
    expect(invoiceCaptureJournal.clear(scope, pending, storage)).toBe(true);
    expect(invoiceCaptureJournal.read(scope, storage)).toEqual({ pending: null, blocked: false });
  });

  it("accepts an already cleared confirmed key but never erases a different or corrupt command", () => {
    const storage = store();
    expect(invoiceCaptureJournal.claim(scope, pending, storage)).toBe(true);
    const staleView = invoiceCaptureJournal.read(scope, storage).pending!;
    expect(invoiceCaptureJournal.clear(scope, pending, storage)).toBe(true);
    expect(invoiceCaptureJournal.clear(scope, staleView, storage)).toBe(true);
    expect(invoiceCaptureJournal.claim(scope, { ...pending, key: reference }, storage)).toBe(true);
    expect(invoiceCaptureJournal.clear(scope, staleView, storage)).toBe(false);
    expect(invoiceCaptureJournal.read(scope, storage).pending?.key).toBe(reference);
    const key = [...storage.values.keys()][0];
    storage.setItem(key, "{corrupt");
    expect(invoiceCaptureJournal.clear(scope, staleView, storage)).toBe(false);
    expect(invoiceCaptureJournal.clear({ ...scope, branchId: "" }, staleView, storage)).toBe(false);
  });

  it("keeps the original key and bounded draft after a browser session closes", () => {
    const persistent = store();
    vi.stubGlobal("window", { localStorage: persistent,
      sessionStorage: { getItem: () => { throw new Error("The old tab is closed."); } } });
    expect(invoiceCaptureJournal.claim(scope, pending)).toBe(true);
    expect(invoiceCaptureJournal.read(scope)).toEqual({ pending, blocked: true });
    expect(invoiceCaptureJournal.read({ ...scope, principalId: commandKey })).toEqual({ pending: null, blocked: false });
    expect(invoiceCaptureJournal.clear(scope, pending)).toBe(true);
  });

  it("fails closed for malformed saved commands and missing branch context", () => {
    const storage = store();
    expect(invoiceCaptureJournal.claim({ ...scope, branchId: "" }, pending, storage)).toBe(false);
    expect(invoiceCaptureJournal.read({ ...scope, branchId: "" }, storage).blocked).toBe(true);
    expect(invoiceCaptureJournal.claim(scope, pending, storage)).toBe(true);
    const key = [...storage.values.keys()][0];
    storage.setItem(key, "{corrupt");
    expect(invoiceCaptureJournal.read(scope, storage)).toEqual({ pending: null, blocked: true });
    expect(invoiceCaptureJournal.claim(scope, pending, storage)).toBe(false);
  });
});
