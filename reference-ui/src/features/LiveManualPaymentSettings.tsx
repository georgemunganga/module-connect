import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { emptyManualPaymentLimit, parseManualPaymentPolicy, serializeManualPaymentPolicy,
  type ManualPaymentLimit } from "../lib/manual-payment-policy-editor";
import { createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies, submitPolicyReview,
  updatePolicy, validateManualPaymentPolicy, PolicyActionError,
  type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";

const KEY = "MANUAL_PAYMENT_REVIEW" as const;
const day = (value: string | null) => value?.slice(0, 10) ?? "";
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "Manual payment review settings are unavailable.";
type Pending = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" };

export function LiveManualPaymentSettings() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <ManualPaymentSettingsRecord key={[readiness.tenantId, readiness.legalEntityId,
    selection.branch ?? "", readiness.principalId].join(":")} />;
}

function ManualPaymentSettingsRecord() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Choose an ERP company before opening payment review settings.");
  const company = readiness.legalEntityId;
  const canRead = readiness.capabilities.configurationDraft
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
  const [rows, setRows] = useState<ManualPaymentLimit[]>([emptyManualPaymentLimit()]);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    let active = true; setSchemaReady(false);
    getEffectivePolicy(company, KEY).then(() => { if (active) setSchemaReady(true); })
      .catch(() => { if (active) setSchemaReady(false); });
    return () => { active = false; };
  }, [company, canRead]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setLoading(true); setError("");
    listPolicies(company, controller.signal, KEY)
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, canRead, refresh]);
  const claim = () => {
    if (!alive.current || busy.current || readAuthorityCreateGuard(marker) !== "clear"
      || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker));
      setError("The last change cannot be confirmed. Inspect saved review rules before another command.");
      return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); return true;
  };
  const settle = (cause?: unknown) => {
    if (!cause || cause instanceof PolicyActionError && [400, 422].includes(cause.status))
      clearAuthorityCreateGuard(marker);
    busy.current = false;
    if (alive.current) { setWorking(false); setGuard(readAuthorityCreateGuard(marker)); if (cause) setError(explain(cause)); }
  };
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady)) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id);
      if (!alive.current) return;
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved payment review version did not match this record.");
      if (edit) {
        const parsed = parseManualPaymentPolicy(record.rulesJson);
        if (record.state !== "Draft" || !parsed)
          throw new Error("This saved version needs a fuller editor and remains read-only here.");
        setRows(parsed); setStart(day(record.effectiveFrom)); setEnd(day(record.effectiveTo));
        setEditing(record); setViewing(null); setPending(null);
      } else { setViewing(record); setEditing(null); setPending(null); }
    } catch (cause) { if (alive.current) setError(explain(cause)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string;
    try {
      rulesJson = serializeManualPaymentPolicy(rows);
      if (!start || end && end <= start) throw new Error("Choose an end date after the start date. Effective dates use UTC.");
    } catch (cause) { setError(explain(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const checked = await validateManualPaymentPolicy(company, rulesJson);
      if (!alive.current) return;
      if (!checked.isValid || !checked.reviewReady)
        throw new Error([...checked.issues, ...checked.reviewIssues].map(issue => issue.message).join(" ")
          || "Set explicit currency limits before saving review rules.");
      busy.current = false; setWorking(false);
      if (!claim()) return;
      const draft = { policyKey: KEY, effectiveFrom: `${start}T00:00:00.000Z`,
        effectiveTo: end ? `${end}T00:00:00.000Z` : null, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft)
        : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || day(result.effectiveFrom) !== start || day(result.effectiveTo) !== end
        || editing !== "new" && (result.id !== editing.id || result.version <= editing.version))
        throw new PolicyActionError("ERP did not confirm the saved payment review rules. Check the saved record.", 0);
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
        throw new PolicyActionError("ERP did not confirm this payment review decision. Check the saved version.", 0);
      settle(); if (alive.current) { setPending(null); setReason(""); setRefresh(value => value + 1); }
    } catch (cause) { settle(cause); }
  }
  const patch = (index: number, next: Partial<ManualPaymentLimit>) => setRows(current => current.map((row, i) =>
    i === index ? { ...row, ...next } : row));
  if (!canRead) return <p role="status">Manual payment review settings are unavailable for this account and company.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">These rules govern independent review of externally reported manual payments. Finance still owns payment execution, posting and reconciliation.</p>
    {!schemaReady && <p role="status" className="text-sm text-muted-foreground">Manual payment review policy admission is unavailable. Saved versions remain read-only.</p>}
    <Panel title="Manual payment review rules"><div className="p-5">
      <div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => setRefresh(value => value + 1)}>Refresh saved rules</Button>
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => {
          setRows([emptyManualPaymentLimit()]); setStart(""); setEnd(""); setEditing("new");
          setViewing(null); setPending(null); setError("");
        }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading payment review rules…</p> : page?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}><td>{item.policyVersionNumber}</td><td>{day(item.effectiveFrom)}</td><td>{day(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View</Button>
          {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setEditing(null); setViewing(null); setReason(""); }}>Send for review</Button></>}
          {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setEditing(null); setViewing(null); setReason(""); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setEditing(null); setViewing(null); setReason(""); }}>Return</Button></>}</div></td></tr>)}
      </tbody></RecordTable></div> : <EmptyState title="No manual payment review rules yet" description="An authorized policy author can add explicit currency limits for independent review." />}
      {page && page.total > page.items.length && <p className="mt-3 text-sm">Showing {page.items.length} of {page.total} versions. Older versions remain available through the owning API.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-destructive">{error}</p>}
    {guard !== "clear" && <p role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm">A policy change has no confirmed result or this browser cannot safely record one. No command will be repeated. Inspect saved versions and ask an administrator to reconcile it.</p>}
    {viewing && <Panel title={`Saved manual review version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {day(viewing.effectiveFrom)} UTC.</p>
      {parseManualPaymentPolicy(viewing.rulesJson)?.map(row => <p key={row.currencyCode} className="text-sm">{row.currencyCode}: maximum bill amount {row.maximumExact}. Independent creator/approver and recorder/confirmer are required.</p>)
        ?? <p className="text-sm">This version uses a fuller policy definition and is read-only here.</p>}
      {viewing.lastReturnReason && <p className="text-sm">Returned for changes: {viewing.lastReturnReason}</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New manual review draft" : `Edit manual review draft ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <p className="text-sm text-muted-foreground">Set a positive exact maximum for each currency. Missing currencies have no payment review authority. Saving a draft does not activate it.</p>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Effective from (UTC)"><Input required type="date" value={start} onChange={event => setStart(event.target.value)} /></Field><Field label="Effective until (UTC, optional)"><Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field></div>
      {rows.map((row, index) => <div key={index} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[1fr_2fr_auto]"><Field label={`Currency ${index + 1}`}><Input required maxLength={3} value={row.currencyCode} onChange={event => patch(index, { currencyCode: event.target.value.toUpperCase() })} placeholder="ZMW" /></Field>
        <Field label={`Maximum bill amount ${index + 1}`}><Input required inputMode="decimal" value={row.maximumExact} onChange={event => patch(index, { maximumExact: event.target.value })} placeholder="0.0000" /></Field>
        <Button type="button" variant="secondary" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove</Button></div>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={rows.length >= 32} onClick={() => setRows(current => [...current, emptyManualPaymentLimit()])}>Add currency</Button>
        <Button type="submit">Save draft</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Close</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void act(event)}><Panel title={pending.action === "review" ? "Send for independent review" : pending.action === "publish" ? "Publish manual review rules" : "Return manual review rules"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}>
      <p className="text-sm">Version {pending.item.policyVersionNumber}. A different authorized Core account must publish the complete limits. Publication does not approve a payment or move money.</p>
      <Field label="Reason"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <div className="flex gap-2"><Button type="submit">Confirm {pending.action}</Button><Button type="button" variant="secondary" onClick={() => setPending(null)}>Close</Button></div>
    </fieldset></Panel></form>}
  </div>;
}
