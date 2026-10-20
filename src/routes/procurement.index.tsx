import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search, ShoppingCart, Receipt, Package, Building2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaces } from "@/mock/data";
import type { Role } from "@/mock/types";
import { procApi } from "@/modules/procurement/data";
import { useProcurement, resetProcurement } from "@/modules/procurement/store";
import { useCommercial, resetCommercial } from "@/modules/procurement/commercial/store";
import { usePayables, resetPayables } from "@/modules/procurement/payables/store";
import { resetPlans } from "@/modules/procurement/planning";
import { resetCatalog } from "@/modules/procurement/catalog";
import { useCatalog } from "@/modules/procurement/catalog";
import { demoRequester, procurementEntityName, sameEntity } from "@/modules/procurement/access";
import { useGettingStarted } from "@/modules/procurement/getting-started";
import type { ProcWorkItem } from "@/modules/procurement/types";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { WorkQueue } from "@/platform/components/WorkQueue";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/procurement/")({
  head: () => ({
    meta: [
      { title: "Home — Meridian ERP Procurement" },
      { name: "description", content: "Your next procurement action: requests, approvals, deliveries and exceptions for your role." },
      { property: "og:title", content: "Home — Meridian ERP Procurement" },
      { property: "og:description", content: "Your next procurement action: requests, approvals, deliveries and exceptions for your role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProcHome,
});

type Card = { label: string; value: string; hint: string; to: string; params?: Record<string, string> };

/** Amounts are always shown per currency — never summed across currencies. */
const cardsByView: Record<string, Card[]> = {
  requester: [
    { label: "My open requests", value: "3", hint: "1 returned to you", to: "/procurement/requests" },
    { label: "My orders and deliveries", value: "1", hint: "See what has been ordered", to: "/procurement/requests" },
    { label: "Drafts", value: "1", hint: "Welcome packs, saved 2 Oct", to: "/procurement/requests" },
  ],
  approver: [
    { label: "Waiting for your approval", value: "2", hint: "Earliest due 8 Oct", to: "/procurement/approvals" },
    { label: "Value awaiting you (EUR)", value: "€18,450", hint: "1 request", to: "/procurement/approvals" },
    { label: "Value awaiting you (KES)", value: "KES 386,000", hint: "1 request", to: "/procurement/approvals" },
  ],
  buyer: [
    { label: "Approved items to buy", value: "2", hint: "Not yet ordered", to: "/procurement/requests" },
    { label: "Quote deadlines", value: "1", hint: "Quote request closes 9 Oct", to: "/procurement/sourcing" },
    { label: "Orders ready to send", value: "1", hint: "Chairs, €7,200", to: "/procurement/orders" },
    { label: "Bills needing review", value: "2", hint: "Price is higher than the allowed amount", to: "/procurement/invoices" },
    { label: "New vendors to review", value: "1", hint: "Missing tax ID and bank letter", to: "/procurement/suppliers" },
  ],
  steward: [
    { label: "Vendors being set up", value: "1", hint: "More details needed", to: "/procurement/suppliers" },
    { label: "Vendors on hold", value: "1", hint: "Review 12 Oct", to: "/procurement/suppliers" },
  ],
  receiver: [
    { label: "Deliveries expected", value: "2", hint: "This week", to: "/procurement/receiving" },
  ],
  ap: [
    { label: "Bills needing review", value: "2", hint: "Check the order and delivery", to: "/procurement/invoices" },
  ],
};

function viewFor(role: Role): keyof typeof cardsByView | "auditor" | "supplier" {
  switch (role) {
    case "buyer":
    case "proc_admin":
      return "buyer";
    case "manager":
      return "approver";
    case "supplier_steward":
      return "steward";
    case "receiver":
      return "receiver";
    case "ap_processor":
      return "ap";
    case "auditor":
      return "auditor";
    case "supplier_user":
      return "supplier";
    default:
      return "requester";
  }
}

function ProcHome() {
  const { role, entityId, approvalActor } = useApp();
  const gettingStarted = useGettingStarted(entityId);
  const demo = useProcurement();
  const commercial = useCommercial();
  const payables = usePayables();
  const catalog = useCatalog();
  const view = viewFor(role);
  const queue = useMock(() => procApi.workQueue(role), [role]);
  const ws = workspaces.find((w) => w.id === role)!;
  const canRequest = view === "requester" || view === "approver";
  const visibleRequests = demo.requests.filter((request) => sameEntity(demo.metadata[request.id]?.entity, entityId));
  const visibleApprovals = demo.approvals.filter((task) => sameEntity(task.recordEntity, entityId) && task.state !== "Completed" && (role !== "manager" || task.assignee === approvalActor));
  const visibleOrders = commercial.orders.filter((order) => sameEntity(order.entity, entityId));
  const issuedOrders = visibleOrders.filter((order) => ["Issued", "Acknowledged", "Closed"].includes(order.status));
  const visibleBills = payables.invoices.filter((invoice) => invoice.entityId === entityId);
  const requester = demoRequester(role, entityId);
  const cardValue = (card: Card) => {
    if (card.label === "My open requests") return String(visibleRequests.filter((request) => request.requester === requester && !["Closed", "Cancelled", "Rejected"].includes(request.status)).length);
    if (card.label === "Drafts") return String(visibleRequests.filter((request) => request.requester === requester && request.status === "Draft").length);
    if (card.label === "My orders and deliveries") return String(visibleRequests.filter((request) => request.requester === requester && (demo.metadata[request.id]?.lines ?? []).some((line) => line.orderedQty > line.receivedQty)).length);
    if (card.label === "Waiting for your approval") return String(visibleApprovals.length);
    if (card.label === "Value awaiting you (EUR)" || card.label === "Value awaiting you (KES)") { const currency = card.label.includes("EUR") ? "EUR" : "KES"; return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(visibleApprovals.filter((task) => task.amount?.currency === currency).reduce((sum, task) => sum + (task.amount?.value ?? 0), 0)); }
    if (card.label === "Approved items to buy") return String(visibleRequests.filter((request) => request.status === "Approved").flatMap((request) => demo.metadata[request.id]?.lines ?? []).filter((line) => line.approval === "Approved" && line.approvedQty > line.allocatedQty + line.orderedQty + line.cancelledQty).length);
    if (card.label === "Quote deadlines") return String(demo.sourcing.filter((event) => sameEntity(event.entity, entityId) && event.state === "Published").length);
    if (card.label === "Orders ready to send") return String(commercial.orders.filter((order) => sameEntity(order.entity, entityId) && order.status === "Approved").length);
    if (card.label === "Bills needing review") return String(payables.invoices.filter((invoice) => invoice.entityId === entityId && invoice.status === "Exception").length);
    if (card.label === "New vendors to review" || card.label === "Vendors being set up") return String(demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && ["Proposed", "Under diligence", "More information required", "Conditional"].includes(supplier.status)).length);
    if (card.label === "Vendors on hold") return String(demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && supplier.status === "Suspended").length);
    if (card.label === "Deliveries expected") return String(visibleOrders.filter((order) => ["Issued", "Acknowledged"].includes(order.status) && order.line.received < order.line.qty).length);
    return card.value;
  };
  const visibleQueueItems = (items: ProcWorkItem[]) => items.filter((item) => {
    if (!item.params?.id) return true;
    const request = visibleRequests.find((record) => record.id === item.params?.id);
    if (!request) return false;
    if (item.id === "q2") return request.status === "In review";
    if (item.id === "q3") return request.status === "Submitted";
    if (item.id === "q4") return request.status === "Approved" && (demo.metadata[request.id]?.lines ?? []).some((line) => line.approvedQty > line.allocatedQty + line.orderedQty + line.cancelledQty);
    return true;
  });
  const orderTotals = Object.entries(issuedOrders.reduce<Record<string, number>>((totals, order) => {
    totals[order.currency] = (totals[order.currency] ?? 0) + order.line.qty * order.line.price;
    return totals;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const trendCurrency = orderTotals[0]?.[0];
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString("en", { month: "short", timeZone: "UTC" }), value: issuedOrders.filter((order) => order.currency === trendCurrency && order.issuedAt?.startsWith(key)).reduce((sum, order) => sum + order.line.qty * order.line.price, 0) };
  });
  const peak = Math.max(1, ...months.map((month) => month.value));
  const metrics = [
    { label: "Issued orders", value: issuedOrders.length, to: "/procurement/orders", icon: ShoppingCart },
    { label: "Bills needing review", value: visibleBills.filter((bill) => ["Exception", "AP rejected"].includes(bill.status)).length, to: "/procurement/invoices", icon: Receipt },
    { label: "Available items", value: catalog.filter((item) => item.status === "Active" && !item.block && item.entities.includes(procurementEntityName(entityId))).length, to: "/procurement/catalog", icon: Package },
    { label: "Active vendors", value: demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && supplier.status === "Active").length, to: "/procurement/suppliers", icon: Building2 },
  ];
  const auditRows = [
    ...visibleRequests.flatMap((request) => request.timeline.map((entry) => ({ when: entry.at, who: entry.actor, what: `${request.id} · ${entry.event}`, to: "/procurement/requests/$id", id: request.id }))),
    ...visibleOrders.flatMap((order) => order.audit.map((entry) => ({ when: entry.at, who: entry.actor, what: `${order.id} · ${entry.action}`, to: "/procurement/orders/$id", id: order.id }))),
  ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 12);

  if (view === "supplier") {
    return (
      <AppShell>
        <PageHeader eyebrow={`${ws.label} workspace`} title="Procurement home" />
        <RestrictedState
          title="Suppliers use the supplier portal"
          body="This internal workspace isn't available to supplier accounts. Open the supplier portal to view shared opportunities, orders and invoices."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${ws.label} workspace`}
        title={canRequest ? `Hello, ${requester.split(" ")[0]}` : "Procurement overview"}
        description={view === "auditor" ? "Search records and review recent activity. You cannot make changes here." : "See what needs your attention and what happens next."}
        primaryAction={
          canRequest ? (
            <Button asChild>
              <Link to="/procurement/requests/new" search={{ item: undefined }}>Create request</Link>
            </Button>
          ) : undefined
        }
      />
      <nav aria-label="Home views" className="-mt-2 flex gap-6 border-b text-sm"><span aria-current="page" className="border-b-2 border-primary pb-3 font-medium">Dashboard</span><Link to="/procurement/requests" className="pb-3 text-muted-foreground hover:text-foreground">{canRequest ? "My requests" : "Purchase requests"}</Link></nav>

      {role === "proc_admin" && gettingStarted.loaded ? <section className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-labelledby="proc-start-h">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">First use</p><h2 id="proc-start-h" className="mt-1 text-lg font-semibold">{gettingStarted.reviewedCount === 3 ? "Review purchasing setup" : "Set up purchasing"}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Check buying rules, try a first purchase, and see how bills reach Finance.</p><p className="mt-2 text-xs text-muted-foreground">{gettingStarted.reviewedCount} of 3 steps reviewed · saved in this browser for this company</p></div><Button asChild><Link to="/procurement/getting-started">{gettingStarted.reviewedCount === 3 ? "Open guide" : "Get started"}</Link></Button></div>
      </section> : null}

      {role === "proc_admin" ? <div className="mb-4"><Button size="sm" variant="outline" onClick={() => { if (window.confirm("Reset all Procurement demo transactions to their starting data?")) { resetProcurement(); resetCommercial(); resetPayables(); resetPlans(); resetCatalog(); } }}>Reset Procurement demo</Button></div> : null}

      {view === "auditor" ? (
        <AuditorHome rows={auditRows} />
      ) : (
        <div className="space-y-8">
          {view === "buyer" ? <section aria-label="Procurement at a glance" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Link key={metric.label} to={metric.to as never} className="flex items-center gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-primary"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><metric.icon className="size-5" aria-hidden /></span><span><span className="block text-xs text-muted-foreground">{metric.label}</span><strong className="mt-1 block text-xl tabular-nums">{metric.value}</strong></span></Link>)}</div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]"><div className="rounded-xl border bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Issued purchase orders</h2><p className="mt-1 text-xs text-muted-foreground">Commercial commitments in this company. Finance owns actual spend and payments.</p></div><Link to="/procurement/orders" className="text-sm text-primary hover:underline">View orders →</Link></div><div className="mt-5 flex flex-wrap gap-6">{orderTotals.length ? orderTotals.map(([currency, total]) => <div key={currency}><p className="text-xs text-muted-foreground">{currency} committed</p><p className="mt-1 text-2xl font-semibold tabular-nums">{new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(total)}</p></div>) : <p className="text-sm text-muted-foreground">No orders have been issued yet.</p>}</div>{trendCurrency ? <div className="mt-5"><p className="text-xs text-muted-foreground">Last six months · {trendCurrency} issued PO value</p><div className="mt-3 grid h-36 grid-cols-6 items-end gap-3" role="img" aria-label={`Issued purchase order value by month in ${trendCurrency}: ${months.map((month) => `${month.label} ${month.value}`).join(", ")}`}>{months.map((month) => <div key={month.key} className="flex h-full flex-col justify-end gap-1"><div className="min-h-1 rounded-t bg-primary/65" style={{ height: `${Math.max(3, month.value / peak * 100)}%` }} title={`${month.label}: ${month.value} ${trendCurrency}`} /><span className="text-center text-xs text-muted-foreground">{month.label}</span></div>)}</div></div> : null}</div><div className="rounded-xl border bg-surface p-5"><h2 className="font-semibold">Attention required</h2><p className="mt-1 text-xs text-muted-foreground">Open decisions and exceptions for this company.</p><div className="mt-4 space-y-2"><Link to="/procurement/approvals" className="flex justify-between rounded-lg border p-3 text-sm hover:border-primary"><span>Approvals waiting</span><strong>{visibleApprovals.length}</strong></Link><Link to="/procurement/invoices" className="flex justify-between rounded-lg border p-3 text-sm hover:border-primary"><span>Bill exceptions</span><strong>{metrics[1].value}</strong></Link><Link to="/procurement/suppliers" className="flex justify-between rounded-lg border p-3 text-sm hover:border-primary"><span>Vendors in review</span><strong>{demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && ["Proposed", "Under diligence", "More information required", "Conditional"].includes(supplier.status)).length}</strong></Link></div></div></div>
          </section> : null}
          <section aria-labelledby="summary-h">
            <h2 id="summary-h" className="sr-only">Summary</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cardsByView[view].map((c) => (
                <li key={c.label}>
                  <Link
                    to={c.to}
                    params={c.params as never}
                    className="flex h-full items-start justify-between gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <span>
                      <span className="block text-xs text-muted-foreground">{c.label}</span>
                      <span className="mt-1 block text-xl font-semibold tabular-nums">{cardValue(c)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Open work queue</span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <Async state={queue}>
            {(items) =>
              visibleQueueItems(items).length ? (
                <WorkQueue items={visibleQueueItems(items)} />
              ) : (
                <EmptyState
                  title={view === "requester" ? "You haven't asked for anything yet" : "Nothing needs you right now"}
                  body={view === "requester" ? "Ask for goods, a service or a subscription. You'll see what happens next here." : "New requests, approvals and tasks will appear here."}
                />
              )
            }
          </Async>
        </div>
      )}
    </AppShell>
  );
}

function AuditorHome({ rows: activity }: { rows: { when: string; who: string; what: string; to: string; id: string }[] }) {
  const [q, setQ] = useState("");
  const rows = activity.filter((a) => (a.what + a.who).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="audit-q" className="sr-only">Search activity</label>
        <Input id="audit-q" className="pl-9" placeholder="Search by reference, person or action" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section aria-labelledby="act-h" className="rounded-lg border bg-surface">
        <h2 id="act-h" className="border-b px-4 py-3 text-sm font-semibold">Recent activity</h2>
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((a) => (
              <li key={`${a.id}-${a.when}-${a.what}`} className="px-4 py-3 text-sm"><Link to={a.to as never} params={{ id: a.id } as never} className="font-medium text-primary hover:underline">{a.what}</Link><span className="block text-xs text-muted-foreground">{a.who} · {a.when}</span></li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No activity matches “{q}”.</p>
        )}
      </section>
    </div>
  );
}
