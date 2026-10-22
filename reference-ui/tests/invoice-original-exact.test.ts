import { afterEach, describe, expect, it, vi } from "vitest";
import { captureInvoiceIntake, getInvoiceIntake, listInvoiceIntake } from "../../src/platform/procurement-invoices-api";
import { invoiceDecimal, invoiceTotals, formatInvoiceDecimal } from "../../src/platform/procurement-invoice-exact";
import { parseInvoiceOriginalJson } from "../../src/platform/procurement-invoice-json";
const company = "11111111-1111-4111-8111-111111111111", invoice = "22222222-2222-4222-8222-222222222222";
const vendor = "33333333-3333-4333-8333-333333333333", line = "44444444-4444-4444-8444-444444444444";
const input = () => ({ supplierId: vendor, invoiceNumber: "EXACT-1", invoiceDate: "2026-10-20", currencyCode: "ZMW",
  lines: [{ description: 'Original "unitPrice":12345678901234.5678', quantity: "1", unitPrice: "12345678901234.5678", taxAmount: "0" }] });
const rawDetail = String.raw`{"id":"${invoice}","supplierId":"${vendor}","invoiceNumber":"EXACT-1","status":"Received","version":1,"currencyCode":"ZMW","netAmount":12345678901234.5678,"taxAmount":0.0000,"grossAmount":12345678901234.5678,"lines":[{"id":"${line}","lineNumber":1,"description":"Escaped \"quantity\":12345678901234.5678 \\ path","quantity":1,"unitPrice":12345678901234.5678,"taxAmount":0}]}`;
function respond(raw: string) { const fetch = vi.fn().mockResolvedValue(new Response(raw, { headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetch); return fetch; }
afterEach(() => vi.unstubAllGlobals());
describe("exact original invoice transport", () => {
  it("reads raw original18,4 numeric lexemes before JSON.parse and leaves escaped descriptions untouched", async () => {
    respond(rawDetail); const result = await getInvoiceIntake(company, invoice);
    expect(result.netAmount).toBe("12345678901234.5678"); expect(result.grossAmount).toBe(result.netAmount);
    expect(result.lines[0].unitPrice).toBe(result.netAmount); expect(result.lines[0].quantity).toBe("1");
    expect(result.taxAmount).toBe("0"); expect(result.lines[0].description).toBe('Escaped "quantity":12345678901234.5678 \\ path');
    expect(result.version).toBe(1); expect(result.lines[0].lineNumber).toBe(1);
  });
  it("retains list totals without coercing metadata numbers or amount-looking strings", async () => {
    respond(`{"items":[{"id":"${invoice}","invoiceNumber":"quantity:12345678901234.5678","status":"Received","grossAmount":99999999999999.9999}],"total":1,"page":1,"pageSize":25}`);
    const result = await listInvoiceIntake(company); expect(result.items[0].grossAmount).toBe("99999999999999.9999");
    expect(result.items[0].invoiceNumber).toBe("quantity:12345678901234.5678"); expect(result.total).toBe(1);
  });
  it("sends exact decimal strings including wide values; no original is converted to a JS financial number", async () => {
    const fetch = respond(`{"id":"${invoice}","status":"Received","grossAmount":12345678901234.5678}`);
    await captureInvoiceIntake(company, input());
    const body = fetch.mock.calls[0][1].body as string; const parsed = JSON.parse(body);
    expect(parsed.lines[0]).toEqual(input().lines[0]); expect(body).toContain('"unitPrice":"12345678901234.5678"');
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
  });
  it("does not accept already rounded caller numbers or submit unrepresentable original headers", async () => {
    const fetch = respond("{}");
    await expect(captureInvoiceIntake(company, { ...input(), lines: [{ ...input().lines[0], unitPrice: 12345678901234.568 as unknown as string }] })).rejects.toThrow("exact");
    await expect(captureInvoiceIntake(company, { ...input(), lines: [{ ...input().lines[0], quantity: "0.0001", unitPrice: "0.0001" }] })).rejects.toThrow("without rounding");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows8dp individual products when their aggregate is exact18,4", async () => {
    const fetch = respond(`{"id":"${invoice}","status":"Received"}`);
    await captureInvoiceIntake(company, { ...input(), lines: [
      { description: "First", quantity: "0.0001", unitPrice: "0.0001", taxAmount: "0" },
      { description: "Second", quantity: "0.0001", unitPrice: "0.9999", taxAmount: "0" }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(invoiceTotals([{ quantity: "0.0001", unitPrice: "0.0001", taxAmount: "0" },
      { quantity: "0.0001", unitPrice: "0.9999", taxAmount: "0" }]).netAmount).toBe("0.0001");
  });
});
describe("bounded string-aware numeric token reader", () => {
  it("handles exponent numeric originals, escaped key names and both exact string/numeric wires", () => {
    expect(parseInvoiceOriginalJson(String.raw`{"\u0071uantity":1e-4,"unitPrice":"1.2300","description":"{\"taxAmount\":1e99}","taxAmount":0}`))
      .toEqual({ quantity: "0.0001", unitPrice: "1.23", description: '{"taxAmount":1e99}', taxAmount: "0" });
  });
  it.each([`{"quantity":1e-5}`, `{"unitPrice":999999999999999}`, `{"taxAmount":0.00001}`, `{"quantity":1,"quantity":2}`,
    `{"quantity":1,"\\u0071uantity":2}`, `{"quantity":01}`, `{"quantity":null}`, `{"quantity":true}`, `{"quantity":{}}`,
    `{"description":"bad\\q"}`, `{"quantity":1} trailing`, `{"quantity":1,}`])("rejects invalid/ambiguous/unrepresentable originals %s", (text) => {
      expect(() => parseInvoiceOriginalJson(text)).toThrow();
  });
  it("rejects unsupported size and depth without unbounded recursion", () => {
    expect(() => parseInvoiceOriginalJson(" ".repeat(2 * 1024 * 1024 + 1))).toThrow();
    expect(() => parseInvoiceOriginalJson("[".repeat(26) + "0" + "]".repeat(26))).toThrow();
  });
});
describe("invoice exact preview and formatting", () => {
  it("groups wide digits and keeps significant4dp without Number/toFixed rounding", () => {
    expect(formatInvoiceDecimal("12345678901234.5678")).toBe("12,345,678,901,234.5678");
    expect(formatInvoiceDecimal("275")).toBe("275.00"); expect(formatInvoiceDecimal("0.0001")).toBe("0.0001");
    expect(invoiceTotals([{ quantity: "1", unitPrice: "12345678901234.5678", taxAmount: "0" }]).grossAmount).toBe("12345678901234.5678");
    expect(invoiceDecimal("1.2300")).toBe("1.23"); expect(invoiceDecimal("1E-4")).toBe("0.0001");
  });
});
