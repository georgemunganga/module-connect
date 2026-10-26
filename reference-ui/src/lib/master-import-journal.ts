import type { MasterImportKind } from "../../../src/platform/procurement-master-import";

const prefix = "erp.procurement.master-import.v1:";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/i;
const identity = /^[a-zA-Z0-9._-]{1,128}$/;
/** Masters are company-owned; branch changes must not hide an unresolved command. */
export type ImportScope = { tenantId: string; companyId: string; principalId: string; kind: MasterImportKind };
export type ImportLocator = { batchId: string; previewSha256: string; commandKey: string; expiresAt: string };
export class ImportJournalError extends Error {}
function slot(scope: ImportScope) {
  if (!identity.test(scope.tenantId) || !guid.test(scope.companyId) || !guid.test(scope.principalId)
    || !["vendors", "items"].includes(scope.kind)) throw new ImportJournalError("Choose a valid company before importing.");
  return prefix + [scope.tenantId, scope.companyId, scope.principalId, scope.kind].join(":");
}
function valid(value: unknown): value is ImportLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join("|") === "batchId|commandKey|expiresAt|previewSha256"
    && guid.test(String(row.batchId)) && guid.test(String(row.commandKey)) && hash.test(String(row.previewSha256))
    && typeof row.expiresAt === "string" && Number.isFinite(Date.parse(row.expiresAt));
}
/** Only a scoped locator is retained. CSV bytes, mapped rows and credentials remain in memory. */
export const masterImportJournal = {
  read(scope: ImportScope, storage: Storage = sessionStorage): ImportLocator | null {
    let raw: string | null;
    try { raw = storage.getItem(slot(scope)); } catch { throw new ImportJournalError("Saved import recovery is unavailable."); }
    if (raw === null) return null;
    if (raw.length > 1024) throw new ImportJournalError("A saved import needs review.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ImportJournalError("A saved import needs review."); }
    if (!valid(parsed)) throw new ImportJournalError("A saved import needs review.");
    return parsed;
  },
  claim(scope: ImportScope, locator: ImportLocator, storage: Storage = sessionStorage) {
    if (!valid(locator) || this.read(scope, storage)) throw new ImportJournalError("Check the earlier import before another change.");
    const raw = JSON.stringify(locator);
    try { storage.setItem(slot(scope), raw); if (storage.getItem(slot(scope)) !== raw) throw Error(); }
    catch { throw new ImportJournalError("Recovery storage is unavailable. The import was not sent."); }
  },
  clear(scope: ImportScope, locator: ImportLocator, storage: Storage = sessionStorage) {
    const saved = this.read(scope, storage);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(locator)) throw new ImportJournalError("The saved import changed. Review it before another change.");
    try { storage.removeItem(slot(scope)); if (storage.getItem(slot(scope)) !== null) throw Error(); }
    catch { throw new ImportJournalError("The saved import could not be cleared."); }
  },
};
