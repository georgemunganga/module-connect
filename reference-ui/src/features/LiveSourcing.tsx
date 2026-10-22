import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  cancelOwnSourcingDraft, createOwnSourcingDraft, getOwnSourcingDraft,
  listOwnSourcingDrafts, updateOwnSourcingDraft,
  type SourcingDetail, type SourcingDraft, type SourcingLineDraft, type SourcingPage,
} from "../../../src/platform/procurement-sourcing-api";

const emptyLine = (): SourcingLineDraft => ({ description: "", unitCode: "each", quantity: 1 });
const message = (error: unknown) => error instanceof Error ? error.message : "The quote action failed. Try again.";
function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Quotes require an ERP company.");
  return readiness;
}
function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
}
function iso(value: string) { return value ? new Date(value).toISOString() : null; }

export function LiveSourcingList() {
  const { legalEntityId, adminViewOnly } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SourcingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listOwnSourcingDrafts(legalEntityId, page, controller.signal).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Request for Quotes" subtitle="Prepare a draft for your company. Sending it to vendors opens after approvals and supplier access are ready." actions={!adminViewOnly ? <Link to="/rfqs/new"><Button><Plus size={16} className="mr-2 inline" />New quote request</Button></Link> : undefined} />
    <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading quote requests…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Reference</th><th>Title</th><th>Method</th><th>Lines</th><th>Closes</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/rfqs/${item.id}`} className="font-medium text-primary hover:underline">{item.title}</Link></td><td>{item.method}</td><td>{item.lineCount}</td><td>{item.closesAt ? new Date(item.closesAt).toLocaleString() : "—"}</td><td><Badge>{item.status}</Badge></td><td><Link to={`/rfqs/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No quote requests yet" description="Start a draft to prepare what you need from suppliers." action={!adminViewOnly ? <Link to="/rfqs/new"><Button>New quote request</Button></Link> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveSourcingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode } = useCompany();
  const [draft, setDraft] = useState<SourcingDraft>(() => ({ title: "", method: "RFQ", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }));
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editorContext = `${legalEntityId}:${id ?? "new"}`;
  const currentEditorContext = useRef(editorContext);
  currentEditorContext.current = editorContext;
  const editorGeneration = useRef(0);
  useEffect(() => () => { editorGeneration.current += 1; }, [editorContext]);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  useEffect(() => {
    setVersion(null); setLoadedContext(null); setSaving(false); setError("");
    if (!id) { setLoading(false); setDraft({ title: "", method: "RFQ", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnSourcingDraft(legalEntityId, id, controller.signal).then((record) => {
      if (controller.signal.aborted) return;
      setVersion(record.version);
      setLoadedContext(editorContext);
      setDraft({ title: record.title, method: record.method, currencyCode: record.currencyCode,
        opensAt: localDateTime(record.opensAt), closesAt: localDateTime(record.closesAt),
        lines: record.lines.filter((line) => line.status === "Active").map((line) => ({
          id: line.id, description: line.description, unitCode: line.unitCode,
          quantity: line.quantity, categoryCode: line.categoryCode, neededBy: line.neededBy,
        })) });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode]);
  const field = (key: keyof SourcingDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const lineField = (index: number, key: keyof SourcingLineDraft, value: string | number) =>
    setDraft((current) => ({ ...current, lines: current.lines.map((line, at) => at === index ? { ...line, [key]: value } : line) }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (id && (version === null || loadedContext !== editorContext)) { setError("This draft is unavailable. Return to the quote request list."); return; }
    const savingContext = editorContext;
    const savingGeneration = editorGeneration.current;
    const isCurrentSave = () => currentEditorContext.current === savingContext && editorGeneration.current === savingGeneration;
    setSaving(true); setError("");
    if (draft.opensAt && draft.closesAt && new Date(draft.closesAt) <= new Date(draft.opensAt)) {
      setError("Closing time must follow opening time."); setSaving(false); return;
    }
    const payload = { ...draft, opensAt: iso(draft.opensAt || ""), closesAt: iso(draft.closesAt || "") };
    try {
      const saved = id && version !== null
        ? await updateOwnSourcingDraft(legalEntityId, id, version, payload)
        : await createOwnSourcingDraft(legalEntityId, payload);
      if (isCurrentSave()) navigate(`/rfqs/${saved.id}`);
    } catch (cause) { if (isCurrentSave()) setError(message(cause)); }
    finally { if (isCurrentSave()) setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit quote request" : "New quote request"} subtitle="Save a draft. Vendors will not receive it until publication is approved." />
    {loading ? <p role="status">Loading quote request…</p> : id && (version === null || loadedContext !== editorContext)
      ? <p role="alert">{error || "This draft is unavailable. Return to the quote request list."}</p>
      : <form className="max-w-6xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current draft before retrying.</span>}</p>}
      <Panel title="Quote details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="What are you buying?" className="sm:col-span-2"><Input required maxLength={300} value={draft.title} onChange={(event) => field("title", event.target.value)} /></Field>
        <Field label="Buying method"><Select value={draft.method} onChange={(event) => field("method", event.target.value)}><option value="RFQ">Request for quotes</option><option value="RFP">Request for proposals</option><option value="ITT">Tender</option></Select></Field>
        <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode ?? ""} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Opens (local time)"><Input type="datetime-local" value={draft.opensAt ?? ""} onChange={(event) => field("opensAt", event.target.value)} /></Field>
        <Field label="Closes (local time)"><Input type="datetime-local" value={draft.closesAt ?? ""} onChange={(event) => field("closesAt", event.target.value)} /></Field>
      </div></Panel>
      <Panel title="What suppliers will quote"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div key={line.id ?? `new-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
          <Field label={`Item or service ${index + 1}`} className="sm:col-span-3"><Input required maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => lineField(index, "quantity", Number(event.target.value))} /></Field>
          <Field label="Unit"><Input required value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field>
          <Field label="Category"><Input value={line.categoryCode ?? ""} onChange={(event) => lineField(index, "categoryCode", event.target.value)} /></Field>
          <Field label="Needed by"><Input type="date" value={line.neededBy ?? ""} onChange={(event) => lineField(index, "neededBy", event.target.value)} /></Field>
          <div className="flex items-end">{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</div>
        </div>)}
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add line</Button>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/rfqs/${id}` : "/rfqs"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveSourcingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, adminViewOnly } = useCompany();
  const [record, setRecord] = useState<SourcingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnSourcingDraft(legalEntityId, id, controller.signal).then(setRecord)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  async function cancel() {
    if (adminViewOnly) return;
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this draft."); return; }
    setBusy(true); setError("");
    try { await cancelOwnSourcingDraft(legalEntityId, record.id, record.version, reason.trim()); navigate("/rfqs"); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading quote request…</div>;
  if (!record) return <div role="alert" className="p-5 sm:p-8">{error || "Quote request not found."}</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={record.title} subtitle={`${record.number} · ${record.method} · ${record.currencyCode}`} actions={<><Badge>{record.status}</Badge>{!adminViewOnly && record.status === "Draft" && <Link to={`/rfqs/${record.id}/edit`}><Button variant="secondary">Edit draft</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <Panel title="Items and services"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Category</th><th>Status</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitCode}</td><td>{line.categoryCode || "—"}</td><td>{line.status}</td></tr>)}</tbody></RecordTable></div></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Schedule"><div className="space-y-2 p-5 text-sm"><p>Opens: {record.opensAt ? new Date(record.opensAt).toLocaleString() : "Not set"}</p><p>Closes: {record.closesAt ? new Date(record.closesAt).toLocaleString() : "Not set"}</p></div></Panel><Panel title="Next step"><p className="p-5 text-sm text-muted-foreground">Publication and vendor invitations will open after approval rules and supplier access are connected.</p></Panel></div>
    {!adminViewOnly && record.status === "Draft" && <Panel title="Cancel this draft" className="mt-5"><div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"><Field label="Reason" className="flex-1"><Textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
    <Link to="/rfqs" className="mt-5 inline-block text-sm text-primary hover:underline">Back to quote requests</Link>
  </div>;
}
