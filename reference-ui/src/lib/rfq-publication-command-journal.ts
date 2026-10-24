export type PublicationRecovery = { type: "publication" | "contact" | "quote";
  action: "open" | "decide" | "contact" | "quote-create" | "quote-revise" | "quote-cancel";
  key: string; eventId: string; targetId?: string };
const prefix = "erp.rfq.publication.recovery.v1:";
const guid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  && value !== "00000000-0000-0000-0000-000000000000";
const invalid = () => new Error("The saved quote action needs reconciliation. Keep its original reference and ask Procurement for help.");
function validate(value: unknown): PublicationRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const raw = value as Record<string, unknown>;
  const action = raw.action;
  const type = action === "open" || action === "decide" ? "publication"
    : action === "contact" ? "contact"
      : action === "quote-create" || action === "quote-revise" || action === "quote-cancel" ? "quote" : null;
  if (!type || raw.type !== type || !guid(raw.key) || !guid(raw.eventId)
    || raw.targetId !== undefined && !guid(raw.targetId)
    || (action === "decide" || action === "contact" || action === "quote-revise" || action === "quote-cancel") && !guid(raw.targetId)
    || !["action", "eventId", "key", "targetId", "type"].every(key =>
      Object.keys(raw).includes(key) || key === "targetId")
    || Object.keys(raw).some(key => !["action", "eventId", "key", "targetId", "type"].includes(key))) throw invalid();
  return { type, action: action as PublicationRecovery["action"], key: raw.key,
    eventId: raw.eventId, ...(raw.targetId ? { targetId: raw.targetId as string } : {}) };
}
export function readPublicationRecovery(slot: string, storage: Storage = sessionStorage): PublicationRecovery | null {
  try {
    const raw = storage.getItem(prefix + slot);
    if (raw === null) return null;
    if (raw.length > 512) throw invalid();
    const value = validate(JSON.parse(raw));
    const parts: unknown = JSON.parse(slot);
    if (!Array.isArray(parts) || parts.length !== 5 || parts[4] !== value.eventId) throw invalid();
    return value;
  } catch { throw invalid(); }
}
export function writePublicationRecovery(slot: string, value: PublicationRecovery | null, storage: Storage = sessionStorage): void {
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
