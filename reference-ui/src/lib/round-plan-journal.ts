import { approvalBrowserTabNonce } from "./request-approval-journal";
import { roundGuid, type RoundLocator, type RoundScope, type RoundReceipt } from "../../../src/platform/procurement-round-plan-api";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function validRoundLocator(x: unknown): x is RoundLocator {
  return !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 3
    && roundGuid((x as RoundLocator).key) && roundGuid((x as RoundLocator).eventId) && ["Create", "Revise", "Cancel"].includes((x as RoundLocator).operation);
}
export function roundPlanJournal(scope: RoundScope, eventId: string, store: Store = sessionStorage, nonce?: string) {
  const tab = nonce ?? approvalBrowserTabNonce(scope.identity.tenantId, scope.identity.principalId);
  const slot = roundGuid(tab) && roundGuid(eventId) ? "erp.procurement.round-plan-command.v1:" + JSON.stringify([scope.identity,
    scope.headers["X-Shell-Branch-Scope"] ?? "selected", eventId, tab]) : null;
  const state = (): { blocked: boolean; pending: RoundLocator | null } => {
    if (!slot || !scope.current()) return { blocked: true, pending: null };
    try { const raw = store.getItem(slot); if (raw === null) return { blocked: false, pending: null };
      if (raw.length > 2048) throw new Error(); const saved = JSON.parse(raw);
      if (!saved || Object.keys(saved).length !== 2 || saved.slot !== slot || !validRoundLocator(saved.locator) || saved.locator.eventId !== eventId) throw new Error();
      return { blocked: true, pending: saved.locator };
    } catch { return { blocked: true, pending: null }; }
  };
  return { state,
    claim(locator: RoundLocator) {
      if (!slot || state().blocked || !validRoundLocator(locator) || locator.eventId !== eventId) return false;
      try { const raw = JSON.stringify({ slot, locator }); store.setItem(slot, raw); return store.getItem(slot) === raw; } catch { return false; }
    },
    discardRejectedValidation(locator: RoundLocator, status: number) {
      if (!slot || ![400, 422].includes(status) || !scope.current() || JSON.stringify(state().pending) !== JSON.stringify(locator)) return false;
      try { store.removeItem(slot); return store.getItem(slot) === null; } catch { return false; }
    },
    confirm(locator: RoundLocator, receipt: RoundReceipt) {
      if (!slot || !scope.current() || JSON.stringify(state().pending) !== JSON.stringify(locator)
        || receipt.eventId !== eventId || receipt.commandKey !== locator.key || receipt.operation !== locator.operation) return false;
      try { store.removeItem(slot); return store.getItem(slot) === null; } catch { return false; }
    },
  };
}
