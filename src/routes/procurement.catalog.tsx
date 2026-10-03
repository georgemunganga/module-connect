import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/platform/app-context";
import { internalRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { NoResultsState } from "@/platform/components/States";
import { bestOffer, catalogItems, isExpired, money } from "@/modules/procurement/catalog";
import type { ItemKind } from "@/modules/procurement/catalog";

type Search = { q?: string; kind?: string; entity?: string };

export const Route = createFileRoute("/procurement/catalog")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
    kind: typeof s.kind === "string" ? s.kind : undefined,
    entity: typeof s.entity === "string" ? s.entity : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catalog — Meridian ERP Procurement" },
      { name: "description", content: "Search approved items, services and contract offers with price, lead time and eligibility." },
      { property: "og:title", content: "Catalog — Meridian ERP Procurement" },
      { property: "og:description", content: "Approved items and contract offers, ready to request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

const kinds: ItemKind[] = ["Goods", "Service", "Asset", "Consumable", "Subscription"];
const entities = ["Meridian Netherlands B.V.", "Meridian GmbH", "Meridian Kenya Ltd"];
const MAINTAINERS = ["buyer", "proc_admin"];

function CatalogPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { role, entityId } = useApp();
  const maintainer = MAINTAINERS.includes(role);
  const [view, setView] = useState<"browse" | "manage">("browse");
  const setS = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }), replace: true });

  const rows = useMemo(
    () =>
      catalogItems.filter(
        (i) =>
          (view === "manage" || i.status === "Active") &&
          i.entities.some((entity) => sameEntity(entity, entityId)) &&
          (!search.kind || i.kind === search.kind) &&
          (!search.entity || i.entities.includes(search.entity)) &&
          (i.name + i.category + i.spec).toLowerCase().includes((search.q ?? "").toLowerCase()),
      ),
    [search, view, entityId],
  );

  if (!internalRole(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Catalog"
        description="Approved items and contract offers. Prices are indicative unless marked Contract."
        primaryAction={<Button asChild><Link to="/procurement/requests/new">Create request</Link></Button>}
      />
      {maintainer ? (
        <div role="tablist" aria-label="Catalog view" className="mb-4 inline-flex rounded-md border p-1">
          {(["browse", "manage"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground"}`}>
              {v === "browse" ? "Browse" : "Manage items"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="q">Search</Label><Input id="q" className="mt-1" value={search.q ?? ""} placeholder="Item, category or spec" onChange={(e) => setS({ q: e.target.value || undefined })} /></div>
        <div>
          <Label htmlFor="k">Type</Label>
          <select id="k" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={search.kind ?? ""} onChange={(e) => setS({ kind: e.target.value || undefined })}>
            <option value="">All types</option>{kinds.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="e">Eligible for entity</Label>
          <select id="e" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={search.entity ?? ""} onChange={(e) => setS({ entity: e.target.value || undefined })}>
            <option value="">All entities</option>{entities.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
      </div>

      {!rows.length ? (
        <NoResultsState title="No items match" body="Try fewer filters. If nothing fits, you can request a non-catalog item with a reason." action={<Button variant="outline" asChild><Link to="/procurement/requests/new">Request non-catalog item</Link></Button>} />
      ) : view === "manage" ? (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Item</th><th className="p-3">Category / unit</th><th className="p-3">Tax ref.</th><th className="p-3">Offers</th><th className="p-3">Active</th><th className="p-3">Owner</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="p-3"><Link to="/procurement/catalog/$id" params={{ id: i.id }} className="font-medium text-primary underline-offset-2 hover:underline">{i.name}</Link><span className="block text-xs text-muted-foreground">v{i.versions[0].version} · {i.status}</span></td>
                  <td className="p-3">{i.category} · {i.unit}</td>
                  <td className="p-3">{i.taxRef}</td>
                  <td className="p-3">{i.offers.length}</td>
                  <td className="p-3">{i.activeFrom}{i.activeTo ? ` → ${i.activeTo}` : " → open"}</td>
                  <td className="p-3 text-xs">{i.authoritativeOwner ?? "Procurement"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i) => {
            const o = bestOffer(i);
            return (
              <li key={i.id}>
                <Link to="/procurement/catalog/$id" params={{ id: i.id }} className="flex h-full flex-col rounded-lg border bg-surface p-4 transition-colors hover:border-border-strong">
                  <span className="text-xs text-muted-foreground">{i.kind} · {i.category}</span>
                  <span className="mt-1 font-medium">{i.name}</span>
                  <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.spec}</span>
                  {o ? (
                    <span className="mt-3 text-sm">
                      <strong className="tabular-nums">{money(o.price, o.currency)}</strong> / {i.unit} · {o.source}
                      <span className="block text-xs text-muted-foreground">{o.supplier} · {o.leadTimeDays ? `${o.leadTimeDays} days` : "same day"}{i.offers.length > 1 ? ` · ${i.offers.length} offers` : ""}</span>
                    </span>
                  ) : null}
                  {o && isExpired(o) ? <span className="mt-2 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden />Price expired {o.validTo}</span> : null}
                  {i.block ? <span className="mt-2 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden />Restricted — see details</span> : null}
                  <span className="mt-auto flex justify-end pt-2"><ChevronRight className="size-4 text-muted-foreground" aria-hidden /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
