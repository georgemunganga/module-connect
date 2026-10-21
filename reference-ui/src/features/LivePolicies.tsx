import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  createPolicy, decidePolicy, getPolicy, listPolicies, previewPolicy,
  submitPolicyReview, updatePolicy, validatePolicy, lookupSourcingReviewers, PolicyApiError,
  type PolicyPage, type PolicyRecord, type PolicyIssue, type PolicyPreview,
} from "../../../src/platform/procurement-policy-api";

import { PolicyReviewerPicker } from "./PolicyReviewerPicker";
import { useErpShell } from "../lib/erpShell";
import { emptyRule, exactPolicySample, fromRuleJson, toRuleJson, approvalAssigneesForPolicy, type RuleRow } from "../lib/buying-rules-editor";

const day = (value: string | null) => value?.slice(0, 10) ?? "";
const utc = (value: string) => `${value}T00:00:00.000Z`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Buying rules are unavailable.";
const supportedKey = (key: string) => key === "PURCHASE_REQUEST" || key === "PURCHASE_ORDER" || key === "SOURCING";
const policyLabel = (key: string) => key === "PURCHASE_REQUEST" ? "Purchase requests" : key === "PURCHASE_ORDER" ? "Purchase orders" : key === "SOURCING" ? "Sourcing publication rules" : "Unsupported type — read-only";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

type PolicyKey = "PURCHASE_REQUEST" | "PURCHASE_ORDER" | "SOURCING";
export function LivePolicies({ onlyPolicyKey }: { onlyPolicyKey?: PolicyKey }) {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness) throw new Error("Buying rules require an ERP company.");
  return <LivePolicyEditor key={`${readiness.tenantId}:${readiness.legalEntityId}:${readiness.workerId}:${selection.entityId ?? ""}:${selection.branch ?? ""}:${readiness.permissions.join(",")}:${onlyPolicyKey ?? ""}`} onlyPolicyKey={onlyPolicyKey} />;
}
function LivePolicyEditor({ onlyPolicyKey }: { onlyPolicyKey?: PolicyKey }) {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Buying rules require an ERP company.");
  const companyId = readiness.legalEntityId;
  const currency = readiness.defaultCurrencyCode;
  const initialKey = onlyPolicyKey ?? "PURCHASE_REQUEST";
  const canEdit = readiness.permissions.includes("procurement-configuration-edit");
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [reviewing, setReviewing] = useState<PolicyPage["items"][number] | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [deciding, setDeciding] = useState<PolicyPage["items"][number] | null>(null);
  const [decisionAction, setDecisionAction] = useState<"publish" | "return">("publish");
  const [decisionReason, setDecisionReason] = useState("");
  const [previewing, setPreviewing] = useState<PolicyPage["items"][number] | null>(null);
  const [sampleAmount, setSampleAmount] = useState("0");
  const [sampleCategory, setSampleCategory] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [key, setKey] = useState<string>(initialKey);
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<RuleRow[]>([emptyRule(initialKey)]);
  const [issues, setIssues] = useState<PolicyIssue[]>([]);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unsupported, setUnsupported] = useState<PolicyRecord | null>(null);
  const [uncertain, setUncertain] = useState(false), [sourcingReady, setSourcingReady] = useState(false);
  const alive = useRef(true), sequence = useRef(0), readAbort = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; readAbort.current?.abort(); }; }, []);
  useEffect(() => {
    const abort = new AbortController(); setSourcingReady(false);
    lookupSourcingReviewers(companyId, "", 0, abort.signal).then(() => { if (!abort.signal.aborted) setSourcingReady(true); })
      .catch(() => { if (!abort.signal.aborted) setSourcingReady(false); });
    return () => abort.abort();
  }, [companyId]);
  const current = (ticket: number) => alive.current && sequence.current === ticket;
  const nextRead = () => { readAbort.current?.abort(); readAbort.current = new AbortController(); return { ticket: ++sequence.current, signal: readAbort.current.signal }; };
  const reconcile = () => { sequence.current++; readAbort.current?.abort(); setUncertain(false); setEditing(null); setReviewing(null); setDeciding(null); setPreviewing(null); setUnsupported(null); setIssues([]); setError(""); setRefresh(value => value + 1); };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    listPolicies(companyId, controller.signal).then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, refresh]);

  const newDraft = () => { if (uncertain || saving) return; nextRead(); setUnsupported(null); setEditing("new"); setKey(initialKey);
    setStart(tomorrow()); setEnd(""); setRows([emptyRule(initialKey)]);
    setIssues([]); setError(""); };
  async function edit(id: string) {
    if (uncertain || saving) return;
    const { ticket, signal } = nextRead();
    setEditing(null); setError(""); setIssues([]); setUnsupported(null);
    try {
      const record = await getPolicy(companyId, id, signal);
      if (!current(ticket)) return;
      const parsed = fromRuleJson(record.rulesJson, record.policyKey, currency);
      if (!parsed?.length || record.policyKey === "SOURCING" && !sourcingReady) {
        setUnsupported(record); setEditing(null);
        setError("These rules include settings this editor cannot safely change. The saved rules below are read-only and will be preserved.");
        return;
      }
      setEditing(record); setKey(record.policyKey); setStart(day(record.effectiveFrom));
      setEnd(day(record.effectiveTo)); setRows(parsed);
    } catch (cause) { if (current(ticket)) setError(errorText(cause)); }
  }
  const changeRow = (index: number, patch: Partial<RuleRow>) =>
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || uncertain || saving) return;
    const ticket = sequence.current; let mutationStarted = false;
    setSaving(true); setError(""); setIssues([]);
    try {
      if (key === "SOURCING" && !sourcingReady) throw new Error("Sourcing rule setup is unavailable until ERP supports this configuration version.");
      const rulesJson = toRuleJson(key, currency, rows);
      const check = await validatePolicy(companyId, rulesJson);
      if (!current(ticket)) return;
      setIssues(check.issues);
      if (!check.isValid) return;
      const draft = { policyKey: key, effectiveFrom: utc(start),
        effectiveTo: end ? utc(end) : null, rulesJson };
      mutationStarted = true;
      if (editing === "new") await createPolicy(companyId, draft);
      else await updatePolicy(companyId, editing.id, editing.version, draft);
      if (current(ticket)) { setEditing(null); setRefresh((value) => value + 1); }
    } catch (cause) { if (current(ticket)) { setError(errorText(cause)); if (mutationStarted && (!(cause instanceof PolicyApiError) || cause.unconfirmed)) setUncertain(true); } }
    finally { if (current(ticket)) setSaving(false); }
  }

  async function beginReview(record: PolicyPage["items"][number]) {
    if (uncertain || saving) return;
    const { ticket, signal } = nextRead();
    setError(""); setEditing(null); setReviewing(null); setPreviewing(null); setDeciding(null); setUnsupported(null);
    try {
      const fresh = await getPolicy(companyId, record.id, signal);
      if (!current(ticket)) return;
      if (!fromRuleJson(fresh.rulesJson, fresh.policyKey, currency)?.length || fresh.policyKey === "SOURCING" && !sourcingReady) {
        setUnsupported(fresh); setError("These saved rules use unsupported settings. Keep them read-only until their setup is verified."); return;
      }
      setReviewing(fresh); setReviewReason("");
    } catch (cause) { if (current(ticket)) setError(errorText(cause)); }
  }
  async function sendForReview(event: FormEvent) {
    event.preventDefault();
    if (!reviewing || !reviewReason.trim() || uncertain || saving || reviewing.policyKey === "SOURCING" && !sourcingReady) return;
    const ticket = sequence.current;
    setSaving(true); setError("");
    try {
      await submitPolicyReview(companyId, reviewing.id, reviewing.version, reviewReason.trim());
      if (current(ticket)) { setReviewing(null); setReviewReason(""); setRefresh((value) => value + 1); }
    } catch (cause) { if (current(ticket)) { setError(errorText(cause)); if (!(cause instanceof PolicyApiError) || cause.unconfirmed) setUncertain(true); } }
    finally { if (current(ticket)) setSaving(false); }
  }
  async function runPreview(event: FormEvent) {
    event.preventDefault();
    if (!previewing || saving || uncertain || previewing.policyKey === "SOURCING" && !sourcingReady) return;
    const ticket = sequence.current;
    setSaving(true); setError(""); setPreview(null);
    try {
      const numeric = exactPolicySample(sampleAmount, previewing.policyKey === "SOURCING");
      const result = await previewPolicy(companyId, previewing.id, {
        currencyCode: currency, lineBaseAmount: numeric,
        categoryCode: sampleCategory.trim().toUpperCase() || null,
        purchaseType: sampleType || null, branchId: null,
      });
      if (current(ticket)) setPreview(result);
    } catch (cause) { if (current(ticket)) setError(errorText(cause)); }
    finally { if (current(ticket)) setSaving(false); }
  }
  async function makeDecision(event: FormEvent) {
    event.preventDefault();
    if (!deciding || !decisionReason.trim() || uncertain || saving || deciding.policyKey === "SOURCING" && !sourcingReady) return;
    const ticket = sequence.current;
    setSaving(true); setError("");
    try {
      await decidePolicy(companyId, deciding.id, deciding.version, decisionAction, decisionReason.trim());
      if (current(ticket)) { setDeciding(null); setDecisionReason(""); setRefresh((value) => value + 1); }
    } catch (cause) { if (current(ticket)) { setError(errorText(cause)); if (!(cause instanceof PolicyApiError) || cause.unconfirmed) setUncertain(true); } }
    finally { if (current(ticket)) setSaving(false); }
  }
  async function beginDecision(record: PolicyPage["items"][number], action: "publish" | "return") {
    if (uncertain || saving) return;
    const { ticket, signal } = nextRead();
    setError(""); setEditing(null); setReviewing(null); setPreviewing(null); setDeciding(null); setUnsupported(null);
    try {
      const fresh = await getPolicy(companyId, record.id, signal);
      if (!current(ticket)) return;
      if (!fromRuleJson(fresh.rulesJson, fresh.policyKey, currency)?.length || fresh.policyKey === "SOURCING" && !sourcingReady) {
        setUnsupported(fresh);
        setError("These rules need settings or approval assignments that are not connected to this editor. Keep them read-only until their setup is verified.");
        return;
      }
      setDeciding(fresh); setDecisionAction(action); setDecisionReason("");
    } catch (cause) { if (current(ticket)) setError(errorText(cause)); }
  }

  const visible = page?.items.filter((record) => !onlyPolicyKey || record.policyKey === onlyPolicyKey);
  return <div className="mx-auto max-w-5xl space-y-5">
    {!onlyPolicyKey && <PageHeader title="Buying rules" subtitle="Prepare company rules for budgets, quotes and approvals." />}
    <Panel><div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Rules for {currency}</h2>
          <p className="text-sm text-muted-foreground">A draft does not approve or release a purchase. Publishing rules configures policy; it does not publish a request for quotes.</p></div>
        {canEdit && <Button disabled={saving || uncertain} onClick={newDraft}>Add buying rule draft</Button>}
      </div>
      {listError && <p role="alert" className="mb-4 text-sm text-red-700">{listError}</p>}
      {loading ? <p role="status">Loading buying rules…</p> : visible?.length
        ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Used for</th><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{visible.map((record) => <tr key={record.id}><td>{policyLabel(record.policyKey)}</td><td>{record.policyVersionNumber}</td><td>{day(record.effectiveFrom)}</td><td>{day(record.effectiveTo) || "No end date"}</td><td><Badge>{record.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={saving || uncertain || record.policyKey === "SOURCING" && !sourcingReady} onClick={() => { nextRead(); setPreviewing(record); setEditing(null); setReviewing(null); setDeciding(null); setPreview(null); setError(""); }}>Try a sample</Button>{(!supportedKey(record.policyKey) || record.policyKey === "SOURCING" && !sourcingReady) && <Button variant="secondary" disabled={saving || uncertain} onClick={() => void edit(record.id)}>View saved rules</Button>}{record.state === "Draft" && canEdit && supportedKey(record.policyKey) && (record.policyKey !== "SOURCING" || sourcingReady) && <><Button variant="secondary" disabled={saving || uncertain} onClick={() => void edit(record.id)}>Edit draft</Button><Button variant="secondary" disabled={saving || uncertain} onClick={() => void beginReview(record)}>Send for review</Button></>}{record.state === "PendingReview" && supportedKey(record.policyKey) && (record.policyKey !== "SOURCING" || sourcingReady) && readiness.permissions.includes("procurement-configuration-approve") && <><Button variant="secondary" disabled={saving || uncertain} onClick={() => void beginDecision(record, "publish")}>Publish</Button><Button variant="secondary" disabled={saving || uncertain} onClick={() => void beginDecision(record, "return")}>Return for changes</Button></>}</div></td></tr>)}</tbody></RecordTable></div>
        : <EmptyState title="No buying rules yet" description="Add a draft for purchase requests, orders or supported sourcing rules." action={canEdit ? <Button disabled={saving || uncertain} onClick={newDraft}>Add buying rule draft</Button> : undefined} />}
      {page && page.total > page.items.length && <p className="mt-3 text-xs text-muted-foreground">Showing the first {page.items.length} of {page.total} versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!sourcingReady && <p className="text-sm text-muted-foreground">Sourcing rule setup is unavailable until ERP supports its controlled configuration version. Purchase request and order settings remain available.</p>}
    {uncertain && <Panel title="Check the saved result"><div className="space-y-3 p-5"><p>The response was interrupted. This page will not repeat the change. Refresh and check the saved rules before starting another action.</p><Button onClick={reconcile}>Refresh and check saved rules</Button></div></Panel>}
    {unsupported && <Panel title="Saved rules — read-only"><div className="space-y-3 p-5"><Field label="Saved rule definition"><Textarea readOnly rows={12} value={unsupported.rulesJson} /></Field><Button variant="secondary" onClick={() => setUnsupported(null)}>Close saved rules</Button></div></Panel>}
    {deciding && <form onSubmit={makeDecision}><Panel title={decisionAction === "publish" ? "Publish buying rules" : "Return buying rules for changes"}><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{decisionAction === "publish" ? "A separate reviewer must confirm these rules. The start date must be in the future, the rules must cover all purchases, and the effective period cannot overlap another published version. Publication does not approve a purchase." : "Send the rules back to their author with a clear correction note. They can edit the draft and request review again."}</p>
      <Field label={decisionAction === "publish" ? "Publication reason" : "What needs to change?"}><Input required maxLength={1000} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></Field>
      <div className="flex gap-3"><Button type="submit" disabled={saving || uncertain || !decisionReason.trim()}>{saving ? "Checking…" : decisionAction === "publish" ? "Publish rules" : "Return to author"}</Button><Button variant="secondary" disabled={saving || uncertain} onClick={() => { nextRead(); setDeciding(null); }}>Cancel</Button></div>
    </div></Panel></form>}
    {previewing && <form onSubmit={runPreview}><Panel title="Try a sample purchase"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">See which rule a sample purchase matches. This check does not approve or change a purchase. Branch-specific conditions need a fuller preview.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Sample line amount before adjustments (${currency})`}><Input type="number" min={0} step={previewing.policyKey === "SOURCING" ? "0.00000001" : "0.0001"} required value={sampleAmount} onChange={(event) => setSampleAmount(event.target.value)} /></Field>
        <Field label="Sample category"><Input value={sampleCategory} placeholder="IT" onChange={(event) => setSampleCategory(event.target.value.toUpperCase())} /></Field>
        <Field label="Sample purchase type"><Select value={sampleType} onChange={(event) => setSampleType(event.target.value)}><option value="">Any type</option><option value="GOODS">Goods</option><option value="SERVICES">Services</option><option value="ASSETS">Assets</option><option value="SUBSCRIPTIONS">Subscriptions</option></Select></Field>
      </div>
      <div className="flex gap-3"><Button type="submit" disabled={saving || uncertain}>{saving ? "Checking…" : "Check sample"}</Button><Button variant="secondary" disabled={saving} onClick={() => { nextRead(); setPreviewing(null); }}>Close</Button></div>
      {preview && <div role="status" className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
        <p className="font-semibold">{preview.decision.status === "Match" ? `Matched ${preview.decision.ruleCode}` : `Check result: ${preview.decision.status}`}</p>
        {preview.decision.status === "Match" && previewing.policyKey !== "SOURCING" && <p className="mt-2">Budget: {preview.decision.budgetReservation} · Buying method: {preview.decision.sourcingMethodCode || "No specific method"} · Quotes: {preview.decision.minimumQuoteCount ?? "Not specified"} · Approvers: {preview.decision.approvalStages.map((stage) => stage.assignee).join(", ")}</p>}
        {previewing.policyKey === "SOURCING" && preview.decision.controls && <p className="mt-2">Minimum quotes: {preview.decision.controls.minimumQuoteCount} · Minimum invited suppliers: {preview.decision.controls.minimumInvitedSuppliers} · Named review steps: {preview.decision.stages?.length ?? 0}. Settings preview only; no RFQ is published.</p>}
        {!!preview.coverageIssues.length && <div className="mt-3"><p className="font-medium">Rules to review before publication:</p><ul className="list-disc pl-5">{preview.coverageIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>}
        {!!preview.decision.issues.length && <ul className="mt-2 list-disc pl-5">{preview.decision.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        <p className="mt-3 text-xs text-muted-foreground">Sample only. This is not a spending approval.</p>
      </div>}
    </div></Panel></form>}
    {reviewing && <form onSubmit={sendForReview}><Panel title="Send buying rule for review"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">Only the draft author can send it. ERP will check the company currency and active categories, branches and buying methods. A review request does not approve spending.</p>
      <Field label="What should the reviewer check?"><Input required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <div className="flex gap-3"><Button type="submit" disabled={saving || uncertain || !reviewReason.trim()}>{saving ? "Checking…" : "Send for review"}</Button><Button variant="secondary" disabled={saving || uncertain} onClick={() => { nextRead(); setReviewing(null); }}>Cancel</Button></div>
    </div></Panel></form>}
    {editing && <form onSubmit={save}>
      <fieldset disabled={saving || uncertain}><Panel title={editing === "new" ? "New buying rule draft" : `Edit ${key.replaceAll("_", " ").toLowerCase()} draft`}>
        <div className="space-y-5 p-5">
          {editing !== "new" && editing.lastReturnReason && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Reviewer asked for changes: {editing.lastReturnReason}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Use these rules for"><Select value={key} disabled={!!onlyPolicyKey || editing !== "new"} onChange={(event) => {
              const next = event.target.value; setKey(next);
              if (next === "SOURCING" || key === "SOURCING") { setRows([emptyRule(next)]); return; }
              // Only a new unsaved draft can change type. Require an explicit reviewer
              // choice instead of silently converting any existing approval steps.
              setRows((current) => current.map((row) => ({ ...row, stages: row.stages.map((stage) => ({ ...stage,
                assignee: approvalAssigneesForPolicy(next).includes(stage.assignee) ? stage.assignee : "" })) })));
            }}>{(!onlyPolicyKey || onlyPolicyKey === "PURCHASE_REQUEST") && <option value="PURCHASE_REQUEST">Purchase requests</option>}{(!onlyPolicyKey || onlyPolicyKey === "PURCHASE_ORDER") && <option value="PURCHASE_ORDER">Purchase orders</option>}{(!onlyPolicyKey || onlyPolicyKey === "SOURCING") && <option value="SOURCING" disabled={!sourcingReady}>Sourcing publication rules</option>}</Select></Field>
            <Field label="Start date"><Input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
            <Field label="End date (optional)"><Input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          </div>
          <p className="text-sm text-muted-foreground">{key === "SOURCING" ? "Sourcing review uses the full selected approved source line amount. Publishing these settings does not publish an RFQ." : key === "PURCHASE_ORDER" ? "Order approval uses the approved order line amount. Finance confirms the full amount including tax separately." : "Request approval uses the estimated request line amount."} Amounts use {currency} and equal quantity × unit price before discounts, tax and delivery. An empty amount or category means there is no limit for that condition. Higher priority wins where rules overlap.</p>
          {rows.map((row, index) => <section key={index} className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Rule {index + 1}</h3>{rows.length > 1 && <Button variant="secondary" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove rule</Button>}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rule code"><Input required maxLength={100} value={row.code} onChange={(event) => changeRow(index, { code: event.target.value.toUpperCase() })} /></Field>
              <Field label="Priority"><Input type="number" min={0} max={100000} required value={row.priority} onChange={(event) => changeRow(index, { priority: Number(event.target.value) })} /></Field>
              <Field label="Purchase type"><Select value={row.purchaseType} onChange={(event) => changeRow(index, { purchaseType: event.target.value })}><option value="">Any type</option><option value="GOODS">Goods</option><option value="SERVICES">Services</option><option value="ASSETS">Assets</option><option value="SUBSCRIPTIONS">Subscriptions</option></Select></Field>
              <Field label={`Amount from (${currency})`}><Input type="number" min={0} step="0.0001" value={row.minimum} onChange={(event) => changeRow(index, { minimum: event.target.value })} /></Field>
              <Field label={`Amount below (${currency})`}><Input type="number" min={0} step="0.0001" value={row.maximum} onChange={(event) => changeRow(index, { maximum: event.target.value })} /></Field>
              <Field label="Category codes (optional)"><Input value={row.categoryCodes} placeholder="IT, OFFICE" onChange={(event) => changeRow(index, { categoryCodes: event.target.value.toUpperCase() })} /></Field>
              {key !== "SOURCING" && <><Field label="Budget handling"><Select value={row.budget} onChange={(event) => changeRow(index, { budget: event.target.value as RuleRow["budget"] })}><option value="Required">Require budget confirmation</option><option value="ExceptionReview">Send budget exception for review</option></Select></Field>
              <Field label="Buying method code (optional)"><Input value={row.method} onChange={(event) => changeRow(index, { method: event.target.value.toUpperCase() })} /></Field>
              <Field label="Quotes needed (optional)"><Input type="number" min={0} max={20} value={row.quotes} onChange={(event) => changeRow(index, { quotes: event.target.value })} /></Field></>}
            </div>
            {key === "SOURCING" && row.sourcing && <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Branch coverage"><Select required value={row.sourcing.companyWide === true ? "all" : ""} onChange={event => changeRow(index, { sourcing: { ...row.sourcing!, companyWide: event.target.value === "all" ? true : null } })}><option value="">Choose branch coverage</option><option value="all">All company branches</option></Select></Field>
              <Field label="Minimum quotes"><Input required inputMode="numeric" value={row.sourcing.quotes} onChange={event => changeRow(index, { sourcing: { ...row.sourcing!, quotes: event.target.value } })} /></Field>
              <Field label="Minimum invited suppliers"><Input required inputMode="numeric" value={row.sourcing.invited} onChange={event => changeRow(index, { sourcing: { ...row.sourcing!, invited: event.target.value } })} /></Field>
              {([['pack','Requirements pack'],['criteria','Evaluation criteria'],['deadline','Closing date']] as const).map(([field,label]) => <Field key={field} label={label}><Select required value={row.sourcing![field] == null ? "" : String(row.sourcing![field])} onChange={event => changeRow(index, { sourcing: { ...row.sourcing!, [field]: event.target.value === "" ? null : event.target.value === "true" } })}><option value="">Choose a requirement</option><option value="true">Required</option><option value="false">Not required</option></Select></Field>)}
              <p className="text-sm text-muted-foreground sm:col-span-3">Choose every control explicitly. Zero is allowed when policy permits it. Branch-specific saved rules stay read-only in this editor; ERP validates your actual company branch authority.</p>
            </div>}
            <fieldset><legend className="mb-2 text-sm font-medium">Approval steps (in order)</legend><div className="space-y-3 text-sm">
              {row.stages.map((stage, position) => <div key={position} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
                <Field label={`Step ${position + 1} code`}><Input required maxLength={100} value={stage.code} onChange={(event) => changeRow(index, { stages: row.stages.map((item, i) => i === position ? { ...item, code: event.target.value.toUpperCase() } : item) })} /></Field>
                {key !== "SOURCING" && <Field label={`Step ${position + 1} reviewers`}><Select value={stage.assignee} onChange={(event) => changeRow(index, { stages: row.stages.map((item, i) => i === position ? { ...item, assignee: event.target.value } : item) })}><option value="">Choose reviewers</option>{key === "PURCHASE_REQUEST" && <option value="LineManager">Line manager</option>}<option value="BudgetOwner" disabled>Budget owner — mapping not connected</option><option value="ProcurementManager">Procurement managers</option></Select></Field>}
                <Field label={`Step ${position + 1} decision rule`}><Select value={stage.mode} onChange={(event) => changeRow(index, { stages: row.stages.map((item, i) => i === position ? { ...item, mode: event.target.value as "One" | "All" } : item) })}>{key === "SOURCING" && <option value="">Choose One or All</option>}<option value="One">One eligible reviewer</option><option value="All">All eligible reviewers</option></Select></Field>
                {key === "SOURCING" && <PolicyReviewerPicker company={companyId} label={`Step ${position + 1} named reviewers`} selected={stage.principalIds ?? []} disabled={saving || uncertain} onChange={principalIds => changeRow(index, { stages: row.stages.map((item,i) => i === position ? { ...item, principalIds } : item) })} />}
                <div className="flex flex-wrap gap-2 sm:col-span-3"><Button variant="secondary" disabled={!position} onClick={() => { const next = [...row.stages]; [next[position - 1], next[position]] = [next[position], next[position - 1]]; changeRow(index, { stages: next }); }}>Move step up</Button><Button variant="secondary" disabled={position === row.stages.length - 1} onClick={() => { const next = [...row.stages]; [next[position + 1], next[position]] = [next[position], next[position + 1]]; changeRow(index, { stages: next }); }}>Move step down</Button><Button variant="secondary" onClick={() => changeRow(index, { stages: row.stages.filter((_, i) => i !== position) })}>Remove step {position + 1}</Button></div>
              </div>)}
              <Button variant="secondary" onClick={() => changeRow(index, { stages: [...row.stages, { code: `STEP_${row.stages.length + 1}`, assignee: "ProcurementManager", mode: key === "SOURCING" ? "" : "One", ...(key === "SOURCING" ? { principalIds: [] } : {}) }] })}>Add approval step</Button>
              <p className="text-muted-foreground">{key === "PURCHASE_ORDER" ? "Order steps use procurement reviewers with purchase order approval limits. " : ""}People must also have active finite approval limits. Missing or ambiguous assignments stop approval routing; these choices do not grant authority.</p>
            </div></fieldset>
          </section>)}
          <Button variant="secondary" onClick={() => setRows((current) => [...current, { ...emptyRule(key), code: `RULE_${current.length + 1}`, priority: current.length }])}>Add another rule</Button>
          {!!issues.length && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Check these rule details:</p><ul className="mt-2 list-disc pl-5">{issues.map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul></div>}
          <div className="flex gap-3"><Button type="submit" disabled={saving || uncertain}>{saving ? "Checking…" : "Check and save draft"}</Button><Button variant="secondary" onClick={() => { nextRead(); setEditing(null); setIssues([]); }}>Cancel</Button></div>
        </div>
      </Panel></fieldset>
    </form>}
  </div>;
}
