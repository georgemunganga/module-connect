import { roundGuid } from "../../../src/platform/procurement-round-plan-api";
export const criterionStages = ["Mandatory", "Technical", "Commercial"] as const;
export const participantDuties = ["Planner", "Reviewer", "OpeningOfficer", "TechnicalEvaluator", "CommercialEvaluator", "ConflictReviewer"] as const;
export type RoundPolicyDraft = { mode: "" | "Any" | "All" | "Quorum"; requiredApprovals: string; principalIds: string[]; methodIds: string[]; categoryCodes: string[];
  currencyCodes: string; minimumCriteria: string; requiredCriterionStages: string[]; requiredParticipantDuties: string[];
  requireTechnicalRelease: "" | "true" | "false"; requireCommercialRelease: "" | "true" | "false"; documentsRequired: "" | "true" | "false" };
export const emptyRoundPolicy = (): RoundPolicyDraft => ({ mode: "", requiredApprovals: "", principalIds: [], methodIds: [], categoryCodes: [], currencyCodes: "", minimumCriteria: "",
  requiredCriterionStages: [], requiredParticipantDuties: [], requireTechnicalRelease: "", requireCommercialRelease: "", documentsRequired: "" });
const unique = (x: string[]) => new Set(x).size === x.length;
export function serializeRoundPolicy(draft: RoundPolicyDraft): string {
  const currencies = draft.currencyCodes.split(",").map(x => x.trim());
  if (!["Any", "All", "Quorum"].includes(draft.mode) || !/^[1-9]\d?$/.test(draft.requiredApprovals) || !draft.principalIds.length || draft.principalIds.length > 20
    || !draft.principalIds.every(roundGuid) || !unique(draft.principalIds) || !draft.methodIds.length || draft.methodIds.length > 20 || !draft.methodIds.every(roundGuid) || !unique(draft.methodIds)
    || !draft.categoryCodes.length || draft.categoryCodes.length > 100 || !unique(draft.categoryCodes) || !draft.categoryCodes.every(x => /^[A-Za-z0-9_-]{1,80}$/.test(x) || x === "*")
    || draft.categoryCodes.includes("*") && draft.categoryCodes.length !== 1 || !currencies.length || currencies.length > 30 || !currencies.every(x => /^[A-Z]{3}$/.test(x)) || !unique(currencies)
    || !/^(?:[1-9]\d?|100)$/.test(draft.minimumCriteria) || !draft.requiredCriterionStages.length || !unique(draft.requiredCriterionStages)
    || !draft.requiredCriterionStages.every(x => (criterionStages as readonly string[]).includes(x)) || !draft.requiredParticipantDuties.length || !unique(draft.requiredParticipantDuties)
    || !draft.requiredParticipantDuties.every(x => (participantDuties as readonly string[]).includes(x))
    || ![draft.requireTechnicalRelease, draft.requireCommercialRelease, draft.documentsRequired].every(x => x === "true" || x === "false"))
    throw new Error("Choose the methods, categories, currencies, named reviewers and every required review setting explicitly.");
  const required = Number(draft.requiredApprovals);
  if (required > draft.principalIds.length || draft.mode === "Any" && required !== 1 || draft.mode === "All" && required !== draft.principalIds.length)
    throw new Error("Any needs one approval; All needs every selected reviewer; a quorum must fit the selected people.");
  return JSON.stringify({ schemaVersion: 1, mode: draft.mode, requiredApprovals: required, assigneePrincipalIds: [...draft.principalIds], methodIds: [...draft.methodIds],
    categoryCodes: [...draft.categoryCodes], currencyCodes: currencies, minimumCriteria: Number(draft.minimumCriteria), requiredCriterionStages: [...draft.requiredCriterionStages],
    requiredParticipantDuties: [...draft.requiredParticipantDuties], requireTechnicalRelease: draft.requireTechnicalRelease === "true", requireCommercialRelease: draft.requireCommercialRelease === "true", documentsRequired: draft.documentsRequired === "true" });
}
export function parseRoundPolicy(json: string): RoundPolicyDraft | null {
  try {
    if (json.length > 32768) return null; const x = JSON.parse(json);
    const expected = ["schemaVersion", "mode", "requiredApprovals", "assigneePrincipalIds", "methodIds", "categoryCodes", "currencyCodes", "minimumCriteria", "requiredCriterionStages", "requiredParticipantDuties", "requireTechnicalRelease", "requireCommercialRelease", "documentsRequired"];
    if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).sort().join() !== expected.sort().join() || x.schemaVersion !== 1 || !Number.isInteger(x.requiredApprovals)
      || !Number.isInteger(x.minimumCriteria) || ![x.assigneePrincipalIds, x.methodIds, x.categoryCodes, x.currencyCodes, x.requiredCriterionStages, x.requiredParticipantDuties].every(Array.isArray)
      || ![x.requireTechnicalRelease, x.requireCommercialRelease, x.documentsRequired].every(v => typeof v === "boolean")) return null;
    const draft: RoundPolicyDraft = { mode: x.mode, requiredApprovals: String(x.requiredApprovals), principalIds: x.assigneePrincipalIds, methodIds: x.methodIds, categoryCodes: x.categoryCodes,
      currencyCodes: x.currencyCodes.join(", "), minimumCriteria: String(x.minimumCriteria), requiredCriterionStages: x.requiredCriterionStages, requiredParticipantDuties: x.requiredParticipantDuties,
      requireTechnicalRelease: String(x.requireTechnicalRelease) as "true" | "false", requireCommercialRelease: String(x.requireCommercialRelease) as "true" | "false", documentsRequired: String(x.documentsRequired) as "true" | "false" };
    serializeRoundPolicy(draft); return draft;
  } catch { return null; }
}
