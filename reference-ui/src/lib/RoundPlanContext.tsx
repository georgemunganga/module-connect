import { useEffect, useRef } from "react";
import { useLiveReadiness } from "./ProcurementLiveGate";
import { useErpShell } from "./erpShell";
import { captureRoundScope, type RoundIdentity } from "../../../src/platform/procurement-round-plan-api";
export function useRoundPlanContext() {
  const readiness = useLiveReadiness(), shell = useErpShell();
  if (!readiness) throw new Error("Choose an ERP company before opening the RFQ.");
  const identity: RoundIdentity = { tenantId: readiness.tenantId, companyId: readiness.legalEntityId, principalId: readiness.principalId,
    branchId: shell.selection.branch ?? null, authEpoch: shell.authEpoch };
  const key = JSON.stringify([identity, shell.selection.branchScope, readiness.permissions, readiness.capabilities.roundPlanRead, readiness.capabilities.roundPlanRecord]);
  const current = useRef<{ identity: RoundIdentity; key: string } | null>({ identity, key }); current.current = { identity, key };
  useEffect(() => { current.current = { identity, key }; return () => { current.current = null; }; }, []);
  return { readiness, scope: captureRoundScope(identity, () => current.current?.key === key ? current.current.identity : null), key };
}
