/** Keys are owning backend contracts, not interchangeable buying-rule JSON formats. */
export function isBuyingRulePolicy(key: string): key is "PURCHASE_REQUEST" | "PURCHASE_ORDER" {
  return key === "PURCHASE_REQUEST" || key === "PURCHASE_ORDER";
}
export function policyLabel(key: string): string {
  switch (key) {
    case "PURCHASE_REQUEST": return "Purchase requests";
    case "PURCHASE_ORDER": return "Purchase orders";
    case "SOURCING": return "Sourcing publication";
    case "RECEIVING": return "Receiving and service acceptance";
    case "INVOICE_MATCHING": return "Invoice matching";
    case "INVOICE_UNIT_REVIEW": return "Original invoice unit review";
    case "MANUAL_PAYMENT_REVIEW": return "Manual payment review";
    default: return key ? `Other policy (${key})` : "Other policy";
  }
}
export function ownedPolicySettings(key: string): { path: string; label: string } {
  switch (key) {
    case "SOURCING": return { path: "/settings/modules/request-for-quotes/approvals", label: "Sourcing settings" };
    case "RECEIVING": return { path: "/settings/modules/purchase-receives/preferences", label: "Receiving settings" };
    case "INVOICE_MATCHING":
      return { path: "/settings/modules/bills/preferences", label: "Invoice check settings" };
    case "INVOICE_UNIT_REVIEW":
      return { path: "/settings/modules/bills/preferences?rule=unit-review", label: "Bill review rules" };
    case "MANUAL_PAYMENT_REVIEW":
      return { path: "/settings/modules/payments-made/approvals", label: "Manual payment review rules" };
    default: return { path: "/settings", label: "Procurement settings" };
  }
}
