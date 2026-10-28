import { isDefiniteHttpRejection } from "../lib/http-write-outcome";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, Paperclip, Plus, Save, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { invoiceDecimal, invoicePreview } from "./invoice-values";
import { InvoiceDocumentPanel } from "./InvoiceDocuments";
import { InvoiceReviewPanel } from "./InvoiceReview";
import { InvoiceUnitReviewOwner } from "./InvoiceUnitReviewOwner";
import { InvoiceManualUnitReviewOwner } from "./InvoiceManualUnitReview";
import { StandardDataTable } from "../components/data/StandardDataTable";
import { RecordTable } from "../components/data/RecordTable";
import { ListTools, type ExportScope, type ListColumn, type ListFilterField } from "../components/data/ListTools";
import { ActiveFilterChips } from "../components/data/ActiveFilterChips";
import { DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { downloadCsv } from "../lib/csv";
import { invoicePageRows, type InvoiceSort, type InvoiceListFilters } from "./invoice-list-view";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  captureInvoiceIntake, getInvoiceIntake, listInvoiceIntake, updateInvoiceIntake, cancelInvoiceIntake, invoiceAllows, invoiceEditInput, InvoiceIntakeError,
  type InvoiceDetail, type InvoiceIntakeInput, type InvoiceLineInput, type InvoicePage, type InvoiceSummary,
} from "../../../src/platform/procurement-invoices-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Try again. The invoice was not confirmed.";
const money = (amount: number | string, currency: string) => {
  const [whole, fraction = ""] = String(amount).split(".");
  return `${currency} ${whole}.${fraction.padEnd(2, "0")}`;
};
const blankLine = (): InvoiceLineInput => ({ description: "", quantity: "1", unitPrice: "0", taxAmount: "0" });

function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Invoice intake needs an ERP company.");
  return readiness;
}

const invoiceColumns: ListColumn[] = [
  { key: "date", label: "Date", width: 120 },
  { key: "number", label: "Number / Description", width: 235 },
  { key: "vendor", label: "Vendor", width: 210 },
  { key: "status", label: "Status", width: 135 },
  { key: "amount", label: "Amount", width: 170 },
];
const invoiceFilterFields: ListFilterField[] = [
  { key: "number", label: "Number" }, { key: "vendor", label: "Vendor" },
  { key: "date", label: "Date" }, { key: "status", label: "Status", type: "select", options: ["Received", "Cancelled"] },
  { key: "amount", label: "Amount" },
];
const invoiceSortOptions: { key: InvoiceSort; label: string }[] = [
  { key: "newest", label: "Date · Newest on this page" }, { key: "oldest", label: "Date · Oldest on this page" },
  { key: "number", label: "Number on this page" }, { key: "vendor", label: "Vendor on this page" },
  { key: "status", label: "Status on this page" }, { key: "amount", label: "Amount · Highest on this page" },
];

export function LiveInvoiceList() {
  const readiness = useCompany();
  const { selection, authEpoch } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceListRecord key={`${authEpoch}:${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.principalId}`} />;
}
function InvoiceListRecord() {
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<InvoiceListFilters>({});
  const [sort, setSort] = useState<InvoiceSort>("newest");
  const [visibleColumns, setVisibleColumns] = useState(invoiceColumns.map(column => column.key));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [clipText, setClipText] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<InvoiceSummary | null>(null);
  const canRead = permissions.includes("procurement-invoice-read");
  const canCapture = canRead && permissions.includes("procurement-invoice-capture");
  const canExport = canRead && permissions.includes("procurement-invoice-export");
  const rows = invoicePageRows(data?.items ?? [], query, filters, sort);
  const selectPage = (next: number) => { setPreview(null); setSelected([]); setPage(next); };
  const applyFilters = (next: InvoiceListFilters) => { setFilters(next); setSelected([]); setPreview(null); };
  const exportPage = (scope: ExportScope) => {
    const csvSafe = (value: string) => /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    if (!canExport) { setNotice("Invoice CSV export needs a separate export permission."); return; }
    if (scope === "all") { setNotice("All-page export is not connected. Export this page or selected invoices."); return; }
    const exported = scope === "selected" ? rows.filter(row => selected.includes(row.id)) : rows;
    if (!exported.length) { setNotice("No loaded invoices are selected for export."); return; }
    const shown = invoiceColumns.filter(column => visibleColumns.includes(column.key));
    downloadCsv(`bills-${scope}-page-${page}.csv`, [shown.map(column => column.label), ...exported.map(row => shown.map(column => csvSafe(
      column.key === "date" ? row.invoiceDate : column.key === "number" ? row.invoiceNumber
        : column.key === "vendor" ? row.supplierName ?? "Vendor" : column.key === "status" ? row.status
          : `${row.currencyCode} ${String(row.grossAmount)}`)))]);
    setNotice(`Downloaded ${exported.length} invoice(s) from loaded page ${page}.`);
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setSelected([]); setPreview(null);
    if (!canRead) { setLoading(false); return () => controller.abort(); }
    listInvoiceIntake(legalEntityId, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page, revision, canRead]);
  const action = canCapture ? <Button onClick={() => navigate("/bills/new")}><Plus size={16} /> Record invoice</Button> : undefined;
  const pageSize = data?.pageSize || 25;
  const first = data && data.total > (page - 1) * pageSize ? (page - 1) * pageSize + 1 : 0;
  const last = data && first ? Math.min(page * pageSize, data.total) : 0;
  const renderCell = (invoice: InvoiceSummary, column: ListColumn) => {
    if (column.key === "date") return <span className="text-muted-foreground">{invoice.invoiceDate}</span>;
    if (column.key === "number") return <Link aria-label={invoice.invoiceNumber} className="block text-left" to={`/bills/${invoice.id}`}>
      <span className="font-semibold text-primary">{invoice.invoiceNumber}</span>
      <span className="mt-1 block text-xs text-muted-foreground">Supplier invoice</span>
    </Link>;
    if (column.key === "vendor") return invoice.supplierName || "Vendor";
    if (column.key === "status") return <Badge>{invoice.status}</Badge>;
    return <span className="font-medium">{money(invoice.grossAmount, invoice.currencyCode)}</span>;
  };
  return <div className="p-5 sm:p-8">
    <PageHeader title="Bills" subtitle="Create and manage your vendor bills."
      actions={<><ListTools entity="Bills" columns={invoiceColumns} visibleColumns={visibleColumns} onVisibleColumnsChange={setVisibleColumns}
        columnWidths={columnWidths} onColumnWidthsChange={setColumnWidths} clipText={clipText} onClipTextChange={setClipText}
        sortOptions={invoiceSortOptions} onSort={key => setSort(key as InvoiceSort)}
        filterFields={invoiceFilterFields} activeFilters={filters} onApplyFilters={applyFilters}
        currentView={filters.status || "All Bills"} viewOptions={["All Bills", "Received", "Cancelled"]}
        onViewChange={view => applyFilters({ ...filters, status: view === "All Bills" ? "" : view })}
        onExport={exportPage} selectedCount={selected.length} onRefresh={() => setRevision(value => value + 1)}
        onResetWidths={() => setColumnWidths({})} notify={setNotice}
        unavailableImportReason="Invoice import has no scoped server action yet. Record an invoice individually."
        unavailableExportReason={!canExport ? "A separate invoice export permission is required." : undefined}
        unavailableAllExportReason="Only the current server page is loaded."
        viewExportLabel="Export Current Page View" />{action}</>} />
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <Select aria-label="Filter bills by status on this page" value={filters.status || "All"}
            onChange={event => applyFilters({ ...filters, status: event.target.value === "All" ? "" : event.target.value })}>
            <option value="All">All Bills</option><option value="Received">Received</option><option value="Cancelled">Cancelled</option>
          </Select>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{rows.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative"><Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search bills on this page" placeholder="Search number or vendor on this page" className="w-48 pl-10 sm:w-60"
              value={query} onChange={event => { setQuery(event.target.value); setSelected([]); }} /></div>
          <Select aria-label="Sort bills on this page" value={sort} onChange={event => setSort(event.target.value as InvoiceSort)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            <option value="amount">Highest amount</option><option value="number">Number</option><option value="vendor">Vendor</option>
          </Select>
        </div>
      </div>
      <ActiveFilterChips fields={invoiceFilterFields} filters={filters} onChange={applyFilters} />
      <div className="px-5 pt-3"><p className="text-xs text-muted-foreground">Showing loaded page {page} for this company. Search, filters and sorting apply to this page only.</p>
        {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
        {!canRead && <p role="alert" className="mt-3 text-sm">You do not have invoice list access for this company.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {loading && canRead && <p role="status" className="my-5">Loading invoices…</p>}
      </div>
      {!loading && !error && canRead && <>
        {selected.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-700">
          <span>{selected.length} selected on this page</span>
          {canExport ? <Button variant="secondary" onClick={() => exportPage("selected")}>Export selected</Button>
            : <span className="text-xs">Export needs a separate invoice export permission.</span>}
          <Button variant="ghost" className="ml-auto" onClick={() => setSelected([])}>Clear selection</Button>
        </div>}
        {rows.length ? <StandardDataTable rows={rows} columns={invoiceColumns} visibleColumns={visibleColumns}
          columnWidths={columnWidths} clipText={clipText} selected={selected} onSelectedChange={setSelected}
          onSort={key => setSort(key as InvoiceSort)} onOpen={invoice => setPreview(invoice)}
          rowLabel={invoice => `Open ${invoice.invoiceNumber}`} renderCell={renderCell}
          renderActions={invoice => <button type="button" aria-label={`Actions for ${invoice.invoiceNumber}`}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary-soft hover:text-primary"
            onClick={() => setPreview(invoice)}><MoreHorizontal size={18} /></button>} />
          : <div className="p-5"><EmptyState title={data?.items.length || data?.total ? "No matching bills on this page" : "No invoices received yet"}
            description={data?.items.length || data?.total ? "Change this page's search or filters, or move to another page." : "Record a supplier invoice to start its review."}
            action={data?.items.length || data?.total ? <Button variant="secondary" onClick={() => { setQuery(""); applyFilters({}); }}>Clear page filters</Button> : action} /></div>}
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>{data ? `${first}–${last} of ${data.total} · ${rows.length} shown on this page` : "0 records shown"}</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={loading || page <= 1} onClick={() => selectPage(page - 1)}>Previous</Button>
          <span>Page {page}{data ? ` of ${Math.max(1, Math.ceil(data.total / pageSize))}` : ""}</span>
          <Button variant="secondary" disabled={loading || !data || page * pageSize >= data.total} onClick={() => selectPage(page + 1)}>Next</Button>
        </div>
      </footer>
    </Panel>
    {preview && <Modal title={`${preview.invoiceNumber} · Bill`} onClose={() => setPreview(null)}>
      <div className="space-y-3 text-sm"><p className="font-medium">{preview.supplierName || "Vendor"}</p>
        <p>{preview.invoiceDate} · {money(preview.grossAmount, preview.currencyCode)} · <Badge>{preview.status}</Badge></p>
        <p className="text-muted-foreground">Edit and cancellation availability is checked on the saved invoice detail, where server allowed actions and revision are available.</p>
        <Link to={`/bills/${preview.id}`}><Button variant="secondary">View full details</Button></Link>
      </div>
    </Modal>}
  </div>;
}

export function LiveInvoiceEditor() {
  const { id } = useParams();
  const readiness = useCompany();
  const { selection, authEpoch } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceEditorRecord key={`${authEpoch}:${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.principalId}:${id ?? "new"}`} />;
}
function InvoiceEditorRecord() {
  const { id } = useParams();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions } = useCompany();
  const [input, setInput] = useState<InvoiceIntakeInput>(() => ({ supplierId: "", invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10), currencyCode: defaultCurrencyCode, lines: [blankLine()] }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(input));
  const [original, setOriginal] = useState<InvoiceDetail | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(!!id);
  const [reason, setReason] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    setLoadingInvoice(true); setOriginal(null);
    getInvoiceIntake(legalEntityId, id, abort.signal).then(record => {
      if (abort.signal.aborted) return;
      const editable = invoiceAllows(record, "Edit") ? invoiceEditInput(record) : null;
      setOriginal(record);
      if (editable) { setInput(editable); setBaseline(JSON.stringify(editable)); }
    }).catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoadingInvoice(false); });
    return () => abort.abort();
  }, [legalEntityId, id]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(input) !== baseline || reason.trim().length > 0;
  const backTo = id ? `/bills/${id}` : "/bills";
  const leave = () => {
    if (saving) return;
    if (uncertain) { setReconcileOpen(true); return; }
    if (dirty) setDiscardOpen(true); else navigate(backTo);
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoadingVendors(true);
    listVendorDrafts(legalEntityId, { search: vendorSearch, pageSize: 25, signal: controller.signal })
      .then((page) => { if (!controller.signal.aborted) setVendors(page.items.filter((vendor) =>
        vendor.status === "Active" || vendor.status === "Suspended" || vendor.status === "Inactive")); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingVendors(false); });
    return () => controller.abort();
  }, [legalEntityId, vendorSearch]);
  const setLine = (index: number, changes: Partial<InvoiceLineInput>) => setInput((current) => ({
    ...current, lines: current.lines.map((line, at) => at === index ? { ...line, ...changes } : line),
  }));
  let preview: ReturnType<typeof invoicePreview> | null = null;
  try { preview = invoicePreview(input.lines); } catch { /* Field errors are shown on submission. */ }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || uncertain || stale || (id && (!original || !invoiceAllows(original, "Edit")))) return;
    setError("");
    let draft: InvoiceIntakeInput;
    try {
      draft = { ...input, lines: input.lines.map(line => ({ ...line, quantity: invoiceDecimal(line.quantity, true),
        unitPrice: invoiceDecimal(line.unitPrice), taxAmount: invoiceDecimal(line.taxAmount) })) };
      if (id && !reason.trim()) throw new Error("Add a reason for changing this invoice.");
    } catch (cause) { setError(errorText(cause)); return; }
    setSaving(true);
    try {
      const result = id && original
        ? await updateInvoiceIntake(legalEntityId, id, original.version, draft, reason)
        : await captureInvoiceIntake(legalEntityId, draft);
      if (alive.current) navigate(`/bills/${result.id}`);
    } catch (cause) {
      if (!alive.current) return;
      setError(errorText(cause));
      if (cause instanceof InvoiceIntakeError && cause.status === 409) setStale(true);
      if (!(cause instanceof InvoiceIntakeError) || !isDefiniteHttpRejection(cause.status)) setUncertain(true);
    } finally { if (alive.current) setSaving(false); }
  }
  if (!permissions.includes("procurement-invoice-capture")) return <div className="p-5 sm:p-8" role="alert">You do not have access to record invoices for this company.</div>;
  return <div className="pb-20">
    <header className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={23} strokeWidth={1.4} />{id ? "Edit" : "New"} Bill</h1>
      <Button type="button" variant="ghost" aria-label="Close editor" disabled={saving} onClick={leave}><X size={21} /></Button>
    </header>
    {loadingInvoice ? <p className="px-5 py-6 sm:px-8" role="status">Loading invoice…</p>
      : id && !original ? <p className="px-5 py-6 sm:px-8" role="alert">{error || "Invoice not found."}</p>
        : id && !invoiceAllows(original!, "Edit") ? <div className="px-5 py-6 sm:px-8" role="alert">This invoice cannot be edited. <Link className="text-primary underline" to={backTo}>Open its saved details</Link>.</div>
          : <form onSubmit={save}>
      <fieldset disabled={saving || uncertain || stale} className="min-w-0 border-0 p-0">
        <div className="max-w-[1260px] space-y-7 px-5 py-6 sm:px-8">
          <p className="text-sm text-muted-foreground">Record the supplier invoice as received. Review and matching happen after intake.</p>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}
            {id && <Button type="button" variant="secondary" onClick={() => { if (window.confirm("Reload the saved invoice and discard these changes?")) window.location.reload(); }}>Reload saved invoice</Button>}
          </div>}
          <div className="-mx-5 bg-surface-muted px-5 py-5 sm:-mx-8 sm:px-8">
            <div className="max-w-xl space-y-3">
              <Field label="Find vendor"><Input value={vendorSearch} disabled={!!id} onChange={event => setVendorSearch(event.target.value)} placeholder="Search vendor name" /></Field>
              <Field label="Vendor Name *"><Select aria-label="Vendor" required value={input.supplierId} disabled={loadingVendors || !!id}
                onChange={event => setInput({ ...input, supplierId: event.target.value })}>
                <option value="">{loadingVendors ? "Loading vendors…" : "Choose vendor"}</option>
                {id && original && !vendors.some(vendor => vendor.id === original.supplierId) && <option value={original.supplierId}>{original.supplierName || "Saved vendor"}</option>}
                {vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.displayName}{vendor.status !== "Active" ? ` · ${vendor.status}` : ""}</option>)}
              </Select></Field>
              {id ? <p className="text-xs text-muted-foreground">The saved supplier cannot be changed on this invoice.</p>
                : dirty || saving || uncertain ? <p className="text-xs text-muted-foreground">Finish or discard this bill before opening the vendor directory.</p>
                  : <Link className="block text-sm text-primary hover:underline" to={`/vendors/new?returnTo=${encodeURIComponent("/bills/new")}`}>+ Add a vendor in the shared directory</Link>}
            </div>
          </div>
          <div className="grid max-w-4xl gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field label="Bill Date *"><Input aria-label="Invoice date" required type="date" value={input.invoiceDate} onChange={event => setInput({ ...input, invoiceDate: event.target.value })} /></Field>
            <Field label="Bill # *"><Input aria-label="Invoice number" required maxLength={120} value={input.invoiceNumber} onChange={event => setInput({ ...input, invoiceNumber: event.target.value })} /></Field>
            <Field label="Due Date"><Input aria-label="Due date" type="date" min={input.invoiceDate} value={input.dueDate || ""} onChange={event => setInput({ ...input, dueDate: event.target.value || null })} /></Field>
            <Field label="Currency *"><Input aria-label="Currency" required maxLength={3} value={input.currencyCode} onChange={event => setInput({ ...input, currencyCode: event.target.value.toUpperCase() })} /></Field>
            <Field label="Payment Terms"><Select aria-label="Payment Terms" disabled value="unavailable"><option value="unavailable">Not available yet</option></Select></Field>
          </div>
          <p className="text-xs text-muted-foreground">Payment terms cannot be saved on bills yet. Use the due date above.</p>
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-medium">Item Table</h2><span className="text-xs text-muted-foreground">Goods and services on this invoice</span></div>
            <div className="relative overflow-x-auto"><RecordTable variant="compact" className="w-full min-w-[760px] text-left">
              <thead className="table-head"><tr><th>Item Details</th><th>Quantity</th><th>Rate</th><th>Tax amount</th><th>Amount</th><th scope="col" aria-label="Actions" /></tr></thead>
              <tbody>{input.lines.map((line, index) => {
                let lineTotal = "—"; try { lineTotal = money(invoicePreview([line]).total, input.currencyCode); } catch { /* Wait for valid input. */ }
                return <tr key={index}>
                  <td className="min-w-56 p-3"><Input required aria-label={`Description ${index + 1}`} maxLength={500} value={line.description}
                    onChange={event => setLine(index, { description: event.target.value })} /></td>
                  <td className="w-32 p-3"><Input required aria-label="Quantity" type="number" min="0.0001" step="0.0001" value={line.quantity}
                    onChange={event => setLine(index, { quantity: event.target.value })} /></td>
                  <td className="w-36 p-3"><Input required aria-label="Unit price" type="number" min="0" step="0.0001" value={line.unitPrice}
                    onChange={event => setLine(index, { unitPrice: event.target.value })} /></td>
                  <td className="w-36 p-3"><Input required aria-label="Tax amount" type="number" min="0" step="0.0001" value={line.taxAmount}
                    onChange={event => setLine(index, { taxAmount: event.target.value })} /></td>
                  <td className="whitespace-nowrap px-3 text-right text-sm font-medium">{lineTotal}</td>
                  <td className="p-3"><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} disabled={input.lines.length === 1}
                    onClick={() => setInput({ ...input, lines: input.lines.filter((_, at) => at !== index) })}><Trash2 size={15} /></Button></td>
                </tr>;
              })}</tbody>
            </RecordTable></div>
            <div className="p-3"><Button type="button" variant="ghost" disabled={input.lines.length >= 200}
              onClick={() => setInput({ ...input, lines: [...input.lines, blankLine()] })}><Plus size={14} /> Add new row</Button></div>
          </section>
          <div className="ml-auto max-w-md space-y-3 rounded-xl bg-surface-muted p-5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span>{preview ? money(preview.net, input.currencyCode) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{preview ? money(preview.tax, input.currencyCode) : "—"}</span></div>
            <div className="flex justify-between border-t border-border pt-3 text-base font-semibold"><span>Total ({input.currencyCode})</span><span>{preview ? money(preview.total, input.currencyCode) : "—"}</span></div>
            {!preview && <p className="text-xs text-muted-foreground">Complete valid quantities and amounts to preview totals.</p>}
          </div>
          <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
            <Field label="Notes"><Textarea disabled value="" placeholder="Notes are not available on bills yet." /></Field>
            <Field label="Terms and Conditions"><Textarea disabled value="" placeholder="Terms are not available on bills yet." /></Field>
            <div className="sm:col-span-2"><Button type="button" variant="secondary" disabled><Paperclip size={16} /> Attach Files</Button>
              <p className="mt-2 text-xs text-muted-foreground">Save the invoice first, then use its Documents panel to attach supplier files. No attachment is silently stored from this form.</p>
            </div>
          </div>
          {id && <Field label="Reason for change *"><Textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>}
        </div>
        <footer className="sticky bottom-8 z-10 flex flex-wrap items-center gap-2 border-y border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-8">
          <Button type="submit" disabled={saving || uncertain || stale}><Save size={14} />{saving ? "Saving…" : id ? "Save changes" : "Record as received"}</Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={leave}><ArrowLeft size={14} /> Cancel</Button>
        </footer>
      </fieldset>
      {stale && <p className="px-5 py-4 sm:px-8" role="alert">The saved invoice changed. Your entries are kept here. <Button type="button" variant="secondary" onClick={() => { if (window.confirm("Reload the saved invoice and discard these changes?")) window.location.reload(); }}>Reload saved invoice</Button></p>}
      {uncertain && <p className="px-5 py-4 sm:px-8" role="alert">The response was not confirmed. Open the invoice list and check the saved record before making another change. <Link className="text-primary underline" to="/bills">Open bills</Link></p>}
      {discardOpen && <Modal title="Discard unsaved changes?" onClose={() => setDiscardOpen(false)}>
        <p className="text-sm text-muted-foreground">Your entries have not been saved to the ERP. Leave this bill editor?</p>
        <div className="mt-5 flex gap-2"><Button type="button" variant="secondary" onClick={() => setDiscardOpen(false)}>Keep editing</Button>
          <Button type="button" variant="danger" disabled={saving} onClick={() => { if (!saving && !uncertain) navigate(backTo); }}>Discard and leave</Button></div>
      </Modal>}
      {reconcileOpen && <Modal title="Check whether this invoice was saved" onClose={() => setReconcileOpen(false)}>
        <p className="text-sm text-muted-foreground">The ERP response was not confirmed. Check the saved invoice list before making another change or recording the invoice again.</p>
        <div className="mt-5 flex gap-2"><Button type="button" variant="secondary" onClick={() => setReconcileOpen(false)}>Stay on editor</Button>
          <Button type="button" onClick={() => navigate("/bills")}>Open bills to check</Button></div>
      </Modal>}
    </form>}
  </div>;
}

export function LiveInvoiceDetail() {
  const { id } = useParams();
  const readiness = useCompany();
  const { selection, authEpoch } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceDetailRecord key={JSON.stringify([authEpoch, readiness.tenantId, readiness.legalEntityId, selection.entityId ?? "", selection.branch ?? "",
    readiness.principalId, readiness.permissions, readiness.capabilities, id])} />;
}
function InvoiceDetailRecord() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const { id } = useParams();
  const { legalEntityId, capabilities, permissions } = useCompany();
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getInvoiceIntake(legalEntityId, id, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setInvoice(result); setUncertain(false); setStale(false); setReason(""); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setError(errorText(cause)); setStale(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, refresh]);
  const refreshSavedInvoice = () => { if (busy || loading) return; setLoading(true); setError(""); setRefresh(value => value + 1); };
  async function cancel() {
    if (!permissions.includes("procurement-invoice-capture") || !invoice || busy || loading || uncertain || stale || !invoiceAllows(invoice, "Cancel") || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await cancelInvoiceIntake(legalEntityId, invoice.id, invoice.version, reason);
      if (!alive.current) return;
      setInvoice({ ...invoice, status: "Cancelled", allowedActions: [] });
      const saved = await getInvoiceIntake(legalEntityId, invoice.id);
      if (alive.current) { setInvoice(saved); setReason(""); }
    } catch (cause) {
      if (!alive.current) return;
      setError(errorText(cause));
      if (cause instanceof InvoiceIntakeError && cause.status === 409) setStale(true);
      if (!(cause instanceof InvoiceIntakeError) || !isDefiniteHttpRejection(cause.status)) setUncertain(true);
    } finally { if (alive.current) setBusy(false); }
  }
  if (loading && !invoice) return <div className="p-5 sm:p-8" role="status">Loading invoice…</div>;
  if (!invoice) return <div className="p-5 sm:p-8" role="alert">{error || "Invoice not found."} <Button variant="secondary" onClick={refreshSavedInvoice}>Try loading again</Button></div>;
  const canEdit = !loading && !busy && !uncertain && !stale && permissions.includes("procurement-invoice-capture") && invoiceAllows(invoice, "Edit");
  const canCancel = permissions.includes("procurement-invoice-capture") && invoiceAllows(invoice, "Cancel");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "items", label: `Items (${invoice.lines.length})` },
    { key: "related", label: "Related" },
    { key: "comments", label: "Comments" },
    { key: "history", label: "History" },
  ];
  return <div className="min-h-[calc(100dvh-5rem)] bg-background">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <Link to="/bills" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft size={13} /> Bills</Link>
        <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold">Invoice {invoice.invoiceNumber}</h1><Badge>{invoice.status}</Badge></div>
        <p className="mt-1 text-xs text-muted-foreground">{invoice.supplierName || "Vendor"} · {invoice.currencyCode} · Revision {invoice.version}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && <Link to={`/bills/${invoice.id}/edit`}><Button variant="secondary">Edit invoice</Button></Link>}
        {capabilities.manualPaymentWorkflow && permissions.includes("procurement-payment-read")
          && permissions.includes("procurement-payment-create")
          ? <Link to={`/payments/new?invoiceId=${encodeURIComponent(invoice.id)}`}><Button variant="secondary">Create manual payment request</Button></Link>
          : <><Button variant="secondary" disabled aria-describedby="invoice-payment-unavailable">Record payment</Button>
            <span id="invoice-payment-unavailable" className="sr-only">Manual payment review is not available yet.</span></>}
        <div className="relative"><Button variant="secondary" aria-label="More invoice actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={16} /> More</Button>
          {menuOpen && <div role="menu" aria-label="Invoice actions" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-card p-3 text-left text-xs shadow-lg">
            <p className="font-medium">More actions</p>
            <Button role="menuitem" variant="ghost" disabled={loading || busy} onClick={() => { setMenuOpen(false); refreshSavedInvoice(); }}>Refresh invoice</Button>
            <p className="mt-1 text-muted-foreground">{canCancel && !uncertain && !stale ? "Cancel is available in Overview after a reason is entered." : uncertain || stale ? "Refresh the saved bill before another action." : "No cancellation action is allowed for this saved invoice."}</p>
            <p className="mt-2 text-muted-foreground">Saved bills cannot be deleted. Payment recording is not connected yet.</p>
          </div>}
        </div>
      </div>
    </header>
    <DetailTabs tabs={tabs} active={activeTab} onChange={key => { setActiveTab(key); setMenuOpen(false); }} />
    <div className="space-y-4 p-4 sm:p-6">
      {loading && <p role="status" className="text-sm text-muted-foreground">Refreshing invoice…</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {error && <div role="alert" className="text-sm text-destructive">{error} <Button variant="secondary" onClick={refreshSavedInvoice}>Refresh invoice</Button></div>}
      {uncertain && <p role="status" className="text-sm">The response was not confirmed. Refresh the invoice to check its saved status before trying another action.</p>}
      {stale && <p role="status" className="text-sm">The invoice changed. Refresh the saved record before another action.</p>}
      <div hidden={activeTab !== "overview"} inert={activeTab !== "overview"} className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(270px,0.85fr)]">
          <DetailSection title="Bill Overview" action={<Badge>{invoice.status}</Badge>}>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailValue label="Invoice date" value={invoice.invoiceDate} />
              <DetailValue label="Due date" value={invoice.dueDate || "—"} />
              <DetailValue label="Vendor" value={invoice.supplierName || "Vendor"} />
              <DetailValue label="Received via" value={invoice.intakeChannel} />
              <DetailValue label="Purchase order" value={invoice.purchaseOrderId || "Not linked"} />
              <DetailValue label="Revision" value={invoice.version} />
            </dl>
          </DetailSection>
          <div className="space-y-4">
            <DetailSection title="Amounts"><dl className="grid gap-4 sm:grid-cols-2">
              <DetailValue label="Net" value={money(invoice.exactAmounts?.netAmount ?? invoice.netAmount, invoice.currencyCode)} />
              <DetailValue label="Tax" value={money(invoice.exactAmounts?.taxAmount ?? invoice.taxAmount, invoice.currencyCode)} />
              <DetailValue label="Total" value={<strong>{money(invoice.exactAmounts?.grossAmount ?? invoice.grossAmount, invoice.currencyCode)}</strong>} />
            </dl></DetailSection>
            <DetailSection title="Workflow context"><p className="text-sm">{invoice.nextStep}</p><p className="mt-3 text-xs text-muted-foreground">Procurement validates this invoice. Finance owns posting and payment.</p></DetailSection>
          </div>
        </div>
        {capabilities.invoiceDocuments && <InvoiceDocumentPanel key={`${legalEntityId}:${invoice.id}`} invoiceId={invoice.id} canUpload={invoice.status === "Received" && permissions.includes("procurement-invoice-capture")} />}
        {(capabilities.invoiceComparison || capabilities.principalInvoiceComparisonRead) && permissions.includes("procurement-invoice-read") && <InvoiceReviewPanel key={`${invoice.id}:${invoice.version}`}
          company={legalEntityId} invoiceId={invoice.id} invoiceVersion={invoice.version} currency={invoice.currencyCode} lines={invoice.lines}
          comparisonAvailable={capabilities.invoiceComparison || capabilities.principalInvoiceComparisonRead} refresh={(message) => { setNotice(message ?? ""); setRefresh(value => value + 1); }} />}
        {capabilities.invoiceOriginalUnitReview && <InvoiceUnitReviewOwner key={`${invoice.id}:${invoice.version}`} invoiceId={invoice.id} invoiceVersion={invoice.version} />}
        {capabilities.invoiceManualUnitReviewRead && <InvoiceManualUnitReviewOwner key={`${invoice.id}:${invoice.version}:manual`} invoiceId={invoice.id} invoiceVersion={invoice.version} />}
        {canCancel && <DetailSection title="Cancel invoice"><div className="space-y-3">
          <p className="text-sm text-muted-foreground">Keep this invoice and its history, and stop further processing.</p>
          <Field label="Cancellation reason"><Textarea required maxLength={1000} disabled={busy || loading || uncertain || stale} value={reason} onChange={event => setReason(event.target.value)} /></Field>
          <Button variant="danger" disabled={busy || loading || uncertain || stale || !reason.trim()} onClick={() => { if (window.confirm("Cancel this invoice? Its saved history will be retained.")) void cancel(); }}>Cancel invoice</Button>
        </div></DetailSection>}
      </div>
      {activeTab === "items" && <DetailSection title="Items / Line Details"><div className="overflow-x-auto"><RecordTable variant="compact" className="w-full min-w-[700px] text-left text-sm">
        <thead className="table-head"><tr><th className="table-cell">Line</th><th className="table-cell">Description</th><th className="table-cell">Quantity</th><th className="table-cell">Unit price</th><th className="table-cell">Tax</th></tr></thead>
        <tbody>{invoice.lines.map(line => <tr key={line.id} className="border-b border-border"><td className="table-cell">{line.lineNumber}</td><td className="table-cell font-medium">{line.description}</td>
          <td className="table-cell">{line.exactAmounts?.quantity ?? line.quantity}</td><td className="table-cell">{money(line.exactAmounts?.unitPrice ?? line.unitPrice, invoice.currencyCode)}</td>
          <td className="table-cell">{money(line.exactAmounts?.taxAmount ?? line.taxAmount, invoice.currencyCode)}</td></tr>)}</tbody>
      </RecordTable></div><div className="ml-auto mt-4 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Net</span><span>{money(invoice.exactAmounts?.netAmount ?? invoice.netAmount, invoice.currencyCode)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{money(invoice.exactAmounts?.taxAmount ?? invoice.taxAmount, invoice.currencyCode)}</span></div><div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span>{money(invoice.exactAmounts?.grossAmount ?? invoice.grossAmount, invoice.currencyCode)}</span></div></div></DetailSection>}
      {activeTab === "related" && <DetailSection title="Related Records"><dl className="grid gap-5 sm:grid-cols-2">
        <DetailValue label="Purchase order reference" value={invoice.purchaseOrderId || "Not linked"} />
        <DetailValue label="Vendor" value={invoice.supplierName || "Vendor"} />
      </dl><p className="mt-4 text-sm text-muted-foreground">Linked orders, credits and payments are not shown here yet. Open their workspaces to check the latest records.</p></DetailSection>}
      {activeTab === "comments" && <DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments are not available for bills yet.</p></DetailSection>}
      {activeTab === "history" && <DetailSection title="History"><dl className="grid gap-5 sm:grid-cols-2"><DetailValue label="Saved revision" value={invoice.version} /><DetailValue label="Created at" value={invoice.createdAt || "—"} /></dl><p className="mt-4 text-sm text-muted-foreground">A detailed activity log is not available here yet. The saved revision above is confirmed.</p></DetailSection>}
    </div>
  </div>;
}
