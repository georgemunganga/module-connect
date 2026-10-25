import { useEffect, useRef, useState } from "react";
import type { ExportScope } from "../components/data/ListTools";
import { beginScopedCsvDownload, fetchScopedCsv, type ScopedCsvFilters, type ScopedCsvKind } from "../../../src/platform/procurement-scoped-export";

/** The directory owns the visible filters; this hook owns one scoped download at a time. */
export function useScopedCsvExport(kind: ScopedCsvKind, companyId: string, scopeKey: string,
  allowed: boolean, viewFilters: ScopedCsvFilters) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const currentScope = useRef(scopeKey);
  const currentAllowed = useRef(allowed);
  currentScope.current = scopeKey;
  currentAllowed.current = allowed;
  useEffect(() => {
    setBusy(false); setError(""); setNotice("");
    return () => { controller.current?.abort(); controller.current = null; };
  }, [scopeKey, allowed]);

  async function onExport(scope: ExportScope) {
    if (!currentAllowed.current || scope === "selected" || controller.current) return;
    const request = new AbortController();
    const requestedScope = scopeKey;
    controller.current = request;
    setBusy(true); setError(""); setNotice("");
    try {
      const file = await fetchScopedCsv(kind, companyId, scope === "all" ? {} : viewFilters, request.signal);
      if (!request.signal.aborted && currentAllowed.current && currentScope.current === requestedScope && controller.current === request) {
        beginScopedCsvDownload(file);
        setNotice("CSV download is starting.");
      }
    } catch (cause) {
      if (!request.signal.aborted && currentAllowed.current && currentScope.current === requestedScope && controller.current === request)
        setError(cause instanceof Error ? cause.message : "The CSV export is unavailable. Try again later.");
    } finally {
      if (controller.current === request) { controller.current = null; setBusy(false); }
    }
  }
  return { allowed, onExport, busy, error, notice };
}
