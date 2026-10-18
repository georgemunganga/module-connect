import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useErpShell } from "./erpShell";
import { fetchProcurementReadiness, ProcurementLiveError, type ProcurementReadiness } from "./procurement-live";

const liveMode = import.meta.env.VITE_PROCUREMENT_LIVE_MODE === "1";
const LiveReadiness = createContext<ProcurementReadiness | null>(null);
export const useLiveReadiness = () => useContext(LiveReadiness);
export const isProcurementLiveMode = liveMode;

/** Live transactions stay closed until their individual API adapters pass acceptance. */
export function ProcurementLiveGate({ children }: { children: ReactNode }) {
  const { selection } = useErpShell();
  const location = useLocation();
  const [state, setState] = useState<{ readiness?: ProcurementReadiness; error?: string }>({});
  useEffect(() => {
    if (!liveMode) return;
    const controller = new AbortController();
    setState({});
    fetchProcurementReadiness(selection, controller.signal)
      .then((readiness) => { if (!controller.signal.aborted) setState({ readiness }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ error: error instanceof ProcurementLiveError ? error.message : "Procurement data is not ready. Please try again later." });
      });
    return () => controller.abort();
  }, [selection.entityId, selection.branch]);

  if (!liveMode) return <>{children}</>;
  const vendorPath = /^\/vendors(?:\/|$)/.test(location.pathname);
  const itemPath = /^\/items(?:\/|$)/.test(location.pathname);
  if (state.readiness && ((vendorPath && state.readiness.capabilities.vendorDraft)
    || (itemPath && state.readiness.capabilities.itemDraft)))
    return <LiveReadiness.Provider value={state.readiness}>{children}</LiveReadiness.Provider>;
  return <main className="flex min-h-dvh items-center justify-center bg-background px-5 text-foreground">
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-semibold">Procurement</h1>
      {!state.readiness && !state.error ? <p className="mt-3 text-sm text-muted-foreground" role="status">Checking your ERP access and company…</p> : null}
      {state.error ? <div role="alert"><p className="mt-3 text-sm text-muted-foreground">{state.error}</p><div className="mt-5 flex gap-3"><button type="button" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground" onClick={() => window.location.reload()}>Try again</button><a className="rounded-full border px-5 py-2 text-sm" href="/sign-in">ERP sign in</a></div></div> : null}
      {state.readiness ? <p className="mt-3 text-sm text-muted-foreground" role="status">Your ERP account and company are connected. Procurement transaction screens will open as their live workflows are verified. No demo transactions are shown in live mode.</p> : null}
    </div>
  </main>;
}
