import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  cancelOwnPlan, createOwnPlan, getOwnPlan, listOwnPlans, updateOwnPlan,
  type PlanDetail, type PlanDraft, type PlanLineDraft, type PlanPage,
} from "../../../src/platform/procurement-plans-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The plan action failed. Try again.";
function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Plans require an ERP company.");
  return readiness;
}
const emptyLine = (): PlanLineDraft => ({ description: "", unitCode: "each", estimatedQuantity: 1, estimatedAmount: 0 });
const emptyDraft = (currency: string): PlanDraft => ({ financialPeriodRef: "", currencyCode: currency, fundingSourceRef: null, lines: [emptyLine()] });
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LivePlanList() {
  const { legalEntityId } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PlanPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listOwnPlans(legalEntityId, page, controller.signal).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Purchase Plans" subtitle="Forecast your department's needs. A plan does not reserve money or approve a purchase." actions={<Link to="/plans/new"><Button><Plus size={16} className="mr-2 inline" />New plan</Button></Link>} />
    <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading plans…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Reference</th><th>Financial period</th><th>Needs</th><th>Currency</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/plans/${item.id}`} className="font-medium text-primary hover:underline">{item.financialPeriodRef}</Link></td><td>{item.lineCount}</td><td>{item.currencyCode}</td><td><Badge>{item.status}</Badge></td><td><Link to={`/plans/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No purchase plans yet" description="Add a draft forecast for the next financial period." action={<Link to="/plans/new"><Button>New plan</Button></Link>} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LivePlanEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode } = useCompany();
  const [draft, setDraft] = useState<PlanDraft>(() => emptyDraft(defaultCurrencyCode));
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) { setDraft(emptyDraft(defaultCurrencyCode)); setVersion(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnPlan(legalEntityId, id, controller.signal).then((record) => {
      setVersion(record.version);
      setDraft({ financialPeriodRef: record.financialPeriodRef, currencyCode: record.currencyCode,
        fundingSourceRef: record.fundingSourceRef || null,
        lines: record.lines.filter((line) => line.status === "Active").map((line) => ({
          id: line.id, catalogItemId: line.catalogItemId, description: line.description,
          categoryCode: line.categoryCode, unitCode: line.unitCode,
          estimatedQuantity: line.estimatedQuantity, estimatedAmount: line.estimatedAmount,
          expectedOn: line.expectedOn, fundingSourceRef: line.fundingSourceRef,
        })) });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode]);
  const field = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const lineField = <K extends keyof PlanLineDraft>(index: number, key: K, value: PlanLineDraft[K]) =>
    setDraft((current) => ({ ...current, lines: current.lines.map((line, at) => at === index ? { ...line, [key]: value } : line) }));
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!draft.lines.length) { setError("Add at least one planned need."); return; }
    setSaving(true);
    try {
      const saved = id && version !== null
        ? await updateOwnPlan(legalEntityId, id, version, draft)
        : await createOwnPlan(legalEntityId, draft);
      navigate(`/plans/${saved.id}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit purchase plan" : "New purchase plan"} subtitle="Estimate what your department may need. This draft does not commit a budget." />
    {loading ? <p role="status">Loading plan…</p> : <form onSubmit={save} className="max-w-6xl space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current plan before retrying.</span>}</p>}
      <Panel title="Plan details"><div className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Financial period"><Input required maxLength={100} placeholder="For example, FY 2027" value={draft.financialPeriodRef} onChange={(event) => field("financialPeriodRef", event.target.value)} /></Field>
        <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Funding source reference"><Input maxLength={100} value={draft.fundingSourceRef || ""} onChange={(event) => field("fundingSourceRef", event.target.value || null)} /></Field>
      </div></Panel>
      <Panel title="Planned needs"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div key={line.id || `new-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
          <Field label={`Need ${index + 1}`} className="sm:col-span-3"><Input required maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" step="0.0001" value={line.estimatedQuantity} onChange={(event) => lineField(index, "estimatedQuantity", Number(event.target.value))} /></Field>
          <Field label="Unit"><Input required maxLength={30} value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field>
          <Field label="Estimated amount"><Input required type="number" min="0" step="0.0001" value={line.estimatedAmount} onChange={(event) => lineField(index, "estimatedAmount", Number(event.target.value))} /></Field>
          <Field label="Category"><Input maxLength={100} value={line.categoryCode || ""} onChange={(event) => lineField(index, "categoryCode", event.target.value || null)} /></Field>
          <Field label="Expected date"><Input type="date" value={line.expectedOn || ""} onChange={(event) => lineField(index, "expectedOn", event.target.value || null)} /></Field>
          <Field label="Funding reference"><Input maxLength={100} value={line.fundingSourceRef || ""} onChange={(event) => lineField(index, "fundingSourceRef", event.target.value || null)} /></Field>
          <div className="flex items-end">{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove need ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</div>
        </div>)}
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add need</Button>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/plans/${id}` : "/plans"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LivePlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId } = useCompany();
  const [record, setRecord] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnPlan(legalEntityId, id, controller.signal).then(setRecord)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  async function cancel() {
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this plan."); return; }
    setBusy(true); setError("");
    try { await cancelOwnPlan(legalEntityId, record.id, record.version, reason.trim()); navigate("/plans"); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className="p-5 sm:p-8">
    {loading ? <p role="status">Loading plan…</p> : record ? <>
      <PageHeader title={record.financialPeriodRef} subtitle={`${record.number} · Purchase forecast`} actions={record.status === "Draft" ? <Link to={`/plans/${record.id}/edit`}><Button>Edit draft</Button></Link> : undefined} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <Panel title="Forecast"><div className="grid gap-4 p-5 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Status</span><div className="mt-1"><Badge>{record.status}</Badge></div></div><div><span className="text-muted-foreground">Currency</span><div className="mt-1">{record.currencyCode}</div></div><div><span className="text-muted-foreground">Estimated total</span><div className="mt-1">{money(record.lines.filter((line) => line.status === "Active").reduce((sum, line) => sum + line.estimatedAmount, 0), record.currencyCode)}</div></div>{record.statusReason && <div className="sm:col-span-3"><span className="text-muted-foreground">Reason</span><div>{record.statusReason}</div></div>}</div></Panel>
      <Panel title="Planned needs" className="mt-5"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Need</th><th>Quantity</th><th>Unit</th><th>Estimated amount</th><th>Expected</th><th>Status</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.estimatedQuantity}</td><td>{line.unitCode}</td><td>{money(line.estimatedAmount, record.currencyCode)}</td><td>{line.expectedOn || "—"}</td><td><Badge>{line.status}</Badge></td></tr>)}</tbody></RecordTable></div></Panel>
      {record.status === "Draft" && <Panel title="Cancel draft" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason"><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
    </> : <p role="alert">{error || "Plan not found."}</p>}
    <Link to="/plans" className="mt-5 inline-block text-sm text-primary hover:underline">Back to purchase plans</Link>
  </div>;
}
