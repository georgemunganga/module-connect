import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useErpShell } from "./erpShell";
import { fetchProcurementReadiness, ProcurementLiveError, type ProcurementReadiness } from "./procurement-live";

const liveMode = import.meta.env.VITE_PROCUREMENT_LIVE_MODE === "1";
const LiveReadiness = createContext<ProcurementReadiness | null>(null);
export const useLiveReadiness = () => useContext(LiveReadiness);
export const isProcurementLiveMode = liveMode;

/** Live transactions stay closed until their individual API adapters pass acceptance. */
export function ProcurementLiveGate({ children, unavailable }: { children: ReactNode; unavailable?: ReactNode }) {
  const { selection,authEpoch } = useErpShell();
  const location = useLocation();
  const readinessKey=JSON.stringify([authEpoch,selection.entityId ?? "",selection.branch ?? ""]);
  const currentKey=useRef(readinessKey);currentKey.current=readinessKey;
  const [storedState, setState] = useState<{ key:string; readiness?: ProcurementReadiness; error?: string }>({key:""});
  // Never render old scope readiness for even the render before passive effect cleanup.
  const state:{readiness?:ProcurementReadiness;error?:string}=storedState.key===readinessKey?storedState:{};
  useEffect(() => {
    if (!liveMode) return;
    const controller = new AbortController();
    const capturedKey=readinessKey;
    setState({key:capturedKey});
    fetchProcurementReadiness(selection, controller.signal)
      .then((readiness) => { if (!controller.signal.aborted && currentKey.current===capturedKey) setState({ key:capturedKey,readiness }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentKey.current===capturedKey)
          setState({ key:capturedKey,error: error instanceof ProcurementLiveError ? error.message : "Procurement data is not ready. Please try again later." });
      });
    return () => controller.abort();
  }, [selection.entityId, selection.branch,authEpoch,readinessKey]);

  if (!liveMode) return <>{children}</>;
  if (state.readiness?.adminViewOnly && /\/(?:new|edit)\/?$/.test(location.pathname) && unavailable)
    return <LiveReadiness.Provider value={state.readiness}><AdminViewNotice readiness={state.readiness} />{unavailable}</LiveReadiness.Provider>;
  const vendorPath = /^\/vendors(?:\/|$)/.test(location.pathname);
  const itemPath = /^\/items(?:\/|$)/.test(location.pathname);
  const approvalPath = /^\/approvals(?:\/|$)/.test(location.pathname);
  const requestPath = /^\/(?:requests|procurement-requests)(?:\/|$)/.test(location.pathname);
  const sourcingPath = /^\/rfqs(?:\/|$)/.test(location.pathname);
  const contractPath = /^\/contracts(?:\/|$)/.test(location.pathname);
  const planPath = /^\/plans(?:\/|$)/.test(location.pathname);
  const creditPath = /^\/vendor-credits(?:\/|$)/.test(location.pathname);
  const invoicePath = /^\/(?:bills|inbox)(?:\/|$)/.test(location.pathname);
  const orderPath = /^\/purchase-orders(?:\/|$)/.test(location.pathname);
  const receivingPath = /^\/purchase-receives(?:\/|$)/.test(location.pathname);
  const budgetPath = /^\/budgets(?:\/|$)/.test(location.pathname);
  const overviewPath = location.pathname === "/" || location.pathname === "/analytics";
  const configurationSettingsPath = /^\/settings(?:\/|$)/.test(location.pathname);
  if (state.readiness && ((overviewPath && [
    ["procurement-request-read", "requestDraft"], ["procurement-po-read", "orderDraft"],
    ["procurement-plan-read", "planningDraft"], ["procurement-contract-read", "contractDraft"],
  ].some(([permission, capability]) => state.readiness!.permissions.includes(permission)
    && state.readiness!.capabilities[capability as keyof ProcurementReadiness["capabilities"]] === true))
    || (vendorPath && state.readiness.capabilities.vendorDraft)
    || (itemPath && state.readiness.capabilities.itemDraft)
    || (requestPath && state.readiness.capabilities.requestDraft)
    || (approvalPath && state.readiness.capabilities.approvals)
    || (sourcingPath && state.readiness.capabilities.sourcingDraft)
    || (contractPath && state.readiness.capabilities.contractDraft)
    || (planPath && state.readiness.capabilities.planningDraft)
    || (invoicePath && state.readiness.capabilities.invoiceIntake)
    || (creditPath && state.readiness.capabilities.vendorCreditDraft)
    || (orderPath && state.readiness.capabilities.orderDraft)
    || (receivingPath && (state.readiness.capabilities.receivingDrafts || state.readiness.capabilities.receivingGoods || state.readiness.capabilities.receivingInspection || state.readiness.capabilities.receivingServices))
    || (budgetPath && state.readiness.capabilities.requestDraft)
    || (configurationSettingsPath && state.readiness.permissions.includes("procurement-access"))))
    return <LiveReadiness.Provider value={state.readiness}><AdminViewNotice readiness={state.readiness} />{children}</LiveReadiness.Provider>;
  if (state.readiness && unavailable)
    return <LiveReadiness.Provider value={state.readiness}><AdminViewNotice readiness={state.readiness} />{unavailable}</LiveReadiness.Provider>;
  return <main className="flex min-h-dvh items-center justify-center bg-background px-5 text-foreground">
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-semibold">Procurement</h1>
      {!state.readiness && !state.error ? <p className="mt-3 text-sm text-muted-foreground" role="status">Checking your ERP access and company…</p> : null}
      {state.error ? <div role="alert"><p className="mt-3 text-sm text-muted-foreground">{state.error}</p><div className="mt-5 flex gap-3"><button type="button" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground" onClick={() => window.location.reload()}>Try again</button><a className="rounded-full border px-5 py-2 text-sm" href="/sign-in">ERP sign in</a></div></div> : null}
      {state.readiness ? <p className="mt-3 text-sm text-muted-foreground" role="status">Your ERP account and company are connected. Procurement transaction screens will open as their live workflows are verified. No demo transactions are shown in live mode.</p> : null}
    </div>
  </main>;
}

function AdminViewNotice({ readiness }: { readiness: ProcurementReadiness }) {
  return readiness.adminViewOnly ? <p role="status" className="border-b border-border bg-background px-5 py-3 text-sm text-muted-foreground">Administrator view. Purchasing and approval actions require an active employee account.</p> : null;
}
