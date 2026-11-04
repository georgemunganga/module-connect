/** Exact existing Plan policy contract. No business defaults or spending authority. */
export type PlanStagePurpose = "Review" | "Final";
export type PlanPolicyStage = { purpose: PlanStagePurpose; mode: "" | "Any" | "All" | "Quorum"; requiredApprovals: string; principalIds: string[] };
export type PlanPolicyDraft = [PlanPolicyStage, PlanPolicyStage];
const canonicalGuid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(v) && v !== "00000000-0000-0000-0000-000000000000";
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(",") === expected.sort().join(",");
export const emptyPlanPolicy = (): PlanPolicyDraft => [
  { purpose: "Review", mode: "", requiredApprovals: "", principalIds: [] },
  { purpose: "Final", mode: "", requiredApprovals: "", principalIds: [] },
];
export function serializePlanPolicy(stages: PlanPolicyDraft): string {
  if (stages.length !== 2) throw new Error("Set one review stage and one final approval stage.");
  const result = stages.map((s, index) => {
    if (s.purpose !== (index === 0 ? "Review" : "Final") || !["Any", "All", "Quorum"].includes(s.mode)
      || !s.principalIds.length || s.principalIds.length > 20 || !s.principalIds.every(canonicalGuid)
      || new Set(s.principalIds).size !== s.principalIds.length || !/^[1-9]\d?$/.test(s.requiredApprovals))
      throw new Error("Choose the decision rule, named people and required approvals for each stage.");
    const required = Number(s.requiredApprovals);
    if (required > s.principalIds.length || s.mode === "Any" && required !== 1 || s.mode === "All" && required !== s.principalIds.length)
      throw new Error("Any requires one approval; All requires every selected person; a quorum must fit the selected people.");
    return { purpose: s.purpose, mode: s.mode, requiredApprovals: required, assigneePrincipalIds: [...s.principalIds] };
  });
  if (result[0].assigneePrincipalIds.some(id => result[1].assigneePrincipalIds.includes(id)))
    throw new Error("Choose independent people for review and final approval.");
  const json = JSON.stringify({ schemaVersion: 2, stages: result });
  if (json.length > 32768) throw new Error("The plan review configuration is too large.");
  return json;
}
export function parsePlanPolicy(json: string): PlanPolicyDraft | null {
  try {
    if (json.length > 32768) return null;
    const root = JSON.parse(json);
    if (!root || typeof root !== "object" || Array.isArray(root) || !keys(root, ["schemaVersion", "stages"]) || root.schemaVersion !== 2
      || !Array.isArray(root.stages) || root.stages.length !== 2) return null;
    const stages = root.stages.map((s: any, index: number) => {
      if (!s || typeof s !== "object" || Array.isArray(s) || !keys(s, ["purpose", "mode", "requiredApprovals", "assigneePrincipalIds"])
        || s.purpose !== (index === 0 ? "Review" : "Final") || !Number.isInteger(s.requiredApprovals) || !Array.isArray(s.assigneePrincipalIds)) throw new Error();
      return { purpose: s.purpose, mode: s.mode, requiredApprovals: String(s.requiredApprovals), principalIds: s.assigneePrincipalIds };
    }) as PlanPolicyDraft;
    serializePlanPolicy(stages); return stages;
  } catch { return null; }
}
