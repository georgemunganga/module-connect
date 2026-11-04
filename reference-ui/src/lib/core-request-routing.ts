export type CoreApprovalStep = { code: string; mode: "One" | "All"; binding: { kind: "CoreUser" | "CoreRole"; key: string } };
export const newCoreStep = (index = 0): CoreApprovalStep => ({ code: index ? `STEP_${index + 1}` : "REVIEW", mode: "One", binding: { kind: "CoreUser", key: "" } });
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const only = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).every(k => keys.includes(k));
export const coreRoleKey = (x: unknown): x is string => typeof x === "string" && /^[a-z][a-z0-9_-]{0,99}$/.test(x);
export const corePrincipalKey = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x) && x !== "00000000-0000-0000-0000-000000000000";
export function parseRequesterRoles(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= 100 && value.every(coreRoleKey) && new Set(value).size === value.length ? [...value] : null;
}
export function parseCoreSteps(value: unknown): CoreApprovalStep[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const seen = new Set<string>(); const result: CoreApprovalStep[] = [];
  for (const stage of value) {
    if (!object(stage) || !only(stage, ["code", "assignee", "mode", "binding"]) || stage.assignee !== "ProcurementManager"
      || typeof stage.code !== "string" || !/^[A-Z0-9_]{1,100}$/.test(stage.code) || seen.has(stage.code)
      || (stage.mode !== "One" && stage.mode !== "All") || !object(stage.binding) || !only(stage.binding, ["kind", "key"])
      || !(stage.binding.kind === "CoreUser" ? corePrincipalKey(stage.binding.key) : stage.binding.kind === "CoreRole" && coreRoleKey(stage.binding.key))) return null;
    seen.add(stage.code);
    result.push({ code: stage.code, mode: stage.mode, binding: { kind: stage.binding.kind as "CoreUser" | "CoreRole", key: stage.binding.key as string } });
  }
  return result;
}
export const serializeCoreSteps = (steps: CoreApprovalStep[]) => steps.map(step => ({
  code: step.code.trim().toUpperCase(), assignee: "ProcurementManager", mode: step.mode, binding: { ...step.binding },
}));
export function moveCoreStep(steps: CoreApprovalStep[], from: number, to: number): CoreApprovalStep[] {
  if (from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const next = [...steps]; const [step] = next.splice(from, 1); next.splice(to, 0, step); return next;
}

export function parseDepartmentIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= 100 && value.every(corePrincipalKey) && new Set(value).size === value.length ? [...value] : null;
}
