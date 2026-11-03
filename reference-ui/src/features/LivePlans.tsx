import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Textarea } from "../components/ui";
import { PlanContextBoundary, usePlanReviewContext } from "../lib/PlanReviewContext";
import { PlanHistoryPanel, PlanOwnerReviewActions, PlanReviewQueue, PlanRoundDialog, planStatusLabel, PlanReviewRecovery } from "./LivePlanReview";
import { planDraftFailureBlock } from "../lib/plan-review-access";
import { planReviewJournal } from "../lib/plan-review-journal";
import { sumPlanAmounts } from "../../../shared/procurement-plan-json";
import { formatBudgetAmount } from "../../../src/platform/procurement-budget-amount";
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
const emptyLine = (): PlanLineDraft => ({ description: "", unitCode: "each", estimatedQuantity: "1", estimatedAmount: "0" });
const emptyDraft = (currency: string): PlanDraft => ({ financialPeriodRef: "", currencyCode: currency, fundingSourceRef: null, lines: [emptyLine()] });
const money = formatBudgetAmount;

export function LivePlanList() { return <PlanContextBoundary><PlanListRecord /></PlanContextBoundary>; }
function PlanListRecord() {
  const { legalEntityId, permissions, capabilities } = useCompany();
  const [params, setParams] = useSearchParams();
  const mine = permissions.includes("procurement-plan-read");
  const canReview = capabilities.planReviewRead && permissions.includes("procurement-plan-review-read");
  const toReview = canReview && (params.get("view") === "review" || !mine);
  const selectedRound = params.get("review");
  const newPlan = capabilities.planningDraft && permissions.includes("procurement-plan-create");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PlanPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (toReview || !mine) return;
    const controller = new AbortController();
    setData(null); setLoading(true); setError("");
    listOwnPlans(legalEntityId, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page, toReview, mine]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Purchase Plans" subtitle="Forecast your department's needs. A plan does not reserve money or approve a purchase." actions={newPlan ? <Link to="/plans/new"><Button><Plus size={16} className="mr-2 inline" />New plan</Button></Link> : undefined} />
    {canReview && <div className="mb-5 flex gap-3" role="tablist" aria-label="Purchase plan views">
      {mine && <Button role="tab" aria-selected={!toReview} variant={toReview ? "secondary" : "primary"} onClick={() => setParams({})}>My plans</Button>}
      <Button role="tab" aria-selected={toReview} variant={toReview ? "primary" : "secondary"} onClick={() => setParams({ view: "review" })}>To review</Button>
    </div>}
    {toReview ? <PlanReviewQueue openSubmission={id => setParams({ view: "review", review: id })} /> : mine ? <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading plans…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Reference</th><th>Financial period</th><th>Needs</th><th>Currency</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/plans/${item.id}`} className="font-medium text-primary hover:underline">{item.financialPeriodRef}</Link></td><td>{item.lineCount}</td><td>{item.currencyCode}</td><td><Badge>{planStatusLabel(item.status)}</Badge></td><td><Link to={`/plans/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No purchase plans yet" description="Add a draft forecast for the next financial period." action={newPlan ? <Link to="/plans/new"><Button>New plan</Button></Link> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel> : <p role="alert">You do not have access to your own plans in this company.</p>}
    {selectedRound && canReview && <PlanRoundDialog key={selectedRound} submissionId={selectedRound} onClose={() => setParams(toReview ? { view: "review" } : {})} />}
  </div>;
}

export function LivePlanEditor() { return <PlanContextBoundary><PlanEditorRecord /></PlanContextBoundary>; }
function PlanEditorRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions, capabilities } = useCompany();
  const { scope } = usePlanReviewContext();
  const [editable, setEditable] = useState(!id);
  const journal = planReviewJournal(scope);
  const pending = journal.state().pending?.planId === id;
  const [draft, setDraft] = useState<PlanDraft>(() => emptyDraft(defaultCurrencyCode));
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
    if (!id) { setLoading(false); setDraft(emptyDraft(defaultCurrencyCode)); setVersion(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnPlan(legalEntityId, id, controller.signal).then((record) => {
      if (controller.signal.aborted) return;
      setVersion(record.version); setLoadedContext(editorContext); setEditable(record.allowedActions === undefined ? record.status === "Draft" : record.allowedActions.includes("Edit"));
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
    event.preventDefault();
    if (saving || saveBlock || pending || !capabilities.planningDraft || !editable || !permissions.includes(id ? "procurement-plan-edit" : "procurement-plan-create")) return;
    if (id && (version === null || loadedContext !== editorContext)) { setError("This draft is unavailable. Return to the list."); return; }
    const savingContext = editorContext;
    const savingGeneration = editorGeneration.current;
    const isCurrentSave = () => currentEditorContext.current === savingContext && editorGeneration.current === savingGeneration;
    setError("");
    if (!draft.lines.length) { setError("Add at least one planned need."); return; }
    setSaving(true);
    try {
      const saved = id && version !== null
        ? await updateOwnPlan(legalEntityId, id, version, draft)
        : await createOwnPlan(legalEntityId, draft);
      if (isCurrentSave()) navigate(`/plans/${saved.id}`);
    } catch (cause) {
      if (isCurrentSave()) {
        setError(errorText(cause));
        const block = planDraftFailureBlock(cause);
        if (block) setSaveBlock(block);
      }
    }
    finally { if (isCurrentSave()) setSaving(false); }
  }
  if (!capabilities.planningDraft || !permissions.includes(id ? "procurement-plan-edit" : "procurement-plan-create")) return <p role="alert" className="p-5 sm:p-8">You cannot change this plan for this company.</p>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit purchase plan" : "New purchase plan"} subtitle="Estimate what your department may need. This draft does not commit a budget." />
    {loading ? <p role="status">Loading plan…</p> : id && (version === null || loadedContext !== editorContext)
      ? <p role="alert">{error || "This draft is unavailable. Return to the list."}</p>
      : <form onSubmit={save} className="max-w-6xl space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current plan before retrying.</span>}</p>}
      <PlanReviewRecovery onRecovered={() => window.location.reload()} />
      {id && !editable && <p role="alert">The current plan is not available to edit. Review its current status first.</p>}
      {saveBlock && <p role="status" className="rounded-lg border border-border p-3 text-sm">{saveBlock === "stale" ? "The saved plan changed. Review it before saving again." : "The save result was not confirmed. Review saved plans before trying again."} <Link className="text-primary underline" to={id ? `/plans/${id}` : "/plans"}>Review saved plan{id ? "" : "s"}</Link></p>}
      <Panel title="Plan details"><div className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Financial period"><Input required maxLength={100} placeholder="For example, FY 2027" value={draft.financialPeriodRef} onChange={(event) => field("financialPeriodRef", event.target.value)} /></Field>
        <Field label="Currency" hint="The company sets the currency for a new plan. Saved plans keep their original currency."><Input readOnly required maxLength={3} value={draft.currencyCode} /></Field>
        <Field label="Funding source reference"><Input maxLength={100} value={draft.fundingSourceRef || ""} onChange={(event) => field("fundingSourceRef", event.target.value || null)} /></Field>
      </div></Panel>
      <Panel title="Planned needs"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div key={line.id || `new-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
          <Field label={`Need ${index + 1}`} className="sm:col-span-3"><Input required maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field>
          <Field label="Quantity"><Input required type="text" inputMode="decimal" value={line.estimatedQuantity} onChange={(event) => lineField(index, "estimatedQuantity", event.target.value)} /></Field>
          <Field label="Unit"><Input required maxLength={30} value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field>
          <Field label="Estimated amount"><Input required type="text" inputMode="decimal" value={line.estimatedAmount} onChange={(event) => lineField(index, "estimatedAmount", event.target.value)} /></Field>
          <Field label="Category"><Input maxLength={100} value={line.categoryCode || ""} onChange={(event) => lineField(index, "categoryCode", event.target.value || null)} /></Field>
          <Field label="Expected date"><Input type="date" value={line.expectedOn || ""} onChange={(event) => lineField(index, "expectedOn", event.target.value || null)} /></Field>
          <Field label="Funding reference"><Input maxLength={100} value={line.fundingSourceRef || ""} onChange={(event) => lineField(index, "fundingSourceRef", event.target.value || null)} /></Field>
          <div className="flex items-end">{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove need ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</div>
        </div>)}
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add need</Button>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving || !!saveBlock || pending || !editable}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/plans/${id}` : "/plans"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LivePlanDetail() { return <PlanContextBoundary><PlanDetailRecord /></PlanContextBoundary>; }
function PlanDetailRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, permissions, capabilities } = useCompany();
  const [revision, setRevision] = useState(0), [selectedRound, setSelectedRound] = useState<string | null>(null);
  const { scope } = usePlanReviewContext();
  const canChange = (action: string) => !!record && capabilities.planningDraft && permissions.includes("procurement-plan-edit")
    && (record.allowedActions === undefined ? record.status === "Draft" : record.allowedActions.includes(action));
  const [record, setRecord] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelBlock, setCancelBlock] = useState<"stale" | "unknown" | null>(null);
  const [, refreshJournal] = useState(0);
  const pendingReview = planReviewJournal(scope).state().blocked;
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setRecord(null); setReason(""); setLoading(true); setError("");
    getOwnPlan(legalEntityId, id, controller.signal).then(value => { if (!controller.signal.aborted && scope.current()) setRecord(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, revision]);
  async function cancel() {
    if (!canChange("Cancel") || busy || cancelBlock || planReviewJournal(scope).state().blocked || !scope.current()) return;
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this plan."); return; }
    setBusy(true); setError("");
    try { await cancelOwnPlan(legalEntityId, record.id, record.version, reason.trim()); navigate("/plans"); }
    catch (cause) { if (scope.current()) { setError(errorText(cause)); setCancelBlock(planDraftFailureBlock(cause)); } }
    finally { if (scope.current()) setBusy(false); }
  }
  return <div className="p-5 sm:p-8">
    {loading ? <p role="status">Loading plan…</p> : record ? <>
      <PageHeader title={record.financialPeriodRef} subtitle={`${record.number} · Purchase forecast`} actions={canChange("Edit") ? <Link to={`/plans/${record.id}/edit`} aria-disabled={busy || !!cancelBlock || pendingReview} onClick={event => { if (busy || cancelBlock || pendingReview) event.preventDefault(); }}><Button disabled={busy || !!cancelBlock || pendingReview}>Edit draft</Button></Link> : undefined} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <Panel title="Forecast"><div className="grid gap-4 p-5 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Status</span><div className="mt-1"><Badge>{planStatusLabel(record.status)}</Badge></div></div><div><span className="text-muted-foreground">Currency</span><div className="mt-1">{record.currencyCode}</div></div><div><span className="text-muted-foreground">Estimated total</span><div className="mt-1">{money(sumPlanAmounts(record.lines.filter((line) => line.status === "Active").map(line => line.estimatedAmount)), record.currencyCode)}</div></div>{record.statusReason && <div className="sm:col-span-3"><span className="text-muted-foreground">Reason</span><div>{record.statusReason}</div></div>}</div></Panel>
      <Panel title="Planned needs" className="mt-5"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Need</th><th>Quantity</th><th>Unit</th><th>Estimated amount</th><th>Expected</th><th>Status</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.estimatedQuantity}</td><td>{line.unitCode}</td><td>{money(line.estimatedAmount, record.currencyCode)}</td><td>{line.expectedOn || "—"}</td><td><Badge>{line.status}</Badge></td></tr>)}</tbody></RecordTable></div></Panel>
      {canChange("Cancel") && <Panel title="Cancel draft" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason"><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || !!cancelBlock || pendingReview || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
      {cancelBlock && <p role="status" className="mt-4 text-sm">{cancelBlock === "stale" ? "The saved plan changed. Review it before another cancellation." : "The cancellation result was not confirmed. Review the saved plan before trying again."} <Button variant="secondary" onClick={() => window.location.reload()}>Reload saved plan</Button></p>}
      <PlanOwnerReviewActions record={record} blocked={busy || !!cancelBlock} onPendingChanged={() => refreshJournal(x => x + 1)} onChanged={() => setRevision(x => x + 1)} openSubmission={setSelectedRound} />
      <PlanHistoryPanel key={`${record.id}:${revision}`} planId={record.id} openSubmission={setSelectedRound} />
      {selectedRound && capabilities.planReviewRead && <PlanRoundDialog key={selectedRound} submissionId={selectedRound} onClose={() => { setSelectedRound(null); setRevision(x => x + 1); }} />}
    </> : <p role="alert">{error || "Plan not found."}</p>}
    <Link to="/plans" className="mt-5 inline-block text-sm text-primary hover:underline">Back to purchase plans</Link>
  </div>;
}
