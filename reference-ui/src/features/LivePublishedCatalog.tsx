import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Input, PageHeader, Panel } from "../components/ui";
import { StandardDataTable } from "../components/data/StandardDataTable";
import type { ListColumn } from "../components/data/ListTools";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { listPublishedCatalog, type PublishedCatalogPage, type PublishedCatalogPrice } from "../../../src/platform/procurement-catalog-api";

const columns: ListColumn[] = [
  { key: "name", label: "Item" }, { key: "code", label: "Code" },
  { key: "kind", label: "Type" }, { key: "supplier", label: "Vendor" },
  { key: "price", label: "Price" },
];

/** Employee view: only the server's published, eligible catalog prices. */
export function LivePublishedCatalog() {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness) throw new Error("Catalog requires ERP company context.");
  const company = readiness.legalEntityId;
  const canRead = readiness.permissions.includes("procurement-item-read") && readiness.capabilities.itemDraft === true;
  const canCreateRequest = !readiness.adminViewOnly && readiness.permissions.includes("procurement-request-create") && readiness.capabilities.requestDraft === true;
  const scopeKey = `${readiness.tenantId}:${company}:${selection.entityId ?? ""}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}:${readiness.permissions.slice().sort().join("|")}:${readiness.capabilities.itemDraft}:${readiness.capabilities.requestDraft}`;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ scopeKey: string; data: PublishedCatalogPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ scopeKey: string; message: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setLoading(true); setError(null); setSelected([]);
    if (!canRead || selection.entityId && selection.entityId !== company) return () => controller.abort();
    listPublishedCatalog(company, search, controller.signal, page)
      .then(data => { if (!controller.signal.aborted) setResult({ scopeKey, data }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError({ scopeKey, message: cause instanceof Error ? cause.message : "Catalog unavailable." }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, scopeKey, canRead, selection.entityId, search, page]);
  const data = result?.scopeKey === scopeKey ? result.data : null;
  const visibleError = error?.scopeKey === scopeKey ? error.message : "";
  const viewLoading = loading || result?.scopeKey !== scopeKey && !visibleError;
  if (selection.entityId && selection.entityId !== company) return <p role="status">Checking the selected company…</p>;
  if (!canRead) return <div className="p-5 sm:p-8" role="alert">The approved item catalog is unavailable for your account.</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title="Items" subtitle="Find approved goods and services available for your company."
      actions={canCreateRequest ? <Link to="/requests/new"><Button>New request</Button></Link> : undefined} />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-md gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <Input aria-label="Search approved items" placeholder="Search item name or code" value={query} onChange={event => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {visibleError && <p role="alert" className="mb-4 text-sm text-destructive">{visibleError}</p>}
      {viewLoading ? <p role="status">Loading approved items…</p> : data?.items.length ? <StandardDataTable
        rows={data.items.map(item => ({ ...item, id: item.entryId }))} columns={columns} visibleColumns={columns.map(column => column.key)}
        selected={selected} onSelectedChange={setSelected} rowLabel={item => item.name}
        renderCell={(item: PublishedCatalogPrice, column) => column.key === "price"
          ? `${item.currencyCode} ${item.estimatedUnitPrice.toLocaleString()} / ${item.unitCode}`
          : column.key === "supplier" ? item.supplierName
            : column.key === "name" ? item.name : column.key === "code" ? item.code : item.kind}
      /> : !visibleError ? <EmptyState title="No approved items found" description="Search again or make a request for something else." action={canCreateRequest ? <Link to="/requests/new"><Button>New request</Button></Link> : undefined} /> : null}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
        <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</Button>
      </div>}
    </div></Panel>
  </div>;
}
