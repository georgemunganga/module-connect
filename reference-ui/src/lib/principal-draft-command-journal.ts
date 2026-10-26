import { createPrincipalBody, type PrincipalCommand } from "../../../src/platform/procurement-principal-drafts-api";

const prefix = "erp.procurement.principal-draft-command.v2:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const sha = /^[0-9a-f]{64}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function bodyValid(operation: unknown, body: unknown, command: PrincipalCommand): boolean {
  if (typeof body !== "string" || body.length < 2 || body.length > 100_000) return false;
  if (operation === "Create") {
    try { return Boolean(command.draft && command.sources
      && createPrincipalBody(command.draft, command.sources) === body); }
    catch { return false; }
  }
  let value: unknown;
  try { value = JSON.parse(body); } catch { return false; }
  if (!object(value)) return false;
  if (operation === "Cancel") return Number.isSafeInteger(value.expectedOrderVersion)
    && Number(value.expectedOrderVersion) > 0 && typeof value.originalDirectSourceSha256 === "string"
    && sha.test(value.originalDirectSourceSha256) && typeof value.reason === "string"
    && value.reason.trim().length > 0;
  return false;
}
const valid = (command: unknown): command is PrincipalCommand => {
  if (!command || typeof command !== "object" || Array.isArray(command)) return false;
  const row = command as Record<string, unknown>;
  return (row.operation === "Create" || row.operation === "Cancel") && typeof row.key === "string"
    && guid.test(row.key) && (row.operation === "Create" ? row.orderId === null
      : typeof row.orderId === "string" && guid.test(row.orderId))
    && bodyValid(row.operation, row.body, row as PrincipalCommand);
};
export function principalDraftScope(tenantId: string, companyId: string, principalId: string): string {
  if (!tenant.test(tenantId) || !guid.test(companyId) || !guid.test(principalId))
    throw new Error("Select an ERP company and sign in before preparing an order.");
  // These draft commands are company scoped. A branch switch must not hide an
  // unresolved Create or Cancel and permit a replacement command key.
  return prefix + [tenantId, companyId, principalId].join(":");
}
export const principalDraftJournal = {
  read(scope: string): PrincipalCommand | null {
    const raw = sessionStorage.getItem(scope);
    if (raw === null) return null;
    // The exact draft and its encoded POST body are retained together so a
    // hard reload can verify the original key without reconstructing decimals.
    if (raw.length > 230_000) throw new Error("A saved order command needs support review.");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error("A saved order command needs support review."); }
    if (!valid(value)) throw new Error("A saved order command needs support review.");
    return value;
  },
  claim(scope: string, command: PrincipalCommand): void {
    if (!valid(command) || this.read(scope)) throw new Error("Check the previous order result before saving again.");
    sessionStorage.setItem(scope, JSON.stringify(command));
    const saved = this.read(scope);
    if (!saved || saved.key !== command.key || saved.body !== command.body)
      throw new Error("The order command could not be retained. Saving is blocked.");
  },
  clear(scope: string, command: PrincipalCommand): void {
    if (this.read(scope)?.key !== command.key) throw new Error("The saved order command changed. Saving remains blocked.");
    sessionStorage.removeItem(scope);
  },
};
