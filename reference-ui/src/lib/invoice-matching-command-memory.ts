import type { InvoiceMatchingCommand } from "../../../src/platform/procurement-invoice-matching-api";
/** Browser-lifetime uncertain commands only, partitioned by verified person and Core scope.
 * Not an automatic retry queue, approval record, or replacement for server receipts. */
export const pendingInvoiceMatching = new Map<string, InvoiceMatchingCommand>();
