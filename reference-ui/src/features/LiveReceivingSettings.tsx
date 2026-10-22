import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { ReceivingCategoryPicker, ReceivingReferencePicker } from "./ReceivingReferencePicker";
import { emptyReceivingRow, parseReceivingPolicy, serializeReceivingPolicy, type ReceivingRow } from "../lib/receiving-policy-editor";
import { createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies, lookupReceivingReferences, submitPolicyReview,
  updatePolicy, validatePolicy, PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";

const KEY = "RECEIVING" as const;
const day = (value: string | null) => value?.slice(0, 10) ?? "";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "Receiving settings are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" };

export function LiveReceivingSettings() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <ReceivingRecord key={[readiness.tenantId, readiness.legalEntityId,
    selection.branch ?? "", readiness.workerId ?? "admin"].join(":")} />;
}
function ReceivingRecord() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Select an ERP company before opening receiving settings.");
  const company = readiness.legalEntityId, currency = readiness.defaultCurrencyCode;
  const canRead = readiness.capabilities.configurationDraft === true
    && readiness.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && !readiness.adminViewOnly && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && !readiness.adminViewOnly && readiness.permissions.includes("procurement-configuration-approve");
  const marker = `procurement.policy.command.pending.v1:${[readiness.tenantId, company,
    selection.branch ?? "", readiness.workerId ?? "admin", KEY].join(":")}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker));
  const [schemaReady, setSchemaReady] = useState(false);
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false);
  const [refresh, setRefresh] = useState(0), [error, setError] = useState("");
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [reason, setReason] = useState("");
  const [rows, setRows] = useState<ReceivingRow[]>([emptyReceivingRow()]);
  const [start, setStart] = useState(tomorrow), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setSchemaReady(false);
    Promise.all([getEffectivePolicy(company, KEY),
      ...(["people", "sites", "categories"] as const).map(kind => lookupReceivingReferences(company, kind, "", 0, controller.signal))])
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
      setGuard(readAuthorityCreateGuard(marker)); setError("The last receiving change cannot be confirmed. Inspect saved rules before another command.");
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
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved receiving version did not match this record.");
      if (edit) {
        const parsed = parseReceivingPolicy(record.rulesJson, currency);
        if (record.state !== "Draft" || !parsed) throw new Error("This receiving version needs a fuller editor. It remains read-only here.");
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
      rulesJson = serializeReceivingPolicy(currency, rows);
      if (!start || end && end <= start) throw new Error("Choose an end date after the start date.");
    } catch (cause) { setError(explain(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validatePolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Check the receiving rules.");
      busy.current = false; setWorking(false);
      if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: `${start}T00:00:00.000Z`,
        effectiveTo: end ? `${end}T00:00:00.000Z` : null, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft)
        : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || day(result.effectiveFrom) !== start || day(result.effectiveTo) !== end
        || editing !== "new" && (result.id !== editing.id || result.version <= editing.version))
        throw new PolicyActionError("ERP did not confirm the saved receiving rule. Check the saved record.", 0);
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
        throw new PolicyActionError("ERP did not confirm this receiving decision. Check the saved record.", 0);
      settle(); if (alive.current) { setPending(null); setReason(""); setRefresh(value => value + 1); }
    } catch (cause) { settle(cause); }
  }
  const patch = (index: number, value: Partial<ReceivingRow>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...value } : row));
  const bool = (value: string): boolean | null => value === "yes" ? true : value === "no" ? false : null;
  const boolValue = (value: boolean | null) => value === null ? "" : value ? "yes" : "no";
  if (!canRead) return <p role="status">Receiving settings are unavailable for this company or account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Choose who may confirm a delivery or service and what evidence is needed. A saved draft does not accept goods or services.</p>
    {!schemaReady && <p role="status" className="text-sm text-muted-foreground">Receiving configuration is unavailable. Saved versions remain read-only.</p>}
    <Panel title="Delivery and service checks"><div className="p-5"><div className="mb-4 flex gap-2"><Button variant="secondary" disabled={working} onClick={() => setRefresh(n => n + 1)}>Refresh saved rules</Button>
      {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { setRows([emptyReceivingRow()]); setStart(tomorrow()); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading receiving rules…</p> : page?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}><td>{item.policyVersionNumber}</td><td>{day(item.effectiveFrom)}</td><td>{day(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View</Button>
          {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setEditing(null); setReason(""); }}>Send for review</Button></>}
          {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setReason(""); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setReason(""); }}>Return</Button></>}</div></td></tr>)}
      </tbody></RecordTable></div> : <EmptyState title="No receiving rules yet" description="Create a draft for goods or service acceptance." />}
      {page && page.total > page.items.length && <p className="mt-3 text-sm">Showing {page.items.length} of {page.total} versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-destructive">{error}</p>}
    {guard !== "clear" && <p role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm">A receiving change has no confirmed result or this browser cannot safely record one. No command will be repeated. Refresh saved rules for read-only inspection and ask an administrator to reconcile it.</p>}
    {viewing && <Panel title={`Saved receiving version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {day(viewing.effectiveFrom)}.</p>
      {parseReceivingPolicy(viewing.rulesJson, currency)?.map((row, index) => <p key={index} className="text-sm">{row.categoryCode} · {row.purchaseType}: {row.kind}; {row.siteIds.length} selected sites; {row.inspectionRequired ? "inspection required" : "no inspection"}.</p>)
        ?? <p className="text-sm">This saved version uses settings this editor cannot safely change. It remains read-only.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New receiving rule draft" : `Edit draft version ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts on"><Input required type="date" value={start} onChange={event => setStart(event.target.value)} /></Field><Field label="Ends on (optional)"><Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field></div>
      {rows.map((row, index) => <div key={index} className="space-y-4 rounded-xl border border-border p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">Acceptance rule {index + 1}</h3><Button variant="secondary" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove</Button></div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Rule code"><Input required maxLength={64} value={row.code} onChange={event => patch(index, { code: event.target.value })} /></Field>
          <ReceivingCategoryPicker company={company} value={row.categoryCode} disabled={working || guard !== "clear"} onChange={categoryCode => patch(index, { categoryCode })} />
          <Field label="Purchase type"><Select required value={row.purchaseType} onChange={event => patch(index, { purchaseType: event.target.value })}><option value="">Choose</option>{["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].map(type => <option key={type} value={type}>{type[0] + type.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Received as"><Select required value={row.kind} onChange={event => patch(index, { kind: event.target.value as ReceivingRow["kind"], inspectionRequired: null, checklistReference: "", inspectorWorkerIds: [], serviceOwnerWorkerIds: [] })}><option value="">Choose</option><option value="Goods">Goods</option><option value="Service">Service</option></Select></Field>
          <ReceivingReferencePicker company={company} kind="sites" label="Receiving sites" selected={row.siteIds} disabled={working || guard !== "clear"} onChange={siteIds => patch(index, { siteIds })} /></div>
        {row.kind && <div className="grid gap-4 sm:grid-cols-3"><Field label="Inspection required"><Select required value={boolValue(row.inspectionRequired)} onChange={event => patch(index, { inspectionRequired: bool(event.target.value), checklistReference: "", inspectorWorkerIds: [] })}><option value="">Choose</option>{row.kind === "Goods" && <option value="yes">Yes</option>}<option value="no">No</option></Select></Field>
          {row.kind === "Goods" && row.inspectionRequired && <><Field label="Inspection checklist reference"><Input required maxLength={200} value={row.checklistReference} onChange={event => patch(index, { checklistReference: event.target.value })} /></Field><ReceivingReferencePicker company={company} kind="people" label="Inspectors" selected={row.inspectorWorkerIds} disabled={working || guard !== "clear"} onChange={inspectorWorkerIds => patch(index, { inspectorWorkerIds })} /></>}</div>}
        {row.kind === "Service" && <ReceivingReferencePicker company={company} kind="people" label="Service owners" selected={row.serviceOwnerWorkerIds} disabled={working || guard !== "clear"} onChange={serviceOwnerWorkerIds => patch(index, { serviceOwnerWorkerIds })} />}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([
          ["allowRequesterCertification", "Requester may confirm"], ["allowBuyerCertification", "Buyer may confirm"],
          ["allowReceiverCertification", "Receiver may confirm"], ["requireIndependentInspector", "Independent inspector required"],
        ] as const).map(([field, label]) => <Field key={field} label={label}><Select required value={boolValue(row[field])} onChange={event => patch(index, { [field]: bool(event.target.value) })}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Evidence method"><Select required value={row.evidenceMode} onChange={event => patch(index, { evidenceMode: event.target.value as ReceivingRow["evidenceMode"] })}><option value="">Choose</option><option value="ControlledManualReference">Controlled document reference</option></Select></Field>
          <Field label="Required evidence reference prefix"><Input required maxLength={100} value={row.evidenceReferencePrefix} onChange={event => patch(index, { evidenceReferencePrefix: event.target.value })} /></Field></div>
      </div>)}<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={rows.length >= 64} onClick={() => setRows(current => [...current, emptyReceivingRow()])}>Add classification</Button><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send for independent review" : pending.action === "publish" ? "Publish receiving rules" : "Return receiving rules"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}><p className="text-sm">Version {pending.item.policyVersionNumber}. Another authorised person must publish it. ERP checks sites, workers and policy evidence again.</p><Field label="Reason"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm</Button><Button variant="secondary" onClick={() => setPending(null)}>Close</Button></div></fieldset></Panel></form>}
  </div>;
}
