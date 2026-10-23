import { useRequestApprovalOperation } from "../lib/RequestApprovalJournal";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Textarea, Modal } from "../components/ui";
import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { DetailTabs, DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { useErpShell } from "../lib/erpShell";
import { RequestApprovalPanel } from "./LiveApprovals";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  RequestApiError, readExactRequestDraft,
  createOwnRequestDraft, getOwnRequestDraft, getRequestForReview, getRequestApprovalReadiness, listOwnRequestDrafts,
  checkRequestPolicy, getOwnRequestBudgetStatus, getOwnRequestPolicyStatus, returnRequestForChanges,
  listRequestsWaitingForPolicy, updateOwnRequestDraft, withdrawOwnRequestDraft, submitOwnRequest,
  type ApprovalReadinessStatus, type OwnBudgetStatus, type OwnPolicyStatus, type PolicyQueuePage,
  type RequestDetail, type RequestDraft, type RequestLineDraft, type RequestPage,
} from "../../../src/platform/procurement-requests-api";
import { requestBaseAmount, formatRequestBaseAmount } from "./request-draft-values";
import { listPublishedCatalog, type PublishedCatalogPrice } from "../../../src/platform/procurement-catalog-api";

const emptyLine = (): RequestLineDraft => ({ description: "", unitCode: "each", requestedQuantity: "1", estimatedUnitPrice: "0", categoryCode: "" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request action failed. Try again.";
const approvalBlockerLabels: Record<string, string> = {
  RequestNotCurrent: "The request needs to be submitted again.",
  ApprovalAlreadyOpened: "An approval is already in progress.",
  NoActiveLines: "The request has no active items or services.",
  AmountOverflow: "The request amount needs correction.",
  BuyingRulesNotMatched: "The buying rules still need a successful check.",
  PinnedPolicyUnavailable: "The saved buying rule is no longer available for review.",
  FinanceReservationNotConfirmed: "Finance has not confirmed the full amount in this currency.",
  PinnedDecisionMismatch: "The saved approval route belongs to another request or rule version.",
  PinnedDecisionInvalid: "The saved approval route cannot be read. Run the buying-rule check again.",
  PinnedDecisionLinesInvalid: "The saved approval route contains repeated or missing request items.",
  PinnedDecisionLinesChanged: "The request items changed after the buying-rule check. Run it again.",
  ApprovalStageMissing: "The saved approval route is missing an approval step.",
  MixedLineApprovalRoutes: "Request items need separate approval routes before approval can start.",
};
function context() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Requests require ERP company context.");
  return readiness;
}

function useRequestScopeKey() {
  const readiness = context(); const { selection, authEpoch } = useErpShell(); const { id } = useParams(); const { pathname } = useLocation();
  return [pathname, authEpoch, readiness.tenantId, readiness.legalEntityId, selection.branch, readiness.effectiveBranchId, readiness.principalId, readiness.permissions.join("|"), id].join(":");
}
export function LiveRequestList() { return <RequestListRecord key={useRequestScopeKey()} />; }
function RequestListRecord() {
  const readiness = context();
  const { legalEntityId } = readiness;
  const canCreate = readiness.permissions.includes("procurement-request-create");
  const canCheckPolicy = readiness.permissions.includes("procurement-policy-evaluate");
  const canReturnRequest = readiness.permissions.includes("procurement-request-return");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const procurement = useLocation().pathname.includes("procurement-requests");
  const [data, setData] = useState<RequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [policyQueue, setPolicyQueue] = useState<PolicyQueuePage | null>(null);
  const [policyOffset, setPolicyOffset] = useState(0);
  const [policyError, setPolicyError] = useState("");
  const [policyNotice, setPolicyNotice] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [returning, setReturning] = useState<{ id: string; version: number; number: string } | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [savingReturn, setSavingReturn] = useState(false);
  const [reviewDetail, setReviewDetail] = useState<RequestDetail | null>(null);
  const [reviewReadiness, setReviewReadiness] = useState<ApprovalReadinessStatus | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listOwnRequestDrafts(legalEntityId, offset, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, offset, revision]);
  useEffect(() => {
    if (!canCheckPolicy) return;
    const controller = new AbortController();
    listRequestsWaitingForPolicy(legalEntityId, policyOffset, controller.signal).then(result => { if (!controller.signal.aborted) setPolicyQueue(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setPolicyError(errorText(cause)); });
    return () => controller.abort();
  }, [canCheckPolicy, legalEntityId, policyOffset]);
  async function checkPolicy(id: string, version: number) {
    setCheckingId(id); setPolicyError(""); setPolicyNotice("");
    try {
      const result = await checkRequestPolicy(legalEntityId, id, version);
      setPolicyNotice(result.status === "Matched"
        ? "Buying rules checked. Funding and approval are still required."
        : result.message || "This request needs Procurement attention before it can proceed.");
      setPolicyOffset(0);
      setPolicyQueue(await listRequestsWaitingForPolicy(legalEntityId));
    } catch (cause) { setPolicyError(errorText(cause)); }
    finally { setCheckingId(null); }
  }
  async function saveReturn() {
    if (!returning || !returnReason.trim()) return;
    setSavingReturn(true); setPolicyError(""); setPolicyNotice("");
    try {
      await returnRequestForChanges(legalEntityId, returning.id, returning.version, returnReason);
      setPolicyNotice(`${returning.number} was returned to the requester with your note.`);
      setReturning(null); setReviewDetail(null); setReviewReadiness(null); setReturnReason(""); setPolicyOffset(0);
      setPolicyQueue(await listRequestsWaitingForPolicy(legalEntityId));
    } catch (cause) { setPolicyError(errorText(cause)); }
    finally { setSavingReturn(false); }
  }
  async function openReview(id: string) {
    setReviewLoading(true); setPolicyError(""); setReviewReadiness(null);
    try {
      const [detail, readiness] = await Promise.all([
        getRequestForReview(legalEntityId, id), getRequestApprovalReadiness(legalEntityId, id),
      ]);
      setReviewDetail(detail); setReviewReadiness(readiness);
    }
    catch (cause) { setPolicyError(errorText(cause)); }
    finally { setReviewLoading(false); }
  }
  return <div className="p-5 sm:p-8">
    <LiveRecordDirectory key={`${procurement}:${offset}`} title={procurement ? "Purchase Requests" : "My Requests"} entity="requests"
      subtitle="Save a request, then send it for policy and budget review." tabs={!procurement}
      columns={[{ key: "date", label: "Created", width: 125 }, { key: "number", label: "Request / Description", width: 260 },
        { key: "lines", label: "Lines", width: 80 }, { key: "needed", label: "Needed by", width: 125 }, { key: "status", label: "Status", width: 130 }]}
      rows={(data?.records ?? []).map(record => ({ id: record.id, number: record.number, title: record.purpose, status: record.status,
        path: `/requests/${record.id}`, fields: { date: record.createdAt?.slice(0, 10) || "", lines: String(record.lineCount), needed: record.neededBy || "" } }))}
      loading={loading} error={error} total={data?.count ?? 0} page={Math.floor(offset / (data?.limit || 50)) + 1} pageSize={data?.limit || 50}
      onPage={page => setOffset((page - 1) * (data?.limit || 50))} onRefresh={() => setRevision(value => value + 1)}
      action={canCreate ? <Link to="/requests/new"><Button><Plus size={16} className="mr-2 inline" />New request</Button></Link> : undefined}
      emptyTitle="What do you need to buy?" emptyDescription="Start with a draft request for goods or services." />
    {canCheckPolicy && <Panel title="Buying-rule checks and issues" className="mt-5"><div className="p-5">
      {policyError && <p role="alert" className="mb-3 text-sm text-red-700">{policyError}</p>}
      {policyNotice && <p role="status" className="mb-3 text-sm">{policyNotice}</p>}
      {policyQueue?.records.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Request</th><th>Purpose</th><th>Lines</th><th>Amount before adjustments</th><th>Status</th><th>Action</th></tr></thead><tbody>{policyQueue.records.map((item) => <tr key={item.id}><td>{item.number}</td><td>{item.purpose}</td><td>{item.lineCount}</td><td>{item.currencyCode} {item.estimatedBaseAmount.toLocaleString()}</td><td>{item.policyOutcome === "Blocked" ? `Needs attention: ${item.policyResultCode || "rule exception"}` : "Waiting for check"}</td><td><div className="flex flex-wrap gap-2">{canReturnRequest && <Button variant="secondary" disabled={reviewLoading} onClick={() => void openReview(item.id)}>View details</Button>}{item.policyOutcome !== "Blocked" && <Button variant="secondary" disabled={checkingId === item.id} onClick={() => void checkPolicy(item.id, item.version)}>{checkingId === item.id ? "Checking…" : "Check buying rules"}</Button>}{canReturnRequest && <Button variant="secondary" onClick={() => { setReturning({ id: item.id, version: item.version, number: item.number }); setReturnReason(""); setPolicyError(""); }}>Return for changes</Button>}</div></td></tr>)}</tbody></RecordTable></div>
        : <p className="text-sm text-muted-foreground">No requests need a buying-rule check or follow-up.</p>}
      {reviewDetail && <div className="mt-4 rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{reviewDetail.number} · {reviewDetail.purpose}</p><Button variant="secondary" onClick={() => setReviewDetail(null)}>Close details</Button></div><p className="mt-2 text-sm text-muted-foreground">Needed by {reviewDetail.neededBy || "not set"} · {reviewDetail.currencyCode}</p>{reviewDetail.notesToApprover && <p className="mt-2 text-sm">Request note: {reviewDetail.notesToApprover}</p>}<div className="mt-3 overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Category</th><th>Quantity</th><th>Unit price</th></tr></thead><tbody>{reviewDetail.lines.filter((line) => line.approvalStatus !== "Cancelled").map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.categoryCode || "Not set"}</td><td>{line.requestedQuantity} {line.unitCode}</td><td>{reviewDetail.currencyCode} {line.estimatedUnitPrice.toLocaleString()}</td></tr>)}</tbody></RecordTable></div></div>}
      {reviewDetail && reviewReadiness && <div className="mt-3 rounded-lg border border-border p-4 text-sm">
        <p className="font-medium">Approval check</p>
        {reviewReadiness.prerequisitesMet
          ? <p className="mt-2 text-muted-foreground">Buying rules and Finance evidence are recorded. An independent approver still needs to be assigned.</p>
          : <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {reviewReadiness.blockers.map((blocker) => <li key={blocker}>{approvalBlockerLabels[blocker] || "This request needs another review."}</li>)}
          </ul>}
        {reviewReadiness.approvalRoute?.lines.length ? <div className="mt-3">
          <p className="font-medium">Approval route from buying rules</p>
          {reviewReadiness.approvalRoute.hasSingleRoute
            ? <ol className="mt-1 list-decimal pl-5 text-muted-foreground">{reviewReadiness.approvalRoute.lines[0].stages.map((stage, index) => {
              const assigned = reviewReadiness.assignmentPlan?.stages[index];
              const people = assigned?.candidates.map((candidate) => candidate.displayName).join(", ");
              return <li key={`${stage.code}-${index}`}>{stage.code} · {stage.assignee}
                {people ? ` · ${people}` : " · person to be assigned"}
                {assigned?.blocker === "ApproverChoiceRequired" ? " · choose an approver before starting" : ""}
              </li>;
            })}</ol>
            : <p className="mt-1 text-amber-800">Request lines need different approval routes. Procurement must split the approvals by line.</p>}
          <p className="mt-1 text-xs text-muted-foreground">This shows the rule route only. No approval task has opened.</p>
        </div> : null}
      </div>}
      {returning && <div className="mt-4 max-w-xl space-y-3 rounded-lg border border-border p-4"><p className="font-medium">Return {returning.number} for changes</p><Field label="What should the requester fix?"><Textarea rows={3} maxLength={1000} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} /></Field><p className="text-xs text-muted-foreground">A confirmed Finance reservation must be released before a request can be returned.</p><div className="flex gap-2"><Button disabled={savingReturn || !returnReason.trim()} onClick={() => void saveReturn()}>{savingReturn ? "Returning…" : "Send back to requester"}</Button><Button variant="secondary" disabled={savingReturn} onClick={() => setReturning(null)}>Cancel</Button></div></div>}
      {policyQueue && policyQueue.count > policyQueue.limit && <div className="mt-3 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={policyOffset === 0} onClick={() => setPolicyOffset(Math.max(0, policyOffset - policyQueue.limit))}>Previous</Button><span>{policyOffset + 1}–{Math.min(policyOffset + policyQueue.records.length, policyQueue.count)} of {policyQueue.count}</span><Button variant="secondary" disabled={policyOffset + policyQueue.limit >= policyQueue.count} onClick={() => setPolicyOffset(policyOffset + policyQueue.limit)}>Next</Button></div>}
      <p className="mt-3 text-xs text-muted-foreground">A rule check records the matching policy. It does not approve the request or reserve money.</p>
    </div></Panel>}
  </div>;
}

export function LiveRequestEditor() { return <RequestEditorRecord key={useRequestScopeKey()} />; }
function RequestEditorRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions } = context();
  const canWrite = permissions.includes(id ? "procurement-request-edit" : "procurement-request-create");
  const [draft, setDraft] = useState<RequestDraft>(() => ({ purpose: "", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [discardOpen, setDiscardOpen] = useState(false), [reconcileOpen, setReconcileOpen] = useState(false);
  const returnPath = id ? `/requests/${id}` : "/requests";
  const leave = () => { if (saving) return; if (saveBlock) { setReconcileOpen(true); return; }
    if (JSON.stringify(draft) !== baseline) { setDiscardOpen(true); return; } navigate(returnPath); };
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
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPrices, setCatalogPrices] = useState<PublishedCatalogPrice[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setCatalogPrices([]); setCatalogLoading(true); setCatalogError("");
    if (!canWrite) { setCatalogLoading(false); return () => controller.abort(); }
    const timer = window.setTimeout(() => {
      listPublishedCatalog(legalEntityId, catalogSearch, controller.signal)
        .then((page) => { if (!controller.signal.aborted) setCatalogPrices(page.items); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setCatalogError(errorText(cause)); })
        .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [legalEntityId, catalogSearch, canWrite]);
  useEffect(() => {
    setVersion(null); setLoadedContext(null); setSaving(false); setError("");
    if (!canWrite) { setLoading(false); return; }
    if (!id) { setLoading(false); const initial = { purpose: "", currencyCode: defaultCurrencyCode, lines: [emptyLine()] }; setDraft(initial); setBaseline(JSON.stringify(initial)); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnRequestDraft(legalEntityId, id, controller.signal).then((record) => {
      if (controller.signal.aborted) return;
      const exactDraft = readExactRequestDraft(record);
      setDraft(exactDraft); setBaseline(JSON.stringify(exactDraft)); setVersion(record.version); setLoadedContext(editorContext);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, defaultCurrencyCode, id, canWrite]);
  const field = (key: keyof RequestDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const lineField = (index: number, key: keyof RequestLineDraft, value: string | number | null) => setDraft((current) => ({ ...current, lines: current.lines.map((line, at) => at === index ? { ...line, [key]: value } : line) }));
  function addCatalogPrice(price: PublishedCatalogPrice) {
    if (price.exactEstimatedUnitPrice === undefined) { setError("Confirm this catalog price before using it. Its exact saved value is unavailable."); return; }
    if (draft.currencyCode?.toUpperCase() !== price.currencyCode.toUpperCase()) {
      setError(`This price is in ${price.currencyCode}. Choose that request currency before adding it.`);
      return;
    }
    const line: RequestLineDraft = {
      description: price.name, unitCode: price.unitCode, requestedQuantity: "1",
      estimatedUnitPrice: price.exactEstimatedUnitPrice, categoryCode: price.categoryCode,
      purchaseType: price.kind, catalogItemId: price.itemId, catalogEntryId: price.entryId,
      catalogPublishedVersion: price.publishedVersion, preferredSupplierId: price.supplierId,
    };
    setDraft((current) => ({ ...current, purpose: current.purpose || `Purchase ${price.name}`,
      lines: current.lines.length === 1 && !current.lines[0].description.trim()
        ? [line] : [...current.lines, line] }));
    setError("");
  }
  let total: string | null = null;
  try { total = requestBaseAmount(draft.lines); } catch { /* Incomplete input has no asserted estimate. */ }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || saving || saveBlock) return;
    if (id && (version === null || loadedContext !== editorContext)) { setError("This draft is unavailable. Return to the list."); return; }
    const savingContext = editorContext;
    const savingGeneration = editorGeneration.current;
    const isCurrentSave = () => currentEditorContext.current === savingContext && editorGeneration.current === savingGeneration;
    setSaving(true); setError("");
    try {
      const result = id && version !== null ? await updateOwnRequestDraft(legalEntityId, id, version, draft) : await createOwnRequestDraft(legalEntityId, draft);
      if (isCurrentSave()) navigate(`/requests/${result.id}`);
    } catch (cause) {
      if (isCurrentSave()) {
        setError(errorText(cause));
        if (cause instanceof RequestApiError && cause.status === 409) setSaveBlock("stale");
        else if (!(cause instanceof RequestApiError) || cause.status === 0 || [408, 429, 499].includes(cause.status) || cause.status >= 500) setSaveBlock("unknown");
      }
    }
    finally { if (isCurrentSave()) setSaving(false); }
  }
  return <div className="pb-20">
    <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><FileText size={22} />{id ? "Edit request" : "New request"}</h1>
      <Button variant="ghost" aria-label="Close request editor" disabled={saving} onClick={leave}><X size={20} /></Button>
    </header>
    <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-8"><p className="text-sm">Purchase request · {draft.currencyCode || defaultCurrencyCode}</p><p className="mt-1 text-xs text-muted-foreground">Save a draft for the company shown in the top bar. No budget is reserved yet.</p></div>
    {!canWrite ? <p role="alert">You do not have access to {id ? "edit this request" : "create a request"}.</p> : loading ? <p role="status">Loading request…</p> : id && (version === null || loadedContext !== editorContext)
      ? <p role="alert">{error || "This draft is unavailable. Return to the list."}</p>
      : <form onSubmit={save}><div className="max-w-6xl space-y-6 px-5 py-6 sm:px-8">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current request before retrying.</span>}</p>}
      {saveBlock && <p role="status" className="rounded-lg border border-border p-3 text-sm">{saveBlock === "stale" ? "The saved request changed. Review it before saving again." : "The save result was not confirmed. Review saved requests before trying again."} <Link className="text-primary underline" to={id ? `/requests/${id}` : "/requests"}>Review saved request{id ? "" : "s"}</Link></p>}
      <fieldset disabled={saving || !!saveBlock} className="min-w-0 space-y-6 border-0 p-0"><section aria-label="Request details"><div className="grid gap-4 sm:grid-cols-2">
        <Field label="What do you need?" className="sm:col-span-2"><Input required maxLength={1000} value={draft.purpose} onChange={(event) => field("purpose", event.target.value)} /></Field>
        <Field label="Needed by"><Input type="date" value={draft.neededBy ?? ""} onChange={(event) => field("neededBy", event.target.value)} /></Field>
        <Field label="Currency"><Input maxLength={3} value={draft.currencyCode ?? ""} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Cost centre"><Input value={draft.costCenterRef ?? ""} onChange={(event) => field("costCenterRef", event.target.value)} /></Field>
        <Field label="Project"><Input value={draft.projectRef ?? ""} onChange={(event) => field("projectRef", event.target.value)} /></Field>
        <Field label="Delivery address" className="sm:col-span-2"><Input value={draft.deliveryAddressText ?? ""} onChange={(event) => field("deliveryAddressText", event.target.value)} /></Field>
        <Field label="Funding source"><Input value={draft.fundingSourceRef ?? ""} onChange={(event) => field("fundingSourceRef", event.target.value)} /></Field>
        <Field label="Note for approver" className="sm:col-span-2"><Textarea rows={3} value={draft.notesToApprover ?? ""} onChange={(event) => field("notesToApprover", event.target.value)} /></Field>
      </div></section>
      <section aria-label="What to buy"><h2 className="mb-4 text-base font-semibold">What to buy</h2><div className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Field label="Search approved items"><Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search by name or item code" /></Field>
          {catalogLoading ? <p role="status" className="text-sm">Loading approved items…</p>
            : catalogError ? <p role="alert" className="text-sm text-red-700">{catalogError}</p>
            : catalogPrices.length ? <div className="grid gap-2 sm:grid-cols-2">{catalogPrices.map((price) =>
              <div key={price.entryId} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div><p className="font-medium">{price.name}</p><p className="text-muted-foreground">{price.supplierName} · {price.exactEstimatedUnitPrice === undefined ? "Confirm price" : `${price.currencyCode} ${price.exactEstimatedUnitPrice} / ${price.unitCode}`}</p></div>
                <Button type="button" variant="secondary" disabled={price.exactEstimatedUnitPrice === undefined} onClick={() => addCatalogPrice(price)}>Use item</Button>
              </div>)}</div> : <p className="text-sm text-muted-foreground">No approved items found. You can enter an item below.</p>}
        </div>
        <div className="relative overflow-x-auto rounded-lg border border-border"><RecordTable className="min-w-[800px]">
          <thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Estimated unit price</th><th aria-label="Actions" /></tr></thead>
          <tbody>{draft.lines.flatMap((line, index) => [
            <tr key={`${line.id ?? index}-main`}>
              <td><Field label={`Item or service ${index + 1}`} className="relative [&>span:first-child]:sr-only"><Input required readOnly={Boolean(line.catalogEntryId)} maxLength={1000} value={line.description} onChange={(event) => lineField(index, "description", event.target.value)} /></Field></td>
              <td><Field label="Quantity" className="relative [&>span:first-child]:sr-only"><Input required inputMode="decimal" value={line.requestedQuantity} onChange={(event) => lineField(index, "requestedQuantity", event.target.value)} /></Field></td>
              <td><Field label="Unit" className="relative [&>span:first-child]:sr-only"><Input required readOnly={Boolean(line.catalogEntryId)} value={line.unitCode} onChange={(event) => lineField(index, "unitCode", event.target.value)} /></Field></td>
              <td><Field label="Estimated unit price" className="relative [&>span:first-child]:sr-only"><Input required readOnly={Boolean(line.catalogEntryId)} inputMode="decimal" value={line.estimatedUnitPrice} onChange={(event) => lineField(index, "estimatedUnitPrice", event.target.value)} /></Field></td>
              <td>{draft.lines.length > 1 && <Button variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}><Trash2 size={16} /></Button>}</td>
            </tr>,
            <tr key={`${line.id ?? index}-details`}><td colSpan={5}><div className="grid gap-3 sm:grid-cols-3">
              <Field label="Category"><Input readOnly={Boolean(line.catalogEntryId)} value={line.categoryCode ?? ""} onChange={(event) => lineField(index, "categoryCode", event.target.value)} /></Field>
              <Field label="Type"><Input readOnly={Boolean(line.catalogEntryId)} value={line.purchaseType ?? ""} onChange={(event) => lineField(index, "purchaseType", event.target.value)} /></Field>
              <Field label="Needed by"><Input type="date" value={line.neededBy ?? ""} onChange={(event) => lineField(index, "neededBy", event.target.value)} /></Field>
              {line.catalogEntryId && <div className="sm:col-span-3 flex items-center justify-between gap-3 text-sm"><span>From approved catalog · price checked when you send the request</span><Button type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: current.lines.map((value, at) => at === index ? { ...value, catalogEntryId: null, catalogItemId: null, catalogPublishedVersion: null, preferredSupplierId: null } : value) }))}>Switch to custom item</Button></div>}
            </div></td></tr>,
          ])}</tbody></RecordTable></div>
        <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add line</Button>
        <p className="text-right text-sm font-semibold">Estimated amount before discounts, tax and delivery: {draft.currencyCode || defaultCurrencyCode} {total === null ? "Enter valid quantities and prices" : formatRequestBaseAmount(total)}</p>
      </div></section>
      <section className="flex flex-wrap items-center gap-3 border-t border-border pt-5" aria-label="Request attachments"><Button variant="secondary" disabled title="Request file upload is not connected."><Paperclip size={15} /> Attach files</Button><p className="text-sm text-muted-foreground">File upload is not available yet.</p></section>
      </fieldset></div>
      <footer className="sticky bottom-8 z-10 flex flex-wrap items-center gap-3 border-y border-border bg-card px-5 py-4 sm:px-8"><Button type="submit" disabled={saving || !!saveBlock}>{saving ? "Saving…" : "Save draft"}</Button><Button variant="secondary" disabled={saving} onClick={leave}>Cancel</Button></footer>
    </form>}
    {discardOpen && <Modal title="Discard changes?" onClose={() => setDiscardOpen(false)}><p className="mb-5 text-sm">Your unsaved changes will be lost.</p><div className="flex gap-3"><Button variant="danger" onClick={() => { if (!saving) navigate(returnPath); }}>Discard changes</Button><Button variant="secondary" onClick={() => setDiscardOpen(false)}>Keep editing</Button></div></Modal>}
    {reconcileOpen && <Modal title="Check the saved request" onClose={() => setReconcileOpen(false)}><p className="mb-5 text-sm">The last save needs review. Open saved requests to check its outcome before starting another save.</p><div className="flex gap-3"><Button variant="secondary" onClick={() => navigate(returnPath)}>Open saved requests</Button><Button variant="ghost" onClick={() => setReconcileOpen(false)}>Stay here</Button></div></Modal>}
  </div>;
}

export function LiveRequestDetail() { return <RequestDetailRecord key={useRequestScopeKey()} />; }
function RequestDetailRecord() {
  const { id } = useParams();
  const approvalRefresh = useRequestApprovalOperation(`request-detail:${id ?? ""}`);
  const { legalEntityId, permissions } = context();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [tab, setTab] = useState("overview");
  const [budget, setBudget] = useState<OwnBudgetStatus | null>(null);
  const [budgetError, setBudgetError] = useState("");
  const [policy, setPolicy] = useState<OwnPolicyStatus | null>(null);
  const [policyError, setPolicyError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    setRecord(null);
    getOwnRequestDraft(legalEntityId, id, controller.signal).then((result) => { if (!controller.signal.aborted) setRecord(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, id]);
  useEffect(() => {
    if (!id || record?.status !== "Submitted") { setBudget(null); return; }
    const controller = new AbortController();
    setBudget(null); setBudgetError("");
    getOwnRequestBudgetStatus(legalEntityId, id, controller.signal).then(result => { if (!controller.signal.aborted) setBudget(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setBudgetError(errorText(cause)); });
    return () => controller.abort();
  }, [legalEntityId, id, record?.status]);
  useEffect(() => {
    if (!id || record?.status !== "Submitted") { setPolicy(null); return; }
    const controller = new AbortController();
    setPolicy(null); setPolicyError("");
    getOwnRequestPolicyStatus(legalEntityId, id, controller.signal).then(result => { if (!controller.signal.aborted) setPolicy(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setPolicyError(errorText(cause)); });
    return () => controller.abort();
  }, [legalEntityId, id, record?.status]);
  async function withdraw() {
    if (!permissions.includes("procurement-request-edit")) return;
    if (!record || (record.status === "Submitted" && !withdrawReason.trim())) return;
    setBusy(true); setError("");
    try { await withdrawOwnRequestDraft(legalEntityId, record.id, record.version, withdrawReason.trim() || undefined); navigate("/requests"); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!permissions.includes("procurement-request-submit")) return;
    if (!record) return;
    setBusy(true); setError("");
    try { setRecord(await submitOwnRequest(legalEntityId, record.id, record.version)); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading request…</div>;
  if (!record) return <div role="alert" className="p-5 sm:p-8">{error || "Request not found."}</div>;
  const activeLines = record.lines.filter((line) => line.approvalStatus !== "Cancelled");
  const waitingForRelease = record.status === "ReturnPendingFinanceRelease"
    || (record.status !== "ReturnedForChanges" && record.approvalState === "Returned");
  const approvalLocked = record.status === "ReturnPendingFinanceRelease" || (record.status !== "ReturnedForChanges"
    && (Boolean(record.approvalInstanceRef) || ["Pending", "Returned", "ReturnPendingFinanceRelease"].includes(record.approvalState || "")));
  return <div className="min-h-[calc(100dvh-5rem)] bg-background">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4 sm:px-8">
      <div className="min-w-0"><Link to="/requests" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft size={14} />My Requests</Link><p className="text-xs text-muted-foreground">{record.number} · {record.currencyCode}</p><h1 title={record.purpose} className="max-w-3xl line-clamp-2 break-words text-2xl font-semibold">{record.purpose}</h1></div>
      <div className="flex items-center gap-3"><Badge>{record.status}</Badge>{permissions.includes("procurement-request-edit") && !approvalLocked && (record.status === "Draft" || record.status === "ReturnedForChanges") && <Link to={`/requests/${record.id}/edit`} onClick={event => { if (busy) event.preventDefault(); }}><Button variant="secondary" disabled={busy}>Edit request</Button></Link>}</div>
    </header>
    <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "items", label: `Items (${activeLines.length})` }, { key: "related", label: "Related" }, { key: "comments", label: "Comments" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
    <div className="space-y-5 px-5 py-5 sm:px-8">
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Saving request…</p>}
    <div hidden={tab !== "overview"} inert={tab !== "overview"} className="space-y-5">
    <DetailSection title="Request Overview"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><DetailValue label="Request" value={record.number} /><DetailValue label="What do you need?" value={record.purpose} /><DetailValue label="Currency" value={record.currencyCode} /><DetailValue label="Needed by" value={record.neededBy} /><DetailValue label="Cost centre" value={record.costCenterRef} /><DetailValue label="Project" value={record.projectRef} /><DetailValue label="Revision" value={record.version} /></dl></DetailSection>

    {record.status === "Submitted" && !waitingForRelease && <div className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">
      <p>Sent for policy and budget review. This request has not been approved and cannot create a purchase order yet.</p>
      {policyError ? <p role="alert" className="mt-2 text-red-700">Buying-rule status is unavailable. {policyError}</p>
        : <p className="mt-2 font-medium">Buying rules: {policy?.status === "Matched" ? "Checked; this has not approved the request" : policy?.status === "Blocked" ? policy.evaluation?.summary || "Needs Procurement attention" : "Waiting for Procurement to check this request"}.</p>}
      {budgetError ? <p role="alert" className="mt-2 text-red-700">Budget status is unavailable. {budgetError}</p>
        : <p className="mt-2 font-medium">Budget: {budget?.status === "Available" && budget.reservationConfirmed ? "Finance confirmed funds for this request" : budget?.status === "Insufficient" ? "Finance found insufficient funds" : budget?.status === "PartiallyAvailable" ? "Finance found only part of the funds" : budget?.status === "NotConfigured" ? "No budget is configured for this request" : "Waiting for Finance to check the budget"}.</p>}
    </div>}
    {record.status === "ReturnedForChanges" && <div className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm"><p className="font-medium">Please update this request and send it again.</p><p className="mt-2">{record.returnReason || "Procurement asked for changes."}</p></div>}
    <Panel title="Requested lines"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Estimated unit price</th></tr></thead><tbody>{activeLines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.exactAmounts?.requestedQuantity ?? String(line.requestedQuantity)}</td><td>{line.unitCode}</td><td>{record.currencyCode} {line.exactAmounts?.estimatedUnitPrice ?? String(line.estimatedUnitPrice)}</td></tr>)}</tbody></RecordTable></div></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Delivery"><p className="p-5 text-sm">{record.deliveryAddressText || "No delivery address added."}</p></Panel><Panel title="Note for approver"><p className="p-5 text-sm">{record.notesToApprover || "No note added."}</p></Panel></div>
    {permissions.includes("procurement-request-submit") && !approvalLocked && (record.status === "Draft" || record.status === "ReturnedForChanges") && <Panel title="Send for review" className="mt-5"><div className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Add a needed-by date to this request or every line before sending it. No budget is reserved by this step.</p><Button disabled={busy || !activeLines.length || (!record.neededBy && activeLines.some((line) => !line.neededBy))} onClick={() => void submit()}>Send for review</Button></div></Panel>}
    {permissions.includes("procurement-request-edit") && !approvalLocked && (record.status === "Draft" || record.status === "Submitted" || record.status === "ReturnedForChanges") && <Panel title="Withdraw request" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason" hint={record.status === "Submitted" ? "Required once a request has been sent for review." : "Optional before review."}><Textarea rows={2} maxLength={1000} value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || (record.status === "Submitted" && !withdrawReason.trim())} onClick={() => void withdraw()}>Withdraw request</Button></div></Panel>}
    <RequestApprovalPanel requestId={record.id} version={record.version} status={waitingForRelease ? "ReturnPendingFinanceRelease" : record.status}
      onChanged={async () => { const captured = approvalRefresh; const updated = await getOwnRequestDraft(legalEntityId, record.id); if (captured.current()) setRecord(updated); }} />
    </div>
    {tab === "items" && <DetailSection title="Items / Line Details"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Estimated unit price</th><th>Category</th><th>Needed by</th></tr></thead><tbody>{activeLines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.exactAmounts?.requestedQuantity ?? String(line.requestedQuantity)}</td><td>{line.unitCode}</td><td>{record.currencyCode} {line.exactAmounts?.estimatedUnitPrice ?? String(line.estimatedUnitPrice)}</td><td>{line.categoryCode || "—"}</td><td>{line.neededBy || record.neededBy || "—"}</td></tr>)}</tbody></RecordTable></div></DetailSection>}
    {tab === "related" && <DetailSection title="Related records"><p className="text-sm text-muted-foreground">Linked quote requests, orders and receipts will appear here when connected.</p></DetailSection>}
    {tab === "comments" && <DetailSection title="All Comments"><p className="mb-3 text-sm text-muted-foreground">Record comments are not connected yet. The saved note for the approver is available in Overview.</p><Button variant="secondary" disabled>Add comment</Button></DetailSection>}
    {tab === "history" && <DetailSection title="History"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Created" value={record.createdAt} /><DetailValue label="Saved revision" value={record.version} /><DetailValue label="Submitted" value={record.submittedAt} /><DetailValue label="Returned" value={record.returnedAt} /></dl><p className="mt-4 text-sm text-muted-foreground">These are saved record facts. Detailed activity history is not connected to this view yet.</p></DetailSection>}
    <Link to="/requests" className="mt-5 inline-block text-sm text-primary hover:underline">Back to my requests</Link>
    </div>
  </div>;
}
