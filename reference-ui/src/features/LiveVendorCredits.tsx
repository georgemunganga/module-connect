import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingBag, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { ListTools, type ExportScope, type ListFilterField } from "../components/data/ListTools";
import { ActiveFilterChips } from "../components/data/ActiveFilterChips";
import { downloadCsv } from "../lib/csv";
import { StandardDataTable } from "../components/data/StandardDataTable";
import { DetailSection, DetailValue, DetailTabs } from "../components/data/DetailPrimitives";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { getInvoiceIntake, listInvoiceIntake, type InvoiceDetail, type InvoicePage } from "../../../src/platform/procurement-invoices-api";
import { cancelVendorCredit, createVendorCredit, creditAmount, creditAllows, creditExactUnits, getVendorCredit, listVendorCredits, updateVendorCredit, VendorCreditApiError,
  type VendorCreditDetail, type VendorCreditDraft, type VendorCreditPage } from "../../../src/platform/procurement-vendor-credits-api";
const errorText = (error: unknown) => error instanceof Error ? error.message : "The credit result was not confirmed. Review its saved details.";
function useScope() { const scope = useLiveReadiness(); if (!scope) throw new Error("Choose an ERP company first."); return scope; }
function Scope({ children }: { children: ReactNode }) {
  const scope = useScope(), { selection } = useErpShell(), { id } = useParams();
  if (selection.entityId && selection.entityId !== scope.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <div key={`${scope.tenantId}:${scope.legalEntityId}:${selection.branch ?? ""}:${scope.principalId}:${id ?? "new"}`}>{children}</div>;
}
function useAlive() { const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []); return alive; }
const filterFields: ListFilterField[] = [{ key: "search", label: "Credit, bill or vendor", type: "text" }, { key: "status", label: "Status", type: "select", options: ["Draft", "Cancelled"] }];
const columns = [{ key: "number", label: "Credit number", width: 180 }, { key: "invoice", label: "Bill", width: 170 },
  { key: "vendor", label: "Vendor", width: 230 }, { key: "amount", label: "Recorded amount", width: 180 }, { key: "status", label: "Status", width: 130 }];
export function LiveVendorCreditList() { return <Scope><CreditList /></Scope>; }
function CreditList() {
  const scope = useScope(), navigate = useNavigate(), [query] = useSearchParams();
  const invoiceId = query.get("invoiceId") || undefined;
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [data, setData] = useState<VendorCreditPage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState(""), [filters, setFilters] = useState<Record<string, string>>({}), [queryText, setQueryText] = useState("");
  const [visible, setVisible] = useState(columns.map(column => column.key)), [widths, setWidths] = useState<Record<string, number>>({});
  const [clip, setClip] = useState(false), [sort, setSort] = useState("newest");
  const applyFilters = (next: Record<string, string>) => { setFilters(next); setQueryText(next.search || ""); setPage(1); };
  const rows = [...(data?.items ?? [])].sort((left, right) => {
    if (sort === "newest") return right.createdAt.localeCompare(left.createdAt);
    if (sort === "amount") {
      const a = creditExactUnits(left.exactAmount), b = creditExactUnits(right.exactAmount); return a < b ? -1 : a > b ? 1 : 0;
    }
    return (sort === "vendor" ? left.supplierName : sort === "status" ? left.status : sort === "invoice" ? left.invoiceNumber : left.creditNumber)
      .localeCompare(sort === "vendor" ? right.supplierName : sort === "status" ? right.status : sort === "invoice" ? right.invoiceNumber : right.creditNumber);
  });
  function exportPage(exportScope: ExportScope) {
    if (exportScope === "all") { setNotice("Full export is not connected. Export the current page or selected records."); return; }
    const exported = exportScope === "selected" ? rows.filter(row => selected.includes(row.id)) : rows;
    if (!exported.length) { setNotice("Choose saved records to export."); return; }
    const safe = (value: string) => /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    const shown = columns.filter(column => visible.includes(column.key));
    downloadCsv(`vendor-credits-${exportScope}-page-${page}.csv`, [shown.map(column => column.label), ...exported.map(row => shown.map(column =>
      safe(column.key === "number" ? row.creditNumber : column.key === "invoice" ? row.invoiceNumber : column.key === "vendor" ? row.supplierName : column.key === "amount" ? `${row.currencyCode} ${row.exactAmount}` : row.status)))]);
  }
  const canCreate = scope.permissions.includes("procurement-invoice-capture") && scope.permissions.includes("procurement-invoice-read");
  useEffect(() => {
    const abort = new AbortController(); setData(null); setSelected([]); setLoading(true); setError("");
    listVendorCredits(scope.legalEntityId, page, invoiceId, abort.signal, { search: filters.search, status: filters.status }).then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [scope.legalEntityId, page, invoiceId, revision, filters.search, filters.status]);
  return <div className="p-5 sm:p-8"><PageHeader title="Vendor Credits" subtitle="Record supplier credits against received bills. Finance manages posting, applications and refunds."
    actions={<><ListTools entity="Vendor Credits" columns={columns} visibleColumns={visible} onVisibleColumnsChange={setVisible}
      columnWidths={widths} onColumnWidthsChange={setWidths} clipText={clip} onClipTextChange={setClip}
      sortOptions={[{ key: "newest", label: "Newest on this page" }, { key: "number", label: "Credit number on this page" }, { key: "amount", label: "Amount on this page" }]}
      onSort={setSort} filterFields={filterFields} activeFilters={filters} onApplyFilters={applyFilters}
      currentView={filters.status || "All Vendor Credits"} viewOptions={["All Vendor Credits", "Draft", "Cancelled"]}
      onViewChange={view => applyFilters({ ...filters, status: view === "All Vendor Credits" ? "" : view })}
      onExport={exportPage} selectedCount={selected.length} onRefresh={() => setRevision(value => value + 1)} onResetWidths={() => setWidths({})} notify={setNotice} />{canCreate && <Link to="/vendor-credits/new"><Button>New Vendor Credit</Button></Link>}</>} />
    <Panel><div className="p-5"><form className="mb-4 flex max-w-xl gap-2" onSubmit={event => { event.preventDefault(); applyFilters({ ...filters, search: queryText.trim() }); }}><Input aria-label="Search vendor credits" placeholder="Search credit number, bill or vendor" maxLength={160} value={queryText} onChange={event => setQueryText(event.target.value)} /><Button type="submit" variant="secondary">Search</Button></form>
    <ActiveFilterChips fields={filterFields} filters={filters} onChange={applyFilters} />{notice && <p role="status" className="my-3 text-sm">{notice}</p>}{error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading vendor credits…</p> : data?.items.length ? <StandardDataTable rows={rows}
      columns={columns} visibleColumns={visible} columnWidths={widths} clipText={clip} onSort={setSort} selected={selected} onSelectedChange={setSelected} onOpen={row => navigate(`/vendor-credits/${row.id}`)} rowLabel={row => row.creditNumber}
      renderCell={(row, column) => column.key === "number" ? row.creditNumber : column.key === "invoice" ? row.invoiceNumber : column.key === "vendor" ? row.supplierName
        : column.key === "amount" ? `${row.currencyCode} ${row.exactAmount}` : <Badge>{row.status}</Badge>}
      renderActions={row => <Link to={`/vendor-credits/${row.id}`} className="text-primary">Open</Link>} /> : !error && <EmptyState title={filters.search || filters.status ? "No credits match these filters" : "No vendor credits yet"} description="Choose a received bill to record a credit draft."
        action={canCreate ? <Link to="/vendor-credits/new"><Button>New Vendor Credit</Button></Link> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3"><Button variant="secondary" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</Button></div>}
      <p className="mt-4 text-sm text-muted-foreground">Sorting and CSV exports cover this page. Imports, full export, credit application, Finance balances and refunds are not connected to this draft list.</p>
    </div></Panel></div>;
}
/** Presentation follows the imported TransactionEditor header, context band, field grid and footer. No local store. */
function CreditEditorFrame({ edit, close, children, footer }: { edit: boolean; close: () => void; children: ReactNode; footer: ReactNode }) {
  return <div className="pb-20"><header className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-8"><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={23} strokeWidth={1.4} />{edit ? "Edit" : "New"} Vendor Credit</h1><Button variant="ghost" type="button" aria-label="Close editor" onClick={close}><X size={21} /></Button></header>
    <div className="max-w-[1260px] space-y-7 px-5 py-6 sm:px-8">{children}</div><footer className="sticky bottom-10 z-10 flex flex-wrap items-center gap-2 border-y border-border bg-card px-5 py-4 sm:px-8">{footer}</footer></div>;
}
export function LiveVendorCreditEditor() { return <Scope><CreditEditor /></Scope>; }
function CreditEditor() {
  const scope = useScope(), { id } = useParams(), navigate = useNavigate(), alive = useAlive();
  const [record, setRecord] = useState<VendorCreditDetail | null>(null), [bill, setBill] = useState<InvoiceDetail | null>(null), [bills, setBills] = useState<InvoicePage | null>(null);
  const [billId, setBillId] = useState(""), [billPage, setBillPage] = useState(1), [loading, setLoading] = useState(!!id), [error, setError] = useState("");
  const [draft, setDraft] = useState<VendorCreditDraft>({ creditNumber: "", amount: "", reason: "" }), [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState<"stale" | "unknown" | null>(null);
  const canWrite = scope.permissions.includes("procurement-invoice-capture") && scope.permissions.includes("procurement-invoice-read");
  useEffect(() => {
    if (!id || !canWrite) return;
    const abort = new AbortController(); setLoading(true); setRecord(null);
    getVendorCredit(scope.legalEntityId, id, abort.signal).then(value => { if (abort.signal.aborted) return; setRecord(value);
      setDraft({ creditNumber: value.creditNumber, amount: value.exactAmount, reason: value.reason }); setBillId(value.supplierInvoiceId); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [id, scope.legalEntityId, canWrite]);
  useEffect(() => {
    if (id || !canWrite) return;
    const abort = new AbortController(); setBills(null);
    listInvoiceIntake(scope.legalEntityId, billPage, abort.signal).then(value => { if (!abort.signal.aborted) setBills(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); }); return () => abort.abort();
  }, [id, scope.legalEntityId, billPage, canWrite]);
  useEffect(() => {
    setBill(null); if (!billId || !canWrite) return;
    const abort = new AbortController();
    getInvoiceIntake(scope.legalEntityId, billId, abort.signal).then(value => { if (!abort.signal.aborted) setBill(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); }); return () => abort.abort();
  }, [billId, scope.legalEntityId, canWrite]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || blocked || !canWrite || !bill || (id && !(record && creditAllows(record, "Edit")))) return;
    try { creditAmount(draft.amount); } catch (cause) { setError(errorText(cause)); return; }
    setBusy(true); setError("");
    try { const saved = id && record ? await updateVendorCredit(scope.legalEntityId, id, record.version, draft, changeReason)
      : await createVendorCredit(scope.legalEntityId, { ...draft, supplierInvoiceId: bill.id });
      if (alive.current) navigate(`/vendor-credits/${saved.id}`);
    } catch (cause) { if (alive.current) { setError(errorText(cause)); if (cause instanceof VendorCreditApiError && cause.status === 409) setBlocked("stale"); else if (!(cause instanceof VendorCreditApiError) || cause.status === 0 || cause.status >= 500) setBlocked("unknown"); } }
    finally { if (alive.current) setBusy(false); }
  }
  if (!canWrite) return <p role="alert">Invoice capture and read access are required to record credits.</p>;
  if (loading) return <p role="status">Loading credit…</p>;
  if (id && (!record || !creditAllows(record, "Edit"))) return <p role="alert">{error || "This credit cannot be edited."}</p>;
  return <form onSubmit={event => void save(event)}><CreditEditorFrame edit={!!id} close={() => { if (!busy && (!draft.creditNumber && !draft.amount && !draft.reason || window.confirm("Leave this editor? Unsaved changes will be lost."))) navigate(id ? `/vendor-credits/${id}` : "/vendor-credits"); }}
    footer={<><Button type="submit" disabled={busy || !!blocked || !bill}>{busy ? "Saving…" : "Save as Draft"}</Button><Button type="button" variant="secondary" onClick={() => navigate("/vendor-credits")}>Cancel</Button><Button type="button" variant="secondary" disabled title="Finance credit application is not connected.">Apply credit unavailable</Button></>}>
    {error && <p role="alert">{error}</p>}
    {blocked && <p role="alert">{blocked === "stale" ? "The saved record changed. Your entries are kept here." : "The response was not confirmed. Check saved credits before another change."} <Link className="text-primary underline" to={`/vendor-credits?invoiceId=${billId}`}>Review saved credits</Link>{id && <Button type="button" variant="secondary" onClick={() => { if (window.confirm("Reload saved credit and discard these changes?")) window.location.reload(); }}>Reload saved credit</Button>}</p>}
    <fieldset disabled={busy || !!blocked} className="space-y-7">
      <div className="-mx-5 bg-muted px-5 py-5 sm:-mx-8 sm:px-8"><div className="max-w-xl"><Field label="Source bill"><Select required disabled={!!id} value={billId} onChange={event => setBillId(event.target.value)}><option value="">Choose a received bill</option>{id && record ? <option value={record.supplierInvoiceId}>{record.invoiceNumber}</option> : bills?.items.filter(value => value.status === "Received").map(value => <option key={value.id} value={value.id}>{value.invoiceNumber} · {value.supplierName}</option>)}</Select></Field>
        {!id && bills && bills.total > bills.pageSize && <div className="mt-3 flex gap-2"><Button type="button" variant="secondary" disabled={billPage === 1} onClick={() => { setBillId(""); setBillPage(value => value - 1); }}>Previous bills</Button><Button type="button" variant="secondary" disabled={billPage * bills.pageSize >= bills.total} onClick={() => { setBillId(""); setBillPage(value => value + 1); }}>Next bills</Button></div>}
        {bill && <p className="mt-3 text-sm">Vendor: {bill.supplierName} · Currency: {bill.currencyCode}. These come from the saved bill.</p>}</div></div>
      <div className="grid max-w-4xl gap-x-8 gap-y-5 sm:grid-cols-2"><Field label="Vendor Credit #"><Input required maxLength={80} value={draft.creditNumber} onChange={event => setDraft({ ...draft, creditNumber: event.target.value })} /></Field><Field label="Credit amount"><Input required inputMode="decimal" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></Field><Field label="Credit reason"><Textarea required maxLength={1000} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></Field>{id && <Field label="Reason for change"><Textarea required maxLength={1000} value={changeReason} onChange={event => setChangeReason(event.target.value)} /></Field>}</div>
      <p className="text-sm text-muted-foreground">This records a commercial draft against the bill. It does not change Finance balances, apply a credit or issue a refund.</p>
    </fieldset>
  </CreditEditorFrame></form>;
}
export function LiveVendorCreditDetail() { return <Scope><CreditDetail /></Scope>; }
function CreditDetail() {
  const scope = useScope(), { id } = useParams(), alive = useAlive();
  const [record, setRecord] = useState<VendorCreditDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [tab, setTab] = useState("overview");
  useEffect(() => { if (!id) return; const abort = new AbortController(); setLoading(true); setRecord(null);
    getVendorCredit(scope.legalEntityId, id, abort.signal).then(value => { if (!abort.signal.aborted) setRecord(value); }).catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); }); return () => abort.abort();
  }, [id, scope.legalEntityId]);
  async function cancel() {
    if (!record || busy || blocked || !canWrite || !creditAllows(record, "Cancel") || !reason.trim()) return; setBusy(true); setError("");
    try { const result = await cancelVendorCredit(scope.legalEntityId, record.id, record.version, reason); if (!alive.current) return;
      setRecord({ ...record, ...result, allowedActions: [] }); const saved = await getVendorCredit(scope.legalEntityId, record.id); if (alive.current) setRecord(saved);
    } catch (cause) { if (alive.current) { setError(errorText(cause)); setBlocked(true); } } finally { if (alive.current) setBusy(false); }
  }
  if (loading) return <p role="status">Loading credit…</p>; if (!record) return <p role="alert">{error || "Credit not found."}</p>;
  const canWrite = scope.permissions.includes("procurement-invoice-capture") && scope.permissions.includes("procurement-invoice-read");
  return <div className="-mx-5 -mt-5 min-h-[calc(100dvh-5rem)] bg-background sm:-mx-8 sm:-mt-8"><header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-6"><div><Link className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground" to="/vendor-credits"><ArrowLeft size={13} />Vendor Credits</Link><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{record.creditNumber}</h1><Badge>{record.status}</Badge></div></div>{canWrite && creditAllows(record, "Edit") && <Link to={`/vendor-credits/${record.id}/edit`}><Button variant="secondary">Edit draft</Button></Link>}</header>
    <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "related", label: "Related" }, { key: "comments", label: "Comments" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
    <div className="space-y-5 p-4 sm:p-6">{error && <p role="alert">{error}<Button variant="secondary" onClick={() => window.location.reload()}>Refresh saved credit</Button></p>}
      {tab === "overview" ? <><DetailSection title="Vendor credit"><dl className="grid gap-4 p-5 sm:grid-cols-2"><DetailValue label="Vendor" value={record.supplierName} /><DetailValue label="Recorded amount" value={`${record.currencyCode} ${record.exactAmount}`} /><DetailValue label="Credit reason" value={record.reason} /><DetailValue label="Revision" value={record.version} /></dl></DetailSection>
        {canWrite && creditAllows(record, "Cancel") && <Panel title="Cancel draft"><div className="space-y-3 p-5"><Field label="Cancellation reason"><Textarea required maxLength={1000} disabled={busy || blocked} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || blocked || !reason.trim()} onClick={() => { if (window.confirm("Cancel this draft? Its history will be retained.")) void cancel(); }}>Cancel draft</Button></div></Panel>}
      </> : tab === "related" ? <DetailSection title="Related bill"><Link className="block p-5 text-primary" to={`/bills/${record.supplierInvoiceId}`}>{record.invoiceNumber}</Link></DetailSection> : <DetailSection title={tab === "comments" ? "Comments" : "History"}><p className="p-5 text-sm text-muted-foreground">{tab === "comments" ? "Comments are not connected to this record yet." : "Detailed activity history is not connected to this view. The saved record revision is shown in Overview."}</p></DetailSection>}
      <p className="text-sm text-muted-foreground">Credit application, Finance balances, payment, refund, email and document actions are not connected to this draft.</p>
    </div></div>;
}
