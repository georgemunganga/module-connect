import { describe, expect, it } from "vitest";
import { isBuyingRulePolicy, ownedPolicySettings, policyLabel } from "./policy-key-dispatch";

describe("policy editor ownership", () => {
  it.each(["PURCHASE_REQUEST", "PURCHASE_ORDER"])("keeps the existing buying editor for %s", key => {
    expect(isBuyingRulePolicy(key)).toBe(true);
  });
  it.each(["SOURCING", "RECEIVING", "INVOICE_MATCHING", "INVOICE_UNIT_REVIEW", "MANUAL_PAYMENT_REVIEW", "FUTURE_POLICY", "purchase_request", " PURCHASE_REQUEST", ""])
    ("never downgrades %s to the purchase request schema", key => {
      expect(isBuyingRulePolicy(key)).toBe(false);
      expect(policyLabel(key)).not.toBe("Purchase requests");
    });
  it("keeps each owning policy label and existing settings destination", () => {
    expect(policyLabel("SOURCING")).toBe("Sourcing publication");
    expect(policyLabel("RECEIVING")).toBe("Receiving and service acceptance");
    expect(policyLabel("INVOICE_MATCHING")).toBe("Invoice matching");
    expect(policyLabel("INVOICE_UNIT_REVIEW")).toBe("Original invoice unit review");
    expect(policyLabel("MANUAL_PAYMENT_REVIEW")).toBe("Manual payment review");
    expect(ownedPolicySettings("SOURCING").path).toBe("/settings/modules/request-for-quotes/approvals");
    expect(ownedPolicySettings("RECEIVING").path).toBe("/settings/modules/purchase-receives/preferences");
    expect(ownedPolicySettings("INVOICE_MATCHING").path).toBe("/settings/modules/bills/preferences");
    expect(ownedPolicySettings("INVOICE_UNIT_REVIEW").path).toBe("/settings/modules/bills/preferences?rule=unit-review");
    expect(ownedPolicySettings("MANUAL_PAYMENT_REVIEW").path).toBe("/settings/modules/payments-made/approvals");
    expect(ownedPolicySettings("FUTURE_POLICY").path).toBe("/settings");
  });
});
