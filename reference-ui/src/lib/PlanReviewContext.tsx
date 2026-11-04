import { procurementIdentityBranch } from "../../../shared/shell-scope";
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useErpShell } from "./erpShell";
import { useLiveReadiness } from "./ProcurementLiveGate";
import { capturePlanReviewScope, type PlanReviewIdentity } from "../../../src/platform/procurement-plan-review-api";
export function PlanContextBoundary({ children }: { children: ReactNode }) {
  const context = useLiveReadiness(), shell = useErpShell(), location = useLocation();
  if (!context) return null;
  const key = JSON.stringify([location.pathname, shell.authEpoch, context.tenantId, context.principalId,
    context.legalEntityId, shell.selection.branch ?? null, shell.selection.branchScope, context.permissions,
    context.capabilities.planningDraft, context.capabilities.planReviewRead, context.capabilities.planReviewWorkflow]);
  return <div key={key}>{children}</div>;
}
export function usePlanReviewContext() {
  const readiness = useLiveReadiness(), shell = useErpShell();
  if (!readiness) throw new Error("Choose an ERP company first.");
  const identity: PlanReviewIdentity = { tenantId: readiness.tenantId, legalEntityId: readiness.legalEntityId,
    principalId: readiness.principalId, branchId: procurementIdentityBranch(shell.selection.branch), authEpoch: shell.authEpoch };
  const current = useRef<PlanReviewIdentity | null>(identity); current.current = identity;
  useEffect(() => { current.current = identity; return () => { current.current = null; }; }, []);
  return { readiness, shell, scope: capturePlanReviewScope(identity, () => current.current), key: JSON.stringify([identity,
    readiness.permissions, readiness.capabilities.planReviewRead, readiness.capabilities.planReviewWorkflow]) };
}
