import type { ReactNode } from "react";
import type { ExportScope, ListColumn } from "./ListTools";
import { LiveRecordDirectory, type DirectoryRow } from "./LiveRecordDirectory";

export type CatalogDirectoryRow = DirectoryRow;

/** Thin buyer adapter over the shared record directory. Search/status remain server queries. */
export function LiveCatalogDirectory({ title, subtitle, entity, columns, rows, total, page, pageSize,
  loading, error, search, onSearch, status, statuses, onStatusChange, onPage, onRefresh, action,
  emptyTitle, emptyDescription, exportCsv }: {
  title: string; subtitle: string; entity: string; columns: ListColumn[]; rows: CatalogDirectoryRow[];
  total: number; page: number; pageSize: number; loading: boolean; error: string;
  search: string; onSearch: (value: string) => void; status?: string;
  statuses?: ReadonlyArray<{ value: string; label: string }>;
  onStatusChange?: (value: string) => void; onPage: (page: number) => void; onRefresh: () => void;
  action?: ReactNode; emptyTitle: string; emptyDescription: string;
  exportCsv?: { allowed: boolean; busy: boolean; error: string; notice: string; onExport: (scope: ExportScope) => void };
}) {
  return <LiveRecordDirectory title={title} subtitle={subtitle} entity={entity} columns={columns} rows={rows}
    total={total} page={page} pageSize={pageSize} loading={loading} error={error}
    onPage={onPage} onRefresh={onRefresh} action={action} emptyTitle={emptyTitle} emptyDescription={emptyDescription}
    serverQuery={{ search, onSearch, status, statuses, onStatusChange }} exportCsv={exportCsv} />;
}
