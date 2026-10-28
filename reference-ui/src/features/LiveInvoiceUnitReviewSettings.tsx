import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { InvoiceUnitReviewerPicker } from "./InvoiceUnitReviewerPicker";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { emptyUnitReviewPolicy, emptyUnitReviewStage, parseUnitReviewPolicy, serializeUnitReviewPolicy,
  unitReviewDate, type UnitReviewPolicyForm, type UnitReviewStageForm } from "../lib/invoice-unit-review-policy-editor";
import { createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies, submitPolicyReview,
  updatePolicy, validateUnitReviewPolicy, PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";
const KEY = "INVOICE_UNIT_REVIEW" as const;
const day = (value: string | null) => value?.slice(0, 10) ?? "";
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Bill review rules are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" };
export function LiveInvoiceUnitReviewSettings() {
  const context = useLiveReadiness(), { selection } = useErpShell();
  if (!context || selection.entityId && selection.entityId !== context.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <UnitReviewSettings key={JSON.stringify([context.tenantId, context.legalEntityId, selection.branch ?? "", context.principalId, context.permissions])} />;
}
function UnitReviewSettings() {
  const context = useLiveReadiness()!, { selection } = useErpShell(), company = context.legalEntityId;
  const canRead = context.capabilities.configurationDraft && context.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && context.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && context.permissions.includes("procurement-configuration-approve");
  const marker = `procurement.policy.command.pending.v1:${[context.tenantId, company, selection.branch ?? "", context.principalId, KEY].join(":")}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker));
  const [schemaReady, setSchemaReady] = useState(false), [loading, setLoading] = useState(true), [working, setWorking] = useState(false);
  const [page, setPage] = useState<PolicyPage | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null), [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [reason, setReason] = useState("");
  const [form, setForm] = useState<UnitReviewPolicyForm>(emptyUnitReviewPolicy), [start, setStart] = useState(tomorrow), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    let active = true; setSchemaReady(false);
    getEffectivePolicy(company, KEY).then(value => { if (active) setSchemaReady(["Valid", "MissingPolicy", "AmbiguousPolicy"].includes(value.status)); }).catch(() => { if (active) setSchemaReady(false); });
    return () => { active = false; };
  }, [company, canRead, refresh]);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController(); setLoading(true); setError("");
    listPolicies(company, abort.signal, KEY).then(value => {
      if (value.items.some(row => row.policyKey !== KEY || !Number.isSafeInteger(row.version) || row.version < 1
        || !Number.isSafeInteger(row.policyVersionNumber) || row.policyVersionNumber < 1
        || !["Draft", "PendingReview", "Published", "Retired"].includes(row.state)))
        throw new Error("The saved bill review list could not be confirmed.");
      if (!abort.signal.aborted) setPage(value);
    })
      .catch(cause => { if (!abort.signal.aborted) setError(message(cause)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, canRead, refresh]);
  function claim() {
    if (!alive.current || busy.current || readAuthorityCreateGuard(marker) !== "clear" || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker)); setError("An earlier change is unconfirmed. Check the saved rules before another command."); return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); return true;
  }
  function finish(cause?: unknown) {
    if (!cause || cause instanceof PolicyActionError && [400, 422].includes(cause.status)) clearAuthorityCreateGuard(marker);
    busy.current = false;
    if (alive.current) { setWorking(false); setGuard(readAuthorityCreateGuard(marker)); if (cause) setError(message(cause)); }
  }
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady)) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id);
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved rule does not belong to bill unit reviews.");
      if (!alive.current) return;
      if (edit) {
        const parsed = parseUnitReviewPolicy(record.rulesJson);
        if (record.state !== "Draft" || !parsed) throw new Error("This definition cannot be safely edited here. It remains read-only.");
        setForm(parsed); setStart(day(record.effectiveFrom)); setEnd(day(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string;
    try {
      rulesJson = serializeUnitReviewPolicy(form);
      if (!unitReviewDate(start) || end && (!unitReviewDate(end) || end <= start)) throw new Error("Choose valid dates, with the end after the start.");
    } catch (cause) { setError(message(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validateUnitReviewPolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.join(" ") || "Check the review steps.");
      busy.current = false; setWorking(false); if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: `${start}T00:00:00.000Z`, effectiveTo: end ? `${end}T00:00:00.000Z` : null, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft) : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || !Number.isSafeInteger(result.version) || result.version < 1 || !Number.isSafeInteger(result.policyVersionNumber) || result.policyVersionNumber < 1
        || day(result.effectiveFrom) !== start || day(result.effectiveTo) !== end
        || editing !== "new" && (result.id !== editing.id || result.version <= editing.version))
        throw new PolicyActionError("The saved bill review draft could not be confirmed. Inspect its saved record.", 0);
      finish(); if (alive.current) { setEditing(null); setRefresh(value => value + 1); }
    } catch (cause) {
      if (readAuthorityCreateGuard(marker) === "pending") finish(cause);
      else { busy.current = false; if (alive.current) { setWorking(false); setError(message(cause)); } }
    }
  }
  async function act(event: FormEvent) {
    event.preventDefault(); if (!pending || !reason.trim() || !schemaReady || guard !== "clear" || (pending.action === "review" ? !canEdit : !canApprove)) return;
    if (pending.action === "review") {
      if (busy.current) return;
      busy.current = true; setWorking(true); setError("");
      try {
        const saved = await getPolicy(company, pending.item.id);
        const parsed = parseUnitReviewPolicy(saved.rulesJson);
        if (saved.id !== pending.item.id || saved.policyKey !== KEY || saved.state !== "Draft" || saved.version !== pending.item.version || !parsed)
          throw new Error("The review draft changed or needs a fuller editor. Refresh its saved version.");
        serializeUnitReviewPolicy(parsed, true);
      } catch (cause) { if (alive.current) setError(message(cause)); return; }
      finally { busy.current = false; if (alive.current) setWorking(false); }
      if (!alive.current) return;
    }
    if (!claim()) return;
    try {
      const { item, action } = pending;
      const result = action === "review" ? await submitPolicyReview(company, item.id, item.version, reason.trim())
        : await decidePolicy(company, item.id, item.version, action === "publish" ? "publish" : "return", reason.trim());
      if (result.id !== item.id || result.policyKey !== KEY || !Number.isSafeInteger(result.version) || result.version <= item.version
        || result.state !== (action === "review" ? "PendingReview" : action === "publish" ? "Published" : "Draft"))
        throw new PolicyActionError("The bill review rule decision is unconfirmed. Inspect its saved history.", 0);
      finish(); if (alive.current) { setPending(null); setReason(""); setRefresh(value => value + 1); }
    } catch (cause) { finish(cause); }
  }
  function patch(index: number, value: Partial<UnitReviewStageForm>) {
    setForm(current => ({ ...current, stages: current.stages.map((stage, i) => i === index ? { ...stage, ...value } : stage) }));
  }
  if (!canRead) return <p role="alert">Bill review settings are unavailable for your account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Choose who checks original bill units. Document checks and manual entry checks have separate review rules. A draft does not approve bills or allow payment. Publishing needs a different authorized person.</p>
    {!schemaReady && <p role="status">Bill review controls are not ready for changes. Saved versions remain read-only.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Panel title="Bill review rules"><div className="space-y-4 p-5"><div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={working} onClick={() => setRefresh(value => value + 1)}>Refresh saved rules</Button>
      {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { setForm(emptyUnitReviewPolicy()); setStart(tomorrow()); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add review draft</Button>}
    </div>{loading ? <p role="status">Loading bill review rules…</p> : page?.items.filter(row => row.policyKey === KEY).length ? <div className="overflow-x-auto"><RecordTable>
      <thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{page.items.filter(row => row.policyKey === KEY).map(item => <tr key={item.id}>
        <td>{item.policyVersionNumber}</td><td>{day(item.effectiveFrom)}</td><td>{day(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View review rule</Button>
          {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit review draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setEditing(null); setReason(""); }}>Send for review</Button></>}
          {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setEditing(null); setReason(""); }}>Publish review rules</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setEditing(null); setReason(""); }}>Return for changes</Button></>}
        </div></td></tr>)}</tbody></RecordTable></div> : page && <EmptyState title="No bill review rules" description="Start with a draft. Choose review steps and named people before sending it for independent review." />}</div></Panel>
    {guard !== "clear" && <p role="alert" className="text-sm">A previous change is unconfirmed or this browser could not record its safety marker. No command will be repeated. Refresh for read-only inspection and ask an administrator to reconcile the saved history.</p>}
    {viewing && <Panel title={`Saved review rules · version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5"><p>Status: {viewing.state}.</p>
      {parseUnitReviewPolicy(viewing.rulesJson) && <p>Evidence: {parseUnitReviewPolicy(viewing.rulesJson)?.evidenceMode === "ManualAttestation" ? "Manually entered invoice units" : "Original invoice document"}.</p>}
      {parseUnitReviewPolicy(viewing.rulesJson)?.stages.map((stage, index) => <p key={stage.code}>Step {index + 1}: {stage.code} · {stage.mode === "One" ? "One named reviewer" : "All named reviewers"} · {stage.principals.length} selected.</p>) ?? <p>This saved definition is not supported by this editor and stays read-only.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New bill review draft" : `Edit review version ${editing.policyVersionNumber}`}><fieldset disabled={working || guard !== "clear"} className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts on"><Input type="date" required value={start} onChange={event => setStart(event.target.value)} /></Field><Field label="Ends on (optional)"><Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field></div>
      <Field label="Evidence to check"><Select value={form.evidenceMode === "ManualAttestation" ? "manual" : "document"}
        disabled={editing !== "new"} onChange={event => setForm(emptyUnitReviewPolicy(event.target.value === "manual" ? "ManualAttestation" : "DocumentReview"))}>
        <option value="document">Original invoice document</option><option value="manual">Manually entered invoice units</option>
      </Select></Field>
      {!form.stages.length && <p className="text-sm text-muted-foreground">No review steps selected. This can be saved as an unfinished draft; it cannot be published.</p>}
      {form.stages.map((stage, index) => <section key={index} aria-label={`Review step ${index + 1}`} className="space-y-4 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Review step {index + 1}</h3><div className="flex gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => setForm(current => { const stages = [...current.stages]; [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]]; return { ...current, stages }; })}>Move step up</Button>
          <Button variant="secondary" disabled={index === form.stages.length - 1} onClick={() => setForm(current => { const stages = [...current.stages]; [stages[index], stages[index + 1]] = [stages[index + 1], stages[index]]; return { ...current, stages }; })}>Move step down</Button>
          <Button variant="secondary" onClick={() => setForm(current => ({ ...current, stages: current.stages.filter((_, i) => i !== index) }))}>Remove step</Button></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Step code"><Input required maxLength={40} value={stage.code} onChange={event => patch(index, { code: event.target.value })} /></Field><Field label="Who must decide?"><Select required value={stage.mode} onChange={event => patch(index, { mode: event.target.value as UnitReviewStageForm["mode"] })}><option value="">Choose</option><option value="One">One of the named reviewers</option><option value="All">All named reviewers</option></Select></Field></div>
        <InvoiceUnitReviewerPicker company={company} selected={stage.principals} onChange={principals => patch(index, { principals })} disabled={working || guard !== "clear"} />
      </section>)}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={form.stages.length >= 16} onClick={() => setForm(current => ({ ...current, stages: [...current.stages, emptyUnitReviewStage()] }))}>Add review step</Button><Button type="submit">Save review draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send bill rules for review" : pending.action === "publish" ? "Publish bill review rules" : "Return bill rules for changes"}><fieldset disabled={working || guard !== "clear" || !schemaReady} className="space-y-4 p-5">
      <p className="text-sm">The saved version and current authority are checked again by ERP. Publishing never approves an invoice or enables payment.</p><Field label="Reason for this rule decision"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit" disabled={!reason.trim()}>Confirm rule decision</Button><Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button></div>
    </fieldset></Panel></form>}
  </div>;
}
