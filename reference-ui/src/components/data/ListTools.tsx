import { useState } from "react";
import {
  ChevronRight,
  Columns3,
  Download,
  Filter,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button, Field, Input, Modal, Select, Switch } from "../ui";
import {
  ListImportWizard,
  type DuplicateMode,
  type ImportKind,
  type ImportResult,
} from "./ListImportWizard";
import { LiveListImportWizard } from "./LiveListImportWizard";
import type { LiveImport } from "../../lib/useLiveMasterImport";

export type ListColumn = { key: string; label: string; width?: number };
export type ListFilterField = {
  key: string;
  label: string;
  type?: "text" | "select";
  options?: string[];
};
export type ListSortOption = { key: string; label: string };
export type ExportScope = "all" | "view" | "selected";

export function ListTools({
  entity,
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  columnWidths,
  onColumnWidthsChange,
  clipText,
  onClipTextChange,
  sortOptions,
  onSort,
  filterFields,
  activeFilters,
  onApplyFilters,
  currentView,
  viewOptions,
  onViewChange,
  showSavedView = true,
  onExport,
  onImport,
  liveImport,
  unavailableImportReason,
  unavailableAllExportReason,
  unavailableExportReason,
  unavailableViewExportReason,
  unavailableSelectedExportReason,
  viewExportLabel = "Export Current View",
  selectedCount = 0,
  onPreferences,
  onRefresh,
  onResetWidths,
  notify,
}: {
  entity: string;
  columns: ListColumn[];
  visibleColumns: string[];
  onVisibleColumnsChange: (keys: string[]) => void;
  columnWidths: Record<string, number>;
  onColumnWidthsChange: (widths: Record<string, number>) => void;
  clipText: boolean;
  onClipTextChange: (value: boolean) => void;
  sortOptions: ListSortOption[];
  onSort: (key: string) => void;
  filterFields: ListFilterField[];
  activeFilters: Record<string, string>;
  onApplyFilters: (filters: Record<string, string>) => void;
  currentView?: string;
  viewOptions?: string[];
  onViewChange?: (view: string) => void;
  showSavedView?: boolean;
  onExport: (scope: ExportScope) => void;
  onImport?: (
    rows: Record<string, string>[],
    kind: ImportKind,
    duplicateMode: DuplicateMode,
  ) => ImportResult;
  liveImport?: LiveImport;
  unavailableImportReason?: string;
  unavailableAllExportReason?: string;
  unavailableExportReason?: string;
  unavailableViewExportReason?: string;
  unavailableSelectedExportReason?: string;
  viewExportLabel?: string;
  selectedCount?: number;
  onPreferences?: () => void;
  onRefresh: () => void;
  onResetWidths: () => void;
  notify: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"sort" | "import" | "export" | null>(
    null,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
    setSubmenu(null);
  };
  const exportAction = (scope: ExportScope) => {
    onExport(scope);
    closeMenu();
  };
  const label = entity.toLowerCase();
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          aria-label={`Filter ${entity} by field`}
          title={`Filter ${entity} by field`}
          onClick={() => setFilterOpen(true)}
          className="px-2.5"
        >
          <Filter size={15} /> <span>Filter{activeFilterCount ? ` (${activeFilterCount})` : ""}</span>
        </Button>
        <div className="relative">
          <Button
            variant="secondary"
            aria-label="Customize columns"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen(true)}
            className="px-2.5"
          >
            <Columns3 size={15} />{" "}
            <span className="hidden sm:inline">Columns</span>
          </Button>
        </div>
        <div className="relative">
          <Button
            variant="secondary"
            aria-label="More Actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setSubmenu(null);
            }}
            className="px-2.5"
          >
            <MoreHorizontal size={17} />
            <span className="hidden sm:inline">More</span>
          </Button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={`${entity} list actions`}
              className="absolute left-0 right-auto top-full z-40 mt-2 w-[min(16rem,calc(100vw-8rem))] rounded-md border border-slate-200 bg-white p-1.5 text-left text-sm shadow-xl sm:left-auto sm:right-0 sm:w-64"
            >
              <button
                role="menuitem"
                aria-expanded={submenu === "sort"}
                className="flex w-full items-center justify-between rounded px-3 py-2 hover:bg-slate-50"
                onClick={() => setSubmenu(submenu === "sort" ? null : "sort")}
              >
                <span>Sort by</span>
                <ChevronRight size={14} />
              </button>
              {submenu === "sort" && (
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {sortOptions.map((option) => (
                    <button
                      key={option.key}
                      role="menuitem"
                      className="block w-full rounded px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => {
                        onSort(option.key);
                        closeMenu();
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {(onImport || liveImport) && (
                <>
                  <button
                    role="menuitem"
                    aria-expanded={submenu === "import"}
                    className="flex w-full items-center justify-between rounded px-3 py-2 hover:bg-slate-50"
                    onClick={() =>
                      setSubmenu(submenu === "import" ? null : "import")
                    }
                  >
                    <span className="flex items-center gap-2">
                      <Upload size={14} />
                      Import
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  {submenu === "import" && (
                    <div className="ml-3 border-l border-slate-200 pl-2">
                      <button
                        role="menuitem"
                        className="block w-full rounded px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50"
                        onClick={() => {
                          setImportOpen(true);
                          closeMenu();
                        }}
                      >
                        Import {entity}
                      </button>
                    </div>
                  )}
                </>
              )}
              {!onImport && !liveImport && unavailableImportReason && (
                <div className="px-3 py-2 text-slate-500" role="note">
                  <span className="flex items-center gap-2"><Upload size={14} /> Import unavailable</span>
                  <span className="mt-1 block text-xs">{unavailableImportReason}</span>
                </div>
              )}
              <button
                role="menuitem"
                aria-expanded={submenu === "export"}
                disabled={Boolean(unavailableExportReason)}
                className="flex w-full items-center justify-between rounded px-3 py-2 hover:bg-slate-50"
                onClick={() =>
                  setSubmenu(submenu === "export" ? null : "export")
                }
              >
                <span className="flex items-center gap-2">
                  <Download size={14} />
                  Export
                </span>
                <ChevronRight size={14} />
              </button>
              {unavailableExportReason && <p className="px-3 pb-2 text-xs text-slate-500" role="note">{unavailableExportReason}</p>}
              {submenu === "export" && !unavailableExportReason && (
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {unavailableAllExportReason ? <div className="px-3 py-2 text-xs text-slate-500" role="note">
                    Export all unavailable: {unavailableAllExportReason}
                  </div> : <button
                    role="menuitem"
                    className="block w-full rounded px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => exportAction("all")}
                  >
                    Export {entity}
                  </button>}
                  <button
                    role="menuitem"
                    disabled={Boolean(unavailableViewExportReason)}
                    className="block w-full rounded px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => exportAction("view")}
                  >
                    {viewExportLabel}
                  </button>
                  {unavailableViewExportReason && <p className="px-3 py-1 text-xs text-slate-500" role="note">{unavailableViewExportReason}</p>}
                  {(selectedCount > 0 || unavailableSelectedExportReason) && (
                    <>
                      <button
                        role="menuitem"
                        disabled={Boolean(unavailableSelectedExportReason)}
                        className="block w-full rounded px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => exportAction("selected")}
                      >
                        Export Selected{selectedCount ? ` (${selectedCount})` : ""}
                      </button>
                      {unavailableSelectedExportReason && <p className="px-3 py-1 text-xs text-slate-500" role="note">{unavailableSelectedExportReason}</p>}
                    </>
                  )}
                </div>
              )}
              {onPreferences && (
                <button
                  role="menuitem"
                  className="w-full rounded px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => {
                    onPreferences();
                    closeMenu();
                  }}
                >
                  Preferences
                </button>
              )}
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-3 py-2 hover:bg-slate-50"
                onClick={() => {
                  onRefresh();
                  closeMenu();
                }}
              >
                <RefreshCw size={14} />
                Refresh List
              </button>
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-3 py-2 hover:bg-slate-50"
                onClick={() => {
                  onResetWidths();
                  closeMenu();
                }}
              >
                <RotateCcw size={14} />
                Reset Column Width
              </button>
            </div>
          )}
        </div>
      </div>
      {columnsOpen && (
        <ColumnSettings
          entity={entity}
          columns={columns}
          selected={visibleColumns}
          widths={columnWidths}
          clipText={clipText}
          onClose={() => setColumnsOpen(false)}
          onSave={(next, clip, widths) => {
            onVisibleColumnsChange(next);
            onClipTextChange(clip);
            onColumnWidthsChange(widths);
            setColumnsOpen(false);
          }}
        />
      )}
      {filterOpen && (
        <AdvancedSearch
          entity={entity}
          fields={filterFields}
          active={activeFilters}
          currentView={currentView}
          viewOptions={viewOptions}
          onViewChange={onViewChange}
          showSavedView={showSavedView}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            onApplyFilters(next);
            setFilterOpen(false);
          }}
          onClear={() => {
            onApplyFilters({});
            setFilterOpen(false);
          }}
        />
      )}
      {importOpen && onImport && (
        <ListImportWizard
          entity={entity.toLowerCase().includes("item") ? "items" : "vendors"}
          onClose={() => setImportOpen(false)}
          onImport={onImport}
          notify={notify}
        />
      )}
      {importOpen && liveImport && <LiveListImportWizard config={liveImport} onClose={() => setImportOpen(false)} />}
      <span className="sr-only" aria-live="polite">
        List tools for {label}
      </span>
    </>
  );
}

function ColumnSettings({
  entity,
  columns,
  selected,
  widths,
  clipText,
  onClose,
  onSave,
}: {
  entity: string;
  columns: ListColumn[];
  selected: string[];
  widths: Record<string, number>;
  clipText: boolean;
  onClose: () => void;
  onSave: (
    keys: string[],
    clip: boolean,
    widths: Record<string, number>,
  ) => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [draftWidths, setDraftWidths] = useState(widths);
  const [clip, setClip] = useState(clipText);
  return (
    <Modal title={`Customize ${entity} columns`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">
        Choose which fields appear in this table. The change stays in this
        browser.
      </p>
      <div className="grid gap-2">
        {columns.map((column) => (
          <div
            key={column.key}
            className="grid grid-cols-[1fr_130px] items-center gap-3 rounded border border-slate-100 px-3 py-2"
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.includes(column.key)}
                onChange={(event) =>
                  setDraft((previous) =>
                    event.target.checked
                      ? [...previous, column.key]
                      : previous.filter((key) => key !== column.key),
                  )
                }
              />
              {column.label}
            </label>
            <Select
              aria-label={`Width for ${column.label}`}
              value={String(draftWidths[column.key] ?? 0)}
              onChange={(event) =>
                setDraftWidths((previous) => ({
                  ...previous,
                  [column.key]: Number(event.target.value),
                }))
              }
            >
              <option value="0">Auto width</option>
              <option value="120">120 px</option>
              <option value="160">160 px</option>
              <option value="200">200 px</option>
              <option value="260">260 px</option>
              <option value="320">320 px</option>
            </Select>
          </div>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-4 text-sm">
        <Switch
          checked={clip}
          onChange={(event) => setClip(event.target.checked)}
          aria-label="Clip long cell text"
        />
        Clip long cell text
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave(
              draft.length ? draft : [columns[0]?.key].filter(Boolean),
              clip,
              Object.fromEntries(
                Object.entries(draftWidths).filter(([, width]) => width > 0),
              ),
            )
          }
        >
          Apply to Preview
        </Button>
      </div>
    </Modal>
  );
}

function AdvancedSearch({
  entity,
  fields,
  active,
  currentView,
  viewOptions,
  onViewChange,
  showSavedView,
  onClose,
  onApply,
  onClear,
}: {
  entity: string;
  fields: ListFilterField[];
  active: Record<string, string>;
  currentView?: string;
  viewOptions?: string[];
  onViewChange?: (view: string) => void;
  showSavedView: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, string>) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(active);
  const [filter, setFilter] = useState(currentView ?? `All ${entity}`);
  const [shownFields, setShownFields] = useState<string[]>(() =>
    fields.filter((field) => active[field.key]).map((field) => field.key),
  );
  const [fieldToAdd, setFieldToAdd] = useState("");
  const submit = () => {
    onViewChange?.(filter);
    onApply(draft);
  };
  return (
    <Modal title={`Filter ${entity}`} onClose={onClose} wide>
      <p className="mb-5 text-sm text-slate-500">Choose a field, then enter the value you want to find. Add another field to narrow the list further.</p>
      <div className={`mb-5 grid gap-4 ${showSavedView ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        <Field label="Filter by">
          <Select
            aria-label="Filter by field"
            value={fieldToAdd}
            onChange={(event) => {
              const key = event.target.value;
              if (key) setShownFields((current) => [...current, key]);
              setFieldToAdd("");
            }}
          >
            <option value="">Choose a field</option>
            {fields.filter((field) => !shownFields.includes(field.key)).map((field) => (
              <option key={field.key} value={field.key}>{field.label}</option>
            ))}
          </Select>
        </Field>
        {showSavedView && (
          <Field label="Saved view">
            <Select
              aria-label="Saved list filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {(viewOptions?.length ? viewOptions : [`All ${entity}`]).map(
                (option) => (
                  <option key={option}>{option}</option>
                ),
              )}
            </Select>
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.filter((field) => shownFields.includes(field.key)).map((field) => (
          <div key={field.key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{field.label}</span>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-800" aria-label={`Remove ${field.label} filter`} onClick={() => {
                setShownFields((current) => current.filter((key) => key !== field.key));
                setDraft((current) => { const next = { ...current }; delete next[field.key]; return next; });
              }}>Remove</button>
            </div>
            {field.type === "select" ? (
              <Select
                aria-label={field.label}
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    [field.key]: event.target.value,
                  }))
                }
              >
                <option value="">Any</option>
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            ) : (
              <Input
                aria-label={field.label}
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={`Search ${field.label.toLowerCase()}`}
              />
            )}
          </div>
        ))}
      </div>
      {!shownFields.length && <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No fields selected yet. Choose one under “Filter by” to get started.</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onClear}>
          Clear filters
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Filter size={14} />
            Apply filters
          </Button>
        </div>
      </div>
    </Modal>
  );
}
