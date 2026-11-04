import { approvalBrowserTabNonce } from "./request-approval-journal";
import { roundGuid, type RoundScope } from "../../../src/platform/procurement-round-plan-api";
import { validRoundReviewLocator, type RoundReviewLocator, type RoundReviewReceipt } from "../../../src/platform/procurement-round-plan-review-api";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Separate protocol; existing draft-command references remain unchanged and recoverable. */
export function roundReviewJournal(scope: RoundScope, store: Store = sessionStorage, nonce?: string) {
  const tab = nonce ?? approvalBrowserTabNonce(scope.identity.tenantId, scope.identity.principalId);
  const slot = roundGuid(tab) ? "erp.procurement.round-plan-review-command.v1:" + JSON.stringify([scope.identity, scope.headers["X-Shell-Branch-Scope"] ?? "selected", tab]) : null;
  const state = (): { blocked: boolean; pending: RoundReviewLocator | null } => {
    if (!slot || !scope.current()) return { blocked: true, pending: null };
    try { const raw = store.getItem(slot); if (raw === null) return { blocked: false, pending: null };
      if (raw.length > 4096) throw new Error(); const x = JSON.parse(raw);
      if (!x || Object.keys(x).length !== 2 || x.slot !== slot || !validRoundReviewLocator(x.locator)) throw new Error();
      return { blocked: true, pending: x.locator };
    } catch { return { blocked: true, pending: null }; }
  };
  return { state,
    claim(locator: RoundReviewLocator) {
      if (!slot || state().blocked || !validRoundReviewLocator(locator)) return false;
      try { const raw = JSON.stringify({ slot, locator }); store.setItem(slot, raw); return store.getItem(slot) === raw; } catch { return false; }
    },
    rejectValidation(locator: RoundReviewLocator, status: number) {
      if (!slot || ![400, 422].includes(status) || !scope.current() || JSON.stringify(state().pending) !== JSON.stringify(locator)) return false;
      try { store.removeItem(slot); return store.getItem(slot) === null; } catch { return false; }
    },
    confirm(locator: RoundReviewLocator, result: RoundReviewReceipt) {
      if (!slot || !scope.current() || JSON.stringify(state().pending) !== JSON.stringify(locator) || result.eventId !== locator.eventId
        || result.planId !== locator.planId || result.commandKey !== locator.key || result.operation !== locator.operation || result.version !== locator.expectedResultVersion
        || locator.submissionId !== null && result.submissionId !== locator.submissionId || locator.assignmentId !== null && result.assignmentId !== locator.assignmentId) return false;
      try { store.removeItem(slot); return store.getItem(slot) === null; } catch { return false; }
    },
  };
}
