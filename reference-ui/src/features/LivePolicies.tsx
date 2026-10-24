import { Link } from "react-router-dom";
import { isBuyingRulePolicy, ownedPolicySettings, policyLabel } from "./policy-key-dispatch";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Switch } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  canRetirePolicyDraft, retirePolicyDraft, PolicyActionError,
  createPolicy, decidePolicy, getPolicy, listPolicies, previewPolicy,
  submitPolicyReview, updatePolicy, validatePolicy,
  type PolicyPage, type PolicyRecord, type PolicyIssue, type PolicyPreview,
} from "../../../src/platform/procurement-policy-api";

type RuleRow = {
  code: string; priority: number; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; budget: "Required" | "ExceptionReview";
  method: string; quotes: string; lineManager: boolean; budgetOwner: boolean;
  procurementManager: boolean;
};
const emptyRule = (): RuleRow => ({ code: "DEFAULT", priority: 0, minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  lineManager: true, budgetOwner: false, procurementManager: false });
const codes = (value: string) => value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
const day = (value: string | null) => value?.slice(0, 10) ?? "";
const utc = (value: string) => `${value}T00:00:00.000Z`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Buying rules are unavailable.";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((name) => allowed.includes(name));

function toRuleJson(key: string, currency: string, rows: RuleRow[]): string {
  if (!isBuyingRulePolicy(key)) throw new Error("This policy needs its own settings editor.");
  return JSON.stringify({ schemaVersion: 1,
    transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
    currencyCode: currency, amountBasis: key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase",
    rules: rows.map((row) => ({ code: row.code.trim().toUpperCase(), priority: Number(row.priority),
      when: { minimumAmountInclusive: row.minimum ? Number(row.minimum) : null,
        maximumAmountExclusive: row.maximum ? Number(row.maximum) : null,
        categoryCodes: codes(row.categoryCodes), purchaseTypes: row.purchaseType ? [row.purchaseType] : [],
        branchIds: [] },
      result: { budgetReservation: row.budget,
        sourcingMethodCode: row.method.trim().toUpperCase() || null,
        minimumQuoteCount: row.quotes === "" ? null : Number(row.quotes),
        approvalStages: [
          ...(row.lineManager ? [{ code: "NEED", assignee: "LineManager", mode: "One" }] : []),
          ...(row.budgetOwner ? [{ code: "FUNDING", assignee: "BudgetOwner", mode: "One" }] : []),
          ...(row.procurementManager ? [{ code: "BUYING", assignee: "ProcurementManager", mode: "One" }] : []),
        ] },
    })) }, null, 2);
}

function fromRuleJson(json: string, key: string, currency: string): RuleRow[] | null {
  if (!isBuyingRulePolicy(key)) return null;
  try {
    const document = JSON.parse(json) as Record<string, unknown>;
    if (document.schemaVersion !== 1 || !Array.isArray(document.rules)
      || !onlyKeys(document, ["schemaVersion", "transactionType", "currencyCode", "amountBasis", "rules"])
      || document.currencyCode !== currency
      || document.transactionType !== (key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest")
      || document.amountBasis !== (key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase")) return null;
    return document.rules.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("Unknown rule");
      const rule = value as Record<string, unknown>;
      const when = rule.when as Record<string, unknown>;
      const result = rule.result as Record<string, unknown>;
      if (!when || !result || !Array.isArray(result.approvalStages)
        || !onlyKeys(rule, ["code", "priority", "when", "result"])
        || !onlyKeys(when, ["minimumAmountInclusive", "maximumAmountExclusive", "categoryCodes", "purchaseTypes", "branchIds"])
        || !onlyKeys(result, ["budgetReservation", "sourcingMethodCode", "minimumQuoteCount", "approvalStages"])
        || !Array.isArray(when.categoryCodes) || !Array.isArray(when.purchaseTypes)
        || !Array.isArray(when.branchIds) || when.branchIds.length
        || when.purchaseTypes.length > 1
        || (when.purchaseTypes.length === 1 && !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(String(when.purchaseTypes[0])))
        || !["Required", "ExceptionReview"].includes(String(result.budgetReservation)))
        throw new Error("This draft uses more detailed conditions.");
      const stages = result.approvalStages as Array<Record<string, unknown>>;
      if (stages.some((stage) => !onlyKeys(stage, ["code", "assignee", "mode"])
        || stage.mode !== "One" || ![
          ["NEED", "LineManager"], ["FUNDING", "BudgetOwner"], ["BUYING", "ProcurementManager"],
        ].some(([code, assignee]) => stage.code === code && stage.assignee === assignee)))
        throw new Error("This draft uses a different approval assignment.");
      return { code: String(rule.code ?? ""), priority: Number(rule.priority ?? 0),
        minimum: when.minimumAmountInclusive == null ? "" : String(when.minimumAmountInclusive),
        maximum: when.maximumAmountExclusive == null ? "" : String(when.maximumAmountExclusive),
        categoryCodes: when.categoryCodes.join(", "), purchaseType: String(when.purchaseTypes[0] ?? ""),
        budget: result.budgetReservation === "ExceptionReview" ? "ExceptionReview" : "Required",
        method: String(result.sourcingMethodCode ?? ""),
        quotes: result.minimumQuoteCount == null ? "" : String(result.minimumQuoteCount),
        lineManager: stages.some((stage) => stage.assignee === "LineManager"),
        budgetOwner: stages.some((stage) => stage.assignee === "BudgetOwner"),
        procurementManager: stages.some((stage) => stage.assignee === "ProcurementManager"),
      } satisfies RuleRow;
    });
  } catch { return null; }
}

export function LivePolicies() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Buying rules require an ERP company.");
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <LivePoliciesRecord key={[readiness.tenantId, readiness.legalEntityId, selection.branch,
    readiness.principalId].join(":")} />;
}
function LivePoliciesRecord() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Buying rules require an ERP company.");
  const companyId = readiness.legalEntityId;
  const canEdit = readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = readiness.permissions.includes("procurement-configuration-approve");
  const canPreview = readiness.permissions.includes("procurement-configuration-read");
  const currency = readiness.defaultCurrencyCode;
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [reviewing, setReviewing] = useState<PolicyPage["items"][number] | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [deciding, setDeciding] = useState<PolicyPage["items"][number] | null>(null);
  const [decisionAction, setDecisionAction] = useState<"publish" | "return">("publish");
  const [decisionReason, setDecisionReason] = useState("");
  const [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [previewing, setPreviewing] = useState<PolicyPage["items"][number] | null>(null);
  const [sampleAmount, setSampleAmount] = useState("0");
  const [sampleCategory, setSampleCategory] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [key, setKey] = useState("PURCHASE_REQUEST");
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<RuleRow[]>([emptyRule()]);
  const [issues, setIssues] = useState<PolicyIssue[]>([]);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [writeLocked, setWriteLocked] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [retiring, setRetiring] = useState<PolicyPage["items"][number] | null>(null);
  const [retirementReason, setRetirementReason] = useState("");
  const [retirementLocked, setRetirementLocked] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const canStart = () => alive.current && !busy.current && !writeLocked;
  const uncertain = (cause: unknown) => !(cause instanceof PolicyActionError)
    || cause.status === 0 || cause.status === 409 || cause.status >= 500;
  const failWrite = (cause: unknown) => {
    if (!alive.current) return;
    setError(errorText(cause));
    if (uncertain(cause)) setWriteLocked(true);
  };
  async function checkSaved() {
    if (!alive.current || busy.current || checkingSaved) return;
    setCheckingSaved(true);
    try {
      const latest = await listPolicies(companyId);
      if (!alive.current) return;
      setPage(latest);
      setError("Saved rules were loaded for comparison. The unconfirmed command is still locked; open the saved record to continue.");
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setCheckingSaved(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    listPolicies(companyId, controller.signal).then((result) => { if (!controller.signal.aborted) setPage(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, refresh]);

  const newDraft = () => { if (!canEdit || !canStart()) return; setEditing("new"); setKey("PURCHASE_REQUEST");
    setStart(tomorrow()); setEnd(""); setRows([emptyRule()]);
    setIssues([]); setError(""); };
  async function viewSavedPolicy(id: string) {
    if (!alive.current || busy.current) return;
    busy.current = true; setSaving(true); setError(""); setViewing(null);
    try {
      const record = await getPolicy(companyId, id);
      if (record.id !== id) throw new Error("The saved policy response did not match this version. Refresh the list.");
      if (alive.current) setViewing(record);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  async function edit(id: string) {
    if (!canEdit || !canStart()) return;
    busy.current = true; setSaving(true); setEditing(null);
    setError(""); setIssues([]);
    try {
      const record = await getPolicy(companyId, id);
      if (!alive.current) return;
      const parsed = fromRuleJson(record.rulesJson, record.policyKey, currency);
      if (!parsed?.length) {
        setError("This draft uses settings that need a fuller editor. Ask Procurement to review the existing draft before changing it.");
        return;
      }
      setEditing(record); setKey(record.policyKey); setStart(day(record.effectiveFrom));
      setEnd(day(record.effectiveTo)); setRows(parsed);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  const changeRow = (index: number, patch: Partial<RuleRow>) =>
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !editing || !isBuyingRulePolicy(key)
      || (editing !== "new" && (!isBuyingRulePolicy(editing.policyKey) || editing.policyKey !== key)) || !canStart()) return;
    busy.current = true;
    setSaving(true); setError(""); setIssues([]);
    let mutationStarted = false;
    try {
      const rulesJson = toRuleJson(key, currency, rows);
      const check = await validatePolicy(companyId, rulesJson);
      if (!alive.current) return;
      setIssues(check.issues);
      if (!check.isValid) return;
      const draft = { policyKey: key, effectiveFrom: utc(start),
        effectiveTo: end ? utc(end) : null, rulesJson };
      mutationStarted = true;
      if (editing === "new") await createPolicy(companyId, draft);
      else await updatePolicy(companyId, editing.id, editing.version, draft);
      if (!alive.current) return;
      setEditing(null); setRefresh((value) => value + 1);
    } catch (cause) { if (alive.current) mutationStarted ? failWrite(cause) : setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }

  async function sendForReview(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !reviewing || !isBuyingRulePolicy(reviewing.policyKey) || !reviewReason.trim() || !canStart()) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      await submitPolicyReview(companyId, reviewing.id, reviewing.version, reviewReason.trim());
      if (!alive.current) return;
      setReviewing(null); setReviewReason(""); setRefresh((value) => value + 1);
    } catch (cause) { failWrite(cause); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  async function runPreview(event: FormEvent) {
    event.preventDefault();
    if (!canPreview || !previewing || !isBuyingRulePolicy(previewing.policyKey) || !canStart()) return;
    busy.current = true;
    setSaving(true); setError(""); setPreview(null);
    try {
      const result = await previewPolicy(companyId, previewing.id, {
        currencyCode: currency, lineBaseAmount: Number(sampleAmount),
        categoryCode: sampleCategory.trim().toUpperCase() || null,
        purchaseType: sampleType || null, branchId: null,
      });
      if (alive.current) setPreview(result);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  async function makeDecision(event: FormEvent) {
    event.preventDefault();
    if (!canApprove || !deciding || !isBuyingRulePolicy(deciding.policyKey) || !decisionReason.trim() || !canStart()) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      await decidePolicy(companyId, deciding.id, deciding.version, decisionAction, decisionReason.trim());
      if (!alive.current) return;
      setDeciding(null); setDecisionReason(""); setRefresh((value) => value + 1);
    } catch (cause) { failWrite(cause); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }

  async function retire(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !retiring || !canStart() || retirementLocked) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      await retirePolicyDraft(companyId, retiring, retirementReason);
      if (!alive.current) return;
      setRetiring(null); setRetirementReason(""); setRefresh((value) => value + 1);
    } catch (cause) {
      if (!alive.current) return;
      setError(errorText(cause));
      if (uncertain(cause)) { setRetirementLocked(true); setWriteLocked(true); }
    } finally { busy.current = false; if (alive.current) setSaving(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title="Buying rules" subtitle="Prepare company rules for budgets, quotes and approvals." />
    <Panel><div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Rules for {currency}</h2>
          <p className="text-sm text-muted-foreground">Saved rules are drafts. A draft does not approve or release a purchase.</p></div>
        {canEdit && <Button disabled={saving || writeLocked} onClick={newDraft}>Add buying rule draft</Button>}
      </div>
      {listError && <p role="alert" className="mb-4 text-sm text-red-700">{listError}</p>}
      {loading ? <p role="status">Loading buying rules…</p> : page?.items.length
        ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Used for</th><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{page.items.map((record) => <tr key={record.id}><td>{policyLabel(record.policyKey)}</td><td>{record.policyVersionNumber}</td><td>{day(record.effectiveFrom)}</td><td>{day(record.effectiveTo) || "No end date"}</td><td><Badge>{record.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={saving} onClick={() => void viewSavedPolicy(record.id)}>View saved version</Button>{!isBuyingRulePolicy(record.policyKey) && <span className="text-sm text-muted-foreground">Read only here. <Link className="text-primary hover:underline" to={ownedPolicySettings(record.policyKey).path}>{ownedPolicySettings(record.policyKey).label}</Link></span>}{canPreview && isBuyingRulePolicy(record.policyKey) && <Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setPreviewing(record); setEditing(null); setReviewing(null); setDeciding(null); setPreview(null); setError(""); }}>Try a sample</Button>}{canEdit && canRetirePolicyDraft(record) && <Button variant="secondary" disabled={saving || writeLocked} onClick={() => {
            setRetiring(record); setRetirementReason(""); setRetirementLocked(false); setEditing(null);
            setReviewing(null); setDeciding(null); setPreviewing(null); setError("");
          }}>Retire unused draft</Button>}{canEdit && isBuyingRulePolicy(record.policyKey) && record.state === "Draft" && <><Button variant="secondary" disabled={saving || writeLocked} onClick={() => void edit(record.id)}>Edit draft</Button><Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setReviewing(record); setPreviewing(null); setDeciding(null); setEditing(null); setReviewReason(""); setError(""); }}>Send for review</Button></>}{canApprove && isBuyingRulePolicy(record.policyKey) && record.state === "PendingReview" && <><Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setDeciding(record); setDecisionAction("publish"); setDecisionReason(""); setReviewing(null); setPreviewing(null); setEditing(null); setError(""); }}>Publish</Button><Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setDeciding(record); setDecisionAction("return"); setDecisionReason(""); setReviewing(null); setPreviewing(null); setEditing(null); setError(""); }}>Return for changes</Button></>}</div></td></tr>)}</tbody></RecordTable></div>
        : <EmptyState title="No buying rules yet" description="Add a draft for purchase requests or purchase orders." action={canEdit ? <Button disabled={saving || writeLocked} onClick={newDraft}>Add buying rule draft</Button> : undefined} />}
      {page && page.total > page.items.length && <p className="mt-3 text-xs text-muted-foreground">Showing the first {page.items.length} of {page.total} versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {writeLocked && <div role="status" className="rounded-lg border border-border bg-surface p-4 text-sm"><p>A change is unconfirmed or these rules changed. Do not submit it again. Your entered values are still here.</p><Button type="button" variant="secondary" disabled={checkingSaved || saving} onClick={() => void checkSaved()}>{checkingSaved ? "Checking saved rules…" : "Check saved rules (read only)"}</Button></div>}
    {canEdit && retiring && <form onSubmit={retire}><fieldset className="min-w-0" disabled={saving}><Panel title="Retire unused buying rule draft"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">Retirement keeps this draft and its history. Reviewed, published or referenced policies cannot be retired here. No spending authority changes.</p>
      <Field label="Retirement reason"><Input required maxLength={1000} disabled={saving || retirementLocked} value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)} /></Field>
      {retirementLocked && <p role="status">The retirement is unconfirmed or the draft changed. Check the saved rules before making another change. This command will not repeat automatically.</p>}
      <div className="flex gap-3"><Button type="submit" variant="danger" disabled={saving || retirementLocked || !retirementReason.trim()}>{saving ? "Retiring…" : "Confirm retirement"}</Button>
        <Button type="button" variant="secondary" disabled={saving || checkingSaved} onClick={() => void checkSaved()}>Check saved rules</Button></div>
    </div></Panel></fieldset></form>}
    {viewing && <Panel title={`${policyLabel(viewing.policyKey)} — saved version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5">
      <p className="text-sm">Status: {viewing.state} · From {day(viewing.effectiveFrom)} · Until {day(viewing.effectiveTo) || "No end date"}</p>
      {!isBuyingRulePolicy(viewing.policyKey) && <p className="text-sm text-muted-foreground">This version is retained history. Its typed editor is not connected on this page; preview, editing and review cannot use the purchase request or order controls. <Link className="text-primary hover:underline" to={ownedPolicySettings(viewing.policyKey).path}>{ownedPolicySettings(viewing.policyKey).label}</Link></p>}
      {viewing.lastReturnReason && <p className="text-sm">Returned for changes: {viewing.lastReturnReason}</p>}
      <details><summary className="cursor-pointer text-sm">Saved policy definition (read only)</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-xs">{viewing.rulesJson}</pre></details>
      <Button type="button" variant="secondary" onClick={() => setViewing(null)}>Close saved version</Button>
    </div></Panel>}
    {canApprove && deciding && isBuyingRulePolicy(deciding.policyKey) && <form onSubmit={makeDecision}><fieldset className="min-w-0" disabled={saving}><Panel title={decisionAction === "publish" ? "Publish buying rules" : "Return buying rules for changes"}><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{decisionAction === "publish" ? "A separate reviewer must confirm these rules. The start date must be in the future, the rules must cover all purchases, and the effective period cannot overlap another published version. Publication does not approve a purchase." : "Send the rules back to their author with a clear correction note. They can edit the draft and request review again."}</p>
      <Field label={decisionAction === "publish" ? "Publication reason" : "What needs to change?"}><Input required maxLength={1000} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></Field>
      <div className="flex gap-3"><Button type="submit" disabled={saving || writeLocked || !decisionReason.trim()}>{saving ? "Checking…" : decisionAction === "publish" ? "Publish rules" : "Return to author"}</Button><Button variant="secondary" onClick={() => setDeciding(null)}>Cancel</Button></div>
    </div></Panel></fieldset></form>}
    {canPreview && previewing && isBuyingRulePolicy(previewing.policyKey) && <form onSubmit={runPreview}><fieldset className="min-w-0" disabled={saving}><Panel title="Try a sample purchase"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">See which rule a sample purchase matches. This check does not approve or change a purchase. Branch-specific conditions need a fuller preview.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Sample line amount before adjustments (${currency})`}><Input type="number" min={0} step="0.0001" required value={sampleAmount} onChange={(event) => setSampleAmount(event.target.value)} /></Field>
        <Field label="Sample category"><Input value={sampleCategory} placeholder="IT" onChange={(event) => setSampleCategory(event.target.value.toUpperCase())} /></Field>
        <Field label="Sample purchase type"><Select value={sampleType} onChange={(event) => setSampleType(event.target.value)}><option value="">Any type</option><option value="GOODS">Goods</option><option value="SERVICES">Services</option><option value="ASSETS">Assets</option><option value="SUBSCRIPTIONS">Subscriptions</option></Select></Field>
      </div>
      <div className="flex gap-3"><Button type="submit" disabled={saving || writeLocked}>{saving ? "Checking…" : "Check sample"}</Button><Button variant="secondary" onClick={() => setPreviewing(null)}>Close</Button></div>
      {preview && <div role="status" className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
        <p className="font-semibold">{preview.decision.status === "Match" ? `Matched ${preview.decision.ruleCode}` : `Check result: ${preview.decision.status}`}</p>
        {preview.decision.status === "Match" && <p className="mt-2">Budget: {preview.decision.budgetReservation} · Buying method: {preview.decision.sourcingMethodCode || "No specific method"} · Quotes: {preview.decision.minimumQuoteCount ?? "Not specified"} · Approvers: {preview.decision.approvalStages.map((stage) => stage.assignee).join(", ")}</p>}
        {!!preview.coverageIssues.length && <div className="mt-3"><p className="font-medium">Rules to review before publication:</p><ul className="list-disc pl-5">{preview.coverageIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>}
        {!!preview.decision.issues.length && <ul className="mt-2 list-disc pl-5">{preview.decision.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        <p className="mt-3 text-xs text-muted-foreground">Sample only. This is not a spending approval.</p>
      </div>}
    </div></Panel></fieldset></form>}
    {canEdit && reviewing && isBuyingRulePolicy(reviewing.policyKey) && <form onSubmit={sendForReview}><fieldset className="min-w-0" disabled={saving}><Panel title="Send buying rule for review"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">Only the draft author can send it. ERP will check the company currency and active categories, branches and buying methods. A review request does not approve spending.</p>
      <Field label="What should the reviewer check?"><Input required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <div className="flex gap-3"><Button type="submit" disabled={saving || writeLocked || !reviewReason.trim()}>{saving ? "Checking…" : "Send for review"}</Button><Button variant="secondary" onClick={() => setReviewing(null)}>Cancel</Button></div>
    </div></Panel></fieldset></form>}
    {canEdit && editing && isBuyingRulePolicy(key) && <form onSubmit={save}><fieldset className="min-w-0" disabled={saving}>
      <Panel title={editing === "new" ? "New buying rule draft" : `Edit ${key.replaceAll("_", " ").toLowerCase()} draft`}>
        <div className="space-y-5 p-5">
          {editing !== "new" && editing.lastReturnReason && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Reviewer asked for changes: {editing.lastReturnReason}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Use these rules for"><Select value={key} disabled={editing !== "new"} onChange={(event) => setKey(event.target.value)}><option value="PURCHASE_REQUEST">Purchase requests</option><option value="PURCHASE_ORDER">Purchase orders</option></Select></Field>
            <Field label="Start date"><Input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
            <Field label="End date (optional)"><Input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Amounts use {currency} and equal quantity × unit price before discounts, tax and delivery. An empty amount or category means there is no limit for that condition. Higher priority wins where rules overlap.</p>
          {rows.map((row, index) => <section key={index} className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Rule {index + 1}</h3>{rows.length > 1 && <Button variant="secondary" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove rule</Button>}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rule code"><Input required maxLength={100} value={row.code} onChange={(event) => changeRow(index, { code: event.target.value.toUpperCase() })} /></Field>
              <Field label="Priority"><Input type="number" min={0} max={100000} required value={row.priority} onChange={(event) => changeRow(index, { priority: Number(event.target.value) })} /></Field>
              <Field label="Purchase type"><Select value={row.purchaseType} onChange={(event) => changeRow(index, { purchaseType: event.target.value })}><option value="">Any type</option><option value="GOODS">Goods</option><option value="SERVICES">Services</option><option value="ASSETS">Assets</option><option value="SUBSCRIPTIONS">Subscriptions</option></Select></Field>
              <Field label={`Amount from (${currency})`}><Input type="number" min={0} step="0.0001" value={row.minimum} onChange={(event) => changeRow(index, { minimum: event.target.value })} /></Field>
              <Field label={`Amount below (${currency})`}><Input type="number" min={0} step="0.0001" value={row.maximum} onChange={(event) => changeRow(index, { maximum: event.target.value })} /></Field>
              <Field label="Category codes (optional)"><Input value={row.categoryCodes} placeholder="IT, OFFICE" onChange={(event) => changeRow(index, { categoryCodes: event.target.value.toUpperCase() })} /></Field>
              <Field label="Budget handling"><Select value={row.budget} onChange={(event) => changeRow(index, { budget: event.target.value as RuleRow["budget"] })}><option value="Required">Require budget confirmation</option><option value="ExceptionReview">Send budget exception for review</option></Select></Field>
              <Field label="Buying method code (optional)"><Input value={row.method} onChange={(event) => changeRow(index, { method: event.target.value.toUpperCase() })} /></Field>
              <div className="space-y-1"><Field label="Quotes needed (optional)"><Input type="number" min={0} max={20} value={row.quotes} onChange={(event) => changeRow(index, { quotes: event.target.value })} /></Field>
                <p className="text-xs text-muted-foreground">For a direct purchase, enter 0 explicitly. Blank means no quote count is set and will not allow direct PO conversion.</p></div>
            </div>
            <fieldset><legend className="mb-2 text-sm font-medium">Approvers needed</legend><div className="flex flex-wrap gap-4 text-sm">
              {([['lineManager', 'Line manager'], ['budgetOwner', 'Budget owner'], ['procurementManager', 'Procurement manager']] as const).map(([field, label]) => <label key={field} className="flex items-center gap-2"><Switch checked={row[field]} onChange={(event) => changeRow(index, { [field]: event.target.checked })} />{label}</label>)}
            </div></fieldset>
          </section>)}
          <Button variant="secondary" onClick={() => setRows((current) => [...current, { ...emptyRule(), code: `RULE_${current.length + 1}`, priority: current.length }])}>Add another rule</Button>
          {!!issues.length && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Check these rule details:</p><ul className="mt-2 list-disc pl-5">{issues.map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul></div>}
          <div className="flex gap-3"><Button type="submit" disabled={saving || writeLocked}>{saving ? "Checking…" : "Check and save draft"}</Button><Button variant="secondary" onClick={() => { setEditing(null); setIssues([]); }}>Cancel</Button></div>
        </div>
      </Panel>
    </fieldset></form>}
  </div>;
}
