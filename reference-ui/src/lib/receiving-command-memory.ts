import type { ReceivingCommand, ReceivingOperation } from "../../../src/platform/procurement-receiving-api";

const memory = new Map<string, ReceivingCommand>();
const keyFor = (scope: string) => `erp.procurement.receiving.principal2:${scope}`;
const principal = (scope: string) => scope.endsWith(":principal2");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operations: ReceivingOperation[] = ["ReceivingDraft", "ServiceDraft", "ReceivingRecord", "ReceivingInspect", "ReceivingAccept", "ServiceCertify", "ReceivingCancel", "ServiceCancel"];
type Stored = { scope: string; command: ReceivingCommand };
function matchesScope(scope: string, command: ReceivingCommand): boolean {
  const fields = scope.split(":"), target = fields.at(-2), kind = fields.at(-3);
  return (target === "new" ? command.targetId === null : command.targetId === target)
    && (kind === "service" ? command.operation.startsWith("Service") : kind === "goods" && command.operation.startsWith("Receiving"));
}

function read(scope: string): { command: ReceivingCommand | null; invalid: boolean } {
  if (!principal(scope)) return { command: memory.get(scope) ?? null, invalid: false };
  try {
    const raw = sessionStorage.getItem(keyFor(scope));
    if (raw === null) return { command: null, invalid: false };
    const entry: unknown = JSON.parse(raw);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { command: null, invalid: true };
    const stored = entry as Partial<Stored>, command = stored.command;
    if (stored.scope !== scope || !command || command.protocol !== "Principal2" || !operations.includes(command.operation)
      || !uuid.test(command.orderId) || !uuid.test(command.key) || command.targetId !== null && !uuid.test(command.targetId)
      || command.lineId !== undefined && !uuid.test(command.lineId) || command.method !== "POST" && command.method !== "PUT"
      || typeof command.body !== "string" || !command.body || !matchesScope(scope, command)) return { command: null, invalid: true };
    const body: unknown = JSON.parse(command.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { command: null, invalid: true };
    return { command, invalid: false };
  } catch { return { command: null, invalid: true }; }
}

/** Principal command keys survive a hard reload in this tab. Corrupt or
 * unavailable storage blocks new writes; no command is automatically reposted. */
export const pendingReceivingCommands = {
  get(scope: string) { return read(scope).command; },
  invalid(scope: string) { return read(scope).invalid; },
  set(scope: string, command: ReceivingCommand) {
    if (!principal(scope)) { memory.set(scope, command); return; }
    const previous = read(scope);
    if (previous.invalid || previous.command || command.protocol !== "Principal2" || !matchesScope(scope, command)) throw new Error("Check the saved delivery command before making another change.");
    try {
      sessionStorage.setItem(keyFor(scope), JSON.stringify({ scope, command } satisfies Stored));
      const saved = read(scope);
      if (saved.invalid || saved.command?.key !== command.key || saved.command?.body !== command.body) throw new Error();
    } catch { throw new Error("The delivery command reference could not be stored. No change was sent."); }
  },
  delete(scope: string) {
    if (!principal(scope)) { memory.delete(scope); return; }
    sessionStorage.removeItem(keyFor(scope));
  },
};
