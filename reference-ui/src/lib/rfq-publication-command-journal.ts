import type { PublicationCommand } from "../../../src/platform/procurement-sourcing-publication-api";
const prefix = "erp.rfq.publication.review.recovery.v1:";
const guid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const invalid = () => new Error("The original review save needs reconciliation. Keep its reference and ask Procurement for help.");
function validate(value: unknown): PublicationCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const raw = value as Record<string, unknown>;
  if ((raw.action !== "open" && raw.action !== "decide") || !guid(raw.key) || !guid(raw.eventId)
    || raw.action === "decide" && !guid(raw.targetId) || raw.action === "open" && raw.targetId !== undefined
    || Object.keys(raw).some(key => !["action", "eventId", "key", "targetId"].includes(key))) throw invalid();
  return { action: raw.action, key: raw.key, eventId: raw.eventId,
    ...(raw.targetId ? { targetId: raw.targetId as string } : {}) };
}
export function readPublicationRecovery(slot: string, storage: Storage = sessionStorage): PublicationCommand | null {
  try {
    const raw = storage.getItem(prefix + slot);
    if (raw === null) return null;
    if (raw.length > 300) throw invalid();
    const value = validate(JSON.parse(raw));
    const parts: unknown = JSON.parse(slot);
    if (!Array.isArray(parts) || parts.length !== 5 || parts[4] !== value.eventId) throw invalid();
    return value;
  } catch { throw invalid(); }
}
export function writePublicationRecovery(slot: string, value: PublicationCommand | null, storage: Storage = sessionStorage): void {
  try {
    const name = prefix + slot;
    if (value === null) {
      storage.removeItem(name);
      if (storage.getItem(name) !== null) throw invalid();
      return;
    }
    const reference = validate(value);
    const existing = readPublicationRecovery(slot, storage);
    if (existing && JSON.stringify(existing) !== JSON.stringify(reference)) throw invalid();
    const encoded = JSON.stringify(reference);
    storage.setItem(name, encoded);
    if (storage.getItem(name) !== encoded || !readPublicationRecovery(slot, storage)) throw invalid();
  } catch { throw invalid(); }
}
