import { validateRecommendationCommand, type RecommendationCommand } from "./principal-rfq-recommendation-api";

const prefix = "erp.procurement.recommendation-draft.v1:";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenant = /^[a-zA-Z0-9._-]{1,128}$/;
const maxBytes = 1100000;
export type RecommendationJournalScope = { tenantId: string; companyId: string; principalId: string; branchId: string; roundId: string; recordId: string };
export class RecommendationJournalError extends Error {}
const unavailable = () => new RecommendationJournalError("Check whether this recommendation draft was saved before another change.");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join() === [...expected].sort().join();
function slot(scope: RecommendationJournalScope): string {
  if (!tenant.test(scope.tenantId) || ![scope.companyId, scope.principalId, scope.branchId, scope.roundId]
    .every(value => uuid.test(value)) || scope.recordId !== "new" && !uuid.test(scope.recordId)) throw unavailable();
  return prefix + [scope.tenantId, scope.companyId, scope.principalId, scope.branchId, scope.roundId, scope.recordId].join(":");
}
function commandForScope(value: unknown, scope: RecommendationJournalScope): RecommendationCommand {
  const command = validateRecommendationCommand(value);
  if (command.roundId !== scope.roundId || command.draftId !== (scope.recordId === "new" ? null : scope.recordId)) throw unavailable();
  return command;
}
export const recommendationJournal = {
  read(scope: RecommendationJournalScope, storage: Storage = sessionStorage): RecommendationCommand | null {
    const key = slot(scope);
    let raw: string | null;
    try { raw = storage.getItem(key); } catch { throw unavailable(); }
    if (raw === null) return null;
    if (raw.length > maxBytes || new TextEncoder().encode(raw).length > maxBytes) throw unavailable();
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw unavailable(); }
    if (!object(parsed) || !keys(parsed, ["schemaVersion", "scope", "command"]) || parsed.schemaVersion !== 1
      || !object(parsed.scope) || !keys(parsed.scope, ["tenantId", "companyId", "principalId", "branchId", "roundId", "recordId"])
      || !Object.entries(scope).every(([name, value]) => (parsed.scope as Record<string, unknown>)[name] === value)) throw unavailable();
    try { return commandForScope(parsed.command, scope); } catch { throw unavailable(); }
  },
  claim(scope: RecommendationJournalScope, command: RecommendationCommand, storage: Storage = sessionStorage): void {
    if (this.read(scope, storage)) throw unavailable();
    const checked = commandForScope(command, scope);
    const key = slot(scope), raw = JSON.stringify({ schemaVersion: 1, scope, command: checked });
    if (raw.length > maxBytes || new TextEncoder().encode(raw).length > maxBytes) throw unavailable();
    try { storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw unavailable(); }
    catch { throw unavailable(); }
  },
  clear(scope: RecommendationJournalScope, command: RecommendationCommand, storage: Storage = sessionStorage): void {
    const existing = this.read(scope, storage);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(command)) throw unavailable();
    try { storage.removeItem(slot(scope)); if (storage.getItem(slot(scope)) !== null) throw unavailable(); }
    catch { throw unavailable(); }
  },
};
