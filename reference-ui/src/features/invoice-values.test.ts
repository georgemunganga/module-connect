import { describe, expect, it } from "vitest";
import { invoiceDecimal, invoicePreview } from "./invoice-values";

describe("invoice input precision", () => {
  it("keeps the largest 18,4 input and exact 8-place products", () => {
    expect(invoiceDecimal("99999999999999.9999")).toBe("99999999999999.9999");
    expect(invoicePreview([{ quantity: "0.0001", unitPrice: "0.0001", taxAmount: "0" }]))
      .toEqual({ net: "0.00000001", tax: "0", total: "0.00000001" });
    expect(invoicePreview([{ quantity: "1", unitPrice: "99999999999999.9999", taxAmount: "0" }]).total)
      .toBe("99999999999999.9999");
  });
  it.each(["1.00001", "100000000000000", "-1", "1e3", "", "NaN"])("rejects unsupported input %s before submit", value => {
    expect(() => invoiceDecimal(value)).toThrow();
  });
  it("requires positive quantity while accepting a zero price and tax", () => {
    expect(() => invoiceDecimal("0.0000", true)).toThrow();
    expect(invoicePreview([{ quantity: "1", unitPrice: "0", taxAmount: "0" }]).total).toBe("0");
  });
});
