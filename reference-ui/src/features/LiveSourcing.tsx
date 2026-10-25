import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useErpShell } from "../lib/erpShell";
import { GovernedSourcingCreate, GovernedSourcingDetail, GovernedSourcingList } from "./GovernedSourcing";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { RfqDetailLayout, RfqWizardLayout } from "./RfqPresentation";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  SourcingApiError,
  cancelOwnSourcingDraft, createOwnSourcingDraft, getOwnSourcingDraft,
  listOwnSourcingDrafts, updateOwnSourcingDraft,
  type SourcingDetail, type SourcingDraft, type SourcingLineDraft, type SourcingPage,
} from "../../../src/platform/procurement-sourcing-api";
import type { RfqSourceMode } from "../../../src/platform/procurement-sourcing-execution-api";

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

/** One reactive context boundary clears both governed and ad-hoc surfaces immediately. */
function ScopedSourcingPage({ view }: { view: "list" | "editor" | "detail" }) {
  const company = useCompany(); const { selection, authEpoch } = useErpShell(); const { id = "" } = useParams();
  const [query] = useSearchParams();
  const source = query.get("source");
  const principalDefault = source === null && company.capabilities.principalSourcingSourceDrafts
    && !company.capabilities.sourcingDraft && !company.capabilities.sourcingSourceDrafts;
  const governed = source === "approved" || source === "principal-approved" || principalDefault;
  const mode: RfqSourceMode = source === "principal-approved" || principalDefault ? "principal" : "worker";
  const key = JSON.stringify([authEpoch, company.tenantId, company.legalEntityId, selection.entityId ?? "", selection.branch ?? "",
    company.principalId, company.permissions, company.capabilities, governed, mode, view, id]);
  return <SourcingPageContent key={key} view={view} governed={governed} mode={mode} id={id} />;
}
function SourcingPageContent({ view, governed, mode, id }: { view: "list" | "editor" | "detail"; governed: boolean; mode: RfqSourceMode; id: string }) {
  const { capabilities, permissions } = useCompany();
  const canConvert = permissions.includes("procurement-sourcing-convert");
  const canReadGoverned = canConvert || permissions.includes("procurement-sourcing-cancel")
    || capabilities.principalSourcingPublication === true && mode === "principal"
      && (permissions.includes("procurement-sourcing-submit") || permissions.includes("procurement-sourcing-publish"));
  const enabled = mode === "principal" ? capabilities.principalSourcingSourceDrafts === true : capabilities.sourcingSourceDrafts === true;
  const anyGoverned = capabilities.sourcingSourceDrafts || capabilities.principalSourcingSourceDrafts;
  const canRecommend = capabilities.principalRfqRecommendationDrafts === true
    && permissions.includes("procurement-sourcing-recommend-draft")
    && permissions.includes("procurement-sourcing-opened-offer-read");
  return <>
    {view === "list" && canRecommend && <div className="px-5 pt-5 sm:px-8"><Link className="text-sm text-primary hover:underline" to="/rfqs/recommendations">Opened offers · My recommendation drafts</Link></div>}
    {view === "list" && anyGoverned && canReadGoverned && <div className="flex gap-3 px-5 pt-5 sm:px-8" aria-label="Quote request type">
      {capabilities.principalSourcingSourceDrafts && <Link to="/rfqs?source=principal-approved"><Button variant={governed && mode === "principal" ? "primary" : "secondary"}>From approved requests</Button></Link>}
      {capabilities.sourcingSourceDrafts && <Link to="/rfqs?source=approved"><Button variant={governed && mode === "worker" ? "primary" : "secondary"}>{capabilities.principalSourcingSourceDrafts ? "Earlier approved request drafts" : "From approved requests"}</Button></Link>}
      {capabilities.sourcingDraft && <Link to="/rfqs"><Button variant={!governed ? "primary" : "secondary"}>Ad hoc drafts</Button></Link>}
    </div>}
    {governed ? !enabled || !canReadGoverned || view === "editor" && (!canConvert || Boolean(id))
      ? <div className="p-5 sm:p-8" role="alert">This quote action is not available with your current access. <Link to="/rfqs">Back to quote requests</Link></div>
      : view === "list" ? <GovernedSourcingList mode={mode} /> : view === "editor" ? <GovernedSourcingCreate mode={mode} /> : <GovernedSourcingDetail id={id} mode={mode} />
      : view === "editor" && (!permissions.includes(id ? "procurement-sourcing-edit" : "procurement-sourcing-create"))
        ? <div className="p-5 sm:p-8" role="alert">You do not have access to change this quote draft.</div>
        : !capabilities.sourcingDraft ? <div className="p-5 sm:p-8" role="status">Ad hoc quote drafts are not available yet.</div>
        : view === "list" ? <LegacySourcingList /> : view === "editor" ? <LegacySourcingEditor /> : <LegacySourcingDetail />}
  </>;
}
export function LiveSourcingList() { return <ScopedSourcingPage view="list" />; }
export function LiveSourcingEditor() { return <ScopedSourcingPage view="editor" />; }
export function LiveSourcingDetail() { return <ScopedSourcingPage view="detail" />; }

function LegacySourcingList() {
  const { legalEntityId, permissions } = useCompany();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<SourcingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listOwnSourcingDrafts(legalEntityId, page, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page, revision]);
  return <div className="p-5 sm:p-8"><LiveRecordDirectory key={page} title="Request for Quotes" entity="quote requests"
    subtitle="Prepare a draft for your company. Sending it to vendors opens after approvals and supplier access are ready."
    columns={[{ key: "number", label: "Reference / Description", width: 260 }, { key: "method", label: "Method", width: 95 }, { key: "lines", label: "Lines", width: 75 }, { key: "date", label: "Opens", width: 150 }, { key: "closes", label: "Closes", width: 150 }, { key: "status", label: "Status", width: 110 }]}
    rows={(data?.items ?? []).map(item => ({ id: item.id, number: item.number, title: item.title, status: item.status,
      path: `/rfqs/${item.id}`, fields: { method: item.method, lines: String(item.lineCount), date: item.opensAt || "", closes: item.closesAt || "" } }))}
    loading={loading} error={error} total={data?.total ?? 0} page={page} pageSize={data?.pageSize || 25}
    onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
    action={permissions.includes("procurement-sourcing-create") ? <Link to="/rfqs/new"><Button><Plus size={16} className="mr-2 inline" />New quote request</Button></Link> : undefined}
    emptyTitle="No quote requests yet" emptyDescription="Start a draft to prepare what you need from suppliers." /></div>;
}

function LegacySourcingEditor() {
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
  const [saveBlock, setSaveBlock] = useState<"stale" | "unknown" | null>(null);
  useEffect(() => { setSaveBlock(null); return () => { editorGeneration.current += 1; }; }, [editorContext]);
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
    if (saving || saveBlock) return;
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
    } catch (cause) {
      if (isCurrentSave()) {
        setError(message(cause));
        if (cause instanceof SourcingApiError && cause.status === 409) setSaveBlock("stale");
        else if (!(cause instanceof SourcingApiError) || cause.status === 0 || cause.status >= 500) setSaveBlock("unknown");
      }
    }
    finally { if (isCurrentSave()) setSaving(false); }
  }
  return <RfqWizardLayout title={id ? "Edit quote request" : "New quote request"} back={id ? `/rfqs/${id}` : "/rfqs"} busy={saving}>
    <p className="text-sm text-muted-foreground">Save an internal draft. Vendors will not receive it until publication is approved.</p>
    {loading ? <p role="status">Loading quote request…</p> : id && (version === null || loadedContext !== editorContext)
      ? <p role="alert">{error || "This draft is unavailable. Return to the quote request list."}</p>
      : <form className="max-w-6xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current draft before retrying.</span>}</p>}
      {saveBlock && <p role="status" className="rounded-lg border border-border p-3 text-sm">{saveBlock === "stale" ? "The saved quote request changed. Review it before saving again." : "The save result was not confirmed. Review saved quote requests before trying again."} <Link className="text-primary underline" to={id ? `/rfqs/${id}` : "/rfqs"}>Review saved quote request{id ? "" : "s"}</Link></p>}
      <div id="rfq-stage-0" className="scroll-mt-28"><Panel title="Quote details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="What are you buying?" className="sm:col-span-2"><Input required maxLength={300} value={draft.title} onChange={(event) => field("title", event.target.value)} /></Field>
        <Field label="Buying method"><Select value={draft.method} onChange={(event) => field("method", event.target.value)}><option value="RFQ">Request for quotes</option><option value="RFP">Request for proposals</option><option value="ITT">Tender</option></Select></Field>
        <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode ?? ""} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Opens (local time)"><Input type="datetime-local" value={draft.opensAt ?? ""} onChange={(event) => field("opensAt", event.target.value)} /></Field>
        <Field label="Closes (local time)"><Input type="datetime-local" value={draft.closesAt ?? ""} onChange={(event) => field("closesAt", event.target.value)} /></Field>
      </div></Panel></div>
      <div id="rfq-stage-1" className="scroll-mt-28"><Panel title="What suppliers will quote"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div key={line.id ?? `new-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
          <Field label={`Item or service ${index + 1}`} className="sm:col-span-3"><Input required maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => lineField(index, "quantity", Number(event.target.value))} /></Field>
          <Field label="Unit"><Input required value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field>
          <Field label="Category"><Input value={line.categoryCode ?? ""} onChange={(event) => lineField(index, "categoryCode", event.target.value)} /></Field>
          <Field label="Needed by"><Input type="date" value={line.neededBy ?? ""} onChange={(event) => lineField(index, "neededBy", event.target.value)} /></Field>
          <div className="flex items-end">{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</div>
        </div>)}
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add line</Button>
      </div></Panel></div>
      <div className="sticky bottom-8 flex flex-wrap gap-3 border-t border-border bg-surface/95 py-4"><Button type="submit" disabled={saving || !!saveBlock}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/rfqs/${id}` : "/rfqs"} onClick={event => { if (saving) event.preventDefault(); }} aria-disabled={saving}><Button variant="secondary" disabled={saving}>Cancel</Button></Link></div>
    </form>}
  </RfqWizardLayout>;
}

function LegacySourcingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
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
    if (!permissions.includes("procurement-sourcing-edit")) return;
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this draft."); return; }
    setBusy(true); setError("");
    try { await cancelOwnSourcingDraft(legalEntityId, record.id, record.version, reason.trim()); navigate("/rfqs"); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading quote request…</div>;
  if (!record) return <div role="alert" className="p-5 sm:p-8">{error || "Quote request not found."}</div>;
  return <RfqDetailLayout title={record.title} number={record.number} method={record.method} currency={record.currencyCode} status={record.status} back="/rfqs"
    actions={<>{permissions.includes("procurement-sourcing-edit") && record.status === "Draft" && <Link to={`/rfqs/${record.id}/edit`}><Button variant="secondary">Edit draft</Button></Link>}<Button variant="secondary" disabled title="Publishing and invitations are not available yet">Publish</Button></>}
    itemCount={record.lines.length}
    items={<div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Category</th><th>Needed by</th><th>Status</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitCode}</td><td>{line.categoryCode || "—"}</td><td>{line.neededBy || "—"}</td><td>{line.status}</td></tr>)}</tbody></RecordTable></div>}
    overview={<>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-3"><DetailSection title="Quote details" className="lg:col-span-2"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Reference" value={record.number} /><DetailValue label="Method" value={record.method} /><DetailValue label="Currency" value={record.currencyCode} /></dl></DetailSection>
      <DetailSection title="Schedule"><dl className="space-y-4"><DetailValue label="Opens" value={record.opensAt ? new Date(record.opensAt).toLocaleString() : "Not set"} /><DetailValue label="Closes" value={record.closesAt ? new Date(record.closesAt).toLocaleString() : "Not set"} /></dl></DetailSection></div>
    <DetailSection title="Next step" className="mt-5"><p className="text-sm text-muted-foreground">Supplier invitations, bids, evaluation and award are not available yet.</p></DetailSection>
    {permissions.includes("procurement-sourcing-edit") && record.status === "Draft" && <Panel title="Cancel this draft" className="mt-5"><div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"><Field label="Reason" className="flex-1"><Textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
    </>} />;
}
