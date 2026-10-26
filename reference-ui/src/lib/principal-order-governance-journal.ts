import { recoverGovernanceCommand, sendGovernanceCommand, validGovernanceCommand,
  type GovernanceCommand, type GovernanceOperation, type GovernanceReply } from "../../../src/platform/procurement-principal-governance-api";

const prefix = "erp.procurement.principal-order-governance.v1:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const operations: GovernanceOperation[] = ["Funding", "Submit", "Decide", "Issue", "Ack",
  "ReleaseRequest", "ReleaseConfirm"];
const help = "A saved order action needs support review. Keep its original command reference.";

/** Auth epoch is intentionally absent: a hard reload must find the same key. */
export function principalOrderGovernanceScope(tenantId: string, companyId: string, principalId: string,
  selectedBranchId: string, orderId: string, operation: GovernanceOperation): string {
  if (!tenant.test(tenantId) || !guid.test(companyId) || !guid.test(principalId)
    || !guid.test(selectedBranchId) || !guid.test(orderId) || !operations.includes(operation))
    throw new Error("Choose a permitted branch and sign in before this order action.");
  return prefix + [tenantId, companyId, principalId, selectedBranchId, orderId, operation].join(":");
}
function parts(scope: string) {
  if (!scope.startsWith(prefix)) throw new Error(help);
  const fields = scope.slice(prefix.length).split(":");
  if (fields.length !== 6 || !tenant.test(fields[0]) || fields.slice(1, 5).some(value => !guid.test(value))
    || !operations.includes(fields[5] as GovernanceOperation)) throw new Error(help);
  return { base: prefix + fields.slice(0, 5).join(":") + ":",
    companyId: fields[1], orderId: fields[4], operation: fields[5] as GovernanceOperation };
}
function read(scope: string): GovernanceCommand | null {
  const { orderId, operation } = parts(scope);
  const raw = sessionStorage.getItem(scope);
  if (raw === null) return null;
  if (raw.length > 25_000) throw new Error(help);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(help); }
  if (!validGovernanceCommand(value) || value.orderId !== orderId || value.operation !== operation)
    throw new Error(help);
  return value;
}
export const principalOrderGovernanceJournal = {
  read,
  claim(scope: string, command: GovernanceCommand): void {
    const { base, orderId, operation } = parts(scope);
    if (!validGovernanceCommand(command) || command.orderId !== orderId || command.operation !== operation)
      throw new Error(help);
    // One unresolved action per order and actor, even when its operation differs.
    if (operations.some(other => read(base + other) !== null))
      throw new Error("Check the previous order action before starting another.");
    sessionStorage.setItem(scope, JSON.stringify(command));
    const saved = read(scope);
    if (!saved || saved.key !== command.key || saved.body !== command.body
      || saved.assignmentId !== command.assignmentId
      || saved.expectedOriginalDirectSourceSha256 !== command.expectedOriginalDirectSourceSha256)
      throw new Error("The original order command could not be retained. Saving is blocked.");
  },
  clear(scope: string, command: GovernanceCommand): void {
    const saved = read(scope);
    if (!validGovernanceCommand(command) || saved?.key !== command.key
      || saved.body !== command.body || saved.assignmentId !== command.assignmentId
      || saved.expectedOriginalDirectSourceSha256 !== command.expectedOriginalDirectSourceSha256)
      throw new Error("The saved order command changed. Saving remains blocked.");
    sessionStorage.removeItem(scope);
  },
};

/** Retain the exact key/body before the one business POST. No automatic retry. */
export async function sendNewJournaledGovernanceCommand(companyId: string, scope: string,
  command: GovernanceCommand): Promise<GovernanceReply> {
  if (parts(scope).companyId.toLowerCase() !== companyId.toLowerCase()) throw new Error(help);
  principalOrderGovernanceJournal.claim(scope, command);
  return sendGovernanceCommand(companyId, command);
}

/** Recovery uses GET only and leaves clearing to the verified UI state transition. */
export async function recoverJournaledGovernanceCommand(companyId: string,
  scope: string): Promise<GovernanceReply> {
  if (parts(scope).companyId.toLowerCase() !== companyId.toLowerCase()) throw new Error(help);
  const command = principalOrderGovernanceJournal.read(scope);
  if (!command) throw new Error("No saved order action was found for this account and branch.");
  return recoverGovernanceCommand(companyId, command);
}
