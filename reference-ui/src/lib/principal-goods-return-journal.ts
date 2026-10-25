import { returnCommandPath, returnQuantity, returnText, type ReturnCommand } from "./principal-goods-return-api";

const prefix = "erp.procurement.goods-return-command.v1:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-zA-Z0-9._-]{1,128}$/;
const limit = 16384;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
export type ReturnJournalScope = { tenantId: string; companyId: string; principalId: string; branchId: string; recordId: string };
export class ReturnJournalError extends Error {}
function validScope(scope: ReturnJournalScope): boolean {
  return tenant.test(scope.tenantId) && [scope.companyId, scope.principalId, scope.branchId].every((id) => guid.test(id))
    && (scope.recordId === "new" || guid.test(scope.recordId));
}
function slot(scope: ReturnJournalScope): string {
  if (!validScope(scope)) throw new ReturnJournalError("Choose a permitted branch before saving or checking this return.");
  return prefix + [scope.tenantId, scope.companyId, scope.principalId, scope.branchId, scope.recordId].join(":");
}
function validCommand(value: unknown, scope: ReturnJournalScope): value is ReturnCommand {
  if (!object(value) || !exactKeys(value, value.operation === "Cancel" ? ["operation", "key", "targetId", "body", "method", "prior"] : ["operation", "key", "targetId", "body", "method"])
    || typeof value.body !== "string" || value.body.length > 12000 || typeof value.key !== "string"
    || value.operation !== "Create" && value.operation !== "Revise" && value.operation !== "Cancel") return false;
  try { returnCommandPath(value as unknown as ReturnCommand); } catch { return false; }
  if ((scope.recordId === "new") !== (value.operation === "Create") || value.targetId !== (scope.recordId === "new" ? null : scope.recordId)) return false;
  let body: unknown; try { body = JSON.parse(value.body); } catch { return false; }
  if (!object(body) || typeof body.reason !== "string") return false;
  try {
    if (body.reason !== returnText(body.reason).reason) return false;
    if (value.operation === "Cancel") {
      if (!exactKeys(body, ["expectedRevision", "reason"]) || typeof body.expectedRevision !== "number"
        || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || !object(value.prior)
        || !exactKeys(value.prior, ["quantityExact", "evidenceReference"]) || typeof value.prior.quantityExact !== "string"
        || value.prior.evidenceReference !== null && typeof value.prior.evidenceReference !== "string") return false;
      const prior = value.prior as unknown as { quantityExact: string; evidenceReference: string | null };
      returnQuantity(prior.quantityExact, prior.quantityExact);
      return prior.evidenceReference === null ||
        prior.evidenceReference.length <= 300 && prior.evidenceReference === prior.evidenceReference.trim();
    }
    const keys = value.operation === "Create" ? ["acceptanceFactId", "quantity", "reason", "evidenceReference"]
      : ["expectedRevision", "quantity", "reason", "evidenceReference"];
    if (!exactKeys(body, keys) || typeof body.quantity !== "string" || body.evidenceReference !== null && typeof body.evidenceReference !== "string"
      || body.evidenceReference !== returnText(body.reason, typeof body.evidenceReference === "string" ? body.evidenceReference : undefined).evidenceReference)
      return false;
    returnQuantity(body.quantity, body.quantity);
    if (value.operation === "Create") return guid.test(String(body.acceptanceFactId));
    return typeof body.expectedRevision === "number" && Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1;
  } catch { return false; }
}

/** Tab-local exact command journal; never contains credentials or auth headers. */
export const goodsReturnJournal = {
  read(scope: ReturnJournalScope, storage: Storage = sessionStorage): ReturnCommand | null {
    const key = slot(scope);
    let raw: string | null;
    try { raw = storage.getItem(key); }
    catch { throw new ReturnJournalError("Return recovery storage is unavailable. Saving is paused."); }
    if (raw === null) return null;
    if (raw.length > limit || new TextEncoder().encode(raw).length > limit)
      throw new ReturnJournalError("A saved return needs review before another change.");
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new ReturnJournalError("A saved return needs review before another change."); }
    if (!object(parsed) || !exactKeys(parsed, ["schemaVersion", "scope", "command"]) || parsed.schemaVersion !== 1
      || !object(parsed.scope) || !exactKeys(parsed.scope, ["tenantId", "companyId", "principalId", "branchId", "recordId"])
      || !Object.entries(scope).every(([field, value]) => parsed.scope && (parsed.scope as Record<string, unknown>)[field] === value)
      || !validCommand(parsed.command, scope)) throw new ReturnJournalError("A saved return needs review before another change.");
    return parsed.command as ReturnCommand;
  },
  claim(scope: ReturnJournalScope, command: ReturnCommand, storage: Storage = sessionStorage): void {
    if (this.read(scope, storage)) throw new ReturnJournalError("Check whether the earlier return was saved before another change.");
    if (!validCommand(command, scope)) throw new ReturnJournalError("The return command cannot be saved for recovery.");
    const key = slot(scope), raw = JSON.stringify({ schemaVersion: 1, scope, command });
    if (raw.length > limit || new TextEncoder().encode(raw).length > limit)
      throw new ReturnJournalError("The return is too large to save safely in this browser tab.");
    try { storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw new Error("Write not retained"); }
    catch { throw new ReturnJournalError("Return recovery storage is unavailable. Saving is paused."); }
  },
  clear(scope: ReturnJournalScope, command: ReturnCommand, storage: Storage = sessionStorage): void {
    const current = this.read(scope, storage);
    if (!current || current.key !== command.key || current.operation !== command.operation || current.method !== command.method
      || current.targetId !== command.targetId || current.body !== command.body
      || JSON.stringify(current.prior ?? null) !== JSON.stringify(command.prior ?? null))
      throw new ReturnJournalError("The saved return reference changed. Saving remains paused.");
    try { storage.removeItem(slot(scope)); if (storage.getItem(slot(scope)) !== null) throw new Error("Removal not retained"); }
    catch { throw new ReturnJournalError("Return recovery storage is unavailable. Saving remains paused."); }
  },
};
