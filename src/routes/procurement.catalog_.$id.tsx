import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { useApp } from "@/platform/app-context";
import { internalRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { catalogItems, isExpired, money } from "@/modules/procurement/catalog";

export const Route = createFileRoute("/procurement/catalog_/$id")({
  head: () => ({ meta: [{ title: "Catalog item — Meridian ERP" }, { name: "description", content: "Procurement catalog item" }] }),
  component: ItemDetail,
});

function ItemDetail() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const i = catalogItems.find((x) => x.id === id);
  if (!i || !internalRole(role) || !i.entities.some((entity) => sameEntity(entity, entityId))) return <AppShell><RestrictedState /></AppShell>;
  if (!i) {
    return (
      <AppShell>
        <EmptyState title="Item not found" body="It may have been removed from the catalog." action={<Button variant="outline" asChild><Link to="/procurement/catalog">Back to catalog</Link></Button>} />
      </AppShell>
    );
  }
  const canRequest = i.status === "Active" && !i.block;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Catalog · ${i.kind}`}
        title={i.name}
        description={`${i.category} · per ${i.unit} · ${i.status}`}
        primaryAction={
          canRequest ? <Button asChild><Link to="/procurement/requests/new">Request this item</Link></Button> : <Button disabled>Can't be requested</Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {i.status === "Inactive" ? <Notice tone="warning">Inactive since {i.activeTo}. Choose a current item or request a non-catalog item with a reason.</Notice> : null}
          {i.block ? <Notice tone="warning">{i.block}</Notice> : null}

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Supplier offers</h2>
            {i.offers.length ? (
              <ul className="mt-3 divide-y text-sm">
                {i.offers.map((o) => (
                  <li key={o.supplier} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{o.supplier}</span>{o.preferred ? <span className="ml-2 rounded-full bg-primary-soft px-2 text-xs text-primary">Preferred</span> : null}
                      <span className="block text-xs text-muted-foreground">{o.source} · lead time {o.leadTimeDays} days · valid to {o.validTo}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      {money(o.price, o.currency)}
                      {isExpired(o) ? <span className="block text-xs text-warning">Expired — buyer must confirm price</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">No current offers.</p>}
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Change history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {i.versions.map((v) => <li key={v.version}><span className="font-medium">v{v.version}</span> · {v.change}<span className="block text-xs text-muted-foreground">{v.by} · {v.date}</span></li>)}
            </ul>
          </section>
        </div>

        <aside className="h-fit rounded-lg border bg-surface p-4 text-sm">
          <h2 className="font-semibold">Details</h2>
          <dl className="mt-3 space-y-2">
            <Row k="Specification" v={i.spec} />
            <Row k="Eligible entities" v={i.entities.join(", ")} />
            <Row k="Tax reference" v={i.taxRef} />
            <Row k="Active" v={`${i.activeFrom} → ${i.activeTo ?? "open"}`} />
          </dl>
          {i.authoritativeOwner ? (
            <p className="mt-3 flex gap-2 rounded-md bg-info-soft p-2 text-xs"><Info className="size-4 shrink-0" aria-hidden />Classification is owned by {i.authoritativeOwner}. Stock on hand isn't shown here.</p>
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
