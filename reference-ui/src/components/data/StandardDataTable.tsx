import { RecordTable } from "./RecordTable";
import type { ReactNode } from "react";
import type { ListColumn } from "./ListTools";
import { updateVisibleSelection } from "../../lib/list-state";

/** Shared table body for procurement lists. The page owns filters, paging and workflow actions. */
export function StandardDataTable<T extends { id: string }>({
  rows,
  columns,
  visibleColumns,
  columnWidths,
  clipText = false,
  selected,
  onSelectedChange,
  onSort,
  renderCell,
  renderActions,
  onOpen,
  rowLabel,
}: {
  rows: T[];
  columns: ListColumn[];
  visibleColumns: string[];
  columnWidths?: Record<string, number>;
  clipText?: boolean;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onSort?: (key: string) => void;
  renderCell: (row: T, column: ListColumn) => ReactNode;
  renderActions?: (row: T) => ReactNode;
  onOpen?: (row: T) => void;
  rowLabel?: (row: T) => string;
}) {
  const shown = columns.filter((column) => visibleColumns.includes(column.key));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, [role='button'], [role='checkbox']"));

  return (
    <div className="overflow-x-auto" data-testid="erp-record-table">
      <RecordTable className="w-full min-w-[940px] table-fixed border-collapse text-left text-sm">
        <thead className="table-head border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <tr>
            <th scope="col" className="w-11 px-4 py-3">
              <input
                type="checkbox"
                aria-label="Select all visible records"
                checked={allSelected}
                onChange={(event) => onSelectedChange(updateVisibleSelection(selected, rows.map((row) => row.id), event.target.checked))}
              />
            </th>
            {shown.map((column) => (
              <th key={column.key} scope="col" style={{ width: columnWidths?.[column.key] ?? column.width }}
                className="px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)]">
                {onSort ? <button type="button" className="hover:text-[var(--foreground)]" onClick={() => onSort(column.key === "date" ? "newest" : column.key)}>
                  {column.label}
                </button> : column.label}
              </th>
            ))}
            {renderActions && <th scope="col" className="sticky right-0 z-10 w-16 bg-[var(--surface-muted)] px-4 py-3 text-right text-xs font-semibold text-[var(--muted-foreground)]"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.id}
              tabIndex={onOpen ? 0 : undefined}
              aria-label={onOpen ? rowLabel?.(row) ?? `Open ${row.id}` : undefined}
              onClick={onOpen ? (event) => { if (!isInteractive(event.target)) onOpen(row); } : undefined}
              onKeyDown={onOpen ? (event) => {
                if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                  event.preventDefault();
                  onOpen(row);
                }
              } : undefined}
              className={`group transition-colors hover:bg-[var(--primary-soft)] ${onOpen ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]" : ""} ${selected.includes(row.id) ? "bg-[var(--primary-soft)]" : ""}`}>
              <td className="px-4 py-3 align-middle">
                <input type="checkbox" aria-label={`Select ${rowLabel?.(row) ?? row.id}`}
                  checked={selected.includes(row.id)}
                  onChange={(event) => onSelectedChange(event.target.checked
                    ? [...new Set([...selected, row.id])]
                    : selected.filter((id) => id !== row.id))} />
              </td>
              {shown.map((column) => (
                <td key={column.key} style={{ width: columnWidths?.[column.key] ?? column.width }}
                  className={`px-4 py-3 align-middle text-[var(--foreground)] ${clipText ? "max-w-[240px] truncate whitespace-nowrap" : ["date", "amount", "status"].includes(column.key) ? "whitespace-nowrap" : "whitespace-normal"}`}>
                  {renderCell(row, column)}
                </td>
              ))}
              {renderActions && <td className="sticky right-0 z-10 bg-white px-4 py-3 text-right group-hover:bg-[var(--primary-soft)]">
                {renderActions(row)}
              </td>}
            </tr>
          ))}
        </tbody>
      </RecordTable>
    </div>
  );
}
