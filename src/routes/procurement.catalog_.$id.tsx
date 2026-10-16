import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { useState } from "react";
import { useApp } from "@/platform/app-context";
import { internalRole, requesterRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { isExpired, money, useCatalog } from "@/modules/procurement/catalog";
import { CatalogItemEditor } from "@/modules/procurement/CatalogItemEditor";
import { useProcurement } from "@/modules/procurement/store";

export const Route = createFileRoute("/procurement/catalog_/$id")({
  head: () => ({ meta: [{ title: "Catalog item — Meridian ERP" }, { name: "description", content: "Procurement catalog item" }] }),
  component: ItemDetail,
});

function ItemDetail() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const catalogItems = useCatalog();
  const [editing, setEditing] = useState(false);
  const procurement = useProcurement();
  const suppliers = procurement.suppliers;
  const i = catalogItems.find((x) => x.id === id);
  if (!i || !internalRole(role) || !i.entities.some((entity) => sameEntity(entity, entityId))) return <AppShell><RestrictedState /></AppShell>;
  const offer = i.offers.find((candidate) => !isExpired(candidate) && suppliers.some((supplier) => supplier.name === candidate.supplier && supplier.status === "Active"));
  const canRequest = i.status === "Active" && !i.block && !!offer;
  const relatedRequests = procurement.requests.filter((request) =>
    procurement.metadata[request.id]?.lines.some((line) => line.catalogItemId === i.id) &&
    sameEntity(procurement.metadata[request.id]?.entity, entityId),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Catalog · ${i.kind}`}
        title={i.name}
        description={`${i.category} · per ${i.unit} · ${i.status}`}
        primaryAction={
          requesterRole(role) ? canRequest ? <Button asChild><Link to="/procurement/requests/new" search={{ item: i.id }}>Request this item</Link></Button> : <Button disabled>Can't be requested</Button> : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {i.status === "Inactive" ? <Notice tone="warning">This item is no longer available. Choose another item or make a new request.</Notice> : null}
          {i.block ? <Notice tone="warning">{i.block}</Notice> : null}
          {!i.block && i.status === "Active" && !offer ? <Notice tone="warning">There is no current price from an approved vendor. Ask the buying team to update it.</Notice> : null}

          {(["buyer", "proc_admin"].includes(role)) ? <div className="flex gap-2"><Button variant="outline" onClick={() => setEditing((value) => !value)}>{editing ? "Close form" : "Edit item"}</Button><Button variant="ghost" asChild><Link to="/procurement/catalog">Back to catalog</Link></Button></div> : null}
          {editing ? <CatalogItemEditor key={`${i.id}-${i.versions[0]?.version}`} item={i} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} /> : null}

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Vendor prices</h2>
            {i.offers.length ? (
              <ul className="mt-3 divide-y text-sm">
                {i.offers.map((o) => (
                  <li key={o.supplier} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{o.supplier}</span>{o.preferred ? <span className="ml-2 rounded-full bg-primary-soft px-2 text-xs text-primary">Preferred</span> : null}
                      <span className="block text-xs text-muted-foreground">{o.source} · delivery in {o.leadTimeDays} days · price valid until {o.validTo}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      {money(o.price, o.currency)}
                      {isExpired(o) ? <span className="block text-xs text-warning">Expired — buyer must confirm price</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">No prices yet.</p>}
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Change history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {i.versions.map((v) => <li key={v.version}><span className="font-medium">v{v.version}</span> · {v.change}<span className="block text-xs text-muted-foreground">{v.by} · {v.date}</span></li>)}
            </ul>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Purchase requests for this item</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only requests linked by item ID appear here. Older requests without that link remain on the requests page.</p>
            {relatedRequests.length ? <ul className="mt-3 divide-y text-sm">{relatedRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/procurement/requests/$id" params={{ id: request.id }}>{request.id} · {request.title}</Link>
                <span className="text-muted-foreground">{request.status}</span>
              </li>
            ))}</ul> : <p className="mt-3 text-sm text-muted-foreground">No linked requests yet.</p>}
          </section>
        </div>

        <aside className="h-fit rounded-lg border bg-surface p-4 text-sm">
          <h2 className="font-semibold">Details</h2>
          <dl className="mt-3 space-y-2">
            <Row k="Description" v={i.spec} />
            <Row k="Available to" v={i.entities.join(", ")} />
            <Row k="Tax code" v={i.taxRef} />
            <Row k="Available from" v={`${i.activeFrom} → ${i.activeTo ?? "no end date"}`} />
          </dl>
          {i.authoritativeOwner ? (
            <p className="mt-3 flex gap-2 rounded-md bg-info-soft p-2 text-xs"><Info className="size-4 shrink-0" aria-hidden />{i.authoritativeOwner} manages this item type. Stock levels are shown in Inventory.</p>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}

function Notice({ children }: { tone: "warning"; children: React.ReactNode }) {
  return <p role="note" className="flex gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />{children}</p>;
}
