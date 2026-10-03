import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
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
import { sameEntity } from "@/modules/procurement/access";
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
    { label: "Order and delivery progress", value: "1", hint: "Track your request lines", to: "/procurement/requests" },
    { label: "Drafts", value: "1", hint: "Welcome packs, saved 2 Oct", to: "/procurement/requests" },
  ],
  approver: [
    { label: "Decisions pending", value: "2", hint: "Earliest due 8 Oct", to: "/procurement/approvals" },
    { label: "Value awaiting you (EUR)", value: "€18,450", hint: "1 request", to: "/procurement/approvals" },
    { label: "Value awaiting you (KES)", value: "KES 386,000", hint: "1 request", to: "/procurement/approvals" },
  ],
  buyer: [
    { label: "Approved lines to process", value: "2", hint: "Not yet sourced or ordered", to: "/procurement/requests" },
    { label: "Sourcing deadlines", value: "1", hint: "RFQ closes 9 Oct", to: "/procurement/sourcing" },
    { label: "POs awaiting issue", value: "1", hint: "Chairs, €7,200", to: "/procurement/orders" },
    { label: "Invoice exceptions", value: "2", hint: "Price variance above tolerance", to: "/procurement/invoices" },
    { label: "Supplier onboarding", value: "1", hint: "Missing tax ID and bank letter", to: "/procurement/suppliers" },
  ],
  steward: [
    { label: "Onboarding in progress", value: "1", hint: "More information required", to: "/procurement/suppliers" },
    { label: "Suppliers on hold", value: "1", hint: "Review 12 Oct", to: "/procurement/suppliers" },
  ],
  receiver: [
    { label: "Deliveries expected", value: "2", hint: "This week", to: "/procurement/receiving" },
  ],
  ap: [
    { label: "Invoice exceptions", value: "2", hint: "Awaiting match decision", to: "/procurement/invoices" },
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

const activity = [
  { when: "3 Oct, 16:12", who: "Grace Wanjiru", what: "Returned PR-2026-1035 — supplier not onboarded" },
  { when: "2 Oct, 10:40", who: "Lukas Brandt", what: "Approved PR-2026-1038 (€7,200)" },
  { when: "1 Oct, 09:05", who: "Sanne de Vries", what: "Submitted PR-2026-1042 (€18,450)" },
];

function ProcHome() {
  const { role, entityId } = useApp();
  const gettingStarted = useGettingStarted(entityId);
  const demo = useProcurement();
  const commercial = useCommercial();
  const payables = usePayables();
  const view = viewFor(role);
  const queue = useMock(() => procApi.workQueue(role), [role]);
  const ws = workspaces.find((w) => w.id === role)!;
  const canRequest = view === "requester" || view === "approver";
  const visibleRequests = demo.requests.filter((request) => sameEntity(demo.metadata[request.id]?.entity, entityId));
  const visibleApprovals = demo.approvals.filter((task) => sameEntity(task.recordEntity, entityId) && task.state !== "Completed");
  const cardValue = (card: Card) => {
    if (card.label === "My open requests") return String(visibleRequests.filter((request) => request.requester.startsWith("Amara") && !["Closed", "Cancelled", "Rejected"].includes(request.status)).length);
    if (card.label === "Drafts") return String(visibleRequests.filter((request) => request.requester.startsWith("Amara") && request.status === "Draft").length);
    if (card.label === "Order and delivery progress") return String(visibleRequests.filter((request) => request.requester.startsWith("Amara") && (demo.metadata[request.id]?.lines ?? []).some((line) => line.orderedQty > line.receivedQty)).length);
    if (card.label === "Decisions pending") return String(visibleApprovals.length);
    if (card.label === "Value awaiting you (EUR)" || card.label === "Value awaiting you (KES)") { const currency = card.label.includes("EUR") ? "EUR" : "KES"; return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(visibleApprovals.filter((task) => task.amount?.currency === currency).reduce((sum, task) => sum + (task.amount?.value ?? 0), 0)); }
    if (card.label === "Approved lines to process") return String(visibleRequests.filter((request) => request.status === "Approved").flatMap((request) => demo.metadata[request.id]?.lines ?? []).filter((line) => line.approval === "Approved" && line.approvedQty > line.allocatedQty + line.orderedQty + line.cancelledQty).length);
    if (card.label === "POs awaiting issue") return String(commercial.orders.filter((order) => sameEntity(order.entity, entityId) && order.status === "Approved").length);
    if (card.label === "Invoice exceptions") return String(payables.invoices.filter((invoice) => invoice.entityId === entityId && invoice.status === "Exception").length);
    if (card.label === "Supplier onboarding" || card.label === "Onboarding in progress") return String(demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && ["Proposed", "Under diligence", "More information required", "Conditional"].includes(supplier.status)).length);
    if (card.label === "Suppliers on hold") return String(demo.suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && supplier.status === "Suspended").length);
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
        title="Procurement home"
        description={view === "auditor" ? "Read-only. Search records and review recent activity." : `${ws.description}. Exceptions first, then decisions, then tasks.`}
        primaryAction={
          canRequest ? (
            <Button asChild>
              <Link to="/procurement/requests/new" search={{ item: undefined }}>Create request</Link>
            </Button>
          ) : undefined
        }
      />

      {role === "proc_admin" && gettingStarted.loaded ? <section className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-labelledby="proc-start-h">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">First use</p><h2 id="proc-start-h" className="mt-1 text-lg font-semibold">{gettingStarted.reviewedCount === 3 ? "Revisit Procurement setup" : "Start your Procurement journey"}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review buying controls, run a first purchase, and connect invoice and Finance workflows in three steps.</p><p className="mt-2 text-xs text-muted-foreground">{gettingStarted.reviewedCount} of 3 steps reviewed · progress is saved for this entity in this browser</p></div><Button asChild><Link to="/procurement/getting-started">{gettingStarted.reviewedCount === 3 ? "Open guide" : "Get started"}</Link></Button></div>
      </section> : null}

      {role === "proc_admin" ? <div className="mb-4"><Button size="sm" variant="outline" onClick={() => { if (window.confirm("Reset all Procurement demo transactions to their starting data?")) { resetProcurement(); resetCommercial(); resetPayables(); resetPlans(); resetCatalog(); } }}>Reset Procurement demo</Button></div> : null}

      {view === "auditor" ? (
        <AuditorHome />
      ) : (
        <div className="space-y-8">
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
              items.length ? (
                <WorkQueue items={visibleQueueItems(items)} />
              ) : (
                <EmptyState
                  title={view === "requester" ? "You haven't asked for anything yet" : "Nothing needs you right now"}
                  body={view === "requester" ? "Start a request for goods, a service or a subscription. You'll see its status and next step here." : "New exceptions, approvals and tasks will appear here."}
                />
              )
            }
          </Async>
        </div>
      )}
    </AppShell>
  );
}

function AuditorHome() {
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
              <li key={a.when} className="px-4 py-3 text-sm">
                <span className="font-medium">{a.what}</span>
                <span className="block text-xs text-muted-foreground">{a.who} · {a.when}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No activity matches “{q}”.</p>
        )}
      </section>
    </div>
  );
}
