import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, PageHeader, Panel } from "../components/ui";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import type { ProcurementCapability } from "../lib/procurement-live";
import { listOwnRequestDrafts } from "../../../src/platform/procurement-requests-api";
import { listOwnOrderDrafts } from "../../../src/platform/procurement-orders-api";
import { listOwnPlans } from "../../../src/platform/procurement-plans-api";
import { listOwnContractDrafts } from "../../../src/platform/procurement-contracts-api";

type Metric = { label: string; permission: string; capability: ProcurementCapability; path: string;
  load: (company: string, signal: AbortSignal) => Promise<number> };
type Result = { state: "ready"; count: number } | { state: "unavailable" | "error" | "loading" };
const metrics: Metric[] = [
  { label: "My purchase requests", permission: "procurement-request-read", capability: "requestDraft", path: "/requests",
    load: async (company, signal) => (await listOwnRequestDrafts(company, 0, signal)).count },
  { label: "My purchase orders", permission: "procurement-po-read", capability: "orderDraft", path: "/purchase-orders",
    load: async (company, signal) => (await listOwnOrderDrafts(company, 1, signal)).total },
  { label: "My purchase plans", permission: "procurement-plan-read", capability: "planningDraft", path: "/plans",
    load: async (company, signal) => (await listOwnPlans(company, 1, signal)).total },
  { label: "My contracts", permission: "procurement-contract-read", capability: "contractDraft", path: "/contracts",
    load: async (company, signal) => (await listOwnContractDrafts(company, 1, signal)).total },
];

/** Counts returned by the scoped ERP list contracts. No invented spend or payment figures. */
export function LiveOverview({ analytics = false }: { analytics?: boolean }) {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness) throw new Error("Procurement overview requires ERP company context.");
  const { legalEntityId, permissions } = readiness;
  const permissionKey = permissions.slice().sort().join("|");
  const capabilityKey = metrics.map(metric => `${metric.capability}:${readiness.capabilities[metric.capability] === true}`).join("|");
  const contextKey = `${readiness.tenantId}:${legalEntityId}:${selection.entityId ?? ""}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}:${permissionKey}:${capabilityKey}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; values: Record<string, Result> }>({ key: "", values: {} });

  useEffect(() => {
    const controller = new AbortController();
    const allowed = new Set(permissions);
    const available = (metric: Metric) => allowed.has(metric.permission) && readiness.capabilities[metric.capability] === true
      && (!selection.entityId || selection.entityId === legalEntityId);
    setResult({ key: contextKey, values: Object.fromEntries(metrics.map(metric =>
      [metric.permission, { state: available(metric) ? "loading" : "unavailable" }])) });
    for (const metric of metrics) {
      if (!available(metric)) continue;
      metric.load(legalEntityId, controller.signal)
        .then(count => {
          if (!controller.signal.aborted)
            setResult(current => current.key === contextKey ? { ...current,
              values: { ...current.values, [metric.permission]: Number.isSafeInteger(count) && count >= 0
                ? { state: "ready", count } : { state: "error" } } } : current);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult(current => current.key === contextKey ? { ...current,
              values: { ...current.values, [metric.permission]: { state: "error" } } } : current);
        });
    }
    return () => controller.abort();
  }, [contextKey, legalEntityId, permissionKey, capabilityKey, readiness.capabilities, selection.entityId, revision]);

  const values = result.key === contextKey ? result.values : {};
  if (selection.entityId && selection.entityId !== legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={analytics ? "Procurement activity" : "Procurement home"}
      subtitle="Your saved purchasing records in the selected company. These counts do not represent company spend or Finance balances."
      actions={<Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Refresh</Button>} />
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {metrics.map(metric => {
        const value = values[metric.permission] ?? { state: "loading" };
        return <Panel key={metric.permission} title={metric.label}><div className="space-y-3 p-5">
          <p className="text-3xl font-semibold" aria-label={`${metric.label}: ${value.state === "ready" ? value.count : value.state}`}>
            {value.state === "ready" ? value.count : "—"}
          </p>
          <p className="text-sm text-muted-foreground" role={value.state === "error" ? "alert" : "status"}>
            {value.state === "ready" ? "Saved records you can access" : value.state === "loading" ? "Loading…"
              : value.state === "unavailable" ? "Unavailable for your access" : "Could not load. Refresh to try again."}
          </p>
          {value.state === "ready" && <Link className="text-sm font-medium text-primary hover:underline" to={metric.path}>Open records</Link>}
        </div></Panel>;
      })}
    </div>
    <p className="mt-5 text-sm text-muted-foreground">Budget balances, supplier payments, savings and spend trends need validated Finance and reporting sources before they can appear here.</p>
  </div>;
}
