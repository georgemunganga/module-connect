import type { RoundScope, RoundLocator } from "../../../src/platform/procurement-round-plan-api";
type Access = { capabilities: { roundPlanRead: boolean; roundPlanRecord: boolean }; permissions: readonly string[] };
export function roundPlanReadAvailable(access: Access): boolean {
  return access.capabilities.roundPlanRead && access.permissions.includes("procurement-round-plan-read");
}
/** Hints are server-owned; current client scope/grants add restrictions only. */
export function roundPlanActionAvailable(access: Access, scope: RoundScope, hints: readonly string[], action: RoundLocator["operation"]): boolean {
  return roundPlanReadAvailable(access) && access.capabilities.roundPlanRecord && !!scope.identity.branchId && !scope.headers["X-Shell-Branch-Scope"]
    && scope.current() && hints.includes(action) && access.permissions.includes(action === "Cancel" ? "procurement-round-plan-cancel" : "procurement-round-plan-manage");
}
/** Keep All admission on the same concrete round route that the RFQ switch renders. */
export function roundPlanRouteSelected(source: string | null, access: Access): boolean {
  return source === "round-plan" || source === null && roundPlanReadAvailable(access)
    && !access.permissions.some(p => ["procurement-sourcing-read", "procurement-sourcing-create", "procurement-sourcing-edit", "procurement-quotation-read", "procurement-sourcing-convert", "procurement-sourcing-submit", "procurement-sourcing-publish"].includes(p));
}

export function roundReviewReadAvailable(access: { capabilities: { roundPlanReviewRead: boolean }; permissions: readonly string[] }): boolean {
  return access.capabilities.roundPlanReviewRead && access.permissions.some(p => p === "procurement-round-plan-submit" || p === "procurement-round-plan-review");
}
export function roundReviewActionAvailable(access: { capabilities: { roundPlanReviewRead: boolean; roundPlanReviewWorkflow: boolean }; permissions: readonly string[] }, scope: RoundScope, hints: readonly string[], action: string): boolean {
  return roundReviewReadAvailable(access) && access.capabilities.roundPlanReviewWorkflow && !!scope.identity.branchId && !scope.headers["X-Shell-Branch-Scope"]
    && scope.current() && hints.includes(action) && access.permissions.includes(action === "Submit" ? "procurement-round-plan-submit" : "procurement-round-plan-review");
}
