import { approvalBrowserTabNonce } from "./request-approval-journal";
import { planGuid, type PlanReviewScope, type PlanReviewLocator, type PlanReviewReceipt } from "../../../src/platform/procurement-plan-review-api";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function validPlanLocator(value: unknown): value is PlanReviewLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as PlanReviewLocator;
  return Object.keys(x).length === 5 && planGuid(x.key) && planGuid(x.planId)
    && (x.operation === "Submit" || x.operation === "ClaimScope" ? x.submissionId === null && x.assignmentId === null
      : x.operation === "Withdraw" ? planGuid(x.submissionId) && x.assignmentId === null
        : x.operation === "Decide" && planGuid(x.submissionId) && planGuid(x.assignmentId));
}
export function planReviewJournal(scope: PlanReviewScope, store: Store = sessionStorage, nonce?: string) {
  const tab = nonce ?? approvalBrowserTabNonce(scope.identity.tenantId, scope.identity.principalId);
  const slot = tab && planGuid(tab) ? "erp.procurement.plan-review-command.v1:" + JSON.stringify([scope.identity,
    scope.headers["X-Shell-Branch-Scope"] ?? "selected", tab]) : null;
  const state = (): { blocked: boolean; pending: PlanReviewLocator | null } => {
    if (!slot || !scope.current()) return { blocked: true, pending: null };
    try { const raw = store.getItem(slot); if (raw === null) return { blocked: false, pending: null };
      if (raw.length > 2048) throw new Error(); const saved = JSON.parse(raw);
      if (!saved || Object.keys(saved).length !== 2 || saved.slot !== slot || !validPlanLocator(saved.locator)) throw new Error();
      return { blocked: true, pending: saved.locator };
    } catch { return { blocked: true, pending: null }; }
  };
  return { state,
    claim(locator: PlanReviewLocator) {
      if (!slot || state().blocked || !validPlanLocator(locator)) return false;
      try { const raw = JSON.stringify({ slot, locator }); if (raw.length > 2048) return false; store.setItem(slot, raw); return store.getItem(slot) === raw; } catch { return false; }
    },
    confirm(locator: PlanReviewLocator, receipt: PlanReviewReceipt) {
      if (!slot || !scope.current() || JSON.stringify(state().pending) !== JSON.stringify(locator)
        || receipt.planId !== locator.planId || locator.submissionId !== null && receipt.submissionId !== locator.submissionId) return false;
      try { store.removeItem(slot); return store.getItem(slot) === null; } catch { return false; }
    },
  };
}
