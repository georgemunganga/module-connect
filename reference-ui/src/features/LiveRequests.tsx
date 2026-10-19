import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  createOwnRequestDraft, getOwnRequestDraft, listOwnRequestDrafts,
  updateOwnRequestDraft, withdrawOwnRequestDraft, submitOwnRequest,
  type RequestDetail, type RequestDraft, type RequestLineDraft, type RequestPage,
} from "../../../src/platform/procurement-requests-api";

const emptyLine = (): RequestLineDraft => ({ description: "", unitCode: "each", requestedQuantity: 1, estimatedUnitPrice: 0, categoryCode: "" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request action failed. Try again.";
function context() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Requests require ERP company context.");
  return readiness;
}

export function LiveRequestList() {
  const { legalEntityId } = context();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<RequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listOwnRequestDrafts(legalEntityId, offset, controller.signal).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, offset]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="My Requests" subtitle="Save a request, then send it for policy and budget review." actions={<Link to="/requests/new"><Button><Plus size={16} className="mr-2 inline" />New request</Button></Link>} />
    <Panel><div className="p-5">{error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading requests…</p> : data?.records.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Request</th><th>Purpose</th><th>Lines</th><th>Needed by</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.records.map((record) => <tr key={record.id}><td>{record.number}</td><td><Link to={`/requests/${record.id}`} className="font-medium text-primary hover:underline">{record.purpose}</Link></td><td>{record.lineCount}</td><td>{record.neededBy || "—"}</td><td><Badge>{record.status}</Badge></td><td><Link to={`/requests/${record.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="What do you need to buy?" description="Start with a draft request for goods or services." action={<Link to="/requests/new"><Button>New request</Button></Link>} />}
      {data && data.count > data.limit && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous</Button><span>{offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}</span><Button variant="secondary" disabled={offset + data.limit >= data.count} onClick={() => setOffset(offset + data.limit)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveRequestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode } = context();
  const [draft, setDraft] = useState<RequestDraft>(() => ({ purpose: "", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }));
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) { setDraft({ purpose: "", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnRequestDraft(legalEntityId, id, controller.signal).then((record) => {
      setVersion(record.version);
      setDraft({ purpose: record.purpose, currencyCode: record.currencyCode, neededBy: record.neededBy,
        costCenterRef: record.costCenterRef, projectRef: record.projectRef,
        deliveryLocationRef: record.deliveryLocationRef, deliveryAddressText: record.deliveryAddressText,
        fundingSourceRef: record.fundingSourceRef, notesToApprover: record.notesToApprover,
        lines: record.lines.filter((line) => line.approvalStatus !== "Cancelled") });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, defaultCurrencyCode, id]);
  const field = (key: keyof RequestDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const lineField = (index: number, key: keyof RequestLineDraft, value: string | number | null) => setDraft((current) => ({ ...current, lines: current.lines.map((line, at) => at === index ? { ...line, [key]: value } : line) }));
  const total = draft.lines.reduce((sum, line) => sum + line.requestedQuantity * line.estimatedUnitPrice * (1 - (line.discountPercent || 0) / 100), 0);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = id && version !== null ? await updateOwnRequestDraft(legalEntityId, id, version, draft) : await createOwnRequestDraft(legalEntityId, draft);
      navigate(`/requests/${result.id}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit request" : "New request"} subtitle="Save a draft for the company shown in the top bar. No budget is reserved yet." />
    {loading ? <p role="status">Loading request…</p> : <form className="max-w-6xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current request before retrying.</span>}</p>}
      <Panel title="Request details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="What do you need?" className="sm:col-span-2"><Input required maxLength={1000} value={draft.purpose} onChange={(event) => field("purpose", event.target.value)} /></Field>
        <Field label="Needed by"><Input type="date" value={draft.neededBy ?? ""} onChange={(event) => field("neededBy", event.target.value)} /></Field>
        <Field label="Currency"><Input maxLength={3} value={draft.currencyCode ?? ""} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Cost centre"><Input value={draft.costCenterRef ?? ""} onChange={(event) => field("costCenterRef", event.target.value)} /></Field>
        <Field label="Project"><Input value={draft.projectRef ?? ""} onChange={(event) => field("projectRef", event.target.value)} /></Field>
        <Field label="Delivery address" className="sm:col-span-2"><Input value={draft.deliveryAddressText ?? ""} onChange={(event) => field("deliveryAddressText", event.target.value)} /></Field>
        <Field label="Funding source"><Input value={draft.fundingSourceRef ?? ""} onChange={(event) => field("fundingSourceRef", event.target.value)} /></Field>
        <Field label="Note for approver" className="sm:col-span-2"><Textarea rows={3} value={draft.notesToApprover ?? ""} onChange={(event) => field("notesToApprover", event.target.value)} /></Field>
      </div></Panel>
      <Panel title="What to buy"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6" key={line.id ?? `new-${index}`}>
          <Field label={`Item or service ${index + 1}`} className="sm:col-span-3"><Input required maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.requestedQuantity} onChange={(event) => lineField(index, "requestedQuantity", Number(event.target.value))} /></Field>
          <Field label="Unit"><Input required value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field>
          <Field label="Estimated unit price"><Input required type="number" min="0" step="0.0001" value={line.estimatedUnitPrice} onChange={(event) => lineField(index, "estimatedUnitPrice", Number(event.target.value))} /></Field>
          <Field label="Category"><Input value={line.categoryCode ?? ""} onChange={(event) => lineField(index, "categoryCode", event.target.value)} /></Field>
          <Field label="Type"><Input value={line.purchaseType ?? ""} onChange={(event) => lineField(index, "purchaseType", event.target.value)} /></Field>
          <Field label="Needed by"><Input type="date" value={line.neededBy ?? ""} onChange={(event) => lineField(index, "neededBy", event.target.value)} /></Field>
          <div className="flex items-end">{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</div>
        </div>)}
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add line</Button>
        <p className="text-right text-sm font-semibold">Estimated total: {draft.currencyCode || defaultCurrencyCode} {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/requests/${id}` : "/requests"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveRequestDetail() {
  const { id } = useParams();
  const { legalEntityId } = context();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnRequestDraft(legalEntityId, id, controller.signal).then(setRecord)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, id]);
  async function withdraw() {
    if (!record || (record.status === "Submitted" && !withdrawReason.trim())) return;
    setBusy(true); setError("");
    try { await withdrawOwnRequestDraft(legalEntityId, record.id, record.version, withdrawReason.trim() || undefined); navigate("/requests"); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!record) return;
    setBusy(true); setError("");
    try { setRecord(await submitOwnRequest(legalEntityId, record.id, record.version)); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading request…</div>;
  if (!record) return <div role="alert" className="p-5 sm:p-8">{error || "Request not found."}</div>;
  const activeLines = record.lines.filter((line) => line.approvalStatus !== "Cancelled");
  return <div className="p-5 sm:p-8">
    <PageHeader title={record.purpose} subtitle={`${record.number} · ${record.currencyCode}`} actions={<><Badge>{record.status}</Badge>{record.status === "Draft" && <Link to={`/requests/${record.id}/edit`}><Button variant="secondary">Edit request</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {record.status === "Submitted" && <p className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">Sent for policy and budget review. This request has not been approved and cannot create a purchase order yet.</p>}
    <Panel title="Requested lines"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Estimated unit price</th></tr></thead><tbody>{activeLines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.requestedQuantity}</td><td>{line.unitCode}</td><td>{record.currencyCode} {line.estimatedUnitPrice.toLocaleString()}</td></tr>)}</tbody></RecordTable></div></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Delivery"><p className="p-5 text-sm">{record.deliveryAddressText || "No delivery address added."}</p></Panel><Panel title="Note for approver"><p className="p-5 text-sm">{record.notesToApprover || "No note added."}</p></Panel></div>
    {record.status === "Draft" && <Panel title="Send for review" className="mt-5"><div className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Add a needed-by date to this request or every line before sending it. No budget is reserved by this step.</p><Button disabled={busy || !activeLines.length || (!record.neededBy && activeLines.some((line) => !line.neededBy))} onClick={() => void submit()}>Send for review</Button></div></Panel>}
    {(record.status === "Draft" || record.status === "Submitted") && <Panel title="Withdraw request" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason" hint={record.status === "Submitted" ? "Required once a request has been sent for review." : "Optional for a draft."}><Textarea rows={2} maxLength={1000} value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || (record.status === "Submitted" && !withdrawReason.trim())} onClick={() => void withdraw()}>Withdraw request</Button></div></Panel>}
    <Link to="/requests" className="mt-5 inline-block text-sm text-primary hover:underline">Back to my requests</Link>
  </div>;
}
