import type { ReceivingCommand } from "../../../src/platform/procurement-receiving-api";
/** Browser-lifetime reconciliation, scoped by company/branch/canonical Core principal and protocol and target.
 * This is neither an automatic retry queue nor durable operational evidence. */
export const pendingReceivingCommands = new Map<string, ReceivingCommand>();
