import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveProgress } from "@/modules/procurement/requisition";
import { useProcurement } from "@/modules/procurement/store";
import { requestVisible, requesterRole, demoRequester } from "@/modules/procurement/access";
import { useApp } from "@/platform/app-context";
import type { PurchaseRequest } from "@/modules/procurement/types";
import { AppShell } from "@/platform/components/AppShell";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RestrictedState } from "@/platform/components/States";

export const Route = createFileRoute("/procurement/requests")({
  head: () => ({
    meta: [
      { title: "Purchase requests — Meridian ERP Procurement" },
      { name: "description", content: "Every purchase request with status, owner, next action and due date." },
      { property: "og:title", content: "Purchase requests — Meridian ERP Procurement" },
      { property: "og:description", content: "Every purchase request with status, owner, next action and due date." },
    ],
  }),
  component: RequestList,
});

const fmt = (r: PurchaseRequest) =>
  new Intl.NumberFormat("en", { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(r.amount);

function RequestList() {
  const { role, entityId } = useApp();
  const { requests, metadata } = useProcurement();
  const [view, setView] = useState("all");

  if (role === "supplier_user") return <AppShell><RestrictedState /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Purchasing"
        title="Purchase requests"
        description="See what you asked for, who is handling it, and what happens next."
        primaryAction={requesterRole(role) ? <Button asChild><Link to="/procurement/requests/new" search={{ item: undefined }}>Create request</Link></Button> : undefined}
      />
          <ListPage<PurchaseRequest>
            rows={requests.filter((r) => requestVisible(role, entityId, metadata[r.id]?.entity, r.requester, r.department)).filter((r) => (view === "open" ? !["Approved", "Rejected", "Cancelled"].includes(r.status) : view === "mine" ? r.requester === demoRequester(role, entityId) : true))}
            emptyState={{ title: view === "all" ? "No purchase requests yet" : `No requests in ${view === "mine" ? "My requests" : "Awaiting action"}`, body: "Start with a request for the goods or services your team needs. Its approval and buying progress will appear here.", icon: <ClipboardList className="size-10" aria-hidden />, action: requesterRole(role) ? <Button asChild><Link to="/procurement/requests/new" search={{ item: undefined }}>Create request</Link></Button> : undefined }}
            savedViews={[
              { id: "all", label: "All requests" },
              { id: "open", label: "Awaiting action" },
              { id: "mine", label: "My requests" },
            ]}
            activeView={view}
            onViewChange={setView}
            searchPlaceholder="Search reference, title or requester"
            searchFields={(r) => `${r.id} ${r.title} ${r.requester} ${r.department}`}
            filters={[
              { id: "dept", label: "Department", options: ["Engineering", "Operations", "Facilities", "Logistics", "People"], match: (r, v) => r.department === v },
              { id: "status", label: "Status", options: ["Draft", "Submitted", "In review", "Approved", "Returned"], match: (r, v) => r.status === v },
              { id: "entity", label: "Entity", options: ["Meridian Netherlands B.V.", "Meridian Kenya Ltd"], match: (r, v) => metadata[r.id]?.entity === v },
              { id: "category", label: "Category", options: ["IT hardware", "Safety equipment", "Furniture", "Logistics", "Office supplies"], match: (r, v) => metadata[r.id]?.category === v },
              { id: "exception", label: "Exception", options: ["Any exception", "Insufficient balance", "Concurrent conversion", "Supplier not onboarded", "Supplier on hold"], match: (r, v) => { const ex = metadata[r.id]?.exceptions ?? []; return v === "Any exception" ? ex.length > 0 : ex.includes(v); } },
            ]}
            columns={[
              { id: "ref", header: "Reference", cell: (r) => <Link to="/procurement/requests/$id" params={{ id: r.id }} className="font-mono text-xs text-primary underline underline-offset-2">{r.id}</Link> },
              { id: "title", header: "Title", cell: (r) => <span className="block max-w-64 truncate">{r.title}</span> },
              { id: "dept", header: "Department", cell: (r) => r.department },
              { id: "amount", header: "Amount", cell: (r) => <span className="tabular">{fmt(r)}</span> },
              { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { id: "next", header: "Next action", cell: (r) => <span className="block max-w-56 truncate text-xs">{r.nextAction} · due {r.dueDate}</span> },
              { id: "progress", header: "Buying progress", cell: (r) => <span className="text-xs">{deriveProgress(metadata[r.id]?.lines ?? [])}</span> },
              { id: "owner", header: "Owner", defaultVisible: false, cell: (r) => r.owner },
              { id: "requester", header: "Requester", defaultVisible: false, cell: (r) => r.requester },
              { id: "date", header: "Submitted", defaultVisible: false, cell: (r) => r.submittedAt },
              { id: "needed", header: "Needed by", defaultVisible: false, cell: (r) => r.neededBy },
            ]}
          />
    </AppShell>
  );
}
