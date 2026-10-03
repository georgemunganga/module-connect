import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deriveProgress, reqMeta } from "@/modules/procurement/requisition";
import { procApi } from "@/modules/procurement/data";
import type { PurchaseRequest } from "@/modules/procurement/types";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { useMock } from "@/platform/use-mock";

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
  const state = useMock(() => procApi.purchaseRequests());
  const [view, setView] = useState("all");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Purchasing"
        title="Purchase requests"
        description="Nothing here is a bare status: each row shows who owns it, what happens next and when it's due."
        primaryAction={<Button asChild><Link to="/procurement/requests/new">Create request</Link></Button>}
      />
      <Async state={state}>
        {(rows) => (
          <ListPage<PurchaseRequest>
            rows={rows.filter((r) => (view === "open" ? !["Approved", "Rejected", "Cancelled"].includes(r.status) : view === "mine" ? r.requester.startsWith("Amara") : true))}
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
              { id: "entity", label: "Entity", options: ["Meridian Netherlands B.V.", "Meridian Kenya Ltd"], match: (r, v) => reqMeta[r.id]?.entity === v },
              { id: "category", label: "Category", options: ["IT hardware", "Safety equipment", "Furniture", "Logistics", "Office supplies"], match: (r, v) => reqMeta[r.id]?.category === v },
              { id: "exception", label: "Exception", options: ["Any exception", "Insufficient balance", "Concurrent conversion", "Supplier not onboarded", "Supplier on hold"], match: (r, v) => { const ex = reqMeta[r.id]?.exceptions ?? []; return v === "Any exception" ? ex.length > 0 : ex.includes(v); } },
            ]}
            bulkActions={[{ label: "Export selection", onSelect: () => undefined }]}
            columns={[
              { id: "ref", header: "Reference", cell: (r) => <Link to="/procurement/requests/$id" params={{ id: r.id }} className="font-mono text-xs text-primary underline underline-offset-2">{r.id}</Link> },
              { id: "title", header: "Title", cell: (r) => <span className="block max-w-64 truncate">{r.title}</span> },
              { id: "dept", header: "Department", cell: (r) => r.department },
              { id: "amount", header: "Amount", cell: (r) => <span className="tabular">{fmt(r)}</span> },
              { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { id: "next", header: "Next action", cell: (r) => <span className="block max-w-56 truncate text-xs">{r.nextAction} · due {r.dueDate}</span> },
              { id: "progress", header: "Line progress", cell: (r) => <span className="text-xs">{deriveProgress(reqMeta[r.id]?.lines ?? [])}</span> },
              { id: "owner", header: "Owner", defaultVisible: false, cell: (r) => r.owner },
              { id: "requester", header: "Requester", defaultVisible: false, cell: (r) => r.requester },
              { id: "date", header: "Submitted", defaultVisible: false, cell: (r) => r.submittedAt },
              { id: "needed", header: "Needed by", defaultVisible: false, cell: (r) => r.neededBy },
            ]}
          />
        )}
      </Async>
    </AppShell>
  );
}
