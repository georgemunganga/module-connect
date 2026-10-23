import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Eye, Search } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Panel, Select } from "../ui";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { ListTools, type ListColumn, type ListFilterField } from "./ListTools";
import { StandardDataTable } from "./StandardDataTable";

export type CatalogDirectoryRow = {
  id: string; number: string; title: string; status: string; path: string;
  fields: Record<string, string>;
};

/** Buyer catalog layout. Search and optional status are server queries; other tools affect this page only. */
export function LiveCatalogDirectory({ title, subtitle, entity, columns, rows, total, page, pageSize,
  loading, error, search, onSearch, status, statuses, onStatusChange, onPage, onRefresh, action,
  emptyTitle, emptyDescription }: {
  title: string; subtitle: string; entity: string; columns: ListColumn[]; rows: CatalogDirectoryRow[];
  total: number; page: number; pageSize: number; loading: boolean; error: string;
  search: string; onSearch: (value: string) => void; status?: string;
  statuses?: ReadonlyArray<{ value: string; label: string }>;
  onStatusChange?: (value: string) => void; onPage: (page: number) => void; onRefresh: () => void;
  action?: ReactNode; emptyTitle: string; emptyDescription: string;
}) {
  const [query, setQuery] = useState(search);
  const [sort, setSort] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(() => columns.map(column => column.key));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [clip, setClip] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const filterFields: ListFilterField[] = columns.filter(column => column.key !== "status")
    .map(column => ({ key: column.key, label: column.label }));
  const applyFilters = (next: Record<string, string>) => {
    setFilters(next); setSelected([]); setPreviewId(null);
  };
  const value = (row: CatalogDirectoryRow, key: string) => key === "number"
    ? `${row.number} ${row.title}` : key === "status" ? row.status : row.fields[key] ?? "";
  const shown = useMemo(() => rows.filter(row => Object.entries(filters).every(([key, expected]) =>
    !expected || value(row, key).toLocaleLowerCase().includes(expected.toLocaleLowerCase())))
    .slice().sort((a, b) => sort ? value(a, sort).localeCompare(value(b, sort), undefined, { numeric: true }) : 0),
  [rows, filters, sort]);
  const selectedOnPage = selected.filter(id => shown.some(row => row.id === id));
  const preview = !loading && !error ? shown.find(row => row.id === previewId) : undefined;
  const first = rows.length ? (page - 1) * pageSize + 1 : 0;
  const movePage = (next: number) => { setSelected([]); setPreviewId(null); onPage(next); };
  return <>
    <PageHeader title={title} subtitle={subtitle} actions={<>
      <ListTools entity={title} columns={columns} visibleColumns={visible} onVisibleColumnsChange={setVisible}
        columnWidths={widths} onColumnWidthsChange={setWidths} clipText={clip} onClipTextChange={setClip}
        sortOptions={columns.map(column => ({ key: column.key, label: column.label }))} onSort={setSort}
        filterFields={filterFields} activeFilters={filters} onApplyFilters={applyFilters}
        showSavedView={false} selectedCount={selectedOnPage.length}
        onExport={() => setNotice("Export is unavailable for this directory.")}
        unavailableExportReason="A scoped server export is not connected."
        unavailableImportReason="A scoped server import is not connected. Add records individually."
        onRefresh={() => { setSelected([]); setPreviewId(null); onRefresh(); }}
        onResetWidths={() => setWidths({})} notify={setNotice} />
      {action}</>} />
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5">
        <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault(); setSelected([]); setPreviewId(null); onSearch(query.trim());
        }}>
          <label className="block text-sm font-medium">Search {entity} across pages
            <span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label={`Search ${entity}`} className="w-64 max-w-full pl-9" value={query}
                onChange={event => setQuery(event.target.value)} placeholder={`Search ${entity}`} /></span>
          </label>
          <Button type="submit" variant="secondary">Search</Button>
          {search && <Button variant="ghost" onClick={() => { setQuery(""); onSearch(""); }}>Clear</Button>}
        </form>
        {statuses && onStatusChange && <label className="block text-sm font-medium">Vendor status across pages
          <Select aria-label={`Filter ${entity} by status`} className="mt-1 min-w-48" value={status ?? ""}
            onChange={event => { setSelected([]); setPreviewId(null); onStatusChange(event.target.value); }}>
            <option value="">All statuses</option>{statuses.map(option =>
              <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
        </label>}
      </div>
      <ActiveFilterChips fields={filterFields} filters={filters} onChange={applyFilters} />
      <div className="px-5 py-3 text-xs text-muted-foreground">Column filters, sorting and selection apply to the loaded page only.</div>
      {notice && <p role="status" className="px-5 pb-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="px-5 pb-3 text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="px-5 pb-5 text-sm">Loading {entity}…</p>}
      {!loading && !error && (shown.length ? <>
        {selectedOnPage.length > 0 && <div className="flex items-center gap-3 border-y border-border px-5 py-2 text-sm">
          {selectedOnPage.length} selected on this page · Bulk actions are unavailable.
          <Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>}
        <StandardDataTable rows={shown} columns={columns} visibleColumns={visible} columnWidths={widths} clipText={clip}
          selected={selectedOnPage} onSelectedChange={setSelected} onSort={setSort}
          onOpen={row => setPreviewId(row.id)} rowLabel={row => `Open ${row.number}`}
          renderCell={(row, column) => column.key === "number" ? <Link to={row.path} className="block text-primary">
            <span className="font-semibold">{row.number}</span><span className="mt-1 block text-sm">{row.title}</span></Link>
            : column.key === "status" ? <Badge>{row.status}</Badge> : row.fields[column.key] || "—"}
          renderActions={row => <div className="flex items-center gap-2"><Link to={row.path} className="text-sm text-primary">Open</Link>
            <button type="button" aria-label={`Preview ${row.number}`} onClick={() => setPreviewId(row.id)}><Eye size={15} /></button></div>} />
      </> : <div className="p-5"><EmptyState title={rows.length || total ? `No matching ${entity} on this page` : search || status ? `No ${entity} match this search` : emptyTitle}
        description={rows.length || total ? "Clear page filters or go to another page." : search || status ? "Try another search or status." : emptyDescription}
        action={!rows.length && !total && !search && !status ? action : undefined} /></div>)}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>{loading || error ? "Record totals unavailable while loading." : `${first}–${rows.length ? Math.min(first + rows.length - 1, total) : 0} of ${total} · ${shown.length} shown on this page`}</span>
        <div className="flex items-center gap-2"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => movePage(page - 1)}>Previous</Button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <Button variant="secondary" disabled={loading || page * pageSize >= total} onClick={() => movePage(page + 1)}>Next</Button></div>
      </footer>
    </Panel>
    {preview && <Modal title={`${preview.number} · Preview`} onClose={() => setPreviewId(null)}><div className="space-y-3 text-sm">
      <p className="font-semibold">{preview.title}</p><Badge>{preview.status}</Badge>
      <dl className="grid gap-3">{columns.filter(column => !["number", "status"].includes(column.key)).map(column =>
        <div key={column.key}><dt className="text-muted-foreground">{column.label}</dt><dd>{preview.fields[column.key] || "—"}</dd></div>)}</dl>
      <Link to={preview.path}><Button variant="secondary">View full details</Button></Link>
    </div></Modal>}
  </>;
}
