import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { PolicyReviewerPicker } from "./PolicyReviewerPicker";
import { emptySourcingRow, parseSourcingPolicy, serializeSourcingPolicy, type SourcingRow } from "../lib/sourcing-publication-editor";
import { createPolicy, decidePolicy, getPolicy, listPolicies, lookupSourcingReviewers, submitPolicyReview, updatePolicy, validatePolicy,
  PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";

const KEY = "SOURCING" as const;
const day = (date: string | null) => date?.slice(0, 10) ?? "";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "Sourcing settings are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" };

export function LiveSourcingSettings() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <SourcingRecord key={[readiness.tenantId, readiness.legalEntityId,
    selection.branch ?? "", readiness.principalId].join(":")} />;
}
function SourcingRecord() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Select an ERP company before opening sourcing settings.");
  const company = readiness.legalEntityId, currency = readiness.defaultCurrencyCode;
  const canRead = readiness.capabilities.configurationDraft === true
    && readiness.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && readiness.permissions.includes("procurement-configuration-approve");
  const marker = `procurement.policy.command.pending.v1:${[readiness.tenantId, company,
    selection.branch ?? "", readiness.principalId, KEY].join(":")}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker));
  const [schemaReady, setSchemaReady] = useState(false);
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false);
  const [refresh, setRefresh] = useState(0), [error, setError] = useState("");
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [reason, setReason] = useState("");
  const [rows, setRows] = useState<SourcingRow[]>([emptySourcingRow()]);
  const [start, setStart] = useState(tomorrow), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setSchemaReady(false);
    lookupSourcingReviewers(company, "", 0, controller.signal)
      .then(() => { if (!controller.signal.aborted) setSchemaReady(true); })
      .catch(() => { if (!controller.signal.aborted) setSchemaReady(false); });
    return () => controller.abort();
  }, [company, canRead]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setLoading(true); setError("");
    listPolicies(company, controller.signal, KEY)
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, canRead, refresh]);
  const claim = () => {
    if (!alive.current || busy.current || readAuthorityCreateGuard(marker) !== "clear" || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker)); setError("The last change cannot be confirmed. Inspect saved rules before another command.");
      return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); return true;
  };
  const settle = (cause?: unknown) => {
    if (!cause || cause instanceof PolicyActionError && [400, 422].includes(cause.status)) clearAuthorityCreateGuard(marker);
    busy.current = false;
    if (alive.current) { setWorking(false); setGuard(readAuthorityCreateGuard(marker)); if (cause) setError(explain(cause)); }
  };
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady)) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id);
      if (!alive.current) return;
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved sourcing version did not match this record.");
      if (edit) {
        const parsed = parseSourcingPolicy(record.rulesJson, currency);
        if (record.state !== "Draft" || !parsed) throw new Error("This version needs a fuller sourcing editor. It remains read-only here.");
        setRows(parsed); setStart(day(record.effectiveFrom)); setEnd(day(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (cause) { if (alive.current) setError(explain(cause)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string;
    try {
      rulesJson = serializeSourcingPolicy(currency, rows);
      if (!start || end && end <= start) throw new Error("Choose an end date after the start date.");
    } catch (cause) { setError(explain(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validatePolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Check the sourcing rules.");
      busy.current = false; setWorking(false);
      if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: `${start}T00:00:00.000Z`,
        effectiveTo: end ? `${end}T00:00:00.000Z` : null, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft)
        : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || day(result.effectiveFrom) !== start || day(result.effectiveTo) !== end
        || editing !== "new" && (result.id !== editing.id || result.version <= editing.version))
        throw new PolicyActionError("ERP did not confirm the saved sourcing rule. Check the saved record.", 0);
      settle(); if (alive.current) { setEditing(null); setRefresh(value => value + 1); }
    } catch (cause) {
      if (readAuthorityCreateGuard(marker) === "pending") settle(cause);
      else { busy.current = false; if (alive.current) { setWorking(false); setError(explain(cause)); } }
    }
  }
  async function act(event: FormEvent) {
    event.preventDefault();
    if (!pending || !reason.trim() || guard !== "clear" || !schemaReady
      || (pending.action === "review" ? !canEdit : !canApprove)) return;
    if (!claim()) return;
    try {
      const { item, action } = pending;
      const result = action === "review" ? await submitPolicyReview(company, item.id, item.version, reason.trim())
        : await decidePolicy(company, item.id, item.version, action === "publish" ? "publish" : "return", reason.trim());
      if (result.id !== item.id || result.policyKey !== KEY || result.version <= item.version
        || result.state !== (action === "review" ? "PendingReview" : action === "publish" ? "Published" : "Draft"))
        throw new PolicyActionError("ERP did not confirm this sourcing decision. Check the saved record.", 0);
      settle(); if (alive.current) { setPending(null); setReason(""); setRefresh(value => value + 1); }
    } catch (cause) { settle(cause); }
  }
  const patch = (index: number, value: Partial<SourcingRow>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...value } : row));
  const bool = (value: string): boolean | null => value === "yes" ? true : value === "no" ? false : null;
  const boolValue = (value: boolean | null) => value === null ? "" : value ? "yes" : "no";
  if (!canRead) return <p role="status">Sourcing settings are unavailable for this company or account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Choose when requests for quotes can be published and who reviews them. Saving a draft does not publish an RFQ or grant approval authority.</p>
    {!schemaReady && <p role="status" className="text-sm text-muted-foreground">Named reviewer setup is unavailable. Saved sourcing versions remain read-only.</p>}
    <Panel title="RFQ publication rules"><div className="p-5">
      <div className="mb-4 flex gap-2"><Button variant="secondary" disabled={working} onClick={() => setRefresh(n => n + 1)}>Refresh saved rules</Button>
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { setRows([emptySourcingRow()]); setStart(tomorrow()); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading sourcing rules…</p> : page?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}><td>{item.policyVersionNumber}</td><td>{day(item.effectiveFrom)}</td><td>{day(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View</Button>
          {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setEditing(null); setReason(""); }}>Send for review</Button></>}
          {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setReason(""); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setReason(""); }}>Return</Button></>}</div></td></tr>)}
      </tbody></RecordTable></div> : <EmptyState title="No sourcing rules yet" description="Add a draft with named reviewers and publication controls." />}
      {page && page.total > page.items.length && <p className="mt-3 text-sm">Showing {page.items.length} of {page.total} versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-destructive">{error}</p>}
    {guard !== "clear" && <p role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm">A sourcing change has no confirmed result or this browser cannot safely record one. No command will be repeated. Refresh saved rules for read-only inspection and ask an administrator to reconcile it.</p>}
    {viewing && <Panel title={`Saved sourcing version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {day(viewing.effectiveFrom)}.</p>
      {parseSourcingPolicy(viewing.rulesJson, currency)?.map((row, index) => <p className="text-sm" key={index}>Rule {row.code}: at least {row.minimumQuoteCount} quotes and {row.minimumInvitedSuppliers} invited suppliers; {row.stages.length} named review steps.</p>)
        ?? <p className="text-sm">This saved version uses a fuller sourcing schema and is read-only here.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New RFQ rule draft" : `Edit draft version ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts on"><Input required type="date" value={start} onChange={event => setStart(event.target.value)} /></Field><Field label="Ends on (optional)"><Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field></div>
      {rows.map((row, index) => <div key={index} className="space-y-4 rounded-xl border border-border p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">Rule {index + 1}</h3><Button variant="secondary" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove</Button></div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Rule code"><Input required maxLength={100} value={row.code} onChange={event => patch(index, { code: event.target.value })} /></Field><Field label="Priority"><Input required inputMode="numeric" value={row.priority} onChange={event => patch(index, { priority: event.target.value })} /></Field>
          <Field label="Branches"><Select required value={boolValue(row.companyWide)} onChange={event => patch(index, { companyWide: bool(event.target.value) })}><option value="">Choose scope</option><option value="yes">All company branches</option></Select></Field>
          <Field label="Amount from (optional)"><Input inputMode="decimal" value={row.minimum} onChange={event => patch(index, { minimum: event.target.value })} /></Field><Field label="Amount below (optional)"><Input inputMode="decimal" value={row.maximum} onChange={event => patch(index, { maximum: event.target.value })} /></Field>
          <Field label="Category codes (optional, comma separated)"><Input value={row.categoryCodes} onChange={event => patch(index, { categoryCodes: event.target.value })} /></Field>
          <Field label="Purchase type"><Select value={row.purchaseType} onChange={event => patch(index, { purchaseType: event.target.value })}><option value="">All types</option>{["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].map(type => <option key={type} value={type}>{type[0] + type.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Minimum quotes"><Input required inputMode="numeric" value={row.minimumQuoteCount} onChange={event => patch(index, { minimumQuoteCount: event.target.value })} /></Field><Field label="Minimum invited suppliers"><Input required inputMode="numeric" value={row.minimumInvitedSuppliers} onChange={event => patch(index, { minimumInvitedSuppliers: event.target.value })} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-3">{([
          ["requirementsPackRequired", "Requirements document required"], ["evaluationCriteriaRequired", "Evaluation criteria required"],
          ["closingDateRequired", "Closing date required"],
        ] as const).map(([field, label]) => <Field key={field} label={label}><Select required value={boolValue(row[field])} onChange={event => patch(index, { [field]: bool(event.target.value) })}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>)}</div>
        {row.stages.map((stage, stageIndex) => <div key={stageIndex} className="rounded-lg border border-border p-3"><div className="flex justify-between"><h4 className="font-semibold">Review step {stageIndex + 1}</h4><Button variant="secondary" disabled={row.stages.length === 1} onClick={() => patch(index, { stages: row.stages.filter((_, i) => i !== stageIndex) })}>Remove step</Button></div><div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Step code"><Input required maxLength={100} value={stage.code} onChange={event => patch(index, { stages: row.stages.map((item, i) => i === stageIndex ? { ...item, code: event.target.value } : item) })} /></Field>
          <Field label="Decision rule"><Select required value={stage.mode} onChange={event => patch(index, { stages: row.stages.map((item, i) => i === stageIndex ? { ...item, mode: event.target.value as typeof stage.mode } : item) })}><option value="">Choose</option><option value="One">One reviewer</option><option value="All">All reviewers</option></Select></Field>
          <PolicyReviewerPicker company={company} label={`Step ${stageIndex + 1} reviewers`} selected={stage.principalIds} disabled={working || guard !== "clear"} onChange={principalIds => patch(index, { stages: row.stages.map((item, i) => i === stageIndex ? { ...item, principalIds } : item) })} />
        </div></div>)}<Button variant="secondary" disabled={row.stages.length >= 20} onClick={() => patch(index, { stages: [...row.stages, { code: "", mode: "", principalIds: [] }] })}>Add review step</Button>
      </div>)}<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, emptySourcingRow()])}>Add rule</Button><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send for independent review" : pending.action === "publish" ? "Publish sourcing rules" : "Return sourcing rules"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}><p className="text-sm">Version {pending.item.policyVersionNumber}. A separate authorised person must publish the rule. ERP checks current reviewer identity and coverage again.</p><Field label="Reason"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm</Button><Button variant="secondary" onClick={() => setPending(null)}>Close</Button></div></fieldset></Panel></form>}
  </div>;
}
