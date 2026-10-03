import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { useProcurement } from "@/modules/procurement/store";
import { sourcingRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import type { SourcingEvent } from "@/modules/procurement/sourcing";

export const Route = createFileRoute("/procurement/sourcing")({
  head: () => ({
    meta: [
      { title: "Sourcing — Meridian ERP Procurement" },
      { name: "description", content: "Sourcing events: RFQ, RFP and tenders with invitations, Q&A and sealed responses." },
      { property: "og:title", content: "Sourcing — Meridian ERP Procurement" },
      { property: "og:description", content: "Run quote requests and tenders with sealed bids." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcingQueue,
});

function SourcingQueue() {
  const { role, entityId } = useApp();
  const events = useProcurement().sourcing.filter((event) => sameEntity(event.entity, entityId));
  if (!sourcingRole(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Sourcing"
        title="Sourcing events"
        description="Bids stay sealed until the authorised opening. Only receipt details are shown before then."
        primaryAction={role === "buyer" || role === "proc_admin" ? <Button asChild><Link to="/procurement/sourcing/new" search={{ requestId: undefined, lineId: undefined }}>Create event</Link></Button> : undefined}
      />
      <ListPage<SourcingEvent>
        rows={events}
        emptyState={{ title: "No sourcing events yet", body: "Create an RFQ, RFP or tender from approved demand. Supplier invitations and responses will appear here.", icon: <FileSearch className="size-10" aria-hidden />, action: role === "buyer" || role === "proc_admin" ? <Button asChild><Link to="/procurement/sourcing/new" search={{ requestId: undefined, lineId: undefined }}>Create event</Link></Button> : undefined }}
        searchPlaceholder="Search reference or title"
        searchFields={(e) => `${e.id} ${e.title}`}
        filters={[
          { id: "state", label: "Status", options: ["Draft", "Pending approval", "Published", "Closed", "Cancelled", "Reopened"], match: (e, v) => e.state === v },
          { id: "method", label: "Method", options: ["RFQ", "RFP", "Tender", "Direct", "Single source", "Emergency"], match: (e, v) => e.method === v },
        ]}
        columns={[
          { id: "ref", header: "Reference", cell: (e) => <Link to="/procurement/sourcing/$id" params={{ id: e.id }} className="font-mono text-xs text-primary underline underline-offset-2">{e.id}</Link> },
          { id: "title", header: "Title", cell: (e) => <span className="block max-w-64 truncate">{e.title}</span> },
          { id: "method", header: "Method", cell: (e) => e.method },
          { id: "state", header: "Status", cell: (e) => <StatusBadge status={e.state} /> },
          { id: "closes", header: "Closes", cell: (e) => (e.closesAt ? `${e.closesAt} (${e.timeZone})` : "Not set") },
          { id: "responses", header: "Responses", cell: (e) => `${e.bids.length} received` },
          { id: "next", header: "Next action", cell: (e) => <span className="block max-w-56 truncate text-xs">{e.nextAction} · due {e.dueDate}</span> },
        ]}
      />
    </AppShell>
  );
}
