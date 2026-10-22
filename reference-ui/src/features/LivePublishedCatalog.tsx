import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Input, PageHeader, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { listPublishedCatalog, type PublishedCatalogPage } from "../../../src/platform/procurement-catalog-api";

/** Employee view: only the server's published, eligible catalog prices. */
export function LivePublishedCatalog() {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness) throw new Error("Catalog requires ERP company context.");
  const company = readiness.legalEntityId;
  const scopeKey = `${company}:${selection.branch ?? ""}`;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ scopeKey: string; data: PublishedCatalogPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setLoading(true); setError("");
    listPublishedCatalog(company, search, controller.signal, page)
      .then(data => { if (!controller.signal.aborted) setResult({ scopeKey, data }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Catalog unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, scopeKey, search, page]);
  const data = result?.scopeKey === scopeKey ? result.data : null;
  return <div className="p-5 sm:p-8">
    <PageHeader title="Items" subtitle="Find approved goods and services available for your company." />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-md gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <Input aria-label="Search approved items" placeholder="Search item name or code" value={query} onChange={event => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading approved items…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Item</th><th>Code</th><th>Type</th><th>Vendor</th><th>Price</th><th>Action</th></tr></thead>
        <tbody>{data.items.map(item => <tr key={item.entryId}>
          <td>{item.name}</td><td>{item.code}</td><td>{item.kind}</td><td>{item.supplierName}</td>
          <td>{item.currencyCode} {item.estimatedUnitPrice.toLocaleString()} / {item.unitCode}</td>
          <td><Link className="text-sm font-medium text-primary hover:underline" to="/requests/new">Request item</Link></td>
        </tr>)}</tbody>
      </RecordTable></div> : !error ? <EmptyState title="No approved items found" description="Search again or make a request for something else." action={<Link to="/requests/new"><Button>New request</Button></Link>} /> : null}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
        <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</Button>
      </div>}
    </div></Panel>
  </div>;
}
