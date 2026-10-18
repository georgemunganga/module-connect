import { RecordTable } from "../components/data/RecordTable";
import { ActiveFilterChips } from "../components/data/ActiveFilterChips";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronDown,
  MoreHorizontal,
  ArrowRight,
  FileText,
  Eye,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { modules, type ModuleKey } from "../data/modules";
import { useApp, useStoredState, money, type AppRecord } from "../lib/store";
import { removeSelectedId } from "../lib/list-state";
import {
  filterEmployeeRequests,
  requesterFor,
  type RequestListTab,
  type RequestOwnerScope,
} from "../lib/request-views";
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Select } from "../components/ui";
import { DeleteConfirm } from "../components/data/DetailPrimitives";
import { StandardDataTable } from "../components/data/StandardDataTable";
import {
  ListTools,
  type ExportScope,
  type ListColumn,
  type ListFilterField,
  type ListSortOption,
} from "../components/data/ListTools";
import { downloadCsv } from "../lib/csv";

export function RecordList({
  kind,
  procurement = false,
  approval = false,
}: {
  kind: ModuleKey;
  procurement?: boolean;
  approval?: boolean;
}) {
  const config = modules[kind];
  const { records, updateRecord, deleteRecord, notify } = useApp();
  const navigate = useNavigate();
  const employeeRequests = kind === "requests" && !procurement && !approval;
  const [requestTab, setRequestTab] = useStoredState<RequestListTab>(
    "my-requests-tab",
    "pending",
  );
  const [requestScope, setRequestScope] = useStoredState<RequestOwnerScope>(
    "my-requests-scope",
    "mine",
  );
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("All"),
    [sort, setSort] = useState("newest"),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [visibleColumns, setVisibleColumns] = useState<string[]>([
      "date",
      "number",
      "party",
      "requester",
      "status",
      "amount",
    ]),
    [columnWidths, setColumnWidths] = useState<Record<string, number>>({}),
    [clipText, setClipText] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<AppRecord | null>(null),
    [pendingDelete, setPendingDelete] = useState<AppRecord | null>(null);
  const all = employeeRequests
    ? filterEmployeeRequests(
        records.filter((record) => record.kind === kind),
        requestTab,
        requestScope,
      )
    : records.filter(
        (record) =>
          record.kind === kind &&
          (!approval || record.status === "Pending Approval"),
      );
  const filtered = all
    .filter(
      (record) =>
        `${record.id} ${record.title} ${record.party} ${kind === "requests" ? requesterFor(record) : ""}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "All" ||
          (status === "Empty" && false) ||
          record.status === status) &&
        Object.entries(filters).every(([key, value]) => {
          if (!value) return true;
          const values: Record<string, string> = {
            number: record.id,
            title: record.title,
            party: record.party,
            requester: requesterFor(record),
            date: record.date,
            status: record.status,
            amount: String(record.amount),
          };
          return (values[key] ?? "")
            .toLowerCase()
            .includes(value.toLowerCase());
        }),
    )
    .sort((a, b) =>
      sort === "amount"
        ? b.amount - a.amount
        : sort === "oldest"
          ? a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
          : sort === "number"
            ? a.id.localeCompare(b.id)
            : sort === "party"
              ? a.party.localeCompare(b.party)
              : sort === "requester"
                ? requesterFor(a).localeCompare(requesterFor(b))
                : sort === "status"
                  ? a.status.localeCompare(b.status)
                  : b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleRecords = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const title = approval
    ? "Approvals"
    : procurement
      ? "Purchase Requests"
      : config.title;
  const statuses = [...new Set(all.map((record) => record.status))];
  const columns: ListColumn[] = [
    { key: "date", label: "Date", width: 112 },
    { key: "number", label: "Number / Description", width: 230 },
    {
      key: "party",
      label: kind === "requests" ? "Department" : "Vendor / Team",
      width: 180,
    },
    ...(kind === "requests"
      ? [{ key: "requester", label: "Requested By", width: 150 }]
      : []),
    { key: "status", label: "Status", width: 130 },
    { key: "amount", label: kind === "rfqs" ? "Type" : "Amount", width: 130 },
  ];
  const sortOptions: ListSortOption[] = [
    { key: "newest", label: "Date · Newest first" },
    { key: "oldest", label: "Date · Oldest first" },
    { key: "number", label: "Number" },
    {
      key: "party",
      label: kind === "requests" ? "Department" : "Vendor / Team",
    },
    ...(kind === "requests"
      ? [{ key: "requester", label: "Requested by" }]
      : []),
    { key: "status", label: "Status" },
    { key: "amount", label: "Amount · Highest first" },
  ];
  const filterFields: ListFilterField[] = [
    { key: "number", label: "Number" },
    { key: "title", label: "Description" },
    {
      key: "party",
      label: kind === "requests" ? "Department" : "Vendor / Team",
    },
    ...(kind === "requests"
      ? [{ key: "requester", label: "Requested by" }]
      : []),
    { key: "date", label: "Date" },
    { key: "status", label: "Status", type: "select", options: statuses },
    { key: "amount", label: "Amount" },
  ];
  const exportLocal = (scope: ExportScope) => {
    const dataset =
      scope === "all"
        ? all
        : scope === "selected"
          ? all.filter((record) => selected.includes(record.id))
          : filtered;
    const exportColumns =
      scope === "all"
        ? columns
        : columns.filter((column) => visibleColumns.includes(column.key));
    const rows = [
      exportColumns.map((column) => column.label),
      ...dataset.map((record) =>
        exportColumns.map((column) => {
          if (column.key === "number") return `${record.id} · ${record.title}`;
          if (column.key === "party") return record.party;
          if (column.key === "requester") return requesterFor(record);
          if (column.key === "date") return record.date;
          if (column.key === "status") return record.status;
          return kind === "rfqs" ? "Request for Quote" : String(record.amount);
        }),
      ),
    ];
    downloadCsv(
      `${kind}-${scope === "all" ? "all" : scope === "view" ? "current-view" : "selected"}.csv`,
      rows,
    );
    notify(
      `Downloaded ${dataset.length} local demo ${config.title.toLowerCase()} record(s).`,
    );
  };
  const returnContext = procurement
    ? "?entry=procurement"
    : approval
      ? "?entry=approvals"
      : "";
  const changeApproval = (record: AppRecord, next: string) => {
    updateRecord(record.id, { status: next });
    setDetail(null);
    notify(
      `${record.id} ${next.toLowerCase()} in this demo only. No ERP record changed.`,
    );
  };
  const removeRecord = () => {
    if (!pendingDelete) return;
    deleteRecord(pendingDelete.id);
    setSelected((previous) => removeSelectedId(previous, pendingDelete.id));
    notify(
      `${pendingDelete.id} removed from local demo data. Linked records remain unchanged.`,
    );
    setPendingDelete(null);
    setDetail(null);
  };
  const forward = (record: AppRecord) => {
    const destination: Record<string, string> = {
      requests: "/rfqs/new",
      "purchase-orders": "/purchase-receives/new",
      "purchase-receives": "/bills/new",
      bills: "/payments/new",
    };
    const entry =
      record.kind === "requests" && procurement
        ? "&entry=procurement"
        : record.kind === "requests" && approval
          ? "&entry=approvals"
          : "";
    navigate(
      `${destination[record.kind]}?source=${encodeURIComponent(record.id)}${entry}`,
    );
  };
  const renderCell = (record: AppRecord, column: ListColumn) => {
    if (column.key === "date") return <span className="text-[var(--muted-foreground)]">{record.date}</span>;
    if (column.key === "number") return <Link className="block text-left" to={`/${kind}/${record.id}${returnContext}`}>
      <span className="font-semibold text-[var(--primary)]">{record.id}</span>
      <span className="mt-1 block text-xs text-[var(--muted-foreground)]">{record.title}</span>
    </Link>;
    if (column.key === "party") return record.party;
    if (column.key === "requester") return requesterFor(record);
    if (column.key === "status") return <Badge>{record.status}</Badge>;
    return <span className="font-medium">{kind === "rfqs" ? "Request for Quote" : money(record.amount)}</span>;
  };
  return (
    <div className="p-5 sm:p-8">
      <PageHeader
        title={title}
        subtitle={
          approval
            ? "Review requests awaiting your approval."
            : procurement
              ? "The Procurement team view of the same purchase-request records."
              : config.description
        }
        actions={
          <>
            <ListTools
              entity={title}
              columns={columns}
              visibleColumns={visibleColumns}
              onVisibleColumnsChange={setVisibleColumns}
              columnWidths={columnWidths}
              onColumnWidthsChange={setColumnWidths}
              clipText={clipText}
              onClipTextChange={setClipText}
              sortOptions={sortOptions}
              onSort={setSort}
              filterFields={filterFields}
              activeFilters={filters}
              onApplyFilters={(next) => { setFilters(next); setPage(1); }}
              currentView={
                employeeRequests
                  ? undefined
                  : status === "All"
                    ? `All ${title}`
                    : status
              }
              viewOptions={
                employeeRequests ? undefined : [`All ${title}`, ...statuses]
              }
              onViewChange={
                employeeRequests
                  ? undefined
                  : (view) => setStatus(view.startsWith("All") ? "All" : view)
              }
              onExport={exportLocal}
              selectedCount={selected.length}
              onRefresh={() =>
                notify(`${title} list refreshed in this local preview.`)
              }
              onResetWidths={() => {
                setColumnWidths({});
                notify("Column widths restored to their default preview size.");
              }}
              notify={notify}
              showSavedView={!employeeRequests}
            />
            {!approval && (
              <Link
                to={`/${kind}/new${procurement ? "?entry=procurement" : ""}`}
              >
                <Button>
                  <Plus size={16} />
                  New {config.singular}
                </Button>
              </Link>
            )}
          </>
        }
      />
      {(procurement || approval) && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs text-slate-500">
          <span>
            {approval
              ? "Approval decisions are simulated locally."
              : "Shared records · Role-specific workflow actions"}
          </span>
          <Link to="/requests" className="shrink-0 text-blue-500">
            Employee view →
          </Link>
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {employeeRequests ? (
              <>
                <div
                  role="tablist"
                  aria-label="Purchase request status views"
                  className="flex items-center gap-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={requestTab === "pending"}
                    onClick={() => { setRequestTab("pending"); setPage(1); }}
                    className={`border-b-2 px-3 py-3 text-sm font-medium ${requestTab === "pending" ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    Pending Requests
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={requestTab === "all"}
                    onClick={() => { setRequestTab("all"); setPage(1); }}
                    className={`border-b-2 px-3 py-3 text-sm font-medium ${requestTab === "all" ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    All Requests
                    <ChevronDown size={13} className="ml-1 inline-block" />
                  </button>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className="sr-only">Request owner scope</span>
                  <Select
                    aria-label="Request owner scope"
                    value={requestScope}
                    onChange={(event) => {
                      setRequestScope(event.target.value as RequestOwnerScope);
                      setPage(1);
                    }}
                    className="max-w-[170px] text-sm"
                  >
                    <option value="mine">My Requests</option>
                    <option value="all">All Requesters</option>
                  </Select>
                </label>
              </>
            ) : (
              <label className="flex items-center gap-2 text-sm font-medium">
                <Select
                  aria-label="Filter records by status"
                  value={status}
                  onChange={(event) => { setStatus(event.target.value); setPage(1); }}
                  className="bg-transparent pr-2 outline-none"
                >
                  <option value="All">
                    All {approval ? "Pending Requests" : title}
                  </option>
                  {statuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                  <option value="Empty">Empty state preview</option>
                </Select>
              </label>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
              {filtered.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={`Search ${title}`}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder={kind === "requests" ? "Search number, description or requester" : "Search number, description or vendor"}
                className="w-40 pl-10 sm:w-60"
              />
            </div>
            <div className="hidden sm:block">
            <Select
              aria-label="Sort records"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="bg-transparent text-sm text-muted-foreground"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Highest amount</option>
            </Select>
            </div>
          </div>
        </div>
        <ActiveFilterChips fields={filterFields} filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 text-xs text-blue-700">
            <span>{selected.length} selected</span>
            <Button variant="secondary" onClick={() => exportLocal("selected")}>
              Export selected
            </Button>
            <button className="ml-auto" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
        {filtered.length ? (
          <StandardDataTable
            rows={visibleRecords}
            columns={columns}
            visibleColumns={visibleColumns}
            columnWidths={columnWidths}
            clipText={clipText}
            selected={selected}
            onSelectedChange={setSelected}
            onSort={setSort}
            onOpen={setDetail}
            rowLabel={(record) => `Open ${record.id}: ${record.title}`}
            renderCell={renderCell}
            renderActions={(record) => (
              <button
                type="button"
                onClick={() => setDetail(record)}
                aria-label={`Actions for ${record.id}`}
                className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
              >
                <MoreHorizontal size={18} />
              </button>
            )}
          />
        ) : (
          <EmptyState
            title={
              status === "Empty"
                ? `No ${title.toLowerCase()} to display`
                : query
                  ? "No matching records"
                  : "Nothing to review yet"
            }
            description={
              query
                ? "Try another search term or clear your filters."
                : approval
                  ? "Approved and rejected requests no longer appear in this queue."
                  : `Create your first ${config.singular.toLowerCase()} to start this workflow.`
            }
            action={
              !approval && (
                <Link to={`/${kind}/new${returnContext}`}>
                  <Button>
                    <Plus size={15} />
                    New {config.singular}
                  </Button>
                </Link>
              )
            }
          />
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted-foreground)]">
          <span>{filtered.length ? `${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, filtered.length)} of ${filtered.length}` : "0 records"}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span className="min-w-16 text-center">Page {currentPage} of {pageCount}</span>
            <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </footer>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400">
        <FileText size={12} />
        Canonical screen:{" "}
        {approval
          ? "approval.inbox"
          : procurement
            ? "purchase-request.list.procurement"
            : `${kind}.list`}{" "}
        · Reference{" "}
        {approval ? "03" : procurement ? "08" : config.reference.slice(0, 2)}
      </p>
      {detail && (
        <Modal
          title={`${detail.id} · ${config.singular}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-medium">{detail.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{detail.party}</p>
            </div>
            <Badge>{detail.status}</Badge>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link to={`/${kind}/${detail.id}${returnContext}`}>
              <Button variant="secondary">
                <Eye size={14} /> View full details
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setPendingDelete(detail)}>
              Delete locally
            </Button>
          </div>
          <div className="my-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
            <div>
              <p className="text-xs text-slate-400">Date</p>
              <p className="mt-1 text-sm">{detail.date}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Amount</p>
              <p className="mt-1 font-semibold">{money(detail.amount)}</p>
            </div>
          </div>
          {detail.lines?.length ? (
            <div className="mb-6 overflow-x-auto">
              <RecordTable variant="compact" className="w-full text-left">
                <thead className="table-head">
                  <tr>
                    {["Item", "Quantity", "Rate", "Amount"].map((label) => (
                      <th key={label} className="table-cell !py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="table-cell">{line.name}</td>
                      <td className="table-cell">
                        {line.quantity} {line.unit}
                      </td>
                      <td className="table-cell">{money(line.rate)}</td>
                      <td className="table-cell">
                        {money(line.quantity * line.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </RecordTable>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {detail.kind === "requests" &&
            detail.status === "Pending Approval" &&
            (approval || procurement) ? (
              <>
                <Button onClick={() => changeApproval(detail, "Approved")}>
                  <Check size={15} />
                  Approve (demo)
                </Button>
                <Button
                  variant="danger"
                  onClick={() => changeApproval(detail, "Rejected")}
                >
                  <X size={15} />
                  Reject (demo)
                </Button>
              </>
            ) : null}
            <Link
              to={`/${kind}/${detail.id}/edit${detail.kind === "requests" ? returnContext : ""}`}
            >
              <Button variant="secondary">
                <Pencil size={14} />
                Edit record
              </Button>
            </Link>
            {((detail.kind === "requests" && detail.status === "Approved") ||
              ["purchase-orders", "purchase-receives", "bills"].includes(
                detail.kind,
              )) && (
              <Button onClick={() => forward(detail)}>
                {detail.kind === "requests"
                  ? "Create RFQ"
                  : detail.kind === "purchase-orders"
                    ? "Record receive"
                    : detail.kind === "purchase-receives"
                      ? "Create bill"
                      : "Record payment"}
                <ArrowRight size={14} />
              </Button>
            )}
            {detail.kind === "requests" && detail.status === "Approved" && (
              <Link to={`/purchase-orders/new?source=${detail.id}`}>
                <Button variant="secondary">Create purchase order</Button>
              </Link>
            )}
          </div>
          <p className="mt-5 text-xs text-slate-400">
            This preview and all workflow actions use local demo state. There is
            no live approval, order, receipt, or payment.
          </p>
        </Modal>
      )}
      <DeleteConfirm
        open={Boolean(pendingDelete)}
        title="Delete record?"
        description={`Delete ${pendingDelete?.id ?? "this record"} from local demo data? Linked records remain unchanged and nothing is deleted from ERP.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeRecord}
      />
    </div>
  );
}
