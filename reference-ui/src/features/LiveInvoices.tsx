import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select } from "../components/ui";
import { InvoiceDocumentPanel } from "./InvoiceDocuments";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  captureInvoiceIntake, getInvoiceIntake, listInvoiceIntake,
  type InvoiceDetail, type InvoiceIntakeInput, type InvoiceLineInput, type InvoicePage,
} from "../../../src/platform/procurement-invoices-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Try again. The invoice was not confirmed.";
const money = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;
const blankLine = (): InvoiceLineInput => ({ description: "", quantity: 1, unitPrice: 0, taxAmount: 0 });

function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Invoice intake needs an ERP company.");
  return readiness;
}

export function LiveInvoiceList() {
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCapture = permissions.includes("procurement-invoice-capture");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listInvoiceIntake(legalEntityId, page, controller.signal).then(setData)
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
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions } = useCompany();
  const [input, setInput] = useState<InvoiceIntakeInput>({ supplierId: "", invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10), currencyCode: defaultCurrencyCode, lines: [blankLine()] });
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoadingVendors(true);
    listVendorDrafts(legalEntityId, { search: vendorSearch, pageSize: 25, signal: controller.signal })
      .then((page) => setVendors(page.items.filter((vendor) =>
        vendor.status === "Active" || vendor.status === "Suspended" || vendor.status === "Inactive")))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingVendors(false); });
    return () => controller.abort();
  }, [legalEntityId, vendorSearch]);
  const setLine = (index: number, changes: Partial<InvoiceLineInput>) => setInput((current) => ({
    ...current, lines: current.lines.map((line, at) => at === index ? { ...line, ...changes } : line),
  }));
  const net = input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const tax = input.lines.reduce((sum, line) => sum + line.taxAmount, 0);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const result = await captureInvoiceIntake(legalEntityId, input);
      navigate(`/bills/${result.id}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  if (!permissions.includes("procurement-invoice-capture")) return <div className="p-5 sm:p-8" role="alert">You do not have access to record invoices for this company.</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title="Record supplier invoice" subtitle="Save the invoice as received. Review and matching happen next." />
    <form onSubmit={save} className="max-w-5xl space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Panel title="Invoice details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Find vendor"><Input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Search vendor name" /></Field>
        <Field label="Vendor"><Select required value={input.supplierId} disabled={loadingVendors}
          onChange={(event) => setInput({ ...input, supplierId: event.target.value })}>
          <option value="">{loadingVendors ? "Loading vendors…" : "Choose vendor"}</option>
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
          <Field label="Quantity"><Input required type="number" min="0.0001" step="any" value={line.quantity}
            onChange={(event) => setLine(index, { quantity: Number(event.target.value) })} /></Field>
          <Field label="Unit price"><Input required type="number" min="0" step="any" value={line.unitPrice}
            onChange={(event) => setLine(index, { unitPrice: Number(event.target.value) })} /></Field>
          <Field label="Tax amount"><Input required type="number" min="0" step="any" value={line.taxAmount}
            onChange={(event) => setLine(index, { taxAmount: Number(event.target.value) })} /></Field>
          {input.lines.length > 1 && <Button type="button" variant="secondary" onClick={() =>
            setInput({ ...input, lines: input.lines.filter((_, at) => at !== index) })}>Remove line</Button>}
        </div>)}
        <Button type="button" variant="secondary" disabled={input.lines.length >= 200} onClick={() =>
          setInput({ ...input, lines: [...input.lines, blankLine()] })}>Add line</Button>
        <div className="text-right text-sm">Net {money(net, input.currencyCode)} · Tax {money(tax, input.currencyCode)}<strong className="ml-3">Total {money(net + tax, input.currencyCode)}</strong></div>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record as received"}</Button>
        <Button type="button" variant="secondary" onClick={() => navigate("/bills")}>Cancel</Button></div>
    </form>
  </div>;
}

export function LiveInvoiceDetail() {
  const { id } = useParams();
  const { legalEntityId, capabilities, permissions } = useCompany();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getInvoiceIntake(legalEntityId, id, controller.signal).then(setInvoice)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading invoice…</div>;
  if (!invoice) return <div className="p-5 sm:p-8" role="alert">{error || "Invoice not found."}</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={`Invoice ${invoice.invoiceNumber}`} subtitle={`${invoice.supplierName || "Vendor"} · ${invoice.currencyCode}`} actions={<Badge>{invoice.status}</Badge>} />
    <p className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">{invoice.nextStep}</p>
    <div className="mb-5 grid gap-5 sm:grid-cols-2"><Panel title="Invoice details"><dl className="grid grid-cols-2 gap-3 p-5 text-sm">
      <dt>Invoice date</dt><dd>{invoice.invoiceDate}</dd><dt>Due date</dt><dd>{invoice.dueDate || "—"}</dd>
      <dt>Received via</dt><dd>{invoice.intakeChannel}</dd><dt>Purchase order</dt><dd>{invoice.purchaseOrderId || "Not linked"}</dd>
    </dl></Panel><Panel title="Amounts"><dl className="grid grid-cols-2 gap-3 p-5 text-sm">
      <dt>Net</dt><dd>{money(invoice.netAmount, invoice.currencyCode)}</dd>
      <dt>Tax</dt><dd>{money(invoice.taxAmount, invoice.currencyCode)}</dd>
      <dt>Total</dt><dd className="font-semibold">{money(invoice.grossAmount, invoice.currencyCode)}</dd>
    </dl></Panel></div>
    <Panel title="Invoice lines"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
      <tbody>{invoice.lines.map((line) => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td>
        <td>{line.quantity}</td><td>{money(line.unitPrice, invoice.currencyCode)}</td><td>{money(line.taxAmount, invoice.currencyCode)}</td></tr>)}</tbody>
    </RecordTable></div></Panel>
    {capabilities.invoiceDocuments && <InvoiceDocumentPanel invoiceId={invoice.id} canUpload={invoice.status === "Received" && permissions.includes("procurement-invoice-capture")} />}
    <Link className="mt-5 inline-block text-sm text-primary hover:underline" to="/bills">Back to bills</Link>
  </div>;
}
