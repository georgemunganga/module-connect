import { RecordTable } from "./RecordTable";
import { ArrowDownAZ, Columns3, Download, Filter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, NoResultsState } from "./States";

export interface ColumnDef<T> {
  id: string;
  header: string;
  /** Columns beyond the first 7 are hidden by default and offered in the column picker. */
  defaultVisible?: boolean;
  /** Optional initial minimum width in pixels. Users can change this in Columns. */
  width?: number;
  cell: (row: T) => ReactNode;
}

export interface SortDef<T> {
  id: string;
  label: string;
  value: (row: T) => string | number | Date | null | undefined;
}

export interface FilterDef<T> {
  id: string;
  label: string;
  options: string[];
  match: (row: T, value: string) => boolean;
}

export interface SavedView {
  id: string;
  label: string;
}

export function ListPage<T extends { id: string }>({
  rows,
  columns,
  filters = [],
  savedViews = [],
  activeView,
  onViewChange,
  searchPlaceholder = "Search",
  searchFields,
  sortOptions = [],
  bulkActions = [],
  onExport,
  rowHref,
  emptyBody = "No records match the current view.",
  emptyState,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  filters?: FilterDef<T>[];
  savedViews?: SavedView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  searchPlaceholder?: string;
  searchFields: (row: T) => string;
  /** Include Created/Modified choices only when those dates exist in the record model. */
  sortOptions?: SortDef<T>[];
  bulkActions?: { label: string; onSelect: (ids: string[]) => void }[];
  /** The owning page supplies authorized export values; rendered cells are never scraped. */
  onExport?: (scope: "view" | "selected", rows: T[], columns: ColumnDef<T>[]) => void;
  rowHref?: (row: T) => ReactNode;
  emptyBody?: string;
  emptyState?: { title: string; body: string; icon?: ReactNode; action?: ReactNode };
}) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [sortId, setSortId] = useState("");
  const [sortDescending, setSortDescending] = useState(false);
  const [clipText, setClipText] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState<string[]>(
    columns.filter((c, i) => c.defaultVisible !== false && i < 7).map((c) => c.id),
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (query && !searchFields(r).toLowerCase().includes(query.toLowerCase())) return false;
      return filters.every((f) => {
        const v = filterValues[f.id];
        return !v || v === "all" || f.match(r, v);
      });
    });
  }, [rows, query, filterValues, filters, searchFields]);

  const sorted = useMemo(() => {
    const sort = sortOptions.find((option) => option.id === sortId);
    if (!sort) return filtered;
    const compare = (a: T, b: T) => {
      const left = sort.value(a);
      const right = sort.value(b);
      const normalize = (value: typeof left) => (value instanceof Date ? value.getTime() : value);
      const l = normalize(left);
      const r = normalize(right);
      if (l == null) return r == null ? 0 : 1;
      if (r == null) return -1;
      const result =
        typeof l === "number" && typeof r === "number"
          ? l - r
          : String(l).localeCompare(String(r), undefined, { numeric: true, sensitivity: "base" });
      return sortDescending ? -result : result;
    };
    return [...filtered].sort(compare);
  }, [filtered, sortId, sortDescending, sortOptions]);

  const shown = columns.filter((c) => visible.includes(c.id));
  const currentIds = new Set(rows.map((row) => row.id));
  const selectedIds = selected.filter((id) => currentIds.has(id));
  const selectedSet = new Set(selectedIds);
  const selectedRows = rows.filter((row) => selectedSet.has(row.id));
  const allSelected = sorted.length > 0 && sorted.every((row) => selectedSet.has(row.id));
  const someSelected = sorted.some((row) => selectedSet.has(row.id));
  const toggleAllShown = (on: boolean) =>
    setSelected((previous) => {
      const current = previous.filter((id) => currentIds.has(id));
      if (on) return [...new Set([...current, ...sorted.map((row) => row.id)])];
      const shownIds = new Set(sorted.map((row) => row.id));
      return current.filter((id) => !shownIds.has(id));
    });
  const activeFilters = Object.entries(filterValues).filter(([, v]) => v && v !== "all");

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" data-testid="erp-record-list">
      {savedViews.length ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 pt-2" role="tablist" aria-label="Saved views">
          {savedViews.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={activeView === v.id}
              onClick={() => onViewChange?.(v.id)}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                activeView === v.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-44 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 rounded-lg pl-9"
          />
        </div>
        {filters.map((f) => (
          <Select
            key={f.id}
            value={filterValues[f.id] ?? "all"}
            onValueChange={(v) => setFilterValues((s) => ({ ...s, [f.id]: v }))}
          >
            <SelectTrigger className="h-9 w-auto min-w-32 rounded-lg" aria-label={f.label}>
              <Filter className="size-3.5 text-muted-foreground" aria-hidden />
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.label}: all</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {sortOptions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <ArrowDownAZ className="size-4" aria-hidden />
                Sort: {sortOptions.find((option) => option.id === sortId)?.label ?? "Default"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort records</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setSortId("")}>Default order</DropdownMenuItem>
              {sortOptions.map((option) => (
                <DropdownMenuItem key={option.id} onSelect={() => setSortId(option.id)}>
                  {option.label}
                  {sortId === option.id ? " ✓" : ""}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={sortDescending}
                onCheckedChange={(on) => setSortDescending(Boolean(on))}
              >
                Descending
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 rounded-lg">
              <Columns3 className="size-4" aria-hidden />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            {columns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={visible.includes(c.id)}
                onCheckedChange={(on) =>
                  setVisible((s) =>
                    on
                      ? [...new Set([...s, c.id])]
                      : s.length > 1
                        ? s.filter((x) => x !== c.id)
                        : s,
                  )
                }
              >
                {c.header}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={clipText}
              onCheckedChange={(on) => setClipText(Boolean(on))}
            >
              Clip long text
            </DropdownMenuCheckboxItem>
            <DropdownMenuLabel>Minimum column width</DropdownMenuLabel>
            {[140, 200, 280].map((width) => (
              <DropdownMenuItem
                key={width}
                onSelect={() =>
                  setWidths(Object.fromEntries(shown.map((column) => [column.id, width])))
                }
              >
                {width === 140 ? "Compact" : width === 200 ? "Comfortable" : "Wide"}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => setWidths({})}>Use column defaults</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onExport ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <Download className="size-4" aria-hidden />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={sorted.length === 0}
                onSelect={() => onExport("view", sorted, shown)}
              >
                Export current view
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedRows.length === 0}
                onSelect={() => onExport("selected", selectedRows, shown)}
              >
                Export selected ({selectedRows.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {activeFilters.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
          {activeFilters.map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilterValues((s) => ({ ...s, [k]: "all" }))}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-muted-foreground hover:text-foreground"
            >
              {filters.find((f) => f.id === k)?.label}: {v}
              <X className="size-3" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedRows.length > 0 && bulkActions.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-soft px-4 py-2">
          <span className="text-sm font-medium text-primary">{selectedRows.length} selected</span>
          {bulkActions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant="outline"
              onClick={() => a.onSelect(selectedIds)}
            >
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-5">
        <EmptyState
          title={emptyState?.title ?? "No records yet"}
          body={emptyState?.body ?? emptyBody}
          icon={emptyState?.icon}
          action={emptyState?.action}
        />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-5">
        <NoResultsState
          title="No matching records"
          body="Try a different search or clear the filters to see the available records."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilterValues({});
              }}
            >
              Clear search and filters
            </Button>
          }
        />
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ contain: "paint" }}>
          <RecordTable className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr>
                <th scope="col" className="w-11 px-4 py-3">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(on) => toggleAllShown(on === true)}
                  />
                </th>
                {shown.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    style={{ minWidth: widths[c.id] ?? c.width }}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted-foreground"
                  >
                    {c.header}
                  </th>
                ))}
                {rowHref ? <th scope="col" className="w-20 px-4 py-3 text-right text-xs font-semibold text-muted-foreground">View</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-primary-soft/45">
                  <td className="px-4 py-3 align-middle">
                    <Checkbox
                      aria-label={`Select ${r.id}`}
                      checked={selectedSet.has(r.id)}
                      onCheckedChange={(on) =>
                        setSelected((s) =>
                          on ? [...new Set([...s, r.id])] : s.filter((x) => x !== r.id),
                        )
                      }
                    />
                  </td>
                  {shown.map((c) => {
                    const content = c.cell(r);
                    return (
                      <td
                        key={c.id}
                        style={{ minWidth: widths[c.id] ?? c.width }}
                        className="px-4 py-3 align-middle text-foreground"
                      >
                        <div
                          className={clipText ? "max-w-[280px] truncate" : undefined}
                          title={clipText && typeof content === "string" ? content : undefined}
                        >
                          {content}
                        </div>
                      </td>
                    );
                  })}
                  {rowHref ? <td className="px-4 py-3 text-right text-sm font-medium text-primary">{rowHref(r)}</td> : null}
                </tr>
              ))}
            </tbody>
          </RecordTable>
        </div>
      )}
      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span aria-live="polite">{filtered.length === rows.length ? `${rows.length} records` : `${filtered.length} of ${rows.length} records`}</span>
      </footer>
    </section>
  );
}
