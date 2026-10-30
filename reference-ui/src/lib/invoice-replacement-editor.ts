import { invoiceAllowsReplacement, validReplacementCommandScope, type InvoiceReplacementCommandScope, type InvoiceDetail, type InvoiceIntakeInput } from "../../../src/platform/procurement-invoices-api";

/** Server action+CAS context are necessary; client permission/scope checks only
 * keep unavailable controls out of the workflow. Backend authorization prevails. */
export function replacementEditorAvailable(invoice: InvoiceDetail | null, branchId: string,
  permissions: readonly string[], currencyCalculationAvailable: boolean): boolean {
  return !!invoice && currencyCalculationAvailable && permissions.includes("procurement-invoice-read")
    && permissions.includes("procurement-invoice-capture") && invoiceAllowsReplacement(invoice)
    && !!branchId && invoice.branchRef?.toLowerCase() === branchId.toLowerCase();
}
export function replacementDraftRetainsSource(invoice: InvoiceDetail | null, input: InvoiceIntakeInput): boolean {
  const context = invoice?.replacementContext;
  return !!invoice && !!context && invoiceAllowsReplacement(invoice)
    && input.supplierId === invoice.supplierId && input.currencyCode === invoice.currencyCode
    && input.purchaseOrderId === context.purchaseOrderId;
}

/** Historical detail and original-key recovery may remain available when intake
 * writes are disabled. This does not admit list, new/edit or other module routes. */
export function replacementHistoryRouteAvailable(pathname: string, readAvailable: boolean): boolean {
  return readAvailable && /^\/bills\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/replace)?\/?$/i.test(pathname);
}

/** All-branch recovery uses a branch only after the scoped source GET has
 * authorized that invoice and returned its actual branch. It never changes the
 * shell/header write context or looks up another explicit branch's journal. */
export function replacementJournalReadScope(writeScope: InvoiceReplacementCommandScope, headerAll: boolean,
  authorizedSource: InvoiceDetail | null): InvoiceReplacementCommandScope {
  if (!headerAll || !authorizedSource || authorizedSource.id !== writeScope.sourceInvoiceId
    || typeof authorizedSource.branchRef !== "string") return writeScope;
  const readScope = { ...writeScope, branchId: authorizedSource.branchRef };
  return validReplacementCommandScope(readScope) ? readScope : writeScope;
}
