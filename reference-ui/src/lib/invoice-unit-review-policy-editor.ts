/** Exact owned policy schema; identities are Core principals, never employee IDs. */
export type UnitReviewStageForm = { code: string; mode: "" | "One" | "All"; principals: string[] };
export type UnitReviewPolicyForm = { stages: UnitReviewStageForm[] };
export const emptyUnitReviewPolicy = (): UnitReviewPolicyForm => ({ stages: [] });
export const emptyUnitReviewStage = (): UnitReviewStageForm => ({ code: "", mode: "", principals: [] });
const canonical = (value: unknown): value is string => typeof value === "string"
  && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(value) && value !== "00000000-0000-0000-0000-000000000000";
const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join("|") === [...expected].sort().join("|");
export function serializeUnitReviewPolicy(form: UnitReviewPolicyForm, complete = false): string {
  if (!Array.isArray(form.stages) || form.stages.length > 16 || complete && !form.stages.length)
    throw new Error("Choose one to 16 review steps before sending for review.");
  let total = 0; const codes = new Set<string>();
  const stages = form.stages.map(row => {
    const code = row.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(code) || codes.has(code) || !["One", "All"].includes(row.mode)
      || !Array.isArray(row.principals) || row.principals.length > 32 || complete && !row.principals.length
      || row.principals.some(value => !canonical(value)) || new Set(row.principals).size !== row.principals.length)
      throw new Error("Give each step a unique code and a decision rule. Choose named reviewers before sending for review.");
    codes.add(code); total += row.principals.length;
    if (total > 128) throw new Error("Use no more than 128 reviewer assignments across the steps.");
    return { code, mode: row.mode, principals: [...row.principals].sort() };
  });
  const result = JSON.stringify({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages });
  if (new TextEncoder().encode(result).byteLength > 65536) throw new Error("This review definition is too large.");
  return result;
}
/** Unknown fields/formats remain read-only instead of being dropped during an edit. */
export function parseUnitReviewPolicy(json: string): UnitReviewPolicyForm | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    const doc: unknown = JSON.parse(json);
    if (!own(doc) || !keys(doc, ["schemaVersion", "transactionType", "stages"]) || doc.schemaVersion !== 1
      || doc.transactionType !== "InvoiceUnitReview" || !Array.isArray(doc.stages)) return null;
    const form = { stages: doc.stages.map((row: unknown) => {
      if (!own(row) || !keys(row, ["code", "mode", "principals"]) || typeof row.code !== "string" || row.code !== row.code.trim().toUpperCase())
        throw new Error("Unsupported stage");
      return { code: row.code, mode: row.mode, principals: row.principals } as UnitReviewStageForm;
    }) };
    serializeUnitReviewPolicy(form);
    // This closed schema has exactly three root keys and three per-step keys.
    // Count decoded property tokens too: JSON.parse must not hide duplicate saved fields.
    const counts = new Map<string, number>();
    for (const match of json.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)) {
      const name: string = JSON.parse(`"${match[1]}"`);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (["schemaVersion", "transactionType", "stages"].some(name => counts.get(name) !== 1)
      || ["code", "mode", "principals"].some(name => (counts.get(name) ?? 0) !== form.stages.length)) return null;
    return form;
  } catch { return null; }
}
export function unitReviewDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
