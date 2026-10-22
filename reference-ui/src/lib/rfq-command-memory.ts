import type { RfqCommand } from "../../../src/platform/procurement-sourcing-execution-api";
/** Browser-lifetime read-only reconciliation, scoped by tenant/company/worker/branch. Never an automatic retry queue. */
export const pendingRfqCommands = new Map<string, RfqCommand>();
