import { describe, expect, it } from "vitest";
import { compareExactDecimal } from "./decimal-comparison";
import { compareInvoiceAmounts } from "../features/invoice-list-view";

describe("exact decimal comparison", () => {
  it("orders tiny fractions without numeric rounding", () => {
    expect(compareExactDecimal("0.0001", "0.001")).toBeLessThan(0);
    expect(compareExactDecimal("0.0000000000000000000000000001", "0.000000000000000000000000001")).toBeLessThan(0);
    expect(compareExactDecimal("1.20", "1.2")).toBe(0);
  });

  it("orders wide integers and retains the invoice alias", () => {
    const smaller = "9007199254740992.9999999999999999";
    const larger = "9007199254740993.0000000000000001";
    expect(compareExactDecimal(smaller, larger)).toBeLessThan(0);
    expect(compareInvoiceAmounts(smaller, larger)).toBe(compareExactDecimal(smaller, larger));
  });
});
