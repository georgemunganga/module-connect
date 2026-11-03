import type { PlanReviewScope } from "../../../src/platform/procurement-plan-review-api";
type Access = { capabilities: { planReviewWorkflow: boolean }; permissions: readonly string[] };
export function planReviewWritesAvailable(readiness: Access, scope: PlanReviewScope): boolean {
  return readiness.capabilities.planReviewWorkflow && !!scope.identity.branchId
    && !scope.headers["X-Shell-Branch-Scope"] && scope.current();
}
export function canPlanReviewAction(readiness: Access, scope: PlanReviewScope, hints: readonly string[], action: string, permission: string): boolean {
  return planReviewWritesAvailable(readiness, scope) && readiness.permissions.includes(permission) && hints.includes(action);
}
