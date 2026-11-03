import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { selectedPolicyInstant, samePolicyInstant, utcPolicyDay, policyInstantIsAfter } from "../lib/policy-effective-instant";
import { emptyPlanPolicy, parsePlanPolicy, serializePlanPolicy, type PlanPolicyDraft, type PlanPolicyStage, type PlanStagePurpose } from "../lib/plan-review-policy-editor";
import { PolicyReviewerPicker, type PolicyPeopleSource } from "./PolicyReviewerPicker";
import { canRetirePolicyDraft, createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies,
  lookupPlanPolicyReviewers, lookupSelectedPlanPolicyReviewers, retirePolicyDraft, submitPolicyReview, updatePolicy,
  validatePlanReviewPolicy, PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";
const KEY = "PROCUREMENT_PLAN_REVIEW" as const;
const explain = (e: unknown) => e instanceof Error ? e.message : "Plan review settings are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" | "retire" };
const sources = Object.fromEntries((["Review", "Final"] as const).map(purpose => [purpose, {
  key: `plan-policy:${purpose}`, maximum: 20,
  async page(company: string, search: string, offset: number, signal: AbortSignal) {
    const value = await lookupPlanPolicyReviewers(company, purpose, search, offset, signal);
    return { items: value.items, nextOffset: offset + value.limit < value.candidateTotal ? offset + value.limit : null };
  },
  async selected(company: string, ids: string[], signal: AbortSignal) {
    const value = await lookupSelectedPlanPolicyReviewers(company, purpose, ids, signal); return { items: value.items, nextOffset: null };
  },
}])) as Record<PlanStagePurpose, PolicyPeopleSource>;

/** Same module-settings/list/editor/independent-policy lifecycle as existing operational rule editors. */
export function LivePlanReviewSettings() {
  const readiness = useLiveReadiness(), { selection, authEpoch } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <PlanPolicyRecord key={JSON.stringify([readiness.tenantId, readiness.legalEntityId, selection.branch, selection.branchScope,
    readiness.principalId, authEpoch, readiness.permissions, readiness.capabilities.configurationDraft])} />;
}
function PlanPolicyRecord() {
  const readiness = useLiveReadiness()!, company = readiness.legalEntityId;
  const canRead = readiness.capabilities.configurationDraft && readiness.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && readiness.permissions.includes("procurement-configuration-approve");
  const marker = `procurement.policy.command.pending.v1:${JSON.stringify([readiness.tenantId, company, readiness.principalId, KEY])}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker)), [schemaReady, setSchemaReady] = useState(false);
  const [page, setPage] = useState<PolicyPage | null>(null), [effectiveVersion, setEffectiveVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [revision, setRevision] = useState(0), [error, setError] = useState("");
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null), [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [reason, setReason] = useState("");
  const [stages, setStages] = useState<PlanPolicyDraft>(emptyPlanPolicy), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return; const abort = new AbortController(); setSchemaReady(false);
    Promise.allSettled((["Review", "Final"] as const).map(purpose => lookupPlanPolicyReviewers(company, purpose, "", 0, abort.signal)))
      .then(results => { if (!abort.signal.aborted) setSchemaReady(results.every(result => result.status === "fulfilled"
        || result.reason instanceof PolicyActionError && result.reason.status === 422 && result.reason.code === "plan-reviewer-search-required")); });
    return () => abort.abort();
  }, [company, canRead]);
  useEffect(() => {
    if (!canRead) return; const abort = new AbortController(); setLoading(true); setError(""); setPage(null); setEffectiveVersion(null);
    listPolicies(company, abort.signal, KEY).then(value => { if (!abort.signal.aborted) setPage(value); })
      .catch(e => { if (!abort.signal.aborted) setError(explain(e)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    getEffectivePolicy(company, KEY).then(value => { if (!abort.signal.aborted) setEffectiveVersion(value.policy?.policyVersionNumber ?? null); })
      .catch(() => { if (!abort.signal.aborted) setEffectiveVersion(null); });
    return () => abort.abort();
  }, [company, canRead, revision]);
  const claim = () => {
    if (!alive.current || busy.current || readAuthorityCreateGuard(marker) !== "clear" || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker)); setError("Inspect the last saved result before another policy change."); return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); return true;
  };
  const settle = (cause?: unknown) => {
    if (!cause || cause instanceof PolicyActionError && [400, 422].includes(cause.status)) clearAuthorityCreateGuard(marker);
    busy.current = false; if (alive.current) { setWorking(false); setGuard(readAuthorityCreateGuard(marker)); if (cause) setError(explain(cause)); }
  };
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady || guard !== "clear")) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id); if (!alive.current) return;
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved version is not a plan review rule.");
      if (edit) {
        const parsed = parsePlanPolicy(record.rulesJson); if (record.state !== "Draft" || !parsed) throw new Error("This saved format remains read-only here.");
        setStages(parsed); setStart(utcPolicyDay(record.effectiveFrom)); setEnd(utcPolicyDay(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (e) { if (alive.current) setError(explain(e)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string, from: string | null, to: string | null;
    try {
      rulesJson = serializePlanPolicy(stages); from = selectedPolicyInstant(start, editing === "new" ? null : editing.effectiveFrom);
      to = selectedPolicyInstant(end, editing === "new" ? null : editing.effectiveTo);
      if (!from || to && !policyInstantIsAfter(to, from)) throw new Error("Choose a start date and an end date after it.");
    } catch (e) { setError(explain(e)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validatePlanReviewPolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Review the named stages and decision rules.");
      busy.current = false; setWorking(false); if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: from, effectiveTo: to, rulesJson };
      const saved = editing === "new" ? await createPolicy(company, draft) : await updatePolicy(company, editing.id, editing.version, draft);
      if (saved.policyKey !== KEY || saved.state !== "Draft" || saved.rulesJson !== rulesJson || !samePolicyInstant(saved.effectiveFrom, from)
        || !samePolicyInstant(saved.effectiveTo, to) || editing !== "new" && (saved.id !== editing.id || saved.version <= editing.version))
        throw new PolicyActionError("The saved plan rule was not confirmed. Inspect its saved version before another change.", 0);
      settle(); if (alive.current) { setEditing(null); setRevision(x => x + 1); }
    } catch (e) {
      if (readAuthorityCreateGuard(marker) === "pending") settle(e);
      else { busy.current = false; if (alive.current) { setWorking(false); setError(explain(e)); } }
    }
  }
  async function act(event: FormEvent) {
    event.preventDefault(); if (!pending || !schemaReady || !reason.trim() || reason.trim().length > 1000 || guard !== "clear"
      || (pending.action === "review" || pending.action === "retire" ? !canEdit : !canApprove)) return;
    if (!claim()) return;
    try {
      const { item, action } = pending;
      const saved = action === "retire" ? await retirePolicyDraft(company, item, reason.trim()) : action === "review"
        ? await submitPolicyReview(company, item.id, item.version, reason.trim()) : await decidePolicy(company, item.id, item.version, action, reason.trim());
      const expected = action === "review" ? "PendingReview" : action === "publish" ? "Published" : action === "retire" ? "Retired" : "Draft";
      if (saved.id !== item.id || saved.policyKey !== KEY || saved.version <= item.version || saved.state !== expected)
        throw new PolicyActionError("The policy action was not confirmed. Inspect the saved version before another change.", 0);
      settle(); if (alive.current) { setPending(null); setReason(""); setRevision(x => x + 1); }
    } catch (e) { settle(e); }
  }
  if (!canRead) return <p role="alert">Plan review settings are unavailable for this company or account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Choose who reviews purchase forecasts and who gives final approval. A separate authorised person publishes these rules. Plans do not reserve funds or authorise spending.</p>
    <p className="text-sm text-muted-foreground">These rules apply to the company. ERP requires current company-wide Core configuration authority; changing the branch view does not grant or remove that authority. This company-wide policy uses people with access to all company branches. Branch-specific plan approval policies are not supported yet.</p>
    {!schemaReady && <p role="status">Plan reviewer names are unavailable. Saved versions remain read-only; narrow the name search if the company has many candidates.</p>}
    <Panel title="Purchase plan review rules"><div className="space-y-4 p-5">
      <p className="text-sm">{effectiveVersion === null ? "No single current published version was confirmed." : `Current published version: ${effectiveVersion}.`} Saving or checking a draft does not activate it.</p>
      <div className="flex gap-2"><Button variant="secondary" disabled={working} onClick={() => setRevision(x => x + 1)}>Refresh saved rules</Button>
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { setStages(emptyPlanPolicy()); setStart(""); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading plan review rules…</p> : page?.items.some(item => item.policyKey === KEY) ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}>
          <td>{item.policyVersionNumber}</td><td>{utcPolicyDay(item.effectiveFrom)}</td><td>{utcPolicyDay(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View saved version</Button>
            {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setReason(""); setEditing(null); }}>Send for review</Button></>}
            {canEdit && schemaReady && canRetirePolicyDraft(item) && <Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "retire" }); setReason(""); setEditing(null); }}>Retire unused draft</Button>}
            {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setReason(""); setEditing(null); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setReason(""); setEditing(null); }}>Return for changes</Button></>}
          </div></td></tr>)}</tbody></RecordTable></div> : <EmptyState title="No plan review rules yet" description="Choose named people and explicit decision rules before sending a forecast for review." />}
      {page && page.total > page.items.length && <p className="text-sm">Showing {page.items.length} of {page.total} saved versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-border p-3 text-sm">{error}</p>}
    {guard !== "clear" && <p role="alert" className="rounded-lg border border-border p-3 text-sm">The last policy change was not confirmed, or this browser cannot safely record it. No command will be repeated. Refresh saved rules for inspection and ask Procurement to reconcile the result.</p>}
    {viewing && <Panel title={`Saved plan rule version ${viewing.policyVersionNumber}`}><div className="space-y-4 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {viewing.effectiveFrom}; until {viewing.effectiveTo || "no end date"}.</p>
      {parsePlanPolicy(viewing.rulesJson) ? <PlanPolicyFields company={company} stages={parsePlanPolicy(viewing.rulesJson)!} disabled change={() => {}} /> : <p>This saved format cannot be edited here. Its retained version is unchanged.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close saved version</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New plan review rule draft" : `Edit plan review draft ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts on (UTC)"><Input required type="date" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="Ends on (UTC, optional)"><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field></div>
      <PlanPolicyFields company={company} stages={stages} disabled={working || guard !== "clear"} change={setStages} />
      <div className="flex gap-2"><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close editor</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send plan rules for independent review" : pending.action === "publish" ? "Publish plan review rules" : pending.action === "retire" ? "Retire unused plan rule draft" : "Return plan rules for changes"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}>
      <p className="text-sm">Version {pending.item.policyVersionNumber}. ERP rechecks current account permissions, people and scope. Publication requires an independent authorised person.</p>
      <Field label="Reason"><Input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm policy action</Button><Button variant="secondary" onClick={() => setPending(null)}>Close action</Button></div>
    </fieldset></Panel></form>}
  </div>;
}
function PlanPolicyFields({ company, stages, disabled, change }: { company: string; stages: PlanPolicyDraft; disabled: boolean; change: (stages: PlanPolicyDraft) => void }) {
  const patch = (index: number, value: Partial<PlanPolicyStage>) => change(stages.map((stage, at) => at === index ? { ...stage, ...value } : stage) as PlanPolicyDraft);
  return <>{stages.map((stage, index) => <Panel key={stage.purpose} title={stage.purpose === "Review" ? "Review stage" : "Final approval stage"}><div className="grid gap-4 p-4 sm:grid-cols-2">
    <Field label={`${stage.purpose} decision rule`}><Select required disabled={disabled} value={stage.mode} onChange={e => patch(index, { mode: e.target.value as PlanPolicyStage["mode"] })}>
      <option value="">Choose a rule</option><option value="Any">Any named person</option><option value="All">All named people</option><option value="Quorum">A stated number of named people</option></Select></Field>
    <Field label={`${stage.purpose} required approvals`} hint="For Any enter 1; for All enter the number of selected people; otherwise choose the quorum."><Input required disabled={disabled} inputMode="numeric" value={stage.requiredApprovals} onChange={e => patch(index, { requiredApprovals: e.target.value })} /></Field>
    <PolicyReviewerPicker company={company} label={stage.purpose === "Review" ? "Plan reviewers" : "Final plan approvers"} selected={stage.principalIds} schemaVersion={2} source={sources[stage.purpose]} disabled={disabled} onChange={principalIds => patch(index, { principalIds })} />
  </div></Panel>)}<p className="text-sm text-muted-foreground">Choose different people for the two stages. A policy creator may be an assignee for other makers' plans; ERP checks the actual plan maker and linked-account independence when each plan is submitted or decided. Selecting a name grants no permission or spending authority.</p></>;
}
