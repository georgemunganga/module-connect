import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { invoiceDecimal, invoicePreview } from "./invoice-values";
import { InvoiceDocumentPanel } from "./InvoiceDocuments";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  captureInvoiceIntake, getInvoiceIntake, listInvoiceIntake, updateInvoiceIntake, cancelInvoiceIntake, invoiceAllows, invoiceEditInput, InvoiceIntakeError,
  type InvoiceDetail, type InvoiceIntakeInput, type InvoiceLineInput, type InvoicePage,
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

export function LiveInvoiceList() {
  const readiness = useCompany();
  const { selection } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceListRecord key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}`} />;
}
function InvoiceListRecord() {
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCapture = permissions.includes("procurement-invoice-capture");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listInvoiceIntake(legalEntityId, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page]);
  const action = canCapture ? <Button onClick={() => navigate("/bills/new")}>Record invoice</Button> : undefined;
  return <div className="p-5 sm:p-8">
    <PageHeader title="Bills" subtitle="Supplier invoices received for review. Payment is handled by Finance." actions={action} />
    <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status">Loading invoices…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Invoice</th><th>Vendor</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((invoice) => <tr key={invoice.id}>
          <td className="font-medium">{invoice.invoiceNumber}</td>
          <td>{invoice.supplierName || "Vendor"}</td><td>{invoice.invoiceDate}</td>
          <td>{money(invoice.grossAmount, invoice.currencyCode)}</td><td><Badge>{invoice.status}</Badge></td>
          <td><Link className="text-sm text-primary hover:underline" to={`/bills/${invoice.id}`}>Open</Link></td>
        </tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No invoices received yet" description="Record a supplier invoice to start its review." action={action} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </div></Panel>
  </div>;
}

export function LiveInvoiceEditor() {
  const { id } = useParams();
  const readiness = useCompany();
  const { selection } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceEditorRecord key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}:${id ?? "new"}`} />;
}
function InvoiceEditorRecord() {
  const { id } = useParams();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions, adminViewOnly } = useCompany();
  const [input, setInput] = useState<InvoiceIntakeInput>({ supplierId: "", invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10), currencyCode: defaultCurrencyCode, lines: [blankLine()] });
  const [original, setOriginal] = useState<InvoiceDetail | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(!!id);
  const [reason, setReason] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    setLoadingInvoice(true); setOriginal(null);
    getInvoiceIntake(legalEntityId, id, abort.signal).then(record => {
      if (abort.signal.aborted) return;
      const editable = invoiceAllows(record, "Edit") ? invoiceEditInput(record) : null;
      setOriginal(record);
      if (editable) setInput(editable);
    }).catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoadingInvoice(false); });
    return () => abort.abort();
  }, [legalEntityId, id]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
      if (!(cause instanceof InvoiceIntakeError) || cause.status === 0 || cause.status >= 500) setUncertain(true);
    } finally { if (alive.current) setSaving(false); }
  }
  if (adminViewOnly || !permissions.includes("procurement-invoice-capture")) return <div className="p-5 sm:p-8" role="alert">You do not have access to record invoices for this company.</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit supplier invoice" : "Record supplier invoice"} subtitle="Save the invoice as received. Review and matching happen next." />
    {loadingInvoice ? <p role="status">Loading invoice…</p> : id && !original ? <p role="alert">{error || "Invoice not found."}</p> : id && (!original || !invoiceAllows(original, "Edit")) ? <p role="alert">This invoice cannot be edited. Open its details to review the current status.</p> :
    <form onSubmit={save} className="max-w-5xl space-y-5">
      <fieldset disabled={saving || uncertain || stale} className="contents">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{id && <Button type="button" variant="secondary" onClick={() => { if (window.confirm("Reload the saved invoice and discard these changes?")) window.location.reload(); }}>Reload saved invoice</Button>}</div>}
      <Panel title="Invoice details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Find vendor"><Input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Search vendor name" /></Field>
        <Field label="Vendor"><Select required value={input.supplierId} disabled={loadingVendors || !!id}
          onChange={(event) => setInput({ ...input, supplierId: event.target.value })}>
          <option value="">{loadingVendors ? "Loading vendors…" : "Choose vendor"}</option>
          {id && original && !vendors.some(vendor => vendor.id === original.supplierId) && <option value={original.supplierId}>{original.supplierName || "Saved vendor"}</option>}
          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}{vendor.status !== "Active" ? ` · ${vendor.status}` : ""}</option>)}
        </Select></Field>
        <Field label="Invoice number"><Input required maxLength={120} value={input.invoiceNumber}
          onChange={(event) => setInput({ ...input, invoiceNumber: event.target.value })} /></Field>
        <Field label="Currency"><Input required maxLength={3} value={input.currencyCode}
          onChange={(event) => setInput({ ...input, currencyCode: event.target.value.toUpperCase() })} /></Field>
        <Field label="Invoice date"><Input required type="date" value={input.invoiceDate}
          onChange={(event) => setInput({ ...input, invoiceDate: event.target.value })} /></Field>
        <Field label="Due date"><Input type="date" min={input.invoiceDate} value={input.dueDate || ""}
          onChange={(event) => setInput({ ...input, dueDate: event.target.value || null })} /></Field>
      </div></Panel>
      <Panel title="Items and services"><div className="space-y-4 p-5">
        {input.lines.map((line, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
          <Field label={`Description ${index + 1}`}><Input required maxLength={500} value={line.description}
            onChange={(event) => setLine(index, { description: event.target.value })} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.quantity}
            onChange={(event) => setLine(index, { quantity: event.target.value })} /></Field>
          <Field label="Unit price"><Input required type="number" min="0" step="0.0001" value={line.unitPrice}
            onChange={(event) => setLine(index, { unitPrice: event.target.value })} /></Field>
          <Field label="Tax amount"><Input required type="number" min="0" step="0.0001" value={line.taxAmount}
            onChange={(event) => setLine(index, { taxAmount: event.target.value })} /></Field>
          {input.lines.length > 1 && <Button type="button" variant="secondary" onClick={() =>
            setInput({ ...input, lines: input.lines.filter((_, at) => at !== index) })}>Remove line</Button>}
        </div>)}
        <Button type="button" variant="secondary" disabled={input.lines.length >= 200} onClick={() =>
          setInput({ ...input, lines: [...input.lines, blankLine()] })}>Add line</Button>
        <div className="text-right text-sm">{preview ? <>Net {money(preview.net, input.currencyCode)} · Tax {money(preview.tax, input.currencyCode)}<strong className="ml-3">Total {money(preview.total, input.currencyCode)}</strong></> : "Complete valid quantities and amounts to preview totals."}</div>
      </div></Panel>
      {id && <Field label="Reason for change"><Textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>}
      <div className="flex gap-3"><Button type="submit" disabled={saving || uncertain || stale}>{saving ? "Saving…" : id ? "Save changes" : "Record as received"}</Button>
        <Button type="button" variant="secondary" onClick={() => navigate("/bills")}>Cancel</Button></div>
      </fieldset>
      {stale && <p role="alert">The saved invoice changed. Your entries are kept here. <Button type="button" variant="secondary" onClick={() => { if (window.confirm("Reload the saved invoice and discard these changes?")) window.location.reload(); }}>Reload saved invoice</Button></p>}
      {uncertain && <p role="alert">The response was not confirmed. Open the invoice list and check the saved record before making another change. <Link className="text-primary underline" to="/bills">Open bills</Link></p>}
    </form>}
  </div>;
}

export function LiveInvoiceDetail() {
  const { id } = useParams();
  const readiness = useCompany();
  const { selection } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <InvoiceDetailRecord key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}:${id}`} />;
}
function InvoiceDetailRecord() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const { id } = useParams();
  const { legalEntityId, capabilities, permissions, adminViewOnly } = useCompany();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setInvoice(null);
    getInvoiceIntake(legalEntityId, id, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setInvoice(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  async function cancel() {
    if (!invoice || busy || uncertain || stale || adminViewOnly || !invoiceAllows(invoice, "Cancel") || !reason.trim()) return;
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
      if (!(cause instanceof InvoiceIntakeError) || cause.status === 0 || cause.status >= 500) setUncertain(true);
    } finally { if (alive.current) setBusy(false); }
  }
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading invoice…</div>;
  if (!invoice) return <div className="p-5 sm:p-8" role="alert">{error || "Invoice not found."}</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={`Invoice ${invoice.invoiceNumber}`} subtitle={`${invoice.supplierName || "Vendor"} · ${invoice.currencyCode}`} actions={<><Badge>{invoice.status}</Badge>{!adminViewOnly && permissions.includes("procurement-invoice-capture") && invoiceAllows(invoice, "Edit") && <Link to={`/bills/${invoice.id}/edit`}><Button variant="secondary">Edit invoice</Button></Link>}</>} />
    {error && <div role="alert" className="mb-4 text-destructive">{error}<Button variant="secondary" onClick={() => window.location.reload()}>Refresh invoice</Button></div>}
    {uncertain && <p role="status">The response was not confirmed. Refresh the invoice to check its saved status before trying another action.</p>}
    <p className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">{invoice.nextStep}</p>
    <div className="mb-5 grid gap-5 sm:grid-cols-2"><Panel title="Invoice details"><dl className="grid grid-cols-2 gap-3 p-5 text-sm">
      <dt>Invoice date</dt><dd>{invoice.invoiceDate}</dd><dt>Due date</dt><dd>{invoice.dueDate || "—"}</dd>
      <dt>Received via</dt><dd>{invoice.intakeChannel}</dd><dt>Purchase order</dt><dd>{invoice.purchaseOrderId || "Not linked"}</dd>
    </dl></Panel><Panel title="Amounts"><dl className="grid grid-cols-2 gap-3 p-5 text-sm">
      <dt>Net</dt><dd>{money(invoice.exactAmounts?.netAmount ?? invoice.netAmount, invoice.currencyCode)}</dd>
      <dt>Tax</dt><dd>{money(invoice.exactAmounts?.taxAmount ?? invoice.taxAmount, invoice.currencyCode)}</dd>
      <dt>Total</dt><dd className="font-semibold">{money(invoice.exactAmounts?.grossAmount ?? invoice.grossAmount, invoice.currencyCode)}</dd>
    </dl></Panel></div>
    <Panel title="Invoice lines"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
      <tbody>{invoice.lines.map((line) => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td>
        <td>{line.exactAmounts?.quantity ?? line.quantity}</td><td>{money(line.exactAmounts?.unitPrice ?? line.unitPrice, invoice.currencyCode)}</td><td>{money(line.exactAmounts?.taxAmount ?? line.taxAmount, invoice.currencyCode)}</td></tr>)}</tbody>
    </RecordTable></div></Panel>
    {capabilities.invoiceDocuments && <InvoiceDocumentPanel key={`${legalEntityId}:${invoice.id}`} invoiceId={invoice.id} canUpload={invoice.status === "Received" && permissions.includes("procurement-invoice-capture")} />}
    {!adminViewOnly && permissions.includes("procurement-invoice-capture") && invoiceAllows(invoice, "Cancel") && <Panel title="Cancel invoice" className="mt-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Keep this invoice and its history, and stop further processing.</p>
      <Field label="Cancellation reason"><Textarea required maxLength={1000} disabled={busy || uncertain || stale} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <Button variant="danger" disabled={busy || uncertain || stale || !reason.trim()} onClick={() => { if (window.confirm("Cancel this invoice? Its saved history will be retained.")) void cancel(); }}>Cancel invoice</Button>
    </div></Panel>}
    <Link className="mt-5 inline-block text-sm text-primary hover:underline" to="/bills">Back to bills</Link>
  </div>;
}
