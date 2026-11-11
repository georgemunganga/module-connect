/** Presentation/route-entry checks only. Server permissions and record scope remain authoritative. */
export function canOpenProcurementPage(url: string, permissions: readonly string[]): boolean {
  const grants = new Set(permissions);
  if (!grants.has("procurement-access")) return false;
  const [raw, search = ""] = url.split("?");
  const path = raw.replace(/\/+$/, "") || "/";
  const any = (...actions: string[]) => actions.some(action => grants.has(action));
  const operation = (read: string | string[], create: string, edit = create) =>
    path.endsWith("/new") ? any(create) : /\/[^/]+\/edit$/.test(path) ? any(edit) : any(...(Array.isArray(read) ? read : [read]));
  if (path === "/") return true;
  if (/^\/(?:requests|procurement-requests)(?:\/|$)/.test(path))
    return operation("procurement-request-read", "procurement-request-create", "procurement-request-edit");
  if (/^\/approvals(?:\/|$)/.test(path)) return any(
    "procurement-approval-read", "procurement-approval-open", "procurement-po-approve", "procurement-round-plan-review", "procurement-plan-review-read",
    "procurement-invoice-unit-review", "procurement-invoice-unit-review-read", "procurement-invoice-unit-review-request");
  if (/^\/vendors(?:\/|$)/.test(path)) return operation("procurement-vendor-read", "procurement-vendor-create", "procurement-vendor-edit");
  if (/^\/items(?:\/|$)/.test(path)) return operation(["procurement-item-read", "procurement-item-manage"], "procurement-item-manage");
  if (/^\/rfqs(?:\/|$)/.test(path)) {
    const source = new URLSearchParams(search).get("source");
    if (source === "round-plan") return operation("procurement-round-plan-read", "procurement-round-plan-manage");
    if (source === "quotations") return operation("procurement-quotation-read", "procurement-quotation-capture");
    return operation(["procurement-sourcing-read", "procurement-round-plan-read", "procurement-quotation-read"], "procurement-sourcing-create", "procurement-sourcing-edit");
  }
  if (/^\/purchase-orders(?:\/|$)/.test(path)) return operation(
    /^\/purchase-orders\/[^/]+$/.test(path) ? ["procurement-po-read", "procurement-po-approve"] : "procurement-po-read",
    "procurement-po-create", "procurement-po-edit");
  if (/^\/purchase-receives\/returns(?:\/|$)/.test(path)) return operation("procurement-return-read", "procurement-return-create", "procurement-return-edit");
  if (/^\/purchase-receives(?:\/|$)/.test(path)) {
    if (path === "/purchase-receives") return any("procurement-receipt-view", "procurement-receipt-inspect", "procurement-receipt-accept", "procurement-service-certify");
    // The list exposes only permitted work queues; task readers need no broad receipt viewing.
    const purpose = new URLSearchParams(search).get("purpose");
    if (/^\/purchase-receives\/[^/]+$/.test(path) && purpose) {
      if (purpose === "receipts" || purpose === "services") return any("procurement-receipt-view");
      if (purpose === "inspection") return any("procurement-receipt-inspect");
      if (purpose === "acceptance") return any("procurement-receipt-accept");
      if (purpose === "certification") return any("procurement-service-certify");
      return false;
    }
    return operation("procurement-receipt-view", "procurement-receipt-create", "procurement-receipt-edit");
  }
  if (/^\/contracts(?:\/|$)/.test(path)) return operation("procurement-contract-read", "procurement-contract-create", "procurement-contract-edit");
  if (/^\/plans(?:\/|$)/.test(path)) return operation(["procurement-plan-read", "procurement-plan-review-read"], "procurement-plan-create", "procurement-plan-edit");
  if (/^\/recurring-bills(?:\/|$)/.test(path)) return operation("procurement-recurring-read", "procurement-recurring-create", "procurement-recurring-edit");
  if (/^\/(?:bills|inbox|vendor-credits)(?:\/|$)/.test(path)) return operation("procurement-invoice-read", "procurement-invoice-capture");
  if (/^\/payments(?:\/|$)/.test(path)) return operation("procurement-payment-read", "procurement-payment-create", "procurement-payment-edit");
  if (path === "/batch-payments") return any("procurement-payment-read");
  if (path === "/budgets") return any("procurement-budget-check");
  if (path === "/analytics") return any("procurement-po-read", "procurement-plan-read", "procurement-contract-read", "procurement-invoice-read");
  if (/^\/settings(?:\/|$)/.test(path)) return any("procurement-configuration-read", "procurement-configuration-edit", "procurement-configuration-approve");
  return false;
}
