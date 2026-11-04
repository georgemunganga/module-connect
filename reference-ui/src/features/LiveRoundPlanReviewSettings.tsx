import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { selectedPolicyInstant, samePolicyInstant, utcPolicyDay, policyInstantIsAfter } from "../lib/policy-effective-instant";
import { settlePlanPolicyCommand, type PlanPolicyOutcome } from "../lib/plan-review-policy-command";
import { emptyRoundPolicy as emptyPlanPolicy, parseRoundPolicy as parsePlanPolicy, serializeRoundPolicy as serializePlanPolicy, criterionStages, participantDuties, type RoundPolicyDraft as PlanPolicyDraft } from "../lib/round-plan-review-policy-editor";
import { listReferences, type ReferenceKind, type ReferencePage } from "../../../src/platform/procurement-configuration-api";
import { roundDutyLabel } from "./RoundPlanDraftFields";
import { PolicyReviewerPicker, type PolicyPeopleSource } from "./PolicyReviewerPicker";
import { canRetirePolicyDraft, createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies,
  lookupRoundPolicyReviewers, lookupSelectedRoundPolicyReviewers, retirePolicyDraft, submitPolicyReview, updatePolicy,
  validateRoundReviewPolicy, PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";
const KEY = "COMMERCIAL_ROUND_PLAN_REVIEW" as const;
const explain = (e: unknown) => e instanceof Error ? e.message : "Plan review settings are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" | "retire" };
const peopleSource: PolicyPeopleSource = { key: "round-plan-review", maximum: 20,
  async page(company, search, offset, signal) { const value = await lookupRoundPolicyReviewers(company, search, offset, signal); return { items: value.items, nextOffset: value.nextOffset }; },
  async selected(company, ids, signal) { const value = await lookupSelectedRoundPolicyReviewers(company, ids, signal); return { items: value.items, nextOffset: null }; },
};

/** Same module-settings/list/editor/independent-policy lifecycle as existing operational rule editors. */
export function LiveRoundPlanReviewSettings() {
  const readiness = useLiveReadiness(), { selection, authEpoch } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <RoundPolicyRecord key={JSON.stringify([readiness.tenantId, readiness.legalEntityId, selection.branch, selection.branchScope,
    readiness.principalId, authEpoch, readiness.permissions, readiness.capabilities.configurationDraft])} />;
}
function RoundPolicyRecord() {
  const readiness = useLiveReadiness()!, company = readiness.legalEntityId;
  const canRead = readiness.capabilities.configurationDraft && readiness.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && readiness.permissions.includes("procurement-configuration-approve");
  const marker = `procurement.policy.command.pending.v1:${JSON.stringify([readiness.tenantId, company, readiness.principalId, KEY])}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker)), [schemaReady, setSchemaReady] = useState(false);
  const [needsFreshRead, setNeedsFreshRead] = useState(false), [commandNotice, setCommandNotice] = useState("");
  const freshReadNeeded = useRef(false), freshReadGeneration = useRef(0);
  const [page, setPage] = useState<PolicyPage | null>(null), [effectiveVersion, setEffectiveVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [revision, setRevision] = useState(0), [error, setError] = useState("");
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null), [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [reason, setReason] = useState("");
  const [stages, setStages] = useState<PlanPolicyDraft>(emptyPlanPolicy), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return; const abort = new AbortController(); setSchemaReady(false);
    lookupRoundPolicyReviewers(company, "", 0, abort.signal).then(() => { if (!abort.signal.aborted) setSchemaReady(true); })
      .catch(e => { if (!abort.signal.aborted) setSchemaReady(e instanceof PolicyActionError && e.status === 422 && e.code === "sourcing-reviewer-search-too-broad"); });
    return () => abort.abort();
  }, [company, canRead]);
  useEffect(() => {
    if (!canRead) return; const abort = new AbortController(), generation = freshReadGeneration.current; setLoading(true); setError(""); setPage(null); setEffectiveVersion(null);
    listPolicies(company, abort.signal, KEY).then(value => { if (!abort.signal.aborted && generation === freshReadGeneration.current) { setPage(value); if (freshReadNeeded.current) setCommandNotice("The earlier command was rejected without saving. Current saved versions were loaded; open the current draft before another change."); freshReadNeeded.current = false; setNeedsFreshRead(false); } })
      .catch(e => { if (!abort.signal.aborted && generation === freshReadGeneration.current) setError(explain(e)); }).finally(() => { if (!abort.signal.aborted && generation === freshReadGeneration.current) setLoading(false); });
    getEffectivePolicy(company, KEY).then(value => { if (!abort.signal.aborted) setEffectiveVersion(value.policy?.policyVersionNumber ?? null); })
      .catch(() => { if (!abort.signal.aborted) setEffectiveVersion(null); });
    return () => abort.abort();
  }, [company, canRead, revision]);
  const claim = () => {
    if (!alive.current || busy.current || freshReadNeeded.current || readAuthorityCreateGuard(marker) !== "clear" || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker)); setError("Inspect the last saved result before another policy change."); return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); setCommandNotice(""); return true;
  };
  const settle = (outcome: PlanPolicyOutcome = { confirmed: true }) => {
    const result = settlePlanPolicyCommand(marker, outcome);
    busy.current = false;
    if (alive.current) {
      setWorking(false); setGuard(result.guard);
      if (!outcome.confirmed) setError(explain(outcome.error));
      if (result.needsFreshRead) {
        freshReadGeneration.current += 1; freshReadNeeded.current = true; setNeedsFreshRead(true); setPending(null);
        if (!outcome.confirmed && outcome.error instanceof PolicyActionError && ![400, 422].includes(outcome.error.status)) setEditing(null);
        setCommandNotice(`${!outcome.confirmed ? explain(outcome.error) + " " : ""}The command was rejected without saving. Saved versions are being checked before another change. If loading fails, refresh saved rules again.`);
        setRevision(x => x + 1);
      }
    }
  };
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady || guard !== "clear" || freshReadNeeded.current)) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id); if (!alive.current) return;
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved version is not a evaluation-plan review rule.");
      if (edit) {
        const parsed = parsePlanPolicy(record.rulesJson); if (record.state !== "Draft" || !parsed) throw new Error("This saved format remains read-only here.");
        setStages(parsed); setStart(utcPolicyDay(record.effectiveFrom)); setEnd(utcPolicyDay(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (e) { if (alive.current) setError(explain(e)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear" || freshReadNeeded.current) return;
    let rulesJson: string, from: string | null, to: string | null;
    try {
      rulesJson = serializePlanPolicy(stages); from = selectedPolicyInstant(start, editing === "new" ? null : editing.effectiveFrom);
      to = selectedPolicyInstant(end, editing === "new" ? null : editing.effectiveTo);
      if (!from || to && !policyInstantIsAfter(to, from)) throw new Error("Choose a start date and an end date after it.");
    } catch (e) { setError(explain(e)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validateRoundReviewPolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Review the named stages and decision rules.");
      busy.current = false; setWorking(false); if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: from, effectiveTo: to, rulesJson };
      const saved = editing === "new" ? await createPolicy(company, draft) : await updatePolicy(company, editing.id, editing.version, draft);
      if (saved.policyKey !== KEY || saved.state !== "Draft" || saved.rulesJson !== rulesJson || !samePolicyInstant(saved.effectiveFrom, from)
        || !samePolicyInstant(saved.effectiveTo, to) || editing !== "new" && (saved.id !== editing.id || saved.version <= editing.version))
        throw new PolicyActionError("The saved evaluation-plan rule was not confirmed. Inspect its saved version before another change.", 0);
      settle(); if (alive.current) { setEditing(null); setRevision(x => x + 1); }
    } catch (e) {
      if (readAuthorityCreateGuard(marker) === "pending") settle({ confirmed: false, error: e });
      else { busy.current = false; if (alive.current) { setWorking(false); setError(explain(e)); } }
    }
  }
  async function act(event: FormEvent) {
    event.preventDefault(); if (!pending || !schemaReady || !reason.trim() || reason.trim().length > 1000 || guard !== "clear" || freshReadNeeded.current
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
    } catch (e) { settle({ confirmed: false, error: e }); }
  }
  if (!canRead) return <p role="alert">Plan review settings are unavailable for this company or account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Choose the independent reviewers and explicit requirements for internal evaluation plans. A separate authorised person publishes these rules. These settings do not contact suppliers, approve quotations or authorise spending.</p>
    <p className="text-sm text-muted-foreground">These rules apply to the company. ERP requires current company-wide Core configuration authority; changing the branch view does not grant or remove that authority. This company-wide policy uses people with access to all company branches. Buying methods, categories and currencies select coverage. Branch-specific round-plan policies are not supported yet.</p>
    {!schemaReady && <p role="status">Evaluation-plan reviewer names are unavailable. Saved versions remain read-only; narrow the name search if the company has many candidates.</p>}
    <Panel title="Evaluation-evaluation-evaluation-plan review rules"><div className="space-y-4 p-5">
      <p className="text-sm">{effectiveVersion === null ? "No single current published version was confirmed." : `Current published version: ${effectiveVersion}.`} Saving or checking a draft does not activate it. A policy pin never replaces the server’s current Submit availability.</p>
      <div className="flex gap-2"><Button variant="secondary" disabled={working} onClick={() => setRevision(x => x + 1)}>Refresh saved rules</Button>
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear" || needsFreshRead} onClick={() => { setStages(emptyPlanPolicy()); setStart(""); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading evaluation-evaluation-plan review rules…</p> : page?.items.some(item => item.policyKey === KEY) ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}>
          <td>{item.policyVersionNumber}</td><td>{utcPolicyDay(item.effectiveFrom)}</td><td>{utcPolicyDay(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View saved version</Button>
            {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear" || needsFreshRead} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear" || needsFreshRead} onClick={() => { setPending({ item, action: "review" }); setReason(""); setEditing(null); }}>Send for review</Button></>}
            {canEdit && schemaReady && canRetirePolicyDraft(item) && <Button variant="secondary" disabled={working || guard !== "clear" || needsFreshRead} onClick={() => { setPending({ item, action: "retire" }); setReason(""); setEditing(null); }}>Retire unused draft</Button>}
            {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear" || needsFreshRead} onClick={() => { setPending({ item, action: "publish" }); setReason(""); setEditing(null); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear" || needsFreshRead} onClick={() => { setPending({ item, action: "return" }); setReason(""); setEditing(null); }}>Return for changes</Button></>}
          </div></td></tr>)}</tbody></RecordTable></div> : <EmptyState title="No evaluation-evaluation-evaluation-plan review rules yet" description="Choose named people and explicit decision rules before sending an evaluation plan for review." />}
      {page && page.total > page.items.length && <p className="text-sm">Showing {page.items.length} of {page.total} saved versions.</p>}
    </div></Panel>
    {commandNotice && <p role="status" className="rounded-lg border border-border p-3 text-sm">{commandNotice}</p>}
    {error && <p role="alert" className="rounded-lg border border-border p-3 text-sm">{error}</p>}
    {guard !== "clear" && <p role="alert" className="rounded-lg border border-border p-3 text-sm">The last policy change was not confirmed, or this browser cannot safely record it. No command will be repeated. Refresh saved rules for inspection and ask Procurement to reconcile the result.</p>}
    {viewing && <Panel title={`Saved evaluation-plan rule version ${viewing.policyVersionNumber}`}><div className="space-y-4 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {viewing.effectiveFrom}; until {viewing.effectiveTo || "no end date"}.</p>
      {parsePlanPolicy(viewing.rulesJson) ? <RoundPolicyFields company={company} stages={parsePlanPolicy(viewing.rulesJson)!} disabled change={() => {}} /> : <p>This saved format cannot be edited here. Its retained version is unchanged.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close saved version</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New evaluation-plan review rule draft" : `Edit plan review draft ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear" || needsFreshRead}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts on (UTC)"><Input required type="date" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="Ends on (UTC, optional)"><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field></div>
      <RoundPolicyFields company={company} stages={stages} disabled={working || guard !== "clear" || needsFreshRead} change={setStages} />
      <div className="flex gap-2"><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close editor</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send evaluation-evaluation-plan rules for independent review" : pending.action === "publish" ? "Publish evaluation-evaluation-plan review rules" : pending.action === "retire" ? "Retire unused evaluation-plan rule draft" : "Return evaluation-evaluation-plan rules for changes"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear" || needsFreshRead}>
      <p className="text-sm">Version {pending.item.policyVersionNumber}. ERP rechecks current account permissions, people and scope. Publication requires an independent authorised person.</p>
      <Field label="Reason"><Input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm policy action</Button><Button variant="secondary" onClick={() => setPending(null)}>Close action</Button></div>
    </fieldset></Panel></form>}
  </div>;
}
function RoundPolicyFields({ company, stages: draft, disabled, change }: { company: string; stages: PlanPolicyDraft; disabled: boolean; change: (draft: PlanPolicyDraft) => void }) {
  const patch = (value: Partial<PlanPolicyDraft>) => change({ ...draft, ...value });
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(x => x !== value) : [...values, value];
  return <div className="space-y-5">
    <Panel title="Coverage"><div className="space-y-4 p-4"><RoundReferencePicker company={company} kind="methods" selected={draft.methodIds} disabled={disabled} onChange={methodIds => patch({ methodIds })} />
      <Field label="Category coverage"><Select disabled={disabled} value={draft.categoryCodes.includes("*") ? "all" : "selected"} onChange={e => patch({ categoryCodes: e.target.value === "all" ? ["*"] : [] })}><option value="selected">Choose individual categories</option><option value="all">Every category</option></Select></Field>
      {!draft.categoryCodes.includes("*") && <RoundReferencePicker company={company} kind="categories" selected={draft.categoryCodes} disabled={disabled} onChange={categoryCodes => patch({ categoryCodes })} />}
      <Field label="Currency codes" hint="Enter the covered three-letter currency codes, separated by commas. These rules do not change company currencies."><Input required disabled={disabled} value={draft.currencyCodes} onChange={e => patch({ currencyCodes: e.target.value.toUpperCase() })} /></Field>
    </div></Panel>
    <Panel title="Independent review"><div className="grid gap-4 p-4 sm:grid-cols-2">
      <Field label="Decision rule"><Select required disabled={disabled} value={draft.mode} onChange={e => patch({ mode: e.target.value as PlanPolicyDraft["mode"] })}><option value="">Choose a rule</option><option value="Any">Any named reviewer</option><option value="All">All named reviewers</option><option value="Quorum">A stated number of named reviewers</option></Select></Field>
      <Field label="Required approvals" hint="Any requires one; All requires every selected person; a quorum must fit the named reviewers."><Input required disabled={disabled} inputMode="numeric" value={draft.requiredApprovals} onChange={e => patch({ requiredApprovals: e.target.value })} /></Field>
      <PolicyReviewerPicker company={company} label="Evaluation-plan reviewers" selected={draft.principalIds} schemaVersion={2} source={peopleSource} disabled={disabled} onChange={principalIds => patch({ principalIds })} />
    </div></Panel>
    <Panel title="Required plan content"><div className="space-y-4 p-4">
      <Field label="Minimum number of criteria"><Input required disabled={disabled} inputMode="numeric" value={draft.minimumCriteria} onChange={e => patch({ minimumCriteria: e.target.value })} /></Field>
      <div><p className="mb-2 text-sm font-medium">Required criterion stages</p><div className="flex flex-wrap gap-2">{criterionStages.map(stage => <Button key={stage} variant={draft.requiredCriterionStages.includes(stage) ? "primary" : "secondary"} aria-pressed={draft.requiredCriterionStages.includes(stage)} disabled={disabled} onClick={() => patch({ requiredCriterionStages: toggle(draft.requiredCriterionStages, stage) })}>{stage}</Button>)}</div></div>
      <div><p className="mb-2 text-sm font-medium">Required colleague duties</p><div className="flex flex-wrap gap-2">{participantDuties.map(duty => <Button key={duty} variant={draft.requiredParticipantDuties.includes(duty) ? "primary" : "secondary"} aria-pressed={draft.requiredParticipantDuties.includes(duty)} disabled={disabled} onClick={() => patch({ requiredParticipantDuties: toggle(draft.requiredParticipantDuties, duty) })}>{roundDutyLabel(duty)}</Button>)}</div></div>
      {([["requireTechnicalRelease", "Technical release date required"], ["requireCommercialRelease", "Commercial release date required"], ["documentsRequired", "Verified supporting files required"]] as const).map(([key, label]) => <Field key={key} label={label}><Select required disabled={disabled} value={draft[key]} onChange={e => patch({ [key]: e.target.value as "true" | "false" })}><option value="">Choose</option><option value="false">No</option><option value="true" disabled={key === "documentsRequired"}>Yes{key === "documentsRequired" ? " — not available yet" : ""}</option></Select></Field>)}
      <p className="text-sm text-muted-foreground">Verified supporting files are not available for this workflow yet. ERP cannot approve a policy that requires them. No requirements, quorum or named people are assumed.</p>
    </div></Panel>
  </div>;
}
function RoundReferencePicker({ company, kind, selected, disabled, onChange }: { company: string; kind: ReferenceKind; selected: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const [page, setPage] = useState(1), [data, setData] = useState<ReferencePage | null>(null), [error, setError] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { const abort = new AbortController(); setData(null); setError("");
    listReferences(company, kind, page, abort.signal).then(value => { if (!abort.signal.aborted) { setData(value); setNames(current => ({ ...current, ...Object.fromEntries(value.items.map(item => [kind === "methods" ? item.id : item.code, `${item.code} · ${item.name}`])) })); } })
      .catch(e => { if (!abort.signal.aborted) setError(explain(e)); }); return () => abort.abort();
  }, [company, kind, page]);
  const label = kind === "methods" ? "Buying methods" : "Buying categories", maximum = kind === "methods" ? 20 : 100;
  return <div className="space-y-3"><Field label={label}><Select disabled={disabled || !data || !!error || selected.length >= maximum} value="" onChange={e => { if (e.target.value && !selected.includes(e.target.value)) onChange([...selected, e.target.value]); }}><option value="">Choose from current page</option>{data?.items.filter(item => item.status === "Active" && !selected.includes(kind === "methods" ? item.id : item.code)).map(item => <option key={item.id} value={kind === "methods" ? item.id : item.code}>{item.code} · {item.name}</option>)}</Select></Field>
    {error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-2">{selected.map((id, index) => <div key={id} className="flex items-center gap-2"><Badge>{names[id] || `Saved ${kind === "methods" ? "method" : "category"} not on this page`}</Badge><Button variant="secondary" disabled={disabled} aria-label={`Remove saved ${kind === "methods" ? "method" : "category"} ${index + 1}`} onClick={() => onChange(selected.filter(x => x !== id))}>Remove</Button></div>)}</div>
    <div className="flex gap-3"><Button variant="secondary" disabled={page <= 1 || !data} onClick={() => setPage(x => x - 1)}>Previous {kind}</Button><Button variant="secondary" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage(x => x + 1)}>More {kind}</Button></div>
  </div>;
}
