import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

const areas: Record<string, { title: string; body: string; milestone: string }> = {
  catalog: { title: "Catalog", body: "Search approved items and contract offers before raising a request.", milestone: "Milestone 03" },
  deliveries: { title: "My orders & deliveries", body: "Track what you ordered, what has been received and what still needs confirming.", milestone: "Milestone 12" },
  sourcing: { title: "Sourcing", body: "Requests for quotation, bids and award decisions.", milestone: "Milestones 08–09" },
  contracts: { title: "Contracts", body: "Contracts and frameworks with call-off limits and renewal dates.", milestone: "Milestone 10" },
  purchasing: { title: "Purchasing", body: "Purchase orders, amendments and receiving progress.", milestone: "Milestone 11" },
  invoices: { title: "Invoices", body: "Invoice intake, matching exceptions and handoff to Accounts Payable.", milestone: "Milestones 13–14" },
  reports: { title: "Reports", body: "Spend, cycle-time and supplier reports by currency and entity.", milestone: "Milestone 16" },
};

export const Route = createFileRoute("/procurement/area/$area")({
  head: ({ params }) => {
    const a = areas[params.area];
    const title = `${a?.title ?? "Area"} — Meridian ERP Procurement`;
    const description = a?.body ?? "Procurement work area.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: AreaPage,
});

function AreaPage() {
  const { area } = Route.useParams();
  const a = areas[area];
  return (
    <AppShell>
      <PageHeader eyebrow="Procurement" title={a?.title ?? "Not found"} description={a?.body} />
      <EmptyState
        title={a ? "Not set up yet" : "This area doesn't exist"}
        body={a ? `This area arrives in ${a.milestone}. Nothing here is live yet.` : "Check the link or go back to Home."}
        action={
          <Button asChild variant="outline">
            <Link to="/procurement">Back to Home</Link>
          </Button>
        }
      />
    </AppShell>
  );
}
