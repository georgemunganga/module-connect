import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileText, Inbox, Paperclip, Upload } from "lucide-react";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listInvoiceIntake, type InvoicePage } from "../../../src/platform/procurement-invoices-api";

const uploadUnavailable = "File intake is not connected yet. Record the invoice details manually, then attach the supplier document to the saved invoice where document upload is available.";

/** The original GreenWebb inbox presentation, backed only by scoped ERP invoices. */
export function LiveInbox() {
  const readiness = useLiveReadiness();
  const { selection, authEpoch } = useErpShell();
  if (!readiness) return <div className="p-5 sm:p-8" role="status">Checking invoice access…</div>;
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <div className="p-5 sm:p-8" role="status">Checking the selected company…</div>;
  return <LiveInboxRecord key={`${authEpoch}:${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.principalId}`} company={readiness.legalEntityId} canCapture={readiness.permissions.includes("procurement-invoice-capture")} />;
}

function LiveInboxRecord({ company, canCapture }: { company: string; canCapture: boolean }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const explainUpload = () => setNotice(uploadUnavailable);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    listInvoiceIntake(company, page, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The inbox could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, page]);

  return <div className="p-5 sm:p-8">
    <PageHeader title="Payables inbox" subtitle="Review supplier invoices received by the ERP, or record invoice details manually."
      actions={<>{canCapture && <Link to="/bills/new"><Button variant="secondary">Record invoice</Button></Link>}<Button onClick={explainUpload}><Upload size={15} /> Upload bill</Button></>} />
    {notice && <p role="status" className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</p>}
    <Panel className="mb-5">
      <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); explainUpload(); }}
        className="m-4 flex min-h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/40 px-6 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600"><Inbox size={26} /></span>
        <h2 className="font-semibold text-slate-800">Upload bills</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500">Drag and drop PDF or image files, or choose a file when ERP document intake is connected.</p>
        <Button className="mt-5" onClick={explainUpload}><Paperclip size={15} /> Choose file</Button>
      </div>
    </Panel>
    <Panel title="Received bills" action={<span className="text-xs text-slate-400">{data?.total ?? 0} invoices</span>}>
      {error && <p role="alert" className="px-5 py-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="px-5 py-4 text-sm">Loading invoices…</p>
        : !data?.items.length ? <EmptyState title="Your inbox is clear" description="Invoices recorded in the ERP will appear here. File uploads are not connected yet."
          action={canCapture ? <Link to="/bills/new"><Button>Record invoice</Button></Link> : undefined} />
          : <div className="divide-y divide-slate-100">{data.items.map(invoice => <div key={invoice.id}
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><div className="rounded-md bg-slate-100 p-2 text-slate-500"><FileText size={18} /></div>
              <div><p className="font-medium text-slate-800">{invoice.invoiceNumber}</p>
                <p className="text-xs text-slate-500">{invoice.supplierName || "Supplier"} · {invoice.invoiceDate} · {invoice.currencyCode} {invoice.grossAmount} · <Badge>{invoice.status}</Badge></p>
              </div></div>
            <Link to={`/bills/${invoice.id}`}><Button variant="secondary">Open invoice <ChevronRight size={14} /></Button></Link>
          </div>)}</div>}
      {data && data.total > data.pageSize && <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </Panel>
    <p className="mt-4 text-xs text-muted-foreground">This list shows recorded bills, not uploaded files. Uploading bills will be available here when enabled.</p>
  </div>;
}
