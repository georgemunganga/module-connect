import { PlanApiError } from "../../../src/platform/procurement-plans-api";
import type { PlanReviewScope } from "../../../src/platform/procurement-plan-review-api";
type Access = { capabilities: { planReviewWorkflow: boolean }; permissions: readonly string[] };
/** A new draft has no retained record ID; two absent IDs must never lock its editor. */
export function hasPendingPlanCommand(planId: string | undefined, pending: { readonly planId: string } | null | undefined): boolean {
  return Boolean(planId && pending?.planId === planId);
}
export function planReviewWritesAvailable(readiness: Access, scope: PlanReviewScope): boolean {
  return readiness.capabilities.planReviewWorkflow && !!scope.identity.branchId
    && !scope.headers["X-Shell-Branch-Scope"] && scope.current();
}
export function canPlanReviewAction(readiness: Access, scope: PlanReviewScope, hints: readonly string[], action: string, permission: string): boolean {
  return planReviewWritesAvailable(readiness, scope) && readiness.permissions.includes(permission) && hints.includes(action);
}

/** An ambiguous legacy draft response must be reconciled before another POST/PUT. */
export function planDraftFailureBlock(error: unknown): "stale" | "unknown" | null {
  if (error instanceof PlanApiError) {
    if (error.status === 409) return "stale";
    if (error.status > 0 && error.status < 500) return null;
  }
  return "unknown";
}
