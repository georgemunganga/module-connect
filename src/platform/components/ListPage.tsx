import { Columns3, Filter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoResultsState } from "./States";

export interface ColumnDef<T> {
  id: string;
  header: string;
  /** Columns beyond the first 7 are hidden by default and offered in the column picker. */
  defaultVisible?: boolean;
  cell: (row: T) => ReactNode;
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
  bulkActions = [],
  rowHref,
  emptyBody = "No records match the current view.",
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  filters?: FilterDef<T>[];
  savedViews?: SavedView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  searchPlaceholder?: string;
  searchFields: (row: T) => string;
  bulkActions?: { label: string; onSelect: (ids: string[]) => void }[];
  rowHref?: (row: T) => ReactNode;
  emptyBody?: string;
}) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
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

  const shown = columns.filter((c) => visible.includes(c.id));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const activeFilters = Object.entries(filterValues).filter(([, v]) => v && v !== "all");

  return (
    <div className="space-y-4">
      {savedViews.length ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Saved views">
          {savedViews.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={activeView === v.id}
              onClick={() => onViewChange?.(v.id)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                activeView === v.id
                  ? "border-primary bg-primary-soft font-medium text-primary"
                  : "bg-surface text-muted-foreground hover:border-border-strong"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {filters.map((f) => (
          <Select
            key={f.id}
            value={filterValues[f.id] ?? "all"}
            onValueChange={(v) => setFilterValues((s) => ({ ...s, [f.id]: v }))}
          >
            <SelectTrigger className="w-auto min-w-36" aria-label={f.label}>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
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
                  setVisible((s) => (on ? [...s, c.id] : s.filter((x) => x !== c.id)))
                }
              >
                {c.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeFilters.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeFilters.map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilterValues((s) => ({ ...s, [k]: "all" }))}
              className="inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5"
            >
              {filters.find((f) => f.id === k)?.label}: {v}
              <X className="size-3" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} records
      </p>

      {selected.length > 0 && bulkActions.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft p-2">
          <span className="text-sm font-medium text-primary">{selected.length} selected</span>
          {bulkActions.map((a) => (
            <Button key={a.label} size="sm" variant="outline" onClick={() => a.onSelect(selected)}>
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <NoResultsState title="No matching records" body={emptyBody} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b bg-surface-muted">
              <tr>
                <th scope="col" className="w-10 px-3 py-2">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allSelected}
                    onCheckedChange={(on) => setSelected(on ? filtered.map((r) => r.id) : [])}
                  />
                </th>
                {shown.map((c) => (
                  <th key={c.id} scope="col" className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {c.header}
                  </th>
                ))}
                {rowHref ? <th scope="col" className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted">
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`Select ${r.id}`}
                      checked={selected.includes(r.id)}
                      onCheckedChange={(on) =>
                        setSelected((s) => (on ? [...s, r.id] : s.filter((x) => x !== r.id)))
                      }
                    />
                  </td>
                  {shown.map((c) => (
                    <td key={c.id} className="px-3 py-2 align-top">
                      {c.cell(r)}
                    </td>
                  ))}
                  {rowHref ? <td className="px-3 py-2 text-right">{rowHref(r)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}