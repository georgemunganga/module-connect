import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Search, Eye } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Panel, Select } from "../ui";
import { ListTools, type ListColumn, type ListFilterField } from "./ListTools";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { StandardDataTable } from "./StandardDataTable";

export type DirectoryRow = { id: string; number: string; title: string; status: string; path: string; fields: Record<string, string> };
export type DirectoryServerQuery = { search: string; onSearch: (value: string) => void;
  status?: string; statuses?: ReadonlyArray<{ value: string; label: string }>;
  onStatusChange?: (value: string) => void };
export type DirectorySortComparators = Record<string, (left: DirectoryRow, right: DirectoryRow) => number>;
/** Shared imported directory presentation. The adapter owns server scope, paging and all mutations. */
export function LiveRecordDirectory({ title, subtitle, entity, rows, columns, loading, error, total, page, pageSize,
  onPage, onRefresh, action, emptyTitle, emptyDescription, tabs = false, serverQuery, sortComparators, contextControls, initialSort }: {
  title: string; subtitle: string; entity: string; rows: DirectoryRow[]; columns: ListColumn[];
  loading: boolean; error: string; total: number; page: number; pageSize: number;
  onPage: (page: number) => void; onRefresh: () => void; action?: ReactNode;
  emptyTitle: string; emptyDescription: string; tabs?: boolean; serverQuery?: DirectoryServerQuery;
  sortComparators?: DirectorySortComparators; contextControls?: ReactNode; initialSort?: string;
}) {
  const [query, setQuery] = useState(""), [serverInput, setServerInput] = useState(serverQuery?.search ?? "");
  const [sort, setSort] = useState(initialSort ?? (serverQuery ? "server" : "newest"));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(() => columns.map(column => column.key));
  const [widths, setWidths] = useState<Record<string, number>>({}), [clip, setClip] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [previewId, setPreviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const statuses = [...new Set(rows.map(row => row.status))].sort();
  const fields: ListFilterField[] = columns.filter(column => !(serverQuery?.onStatusChange && column.key === "status"))
    .map(column => ({ key: column.key, label: column.label,
    ...(column.key === "status" ? { type: "select" as const, options: statuses } : {}) }));
  const applyFilters = (value: Record<string, string>) => { setFilters(value); setSelected([]); setPreviewId(null); };
  const value = (row: DirectoryRow, key: string) => key === "number" ? `${row.number} ${row.title}` : key === "status" ? row.status : row.fields[key] || "";
  const filtered = useMemo(() => rows.filter(row => {
    if (!serverQuery && query.trim() && ![row.number, row.title, row.status, ...Object.values(row.fields)].join(" ").toLowerCase().includes(query.trim().toLowerCase())) return false;
    return Object.entries(filters).every(([key, expected]) => !expected || (key === "status" ? row.status === expected : value(row, key).toLowerCase().includes(expected.toLowerCase())));
  }).slice().sort((a, b) => {
    const compare = sortComparators?.[sort];
    if (compare) return compare(a, b) || a.id.localeCompare(b.id);
    return sort === "server" ? 0 : sort === "oldest" ? value(a, "date").localeCompare(value(b, "date")) || a.number.localeCompare(b.number)
      : sort === "newest" ? value(b, "date").localeCompare(value(a, "date")) || b.number.localeCompare(a.number)
        : value(a, sort).localeCompare(value(b, sort), undefined, { numeric: true });
  }), [rows, query, filters, sort, serverQuery, sortComparators]);
  const currentIds = new Set(filtered.map(row => row.id)), selection = selected.filter(id => currentIds.has(id));
  const preview = !loading && !error ? filtered.find(row => row.id === previewId) : undefined;
  const first = rows.length ? (page - 1) * pageSize + 1 : 0;
  const pageChange = (next: number) => { setSelected([]); setPreviewId(null); onPage(next); };
  return <>
    <PageHeader title={title} subtitle={subtitle} actions={<>
      <ListTools entity={title} columns={columns} visibleColumns={visible} onVisibleColumnsChange={setVisible}
        columnWidths={widths} onColumnWidthsChange={setWidths} clipText={clip} onClipTextChange={setClip}
        sortOptions={serverQuery ? [{ key: "server", label: "Default order" }, ...columns.map(c => ({ key: c.key, label: c.label }))]
          : [{ key: "newest", label: "Date · Newest first" }, { key: "oldest", label: "Date · Oldest first" }, ...columns.filter(c => c.key !== "date").map(c => ({ key: c.key, label: c.label }))]} onSort={setSort}
        filterFields={fields} activeFilters={filters} onApplyFilters={applyFilters}
        currentView={serverQuery ? undefined : filters.status || `All ${title}`}
        viewOptions={serverQuery ? undefined : [`All ${title}`, ...statuses]}
        onViewChange={serverQuery ? undefined : view => applyFilters({ ...filters, status: view === `All ${title}` ? "" : view })}
        showSavedView={!serverQuery}
        selectedCount={selection.length} onExport={() => setNotice("Export is not connected for this directory.")}
        onRefresh={() => { setSelected([]); setPreviewId(null); onRefresh(); }} onResetWidths={() => setWidths({})} notify={setNotice}
        unavailableImportReason="Import is not available yet. Add records individually."
        unavailableExportReason="Export is not available for this page yet."
        unavailableAllExportReason="Only the current page is loaded." viewExportLabel="Export Current Page View" />
      {action}</>} />
    {contextControls}
    {tabs && <nav aria-label="Request views" className="mb-4 flex flex-wrap gap-2 border-b border-border">
      {["", "Submitted"].map(status => <Button key={status} variant="ghost" aria-pressed={(filters.status || "") === status}
        className={(filters.status || "") === status ? "rounded-none border-b-2 border-primary text-primary" : "rounded-none text-muted-foreground"}
        onClick={() => applyFilters({ ...filters, status })}>{status ? "Submitted on this page" : "All on this page"}</Button>)}
    </nav>}
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="max-w-full">{serverQuery?.onStatusChange && serverQuery.statuses
          ? <Select aria-label={`Filter ${entity} by status`} value={serverQuery.status ?? ""} onChange={event => { setSelected([]); setPreviewId(null); serverQuery.onStatusChange?.(event.target.value); }}>
            <option value="">All statuses</option>{serverQuery.statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          : (!serverQuery || !serverQuery.onStatusChange) && <Select aria-label={`Filter ${entity} by status on this page`} value={filters.status || ""} onChange={event => applyFilters({ ...filters, status: event.target.value })}>
            <option value="">All {title}</option>{[...new Set([...statuses, ...(filters.status ? [filters.status] : [])])].map(status => <option key={status} value={status}>{status}</option>)}
          </Select>}</div>
        <div className="flex flex-wrap items-center gap-3">{serverQuery ? <form className="flex min-w-0 max-w-full flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); setSelected([]); setPreviewId(null); serverQuery.onSearch(serverInput.trim()); }}>
          <Input aria-label={`Search ${entity}`} placeholder={`Search ${entity}`} className="w-56 max-w-full" value={serverInput} onChange={event => setServerInput(event.target.value)} />
          <Button type="submit" variant="secondary">Search</Button>
          {serverQuery.search && <Button variant="ghost" onClick={() => { setServerInput(""); serverQuery.onSearch(""); }}>Clear</Button>}
        </form> : <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={`Search ${entity} on this page`} placeholder={`Search ${entity}`} className="w-56 max-w-full pl-9" value={query} onChange={event => { setQuery(event.target.value); setSelected([]); setPreviewId(null); }} /></div>}
          <div className="w-44 max-w-full"><Select aria-label={`Sort ${entity} on this page`} value={sort} onChange={event => setSort(event.target.value)}>
            {serverQuery ? <option value="server">Default order</option> : <><option value="newest">Newest first</option><option value="oldest">Oldest first</option></>}
            {columns.filter(column => serverQuery || column.key !== "date").map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
          </Select></div>
        </div>
      </div>
      <ActiveFilterChips fields={fields} filters={filters} onChange={applyFilters} />
      <div className="px-5 py-3"><p className="text-xs text-muted-foreground">{serverQuery ? "Column filters, sorting and selection apply to the loaded page only." : "Search, filters, sorting and selection apply to the loaded page only."}</p>
        {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {loading && <p role="status" className="my-4">Loading {entity}…</p>}
      </div>
      {!loading && !error && <>
        {selection.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-5 py-3 text-sm"><span>{selection.length} selected on this page</span><span className="text-muted-foreground">Bulk changes and export are not available yet.</span><Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>}
        {filtered.length ? <StandardDataTable rows={filtered} columns={columns} visibleColumns={visible} columnWidths={widths} clipText={clip}
          selected={selection} onSelectedChange={setSelected} onSort={setSort} onOpen={row => setPreviewId(row.id)} rowLabel={row => `Open ${row.number}`}
          renderCell={(row, column) => column.key === "number" ? <Link to={row.path} className="block text-primary"><span className="font-semibold">{row.number}</span><span className="mt-1 block text-sm">{row.title}</span></Link>
            : column.key === "status" ? <Badge>{row.status}</Badge> : <span>{row.fields[column.key] || "—"}</span>}
          renderActions={row => <div className="flex items-center gap-1"><Link to={row.path} className="text-sm text-primary">Open</Link><button type="button" aria-label={`Preview ${row.number}`} className="rounded-lg p-1 text-muted-foreground hover:text-primary" onClick={() => setPreviewId(row.id)}><Eye size={15} /></button></div>} />
          : <div className="p-5"><EmptyState title={rows.length || total ? `No matching ${entity} on this page`
            : serverQuery?.search || serverQuery?.status ? `No ${entity} match this search` : emptyTitle}
            description={rows.length || total ? "Change the page filters or move to another page."
              : serverQuery?.search || serverQuery?.status ? "Try another search or status." : emptyDescription}
            action={rows.length || total ? <Button variant="secondary" onClick={() => { setQuery(""); applyFilters({}); }}>Clear page filters</Button>
              : serverQuery?.search || serverQuery?.status ? undefined : action} /></div>}
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>{loading ? "Loading records…" : error ? "Record totals are unavailable." : `${first}–${rows.length ? Math.min(first + rows.length - 1, total) : 0} of ${total} · ${filtered.length} shown on this page`}</span>
        <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => pageChange(page - 1)}>Previous</Button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><Button variant="secondary" disabled={loading || page * pageSize >= total} onClick={() => pageChange(page + 1)}>Next</Button></div>
      </footer>
    </Panel>
    {preview && <Modal title={`${preview.number} · Preview`} onClose={() => setPreviewId(null)}><div className="space-y-3 text-sm"><p className="font-medium">{preview.title}</p><Badge>{preview.status}</Badge>
      <dl className="grid gap-3">{columns.filter(column => !["number", "status"].includes(column.key)).map(column => <div key={column.key}><dt className="text-muted-foreground">{column.label}</dt><dd>{preview.fields[column.key] || "—"}</dd></div>)}</dl>
      <Link to={preview.path}><Button variant="secondary">View full details</Button></Link></div></Modal>}
  </>;
}
