import { FormSelect } from "@/components/ui/form-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Package, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/platform/app-context";
import { internalRole, procurementEntityName, requesterRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { DataExportButton } from "@/platform/components/DataTransfer";
import { ListPage } from "@/platform/components/ListPage";
import { downloadCsv } from "@/platform/data-transfer";
import { EmptyState, NoResultsState } from "@/platform/components/States";
import { bestOffer, catalogEntities, isExpired, money, useCatalog } from "@/modules/procurement/catalog";
import { CatalogItemEditor } from "@/modules/procurement/CatalogItemEditor";
import { itemExportRows, itemFields } from "@/modules/procurement/data-transfer";
import type { CatalogItem, ItemKind } from "@/modules/procurement/catalog";

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
const MAINTAINERS = ["buyer", "proc_admin"];

function CatalogPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { role, entityId } = useApp();
  const catalogItems = useCatalog();
  const maintainer = MAINTAINERS.includes(role);
  const [view, setView] = useState<"browse" | "manage">("browse");
  const [adding, setAdding] = useState(false);
  const setS = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }), replace: true });

  const rows = useMemo(
    () =>
      catalogItems.filter(
        (i) =>
          (view === "manage" || i.status === "Active") &&
          i.entities.some((entity) => sameEntity(entity, entityId)) &&
          (view === "manage" || (
            (!search.kind || i.kind === search.kind) &&
            (!search.entity || i.entities.includes(search.entity)) &&
            (i.name + i.category + i.spec).toLowerCase().includes((search.q ?? "").toLowerCase())
          )),
      ),
    [search, view, entityId, catalogItems],
  );

  if (!internalRole(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Catalog"
        description="Find goods and services you can request. Prices are estimates unless shown as contract prices."
        primaryAction={requesterRole(role) ? <Button asChild><Link to="/procurement/requests/new" search={{ item: undefined }}>Create request</Link></Button> : undefined}
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

      {maintainer && view === "manage" ? <div className="mb-4 flex flex-wrap gap-2"><Button onClick={() => setAdding(true)}>Add item</Button><Button variant="outline" asChild><Link to="/procurement/catalog/import"><Upload className="size-4" aria-hidden />Import items</Link></Button><DataExportButton fileName="items.csv" fields={itemFields} rows={itemExportRows(procurementEntityName(entityId))} label="Export items CSV" /></div> : null}
      {adding ? <div className="mb-5"><CatalogItemEditor onSaved={(id) => navigate({ to: "/procurement/catalog/$id", params: { id } })} onCancel={() => setAdding(false)} /></div> : null}

      {view === "browse" ? <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="q">Search</Label><Input id="q" className="mt-1" value={search.q ?? ""} placeholder="Item name, type or details" onChange={(e) => setS({ q: e.target.value || undefined })} /></div>
        <div>
          <Label htmlFor="k">Type</Label>
          <FormSelect id="k" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={search.kind ?? ""} onChange={(e) => setS({ kind: e.target.value || undefined })}>
            <option value="">All types</option>{kinds.map((k) => <option key={k}>{k}</option>)}
          </FormSelect>
        </div>
        <div>
          <Label htmlFor="e">Company</Label>
          <FormSelect id="e" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={search.entity ?? ""} onChange={(e) => setS({ entity: e.target.value || undefined })}>
            <option value="">All entities</option>{catalogEntities.map((k) => <option key={k}>{k}</option>)}
          </FormSelect>
        </div>
      </div> : null}

      {!rows.length && !search.q && !search.kind && !search.entity ? (
        <EmptyState title="No items yet" body="Add goods or services so employees can find and request them here." icon={<Package className="size-10" aria-hidden />} action={maintainer ? <Button onClick={() => { setView("manage"); setAdding(true); }}>Add item</Button> : requesterRole(role) ? <Button variant="outline" asChild><Link to="/procurement/requests/new" search={{ item: undefined }}>Request something else</Link></Button> : undefined} />
      ) : !rows.length ? (
        <NoResultsState title="No matching items" body="Try a different search or request an item that is not listed." action={requesterRole(role) ? <Button variant="outline" asChild><Link to="/procurement/requests/new" search={{ item: undefined }}>Request something else</Link></Button> : undefined} />
      ) : view === "manage" ? (
        <ListPage<CatalogItem>
          rows={rows}
          searchPlaceholder="Search item name, type or details"
          searchFields={(item) => `${item.name} ${item.kind} ${item.category} ${item.spec} ${item.taxRef} ${item.status}`}
          filters={[
            { id: "kind", label: "Type", options: kinds, match: (item, value) => item.kind === value },
            { id: "status", label: "Status", options: ["Active", "Inactive"], match: (item, value) => item.status === value },
          ]}
          sortOptions={[
            { id: "name", label: "Item name", value: (item) => item.name },
            { id: "category", label: "Category", value: (item) => item.category },
            { id: "status", label: "Status", value: (item) => item.status },
            { id: "from", label: "Available from", value: (item) => item.activeFrom },
          ]}
          columns={[
            { id: "name", header: "Item", cell: (item) => <Link to="/procurement/catalog/$id" params={{ id: item.id }} className="font-medium text-primary hover:underline">{item.name}</Link> },
            { id: "kind", header: "Type", cell: (item) => item.kind },
            { id: "category", header: "Category", cell: (item) => item.category },
            { id: "unit", header: "Unit", cell: (item) => item.unit },
            { id: "status", header: "Status", cell: (item) => item.status },
            { id: "tax", header: "Tax code", cell: (item) => item.taxRef },
            { id: "prices", header: "Prices", cell: (item) => String(item.offers.length) },
            { id: "from", header: "Available from", defaultVisible: false, cell: (item) => item.activeFrom },
            { id: "owner", header: "Managed by", defaultVisible: false, cell: (item) => item.authoritativeOwner ?? "Procurement" },
          ]}
          onExport={(scope, selectedRows, visibleColumns) => downloadCsv(
            `items-${scope}.csv`,
            visibleColumns.map((column) => ({ key: column.id, label: column.header })),
            selectedRows.map((item) => ({
              name: item.name, kind: item.kind, category: item.category, unit: item.unit,
              status: item.status, tax: item.taxRef, prices: String(item.offers.length),
              from: item.activeFrom, owner: item.authoritativeOwner ?? "Procurement",
            })),
          )}
          rowHref={(item) => <Link to="/procurement/catalog/$id" params={{ id: item.id }} className="text-primary hover:underline">Open<span className="sr-only"> {item.name}</span></Link>}
        />
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
