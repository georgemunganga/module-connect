/** Legacy HRM labels are migrated only from current, authorized Core location reads. */
export type BranchSelection = { entityId?: unknown; branch?: unknown };
export type CoreBranchChoice = { id: string; name: string; legalEntityId: string };
export type LegacyBranchResolution = { kind: "ready" } | { kind: "waiting" } | { kind: "canonicalize"; branchId: string }
  | { kind: "selection-required"; reason: "company" | "invalid" | "unavailable" | "unknown" | "ambiguous" };
export const canonicalScopeId = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v) && v !== "00000000-0000-0000-0000-000000000000";
export function resolveLegacyBranchSelection(selection: BranchSelection, branches: readonly CoreBranchChoice[],
  lookup: "loading" | "ready" | "unavailable"): LegacyBranchResolution {
  if (selection.branch === undefined || selection.branch === null || selection.branch === "" || canonicalScopeId(selection.branch)) return { kind: "ready" };
  if (!canonicalScopeId(selection.entityId)) return { kind: "selection-required", reason: "company" };
  if (typeof selection.branch !== "string" || selection.branch.length > 300 || /[\u0000-\u001f\u007f]/.test(selection.branch))
    return { kind: "selection-required", reason: "invalid" };
  if (lookup === "loading") return { kind: "waiting" };
  if (lookup !== "ready") return { kind: "selection-required", reason: "unavailable" };
  const company = selection.entityId.toLowerCase();
  const matches = branches.filter(b => canonicalScopeId(b.id) && canonicalScopeId(b.legalEntityId)
    && b.legalEntityId.toLowerCase() === company && b.name === selection.branch);
  // Different names, case folding, another company and arbitrary first branches
  // never resolve the saved label. Duplicate matching rows fail closed too.
  return matches.length === 1 ? { kind: "canonicalize", branchId: matches[0].id }
    : { kind: "selection-required", reason: matches.length ? "ambiguous" : "unknown" };
}
