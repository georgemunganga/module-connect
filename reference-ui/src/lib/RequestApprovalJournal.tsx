import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Panel } from "../components/ui";
import { useErpShell } from "./erpShell";
import type { ProcurementReadiness } from "./procurement-live";
import { getApprovalAcknowledgement } from "../../../src/platform/procurement-approval-acknowledgements-api";
import { approvalBrowserTabNonce, approvalJournalEvent, claimApprovalJournal, confirmApprovalJournal,
  readApprovalJournal, type ApprovalJournalScope, type ApprovalJournalState, type ApprovalLocator, type ApprovalOperation } from "./request-approval-journal";

type Journal = { readiness: ProcurementReadiness; scope: ApprovalJournalScope | null; scopeKey: string; revision: number;
  state: (operation: ApprovalOperation) => ApprovalJournalState; current: () => boolean;
  inFlight: (locator: ApprovalLocator) => boolean; reserve: (locator: ApprovalLocator) => boolean; settled: (locator: ApprovalLocator) => void;
  claim: (locator: ApprovalLocator) => boolean; confirm: (locator: ApprovalLocator) => boolean };
const Context = createContext<Journal | null>(null);
export function useRequestApprovalJournal(): Journal {
  const context = useContext(Context);
  if (!context) throw new Error("Approval commands require verified ERP recovery context.");
  return context;
}
/** Capture both record and component lifetime, in addition to the provider's actor/scope epoch. */
export function useRequestApprovalOperation(resourceKey: string): Journal {
  const journal = useRequestApprovalJournal();
  const resource = useRef(resourceKey), alive = useRef(true);
  resource.current = resourceKey;
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [resourceKey]);
  return { ...journal, current: () => alive.current && resource.current === resourceKey && journal.current() };
}
export function RequestApprovalJournalBoundary({ readiness, isScopeCurrent, children }: { readiness: ProcurementReadiness; isScopeCurrent: () => boolean; children: ReactNode }) {
  const { authEpoch } = useErpShell();
  const [revision, setRevision] = useState(0);
  useEffect(() => { const changed = () => setRevision(v => v + 1);
    window.addEventListener(approvalJournalEvent, changed); return () => window.removeEventListener(approvalJournalEvent, changed);
  }, []);
  // Nonce is a browser-tab partition. authEpoch only invalidates the projection.
  const nonce = useMemo(() => approvalBrowserTabNonce(readiness.tenantId, readiness.principalId),
    [readiness.tenantId, readiness.principalId, authEpoch, revision]);
  const scope = nonce && readiness.effectiveBranchId !== undefined ? {
    tenantId: readiness.tenantId, principalId: readiness.principalId, companyId: readiness.legalEntityId,
    branchId: readiness.effectiveBranchId, browserTabNonce: nonce,
  } : null;
  const scopeKey = JSON.stringify(scope);
  const currentScopeKey = useRef(scopeKey); currentScopeKey.current = scopeKey;
  return <JournalProvider key={scopeKey} scope={scope} scopeKey={scopeKey} readiness={readiness} isScopeCurrent={() => isScopeCurrent() && currentScopeKey.current === scopeKey}>{children}</JournalProvider>;
}
function JournalProvider({ scope, scopeKey, readiness, isScopeCurrent, children }: { scope: ApprovalJournalScope | null; scopeKey: string; isScopeCurrent: () => boolean;
  readiness: ProcurementReadiness; children: ReactNode }) {
  const activeKeys = useRef(new Set<string>());
  const alive = useRef(true), [revision, setRevision] = useState(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const changed = () => { if (alive.current) setRevision(v => v + 1); };
  const value: Journal = { readiness, scope, scopeKey, revision, current: () => alive.current && isScopeCurrent(),
    inFlight: locator => activeKeys.current.has(locator.key),
    reserve: locator => {
      if (!alive.current || !isScopeCurrent() || !scope || activeKeys.current.has(locator.key)
        || JSON.stringify(readApprovalJournal(scope, locator.operation).pending) !== JSON.stringify(locator)) return false;
      activeKeys.current.add(locator.key); changed(); return true;
    },
    settled: locator => { activeKeys.current.delete(locator.key); changed(); },
    state: operation => scope ? readApprovalJournal(scope, operation) : { pending: null, blocked: true },
    claim: locator => { if (!alive.current || !isScopeCurrent() || !scope) return false; const ok = claimApprovalJournal(scope, locator); changed(); return ok; },
    confirm: locator => { if (!alive.current || !isScopeCurrent() || !scope) return false; const ok = confirmApprovalJournal(scope, locator); changed(); return ok; },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Optional shell content slot; outside PR journal routes it renders nothing. */
export function RequestApprovalRecoverySlot() {
  const journal = useContext(Context);
  return journal ? <ApprovalCommandRecovery readiness={journal.readiness} /> : null;
}
function ApprovalCommandRecovery({ readiness }: { readiness: ProcurementReadiness }) {
  const journal = useRequestApprovalJournal();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const states = (["Open", "Decide"] as const).map(operation => ({ operation, ...journal.state(operation) }));
  const blocked = states.filter(state => state.blocked);
  if (!readiness.permissions.some(permission => ["procurement-approval-open", "procurement-approval-decide"].includes(permission))) return null;
  if (!blocked.length) return notice ? <p role="status" className="mx-5 mt-5 text-sm">{notice}</p> : null;
  async function recover(locator: ApprovalLocator) {
    const permission = locator.operation === "Open" ? "procurement-approval-open" : "procurement-approval-decide";
    if (busy || !journal.scope || !journal.current() || journal.inFlight(locator) || !readiness.permissions.includes(permission)) return;
    const captured = journal, scope = journal.scope;
    setBusy(true); setError(""); setNotice("");
    try {
      const ack = await getApprovalAcknowledgement(scope, locator);
      if (!captured.current()) return;
      if (!captured.confirm(locator)) throw new Error("The saved acknowledgement was valid, but its local reference could not be released. Keep it for reconciliation.");
      setNotice(`Saved approval result confirmed: ${ack.result.state}. This is the original result, not a new approval.`);
    } catch (cause) { if (captured.current()) setError(cause instanceof Error ? cause.message : "The saved result could not be confirmed."); }
    finally { if (captured.current()) setBusy(false); }
  }
  return <Panel title="Check an earlier approval action" className="mx-5 mt-5"><div className="space-y-3 p-5">
    <p className="text-sm">An earlier approval result has not been confirmed. A new action stays blocked. Checking a saved result sends no new approval.</p>
    {blocked.map(({ operation, pending }) => <div key={operation} className="space-y-2 text-sm">
      {pending ? <><p>{operation === "Open" ? "Start approvals" : "Approval decision"} · reference {pending.key}</p>
        <Button variant="secondary" disabled={busy || journal.inFlight(pending) || !readiness.permissions.includes(operation === "Open" ? "procurement-approval-open" : "procurement-approval-decide")}
          onClick={() => void recover(pending)}>{busy ? "Checking…" : "Check saved approval result"}</Button></>
        : <p>Recovery storage or the effective company/branch context is unavailable. No new approval will be sent. Keep this tab and ask Procurement to reconcile the earlier action.</p>}
    </div>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div></Panel>;
}
