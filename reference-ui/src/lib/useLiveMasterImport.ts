import { useEffect, useState } from "react";
import { getMasterImportSchema, type MasterImportKind, type MasterImportSchema } from "../../../src/platform/procurement-master-import";
import type { ImportScope } from "./master-import-journal";

export type LiveImport = { kind: MasterImportKind; companyId: string; scope: ImportScope;
  schema: MasterImportSchema; onCommitted: () => void };

export function useLiveMasterImport(kind: MasterImportKind, companyId: string, scope: ImportScope,
  scopeKey: string, permitted: boolean, onCommitted: () => void) {
  const [schema, setSchema] = useState<MasterImportSchema | null>(null);
  const [resolvedScope, setResolvedScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("Import is unavailable for this account.");
  useEffect(() => {
    const controller = new AbortController();
    setSchema(null); setResolvedScope("");
    if (!permitted) { setLoading(false); setReason("You do not have permission to import these records."); return () => controller.abort(); }
    setLoading(true); setReason("Checking ERP import availability…");
    getMasterImportSchema(kind, companyId, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setSchema(value); setResolvedScope(scopeKey); setReason(""); } })
      .catch(() => { if (!controller.signal.aborted) setReason("ERP import is unavailable for this company."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, companyId, scopeKey, permitted]);
  return { liveImport: permitted && schema && !loading && resolvedScope === scopeKey ? { kind, companyId, scope, schema, onCommitted } as LiveImport : undefined,
    unavailableImportReason: reason };
}
