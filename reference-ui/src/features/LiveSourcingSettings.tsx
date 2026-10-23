import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { PolicyReviewerPicker } from "./PolicyReviewerPicker";
import { emptySourcingAudience, emptySourcingRow, parseSourcingPolicy, serializeSourcingPolicy,
  type SourcingAudienceRow, type SourcingRow } from "../lib/sourcing-publication-editor";
import { createPolicy, decidePolicy, getPolicy, listPolicies, lookupSourcingReviewers, submitPolicyReview, updatePolicy, validatePolicy, validateSourcingPolicy,
  PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";

const KEY = "SOURCING" as const;
const day = (date: string | null) => date?.slice(0, 10) ?? "";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "Sourcing settings are unavailable.";
const savedSchema = (json: string): 1 | 2 => {
  const document: unknown = JSON.parse(json);
  if (!document || typeof document !== "object" || Array.isArray(document)
    || !("schemaVersion" in document) || (document.schemaVersion !== 1 && document.schemaVersion !== 2))
    throw new Error("This saved policy format is read-only here.");
  return document.schemaVersion;
};
const sameSavedInstant = (actual: string | null, expected: string | null,
  retained?: string | null) => retained != null && expected === retained
    ? actual === retained
    : actual === expected || actual != null && expected != null
      && Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected);
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
  const [supportedSchemas, setSupportedSchemas] = useState<number[]>([]);
  const [schemaVersion, setSchemaVersion] = useState<1 | 2>(1);
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
      .then(result => { if (!controller.signal.aborted) { setSchemaReady(true);
        setSupportedSchemas(result.supportedSourcingRuleSchemas); } })
      .catch(() => { if (!controller.signal.aborted) { setSchemaReady(false); setSupportedSchemas([]); } });
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
        setRows(parsed); setSchemaVersion(savedSchema(record.rulesJson));
        setStart(day(record.effectiveFrom)); setEnd(day(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (cause) { if (alive.current) setError(explain(cause)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string;
    try {
      rulesJson = serializeSourcingPolicy(currency, rows, schemaVersion);
      if (!start || end && end <= start) throw new Error("Choose an end date after the start date.");
    } catch (cause) { setError(explain(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = schemaVersion === 2 ? await validateSourcingPolicy(company, rulesJson)
        : await validatePolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Check the sourcing rules.");
      busy.current = false; setWorking(false);
      if (!claim()) return;
      const from = editing !== "new" && day(editing.effectiveFrom) === start
        ? editing.effectiveFrom : `${start}T00:00:00.000Z`;
      const to = editing !== "new" && day(editing.effectiveTo) === end
        ? editing.effectiveTo : end ? `${end}T00:00:00.000Z` : null;
      const draft = { policyKey: KEY, effectiveFrom: from, effectiveTo: to, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft)
        : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || !sameSavedInstant(result.effectiveFrom, from, editing === "new" ? undefined : editing.effectiveFrom)
        || !sameSavedInstant(result.effectiveTo, to, editing === "new" ? undefined : editing.effectiveTo)
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
    if (pending.action === "review") {
      try {
        const detail = await getPolicy(company, pending.item.id);
        if (detail.policyKey !== KEY || detail.version !== pending.item.version) throw new Error("This sourcing draft changed. Refresh it before review.");
        if (savedSchema(detail.rulesJson) === 2) {
          const validation = await validateSourcingPolicy(company, detail.rulesJson);
          if (!validation.isValid || !validation.reviewConfigurationComplete)
            throw new Error(validation.reviewIssues.map(issue => issue.message).join(" ") || "Complete the supplier audience and rule coverage before review.");
        }
      } catch (cause) { setError(explain(cause)); return; }
    }
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
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { const next: 1 | 2 = supportedSchemas.includes(2) ? 2 : 1;
          setSchemaVersion(next); setRows([{ ...emptySourcingRow(), ...(next === 2 ? { audience: emptySourcingAudience() } : {}) }]);
          setStart(tomorrow()); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
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
      {parseSourcingPolicy(viewing.rulesJson, currency)?.map((row, index) => <div className="rounded-lg border border-border p-3 text-sm" key={index}>
        <p>Rule {row.code}: at least {row.minimumQuoteCount} quotes and {row.minimumInvitedSuppliers} invited suppliers; {row.stages.length} named review steps.</p>
        {row.audience && <p className="mt-2 text-muted-foreground">Supplier audience: {row.audience.supplierLifecycle || "not selected"}; category {row.audience.categoryMode || "not selected"}; qualification documents {row.audience.qualificationDocuments || "not selected"}; contact {row.audience.contactSelection || "not selected"}.</p>}
      </div>)
        ?? <p className="text-sm">This saved version uses a fuller sourcing schema and is read-only here.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New RFQ rule draft" : `Edit draft version ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <p className="text-sm text-muted-foreground">Schema {schemaVersion}. {schemaVersion === 2 ? "Core accounts can be named without an HRMS employee record. Supplier audience choices must be explicit before review." : "This saved version retains its earlier worker-based review format."}</p>
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
          <PolicyReviewerPicker company={company} label={`Step ${stageIndex + 1} reviewers`} selected={stage.principalIds} schemaVersion={schemaVersion} disabled={working || guard !== "clear"} onChange={principalIds => patch(index, { stages: row.stages.map((item, i) => i === stageIndex ? { ...item, principalIds } : item) })} />
        </div></div>)}<Button variant="secondary" disabled={row.stages.length >= 20} onClick={() => patch(index, { stages: [...row.stages, { code: "", mode: "", principalIds: [] }] })}>Add review step</Button>
        {schemaVersion === 2 && <SourcingAudienceFields value={row.audience ?? emptySourcingAudience()} change={audience => patch(index, { audience })} />}
      </div>)}<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, emptySourcingRow()])}>Add rule</Button><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send for independent review" : pending.action === "publish" ? "Publish sourcing rules" : "Return sourcing rules"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}><p className="text-sm">Version {pending.item.policyVersionNumber}. A separate authorised person must publish the rule. ERP checks current reviewer identity and coverage again.</p><Field label="Reason"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm</Button><Button variant="secondary" onClick={() => setPending(null)}>Close</Button></div></fieldset></Panel></form>}
  </div>;
}

function SourcingAudienceFields({ value, change }: {
  value: SourcingAudienceRow; change: (next: SourcingAudienceRow) => void;
}) {
  const patch = (part: Partial<SourcingAudienceRow>) => change({ ...value, ...part });
  const boolean = (text: string): boolean | null => text === "yes" ? true : text === "no" ? false : null;
  const shown = (value: boolean | null) => value === null ? "" : value ? "yes" : "no";
  const qualificationMode = value.qualificationTypes === null ? "" : value.qualificationTypes.length ? "listed" : "none";
  const contactFields = value.contactRequiredFields === null ? ""
    : value.contactRequiredFields.length ? value.contactRequiredFields.join(",") : "none";
  return <Panel title="Supplier audience for this rule"><div className="space-y-4 p-4">
    <p className="text-sm text-muted-foreground">These choices define which currently approved suppliers may be shortlisted. Saving them does not contact a supplier or publish an RFQ.</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Supplier lifecycle"><Select value={value.supplierLifecycle} onChange={event => patch({ supplierLifecycle: event.target.value as SourcingAudienceRow["supplierLifecycle"] })}>
        <option value="">Choose</option><option value="RecordedActiveDecision">Recorded active approval</option></Select></Field>
      <Field label="Category coverage"><Select value={value.categoryMode} onChange={event => patch({ categoryMode: event.target.value as SourcingAudienceRow["categoryMode"] })}>
        <option value="">Choose</option><option value="Ignore">Do not require category coverage</option>
        <option value="CoverAllSelectedCategories">Cover every selected category</option></Select></Field>
      <Field label="Qualification types"><Select value={qualificationMode} onChange={event => patch({ qualificationTypes: event.target.value === "" ? null : event.target.value === "none" ? [] : value.qualificationTypes?.length ? value.qualificationTypes : [""] })}>
        <option value="">Choose</option><option value="none">No types required</option><option value="listed">List required types</option></Select></Field>
      {qualificationMode === "listed" && <Field label="Required qualification types (comma separated)"><Input required value={value.qualificationTypes?.join(", ") ?? ""}
        onChange={event => { const parsed = event.target.value.split(",").map(item => item.trim()).filter(Boolean);
          patch({ qualificationTypes: parsed.length ? parsed : [""] }); }} /></Field>}
      <Field label="Qualification document check"><Select value={value.qualificationDocuments} onChange={event => patch({ qualificationDocuments: event.target.value as SourcingAudienceRow["qualificationDocuments"] })}>
        <option value="">Choose</option><option value="NotRequired">Not required</option>
        <option value="CoreAvailableVersionRequired">Current document version required</option></Select></Field>
      <Field label="Validity point"><Select value={value.validThrough} onChange={event => patch({ validThrough: event.target.value as SourcingAudienceRow["validThrough"] })}>
        <option value="">Choose</option><option value="PreparationInstant">When the shortlist is prepared</option>
        <option value="ClosingInstant">At the RFQ closing time</option></Select></Field>
      <Field label="Permit qualifications without expiry"><Select value={shown(value.allowNoQualificationExpiry)} onChange={event => patch({ allowNoQualificationExpiry: boolean(event.target.value) })}>
        <option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
      <Field label="Permit suppliers without validity end"><Select value={shown(value.allowOpenEndedSupplierValidity)} onChange={event => patch({ allowOpenEndedSupplierValidity: boolean(event.target.value) })}>
        <option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
      <Field label="Supplier contact choice"><Select value={value.contactSelection} onChange={event => patch({ contactSelection: event.target.value as SourcingAudienceRow["contactSelection"] })}>
        <option value="">Choose</option><option value="OneActiveSelected">One selected active contact</option>
        <option value="OneActivePrimarySelected">One selected active primary contact</option></Select></Field>
      <Field label="Required contact fields"><Select value={contactFields} onChange={event => patch({ contactRequiredFields: event.target.value === "" ? null
        : event.target.value === "none" ? [] : event.target.value.split(",") as Array<"Email" | "Phone"> })}>
        <option value="">Choose</option><option value="none">None</option><option value="Email">Email</option><option value="Phone">Phone</option><option value="Email,Phone">Email and phone</option></Select></Field>
    </div>
  </div></Panel>;
}
