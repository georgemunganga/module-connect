import { describe, expect, it } from "vitest";
import { parseManualPaymentPolicy, serializeManualPaymentPolicy } from "./manual-payment-policy-editor";

describe("manual payment policy editor", () => {
  it("serializes only mandatory independent review with explicit exact per-currency limits", () => {
    const json = serializeManualPaymentPolicy([{ currencyCode: "zmw", maximumExact: "0.0001" },
      { currencyCode: "USD", maximumExact: "99999999999999.9999" }]);
    expect(JSON.parse(json)).toEqual({ schemaVersion: 1, identitySchemaVersion: 2,
      policyKey: "MANUAL_PAYMENT_REVIEW", transactionType: "ManualPaymentReview",
      approvalType: "SingleApprover", independentCreatorApprover: true,
      independentRecorderConfirmer: true, maximumByCurrency: { ZMW: "0.0001", USD: "99999999999999.9999" } });
    expect(parseManualPaymentPolicy(json)).toEqual([{ currencyCode: "ZMW", maximumExact: "0.0001" },
      { currencyCode: "USD", maximumExact: "99999999999999.9999" }]);
  });
  it.each([[], [{ currencyCode: "ZMW", maximumExact: "" }],
    [{ currencyCode: "ZMW", maximumExact: "1.00001" }],
    [{ currencyCode: "ZMW", maximumExact: "0" }],
    [{ currencyCode: "ZMW", maximumExact: "1" }, { currencyCode: "zmw", maximumExact: "2" }]])
  ("does not invent payment authority for missing or invalid maxima", rows => {
    expect(() => serializeManualPaymentPolicy(rows)).toThrow();
  });
  it("refuses to edit a policy that weakens independent review or adds unknown fields", () => {
    const valid = JSON.parse(serializeManualPaymentPolicy([{ currencyCode: "ZMW", maximumExact: "1" }]));
    expect(parseManualPaymentPolicy(JSON.stringify({ ...valid, independentRecorderConfirmer: false }))).toBeNull();
    expect(parseManualPaymentPolicy(JSON.stringify({ ...valid, bankPayment: true }))).toBeNull();
    expect(parseManualPaymentPolicy(JSON.stringify({ ...valid, maximumByCurrency: {} }))).toBeNull();
  });
});
