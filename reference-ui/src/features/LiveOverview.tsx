import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Analytics, type AnalyticsRecord } from "./Insights";
import { Dashboard, type HomeRow, type HomeMetric } from "./Dashboard";
import { listVendorDrafts } from "../../../src/platform/procurement-vendors-api";
import { listInvoiceIntake } from "../../../src/platform/procurement-invoices-api";
import { listPublishedCatalog } from "../../../src/platform/procurement-catalog-api";
import { listAssignedApprovals } from "../../../src/platform/procurement-approvals-api";
import { requestApprovalsAvailable } from "../lib/request-approval-availability";
import { Panel } from "../components/ui";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import type { ProcurementCapability } from "../lib/procurement-live";
import { listOwnRequestDrafts } from "../../../src/platform/procurement-requests-api";
import { listOwnOrderDrafts } from "../../../src/platform/procurement-orders-api";
import { listOwnPlans } from "../../../src/platform/procurement-plans-api";
import { listOwnContractDrafts } from "../../../src/platform/procurement-contracts-api";

type Metric = { label: string; permission: string; capability: ProcurementCapability; path: string;
  load: (company: string, signal: AbortSignal) => Promise<{ count: number; rows?: HomeRow[]; reportRows?: AnalyticsRecord[] }> };
type Result = { state: "ready"; count: number; rows?: HomeRow[]; reportRows?: AnalyticsRecord[] } | { state: "unavailable" | "error" | "loading" };
const metrics: Metric[] = [
  { label: "My purchase requests", permission: "procurement-request-read", capability: "requestDraft", path: "/requests",
    load: async (company, signal) => {
      const page = await listOwnRequestDrafts(company, 0, signal);
      return { count: page.count, reportRows: page.records.map(row => ({ id: row.id, number: row.number, title: row.purpose, kind: "requests", party: "—", date: row.createdAt?.slice(0, 10) || "", status: row.status })), rows: page.records.slice().sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 3)
        .map(row => ({ id: row.id, reference: row.number, title: row.purpose, status: row.status, path: `/requests/${row.id}` })) };
    } },
  { label: "My purchase orders", permission: "procurement-po-read", capability: "orderDraft", path: "/purchase-orders",
    load: async (company, signal) => { const page = await listOwnOrderDrafts(company, 1, signal); return { count: page.total,
      reportRows: page.items.map(row => ({ id: row.id, number: row.number, title: row.number, kind: "purchase-orders", party: row.supplierName || "—", date: row.createdAt?.slice(0, 10) || "", status: row.status })) }; } },
  { label: "My purchase plans", permission: "procurement-plan-read", capability: "planningDraft", path: "/plans",
    load: async (company, signal) => { const page = await listOwnPlans(company, 1, signal); return { count: page.total,
      reportRows: page.items.map(row => ({ id: row.id, number: row.number, title: row.number, kind: "plans", party: "—", date: row.createdAt?.slice(0, 10) || "", status: row.status })) }; } },
  { label: "My contracts", permission: "procurement-contract-read", capability: "contractDraft", path: "/contracts",
    load: async (company, signal) => { const page = await listOwnContractDrafts(company, 1, signal); return { count: page.total,
      reportRows: page.items.map(row => ({ id: row.id, number: row.number, title: row.title, kind: "contracts", party: "—", date: row.effectiveFrom?.slice(0, 10) || "", status: row.status })) }; } },
];

const homeMetrics: Metric[] = [
  ...metrics,
  { label: "Supplier bills", permission: "procurement-invoice-read", capability: "invoiceIntake", path: "/bills",
    load: async (company, signal) => ({ count: (await listInvoiceIntake(company, 1, signal)).total }) },
  { label: "Catalog entries", permission: "procurement-item-read", capability: "itemDraft", path: "/items",
    load: async (company, signal) => ({ count: (await listPublishedCatalog(company, "", signal)).total }) },
  { label: "Vendors", permission: "procurement-vendor-read", capability: "vendorDraft", path: "/vendors",
    load: async (company, signal) => ({ count: (await listVendorDrafts(company, { page: 1, signal })).total }) },
  { label: "Approvals", permission: "procurement-approval-read", capability: "approvals", path: "/approvals",
    load: async (company, signal) => {
      const page = await listAssignedApprovals(company, 0, signal);
      return { count: page.count, rows: page.records.slice(0, 3).map(row => ({ id: row.caseId, reference: row.requestNumber,
        title: row.purpose, status: row.state, path: `/approvals/${row.caseId}` })) };
    } },
];

/** Counts returned by the scoped ERP list contracts. No invented spend or payment figures. */
export function LiveOverview({ analytics = false }: { analytics?: boolean }) {
  const readiness = useLiveReadiness();
  const { selection, authEpoch, entities, branding } = useErpShell();
  const visibleMetrics = analytics ? metrics : homeMetrics;
  if (!readiness) throw new Error("Procurement overview requires ERP company context.");
  const { legalEntityId, permissions } = readiness;
  const permissionKey = permissions.slice().sort().join("|");
  const capabilityKey = visibleMetrics.map(metric => `${metric.capability}:${readiness.capabilities[metric.capability] === true}`).concat(`principalApprovals:${readiness.capabilities.principalApprovals === true}`).join("|");
  const contextKey = `${authEpoch}:${analytics}:${readiness.effectiveBranchId ?? ""}:${readiness.tenantId}:${legalEntityId}:${selection.entityId ?? ""}:${selection.branch ?? ""}:${readiness.principalId}:${permissionKey}:${capabilityKey}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; values: Record<string, Result> }>({ key: "", values: {} });

  useEffect(() => {
    const controller = new AbortController();
    const allowed = new Set(permissions);
    const available = (metric: Metric) => allowed.has(metric.permission) && (metric.capability === "approvals" ? requestApprovalsAvailable(readiness.capabilities) : readiness.capabilities[metric.capability] === true)
      && (!selection.entityId || selection.entityId === legalEntityId);
    setResult({ key: contextKey, values: Object.fromEntries(visibleMetrics.map(metric =>
      [metric.permission, { state: available(metric) ? "loading" : "unavailable" }])) });
    for (const metric of visibleMetrics) {
      if (!available(metric)) continue;
      metric.load(legalEntityId, controller.signal)
        .then(({ count, rows, reportRows }) => {
          if (!controller.signal.aborted)
            setResult(current => current.key === contextKey ? { ...current,
              values: { ...current.values, [metric.permission]: Number.isSafeInteger(count) && count >= 0
                ? { state: "ready", count, rows, reportRows } : { state: "error" } } } : current);
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
  if (!analytics) {
    const metric = (index: number): HomeMetric => {
      const definition = homeMetrics[index], result = values[definition.permission] ?? { state: "loading" };
      return { label: definition.label, path: definition.path, state: result.state, count: result.state === "ready" ? result.count : undefined };
    };
    const requests = values[metrics[0].permission], approvals = values["procurement-approval-read"];
    return <Dashboard live={{
      companyName: entities.find(entity => entity.id === legalEntityId)?.name || branding?.displayName || "Your company",
      canCreateRequest: readiness.capabilities.requestDraft && permissions.includes("procurement-request-create"),
      refresh: () => setRevision(value => value + 1),
      stats: [{ ...metric(1), label: "Purchase orders" }, metric(4), metric(5), metric(6)], personal: metrics.map((_, index) => metric(index)),
      attention: { ...metric(7), rows: approvals?.state === "ready" ? approvals.rows ?? [] : [] },
      recent: { state: requests?.state ?? "loading", rows: requests?.state === "ready" ? requests.rows ?? [] : [] },
    }} />;
  }
  return <div className="p-5 sm:p-8">
    <Analytics key={contextKey} live={{ rows: metrics.flatMap(metric => { const value = values[metric.permission]; return value?.state === "ready" ? value.reportRows ?? [] : []; }),
      state: metrics.some(metric => values[metric.permission]?.state === "ready") ? "ready"
        : metrics.some(metric => values[metric.permission]?.state === "error") ? "error"
          : metrics.some(metric => !values[metric.permission] || values[metric.permission]?.state === "loading") ? "loading" : "unavailable",
      incomplete: metrics.some(metric => values[metric.permission]?.state === "error"),
      refresh: () => setRevision(value => value + 1) }} />
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
