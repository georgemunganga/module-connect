import type { OrderCommand } from "../../../src/platform/procurement-order-execution-api";
/** Browser-lifetime reconciliation only, never an automatic retry queue or authority. */
export const pendingOrderCommands = new Map<string, OrderCommand>();
