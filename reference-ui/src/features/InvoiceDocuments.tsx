import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Field, Input, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listInvoiceDocuments, uploadInvoiceDocument, retryInvoiceDocumentScan, downloadInvoiceDocument,
  type InvoiceDocument, type InvoiceDocuments } from "../../../src/platform/procurement-invoices-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The file action was not confirmed. Try again.";
const labels: Record<InvoiceDocument["scanState"], string> = {
  Available: "Ready", Quarantined: "Waiting for security check", Scanning: "Checking file",
  Rejected: "File blocked", ScanFailed: "Check needs retry",
};
export function InvoiceDocumentPanel({ invoiceId, canUpload }: { invoiceId: string; canUpload: boolean }) {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Documents need an ERP company.");
  const company = readiness.legalEntityId;
  const [data, setData] = useState<InvoiceDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const uploadKey = useRef<string | null>(null);
  async function refresh() {
    try { setData(await listInvoiceDocuments(company, invoiceId)); }
    catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const abort = new AbortController();
    listInvoiceDocuments(company, invoiceId, abort.signal).then(setData)
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, invoiceId]);
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !uploadKey.current || !data) return;
    setError(""); setNotice("");
    if (file.size > data.limits.maxFileBytes) { setError("This file exceeds the allowed size. Choose a smaller file."); return; }
    setBusy(true);
    try {
      const saved = await uploadInvoiceDocument(company, invoiceId, file, uploadKey.current);
      setNotice(saved.canDownload ? "File saved and checked." : "File saved. Its security check needs attention.");
      setFile(null); uploadKey.current = null; setInputKey((key) => key + 1);
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function retry(item: InvoiceDocument) {
    setBusy(true); setError(""); setNotice("");
    try { await retryInvoiceDocumentScan(company, invoiceId, item.versionId); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function download(item: InvoiceDocument) {
    setBusy(true); setError("");
    try {
      const blob = await downloadInvoiceDocument(company, invoiceId, item.versionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = item.fileName; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <Panel title="Documents" className="mt-5"><div className="space-y-4 p-5">
    <p className="text-sm text-muted-foreground">Add the original invoice as a PDF, PNG or JPEG.
      {data && ` Up to ${data.limits.maxOwnerFiles} files, ${Math.ceil(data.limits.maxFileBytes / 1024 / 1024)} MB each.`}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {canUpload && data && <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
      <Field label="Invoice document"><Input key={inputKey} type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy}
        onChange={(event) => { setFile(event.target.files?.[0] ?? null); uploadKey.current = crypto.randomUUID(); setError(""); }} /></Field>
      <Button type="submit" variant="secondary" disabled={busy || !file || data.items.length >= data.limits.maxOwnerFiles}>{busy ? "Working…" : "Add document"}</Button>
    </form>}
    {loading ? <p role="status">Loading documents…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
      <thead><tr><th>File</th><th>Size</th><th>Security check</th><th>Action</th></tr></thead>
      <tbody>{data.items.map((item) => <tr key={item.versionId}><td>{item.fileName}</td><td>{Math.max(1, Math.ceil(item.sizeBytes / 1024))} KB</td>
        <td><Badge>{labels[item.scanState]}</Badge></td><td>
          {item.canDownload && <Button variant="secondary" disabled={busy} onClick={() => download(item)}>Download</Button>}
          {canUpload && ["ScanFailed", "Quarantined", "Scanning"].includes(item.scanState) && <Button variant="secondary" disabled={busy}
            onClick={() => retry(item)}>Retry security check</Button>}
        </td></tr>)}</tbody>
    </RecordTable></div> : data ? <p className="text-sm text-muted-foreground">No documents added yet.</p> : null}
    <Button variant="ghost" disabled={busy} onClick={() => { setError(""); void refresh(); }}>Refresh status</Button>
  </div></Panel>;
}
