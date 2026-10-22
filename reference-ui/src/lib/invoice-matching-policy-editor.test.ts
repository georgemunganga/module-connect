import { describe, expect, it } from "vitest";
import { emptyMatchForm, parseMatchPolicy, serializeMatchPolicy } from "./invoice-matching-policy-editor";

function complete() {
  const form = emptyMatchForm();
  form.moneyScale = "2"; form.rounding = "ToEven";
  const row = form.rows[0];
  row.categoryCode = "LAPTOPS"; row.method = "ThreeWay"; row.acceptanceKind = "Goods";
  for (const measure of [row.quantity, row.unitPrice, row.tax, row.total]) {
    measure.absolute = "0.0001"; measure.percent = "1.5000"; measure.combination = "AllLimits";
  }
  return form;
}

describe("owned invoice matching policy editor", () => {
  it("round trips all exact tolerance strings without losing fields", () => {
    const form = complete();
    const json = serializeMatchPolicy("ZMW", form);
    expect(parseMatchPolicy(json, "ZMW")).toEqual(form);
    expect(json).toContain('"absolute":"0.0001"');
  });
  it("does not supply an unchosen method, rounding or acceptance record", () => {
    expect(() => serializeMatchPolicy("ZMW", emptyMatchForm())).toThrow();
    const form = complete(); form.rows[0].acceptanceKind = "";
    expect(() => serializeMatchPolicy("ZMW", form)).toThrow();
  });
  it("rejects excess tolerance, duplicate category and unknown saved schema instead of rewriting", () => {
    const form = complete(); form.rows[0].tax.percent = "100.0001";
    expect(() => serializeMatchPolicy("ZMW", form)).toThrow();
    form.rows[0].tax.percent = "1";
    form.rows.push({ ...form.rows[0], quantity: { ...form.rows[0].quantity } });
    expect(() => serializeMatchPolicy("ZMW", form)).toThrow();
    const valid = serializeMatchPolicy("ZMW", complete());
    expect(parseMatchPolicy(valid.replace('"moneyScale":2', '"moneyScale":2,"newServerRule":true'), "ZMW")).toBeNull();
    expect(parseMatchPolicy(valid.replace('"moneyScale":2', '"moneyScale":"2"'), "ZMW")).toBeNull();
    expect(parseMatchPolicy(valid, "USD")).toBeNull();
  });
  it("maps two way matching to no accepted goods or service record", () => {
    const form = complete(); form.rows[0].method = "TwoWay"; form.rows[0].acceptanceKind = "";
    const json = serializeMatchPolicy("ZMW", form);
    expect(JSON.parse(json).rules[0].acceptanceKind).toBeNull();
    expect(parseMatchPolicy(json, "ZMW")).toEqual(form);
  });
});
