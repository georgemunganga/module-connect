import { RequestApprovalJournalBoundary } from "./RequestApprovalJournal";
import { requestApprovalsAvailable } from "./request-approval-availability";
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useErpShell } from "./erpShell";
import { fetchProcurementReadiness, ProcurementLiveError, type ProcurementReadiness } from "./procurement-live";

const liveMode = import.meta.env.VITE_PROCUREMENT_LIVE_MODE === "1";
const LiveReadiness = createContext<ProcurementReadiness | null>(null);
export const useLiveReadiness = () => useContext(LiveReadiness);
export const isProcurementLiveMode = liveMode;

/** Live transactions stay closed until their individual API adapters pass acceptance. */
export function ProcurementLiveGate({ children, unavailable, scopeUnavailable, blockedShell }: { children: ReactNode; unavailable?: ReactNode; scopeUnavailable?: ReactNode; blockedShell?: (content: ReactNode) => ReactNode }) {
  const { selection,authEpoch,procurementScopeStatus } = useErpShell();
  const location = useLocation();
  const paymentPath = /^\/payments(?:\/|$)/.test(location.pathname);
  const readinessKey=JSON.stringify([authEpoch,selection.entityId ?? "",selection.branch ?? "",selection.branchScope ?? "",procurementScopeStatus,paymentPath]);
  const currentKey=useRef(readinessKey);currentKey.current=readinessKey;
  const [storedState, setState] = useState<{ key:string; readiness?: ProcurementReadiness; error?: string }>({key:""});
  // Never render old scope readiness for even the render before passive effect cleanup.
  const state:{readiness?:ProcurementReadiness;error?:string}=storedState.key===readinessKey?storedState:{};
  useEffect(() => {
    if (!liveMode || procurementScopeStatus !== "ready") return;
    const controller = new AbortController();
    const capturedKey=readinessKey;
    setState({key:capturedKey});
    fetchProcurementReadiness(selection, controller.signal, fetch, paymentPath)
      .then((readiness) => { if (!controller.signal.aborted && currentKey.current===capturedKey) setState({ key:capturedKey,readiness }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentKey.current===capturedKey)
          setState({ key:capturedKey,error: error instanceof ProcurementLiveError ? error.message : "Procurement data is not ready. Please try again later." });
      });
    return () => controller.abort();
  }, [selection.entityId, selection.branch,selection.branchScope,authEpoch,readinessKey,procurementScopeStatus,paymentPath]);

  if (!liveMode) return <>{children}</>;
  if (procurementScopeStatus !== "ready") return <>{scopeUnavailable ?? <ProcurementScopeSelectionState />}</>;
  const vendorPath = /^\/vendors(?:\/|$)/.test(location.pathname);
  const itemPath = /^\/items(?:\/|$)/.test(location.pathname);
  const approvalPath = /^\/approvals(?:\/|$)/.test(location.pathname);
  const requestPath = /^\/(?:requests|procurement-requests)(?:\/|$)/.test(location.pathname);
  const sourcingPath = /^\/rfqs(?:\/|$)/.test(location.pathname);
  const contractPath = /^\/contracts(?:\/|$)/.test(location.pathname);
  const contractReviewPath = /^\/contracts\/internal-review(?:\/|$)/.test(location.pathname);
  const recurringPurchasePath = /^\/recurring-bills(?:\/|$)/.test(location.pathname);
  const planPath = /^\/plans(?:\/|$)/.test(location.pathname);
  const creditPath = /^\/vendor-credits(?:\/|$)/.test(location.pathname);
  const invoicePath = /^\/(?:bills|inbox)(?:\/|$)/.test(location.pathname);
  const orderPath = /^\/purchase-orders(?:\/|$)/.test(location.pathname);
  const receivingPath = /^\/purchase-receives(?:\/|$)/.test(location.pathname);
  const budgetPath = /^\/budgets(?:\/|$)/.test(location.pathname);
  const overviewPath = location.pathname === "/" || location.pathname === "/analytics";
  const configurationSettingsPath = /^\/settings(?:\/|$)/.test(location.pathname);
  const newRecord = /\/new\/?$/.test(location.pathname);
  const editRecord = /\/[^/]+\/edit\/?$/.test(location.pathname);
  // Only routes with a reviewed server All contract enter live content. The
  // shell stays available so the operator can choose a branch for other work.
  const requestList = /^\/(?:requests|procurement-requests)\/?$/.test(location.pathname);
  const planList = /^\/plans\/?$/.test(location.pathname);
  const contractList = /^\/contracts\/?$/.test(location.pathname);
  const allReadSupported = vendorPath || itemPath || paymentPath
    || requestList || planList || contractList;
  if (state.readiness && selection.branchScope === "all" && !allReadSupported) {
    const chooseBranch = <div className="p-5 sm:p-8" role="alert">Choose a permitted branch in Organisation context to open this Procurement workflow.</div>;
    return blockedShell ? blockedShell(chooseBranch) : chooseBranch;
  }
  const permission = state.readiness?.permissions ?? [];
  const permits = (read: string, create: string, edit: string) => permission.includes(newRecord ? create : editRecord ? edit : read);
  const deniedCrud = vendorPath && !permits("procurement-vendor-read", "procurement-vendor-create", "procurement-vendor-edit")
    || itemPath && !(newRecord || editRecord ? permission.includes("procurement-item-manage") : permission.some(value => ["procurement-item-read", "procurement-item-manage"].includes(value)))
    || requestPath && !permits("procurement-request-read", "procurement-request-create", "procurement-request-edit")
    || contractReviewPath && !permission.includes("procurement-contract-review-read")
    || contractPath && !contractReviewPath && !permits("procurement-contract-read", "procurement-contract-create", "procurement-contract-edit")
    || planPath && !permits("procurement-plan-read", "procurement-plan-create", "procurement-plan-edit")
    || invoicePath && !(newRecord || editRecord ? permission.includes("procurement-invoice-capture") : permission.includes("procurement-invoice-read"))
    || paymentPath && !(newRecord ? permission.includes("procurement-payment-create")
      : editRecord ? permission.includes("procurement-payment-edit") : permission.includes("procurement-payment-read"))
    || creditPath && !(newRecord || editRecord ? permission.includes("procurement-invoice-capture") : permission.includes("procurement-invoice-read"));
  if (state.readiness && deniedCrud) {
    const denied = <div className="p-5 sm:p-8" role="alert">You do not have permission to open this Procurement page for the selected company.</div>;
    // A Core account may be allowed in another company. Keep the existing
    // organisation selector reachable when this payment company's grant denies.
    if (paymentPath && blockedShell) return blockedShell(denied);
    return <LiveReadiness.Provider value={state.readiness}>{requestPath
      ? <RequestApprovalJournalBoundary readiness={state.readiness} isScopeCurrent={() => currentKey.current === readinessKey}>{blockedShell ? blockedShell(denied) : denied}</RequestApprovalJournalBoundary>
      : denied}</LiveReadiness.Provider>;
  }
  if (state.readiness && ((overviewPath && [
    ["procurement-request-read", "requestDraft"], ["procurement-po-read", "orderDraft"],
    ["procurement-plan-read", "planningDraft"], ["procurement-contract-read", "contractDraft"],
  ].some(([permission, capability]) => state.readiness!.permissions.includes(permission)
    && state.readiness!.capabilities[capability as keyof ProcurementReadiness["capabilities"]] === true))
    || (vendorPath && state.readiness.capabilities.vendorDraft)
    || (itemPath && state.readiness.capabilities.itemDraft)
    || (requestPath && state.readiness.capabilities.requestDraft)
    || (approvalPath && (requestApprovalsAvailable(state.readiness.capabilities) || state.readiness.capabilities.orders || state.readiness.capabilities.principalOrderGovernance
      || state.readiness.capabilities.invoiceOriginalUnitReview && state.readiness.permissions.some((permission) =>
        ["procurement-invoice-unit-review", "procurement-invoice-unit-review-request", "procurement-invoice-unit-review-read"].includes(permission))
      || state.readiness.capabilities.principalInvoiceMatching && state.readiness.permissions.includes("procurement-invoice-unit-review")))
    || (sourcingPath && (state.readiness.capabilities.sourcingDraft || state.readiness.capabilities.sourcingSourceDrafts || state.readiness.capabilities.principalSourcingSourceDrafts))
    || (contractReviewPath && state.readiness.capabilities.contractInternalReview)
    || (contractPath && !contractReviewPath && state.readiness.capabilities.contractDraft)
    || (recurringPurchasePath && state.readiness.capabilities.recurringPurchaseDraft && state.readiness.permissions.includes("procurement-recurring-read"))
    || (planPath && state.readiness.capabilities.planningDraft)
    || (invoicePath && state.readiness.capabilities.invoiceIntake)
    || (paymentPath && state.readiness.capabilities.manualPaymentWorkflow)
    || (creditPath && state.readiness.capabilities.vendorCreditDraft)
    || (orderPath && (state.readiness.capabilities.orderDraft || state.readiness.capabilities.orders || state.readiness.capabilities.principalDirectOrderDrafts))
    || (receivingPath && (state.readiness.capabilities.principalGoodsReturnDrafts || state.readiness.capabilities.principalReceiving || state.readiness.capabilities.receivingDrafts || state.readiness.capabilities.receivingGoods || state.readiness.capabilities.receivingInspection || state.readiness.capabilities.receivingServices))
    || (budgetPath && state.readiness.capabilities.requestDraft)
    || (configurationSettingsPath && state.readiness.permissions.includes("procurement-access"))))
    return <LiveReadiness.Provider value={state.readiness}>{requestPath || approvalPath
      ? <RequestApprovalJournalBoundary readiness={state.readiness} isScopeCurrent={() => currentKey.current === readinessKey}>{children}</RequestApprovalJournalBoundary> : children}</LiveReadiness.Provider>;
  // Historical acknowledgement remains reachable when execution/manual-policy
  // capability is off. The journal itself exposes only this actor's own locators.
  if (state.readiness && approvalPath)
    return <LiveReadiness.Provider value={state.readiness}><RequestApprovalJournalBoundary readiness={state.readiness} isScopeCurrent={() => currentKey.current === readinessKey}>
      {unavailable ?? <p className="p-5 text-sm">New approvals are currently unavailable. You can check your saved approval reference above.</p>}
    </RequestApprovalJournalBoundary></LiveReadiness.Provider>;
  if (state.readiness && unavailable)
    return <LiveReadiness.Provider value={state.readiness}>{unavailable}</LiveReadiness.Provider>;
  const blocked = <main className={blockedShell && state.error ? "p-5 sm:p-8" : "flex min-h-dvh items-center justify-center bg-background px-5 text-foreground"}>
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-semibold">Procurement</h1>
      {!state.readiness && !state.error ? <p className="mt-3 text-sm text-muted-foreground" role="status">Checking your ERP access and company…</p> : null}
      {state.error ? <div role="alert"><p className="mt-3 text-sm text-muted-foreground">{state.error}</p><div className="mt-5 flex gap-3"><button type="button" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground" onClick={() => window.location.reload()}>Try again</button><a className="rounded-full border px-5 py-2 text-sm" href="/sign-in">ERP sign in</a></div></div> : null}
      {state.readiness ? <p className="mt-3 text-sm text-muted-foreground" role="status">Your ERP account and company are connected. Procurement transaction screens will open as their live workflows are verified. No demo transactions are shown in live mode.</p> : null}
    </div>
  </main>;
  // The shared header remains available for recovery; no business routes are rendered.
  return blockedShell && state.error ? blockedShell(blocked) : blocked;
}

/** Keeps the existing shell/header available while a saved label needs selection. */
export function ProcurementScopeSelectionState() {
  const { procurementScopeStatus, scopeMessage } = useErpShell();
  return <div className="p-5 sm:p-8"><h1 className="text-2xl font-semibold">{procurementScopeStatus === "resolving" ? "Checking your branch" : "Choose your branch"}</h1>
    <p className="mt-3 text-sm text-muted-foreground" role={procurementScopeStatus === "resolving" ? "status" : "alert"}>{scopeMessage}</p></div>;
}
