import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "../lib/authority-create-guard";
import { emptyMatchForm, emptyMatchRow, parseMatchPolicy, serializeMatchPolicy,
  type MatchForm, type MatchRow, type MatchTolerance } from "../lib/invoice-matching-policy-editor";
import { createPolicy, decidePolicy, getEffectivePolicy, getPolicy, listPolicies, submitPolicyReview,
  updatePolicy, validatePolicy, PolicyActionError, type PolicyPage, type PolicyRecord } from "../../../src/platform/procurement-policy-api";

const KEY = "INVOICE_MATCHING" as const;
const day = (date: string | null) => date?.slice(0, 10) ?? "";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const explanation = (error: unknown) => error instanceof Error ? error.message : "The invoice setting could not be loaded.";
type PendingAction = { item: PolicyPage["items"][number]; action: "review" | "publish" | "return" };

export function LiveInvoiceMatchingSettings() {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness || selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <InvoiceMatchingRecord key={[readiness.tenantId, readiness.legalEntityId,
    selection.branch ?? "", readiness.principalId].join(":")} />;
}

function InvoiceMatchingRecord() {
  const readiness = useLiveReadiness();
  const { selection } = useErpShell();
  if (!readiness) throw new Error("Select an ERP company to open invoice settings.");
  const company = readiness.legalEntityId, currency = readiness.defaultCurrencyCode;
  const canRead = readiness.capabilities.configurationDraft === true
    && readiness.permissions.includes("procurement-configuration-read");
  const canEdit = canRead && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = canRead && readiness.permissions.includes("procurement-configuration-approve");
  const scopeKey = [readiness.tenantId, company, selection.branch ?? "", readiness.principalId, KEY].join(":");
  const marker = `procurement.policy.command.pending.v1:${scopeKey}`;
  const [guard, setGuard] = useState(() => readAuthorityCreateGuard(marker));
  const [schemaReady, setSchemaReady] = useState(false);
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [viewing, setViewing] = useState<PolicyRecord | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState<MatchForm>(emptyMatchForm);
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState("");
  const [working, setWorking] = useState(false);
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
    const controller = new AbortController();
    setLoading(true); setError("");
    listPolicies(company, controller.signal, KEY)
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(explanation(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, canRead, refresh]);
  const startCommand = () => {
    if (!alive.current || busy.current || readAuthorityCreateGuard(marker) !== "clear" || !claimAuthorityCreateGuard(marker)) {
      setGuard(readAuthorityCreateGuard(marker));
      setError("A saved change cannot be confirmed. Check the saved list before another command.");
      return false;
    }
    busy.current = true; setWorking(true); setGuard("pending"); setError(""); return true;
  };
  const finishCommand = (cause?: unknown) => {
    if (!cause || cause instanceof PolicyActionError && [400, 422].includes(cause.status)) {
      clearAuthorityCreateGuard(marker);
    }
    busy.current = false;
    if (alive.current) {
      setWorking(false); setGuard(readAuthorityCreateGuard(marker));
      if (cause) setError(explanation(cause));
    }
  };
  async function open(id: string, edit: boolean) {
    if (busy.current || !canRead || edit && (!canEdit || !schemaReady)) return;
    busy.current = true; setWorking(true); setError("");
    try {
      const record = await getPolicy(company, id);
      if (!alive.current) return;
      if (record.id !== id || record.policyKey !== KEY) throw new Error("The saved invoice setting did not match this record.");
      if (edit) {
        const parsed = parseMatchPolicy(record.rulesJson, currency);
        if (record.state !== "Draft" || !parsed) throw new Error("This saved version needs a fuller editor. It remains read-only here.");
        setForm(parsed); setStart(day(record.effectiveFrom)); setEnd(day(record.effectiveTo)); setEditing(record); setViewing(null);
      } else { setViewing(record); setEditing(null); }
    } catch (cause) { if (alive.current) setError(explanation(cause)); }
    finally { busy.current = false; if (alive.current) setWorking(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !schemaReady || !editing || busy.current || guard !== "clear") return;
    let rulesJson: string;
    try {
      rulesJson = serializeMatchPolicy(currency, form);
      if (!start || end && end <= start) throw new Error("Choose an end date after the start date.");
    } catch (cause) { setError(explanation(cause)); return; }
    busy.current = true; setWorking(true); setError("");
    try {
      const validation = await validatePolicy(company, rulesJson);
      if (!alive.current) return;
      if (!validation.isValid) throw new Error(validation.issues.map(issue => issue.message).join(" ") || "Check the invoice rules.");
      busy.current = false; setWorking(false);
      if (!startCommand()) return;
      const draft = { policyKey: KEY, effectiveFrom: `${start}T00:00:00.000Z`,
        effectiveTo: end ? `${end}T00:00:00.000Z` : null, rulesJson };
      const result = editing === "new" ? await createPolicy(company, draft)
        : await updatePolicy(company, editing.id, editing.version, draft);
      if (result.policyKey !== KEY || result.state !== "Draft" || result.rulesJson !== rulesJson
        || day(result.effectiveFrom) !== start || day(result.effectiveTo) !== end
        || editing !== "new" && (result.id !== editing.id || result.version <= editing.version))
        throw new PolicyActionError("ERP did not confirm the saved invoice rules. Check the saved record.", 0);
      finishCommand();
      if (alive.current) { setEditing(null); setRefresh(value => value + 1); }
    } catch (cause) {
      if (readAuthorityCreateGuard(marker) === "pending") finishCommand(cause);
      else { busy.current = false; if (alive.current) { setWorking(false); setError(explanation(cause)); } }
    }
  }
  async function action(event: FormEvent) {
    event.preventDefault();
    if (!pending || !reason.trim() || guard !== "clear" || !schemaReady
      || (pending.action === "review" ? !canEdit : !canApprove)) return;
    if (!startCommand()) return;
    try {
      const { item, action: choice } = pending;
      const result = choice === "review"
        ? await submitPolicyReview(company, item.id, item.version, reason.trim())
        : await decidePolicy(company, item.id, item.version, choice === "publish" ? "publish" : "return", reason.trim());
      if (result.id !== item.id || result.policyKey !== KEY || result.version <= item.version
        || result.state !== (choice === "review" ? "PendingReview" : choice === "publish" ? "Published" : "Draft"))
        throw new PolicyActionError("ERP did not confirm this invoice rule decision. Check the saved record.", 0);
      finishCommand();
      if (alive.current) { setPending(null); setReason(""); setRefresh(value => value + 1); }
    } catch (cause) { finishCommand(cause); }
  }
  function patchRow(index: number, patch: Partial<MatchRow>) {
    setForm(current => ({ ...current, rows: current.rows.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  }
  function patchTolerance(index: number, field: "quantity" | "unitPrice" | "tax" | "total", patch: Partial<MatchTolerance>) {
    setForm(current => ({ ...current, rows: current.rows.map((row, i) => i === index
      ? { ...row, [field]: { ...row[field], ...patch } } : row) }));
  }
  if (!canRead) return <p role="status">Invoice check settings are unavailable for this company or account.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">These rules decide whether an invoice needs an accepted delivery or service and what differences need review. A draft never clears an invoice for Finance.</p>
    {!schemaReady && <p role="status" className="text-sm text-muted-foreground">Invoice matching configuration is unavailable. Saved versions remain read-only.</p>}
    <Panel title="Invoice matching rules"><div className="p-5">
      <div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => setRefresh(value => value + 1)}>Refresh saved rules</Button>
        {canEdit && schemaReady && <Button disabled={working || guard !== "clear"} onClick={() => { setForm(emptyMatchForm()); setStart(tomorrow()); setEnd(""); setEditing("new"); setViewing(null); setPending(null); setError(""); }}>Add draft</Button>}</div>
      {loading ? <p role="status">Loading invoice rules…</p> : page?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {page.items.filter(item => item.policyKey === KEY).map(item => <tr key={item.id}><td>{item.policyVersionNumber}</td><td>{day(item.effectiveFrom)}</td><td>{day(item.effectiveTo) || "No end date"}</td><td><Badge>{item.state}</Badge></td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={working} onClick={() => void open(item.id, false)}>View</Button>
          {canEdit && schemaReady && item.state === "Draft" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => void open(item.id, true)}>Edit draft</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "review" }); setEditing(null); setReason(""); }}>Send for review</Button></>}
          {canApprove && schemaReady && item.state === "PendingReview" && <><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "publish" }); setReason(""); }}>Publish</Button><Button variant="secondary" disabled={working || guard !== "clear"} onClick={() => { setPending({ item, action: "return" }); setReason(""); }}>Return</Button></>}</div></td></tr>)}
      </tbody></RecordTable></div> : <EmptyState title="No invoice rules yet" description="Create a draft for each purchasing category that needs matching." />}
      {page && page.total > page.items.length && <p className="mt-3 text-sm">Showing {page.items.length} of {page.total} versions. Refine the list before editing an older version.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-destructive">{error}</p>}
    {guard !== "clear" && <div role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm">{guard === "pending" ? "A previous change has no confirmed result." : "This browser cannot safely record an in-progress change."} No command will be repeated here. Refresh saved rules for read-only inspection and ask an administrator to reconcile it.</div>}
    {viewing && <Panel title={`Saved invoice rules · version ${viewing.policyVersionNumber}`}><div className="space-y-3 p-5"><p className="text-sm">Status: {viewing.state}. Effective from {day(viewing.effectiveFrom)}.</p>
      {parseMatchPolicy(viewing.rulesJson, currency)?.rows.map((row, index) => <p key={index} className="text-sm">{row.categoryCode}: {row.method === "ThreeWay" ? `${row.acceptanceKind} delivery required` : "Order check only"}. Quantity, price, tax and total tolerances are set separately.</p>)
        ?? <p className="text-sm">This saved definition needs a fuller editor and is read-only here.</p>}
      <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div></Panel>}
    {canEdit && schemaReady && editing && <form onSubmit={event => void save(event)}><Panel title={editing === "new" ? "New invoice rule draft" : `Edit draft version ${editing.policyVersionNumber}`}><fieldset className="space-y-5 p-5" disabled={working || guard !== "clear"}>
      <p className="text-sm text-muted-foreground">Choose every value deliberately. Tolerances are exact decimal values; zero means no difference is allowed for that measure.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Starts on"><Input type="date" required value={start} onChange={event => setStart(event.target.value)} /></Field><Field label="Ends on (optional)"><Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field>
        <Field label="Money decimal places"><Select required value={form.moneyScale} onChange={event => setForm(current => ({ ...current, moneyScale: event.target.value }))}><option value="">Choose</option>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Select></Field>
        <Field label="Rounding"><Select required value={form.rounding} onChange={event => setForm(current => ({ ...current, rounding: event.target.value as MatchForm["rounding"] }))}><option value="">Choose</option><option value="ToEven">To nearest even</option><option value="AwayFromZero">Away from zero</option></Select></Field></div>
      {form.rows.map((row, index) => <div key={index} className="space-y-4 rounded-xl border border-border p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">Category {index + 1}</h3><Button variant="secondary" disabled={form.rows.length === 1} onClick={() => setForm(current => ({ ...current, rows: current.rows.filter((_, i) => i !== index) }))}>Remove</Button></div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Category code"><Input required maxLength={64} value={row.categoryCode} onChange={event => patchRow(index, { categoryCode: event.target.value })} /></Field>
          <Field label="Check method"><Select required value={row.method} onChange={event => patchRow(index, { method: event.target.value as MatchRow["method"], acceptanceKind: "" })}><option value="">Choose</option><option value="TwoWay">Order and invoice</option><option value="ThreeWay">Order, acceptance and invoice</option></Select></Field>
          {row.method === "ThreeWay" && <Field label="Accepted record"><Select required value={row.acceptanceKind} onChange={event => patchRow(index, { acceptanceKind: event.target.value as MatchRow["acceptanceKind"] })}><option value="">Choose</option><option value="Goods">Goods receipt</option><option value="Service">Service acceptance</option></Select></Field>}</div>
        {(["quantity", "unitPrice", "tax", "total"] as const).map(field => <div key={field}><h4 className="mb-2 text-sm font-semibold">{field === "unitPrice" ? "Unit price" : field[0].toUpperCase() + field.slice(1)} difference</h4><div className="grid gap-4 sm:grid-cols-3">
          <Field label="Allowed amount"><Input required inputMode="decimal" value={row[field].absolute} onChange={event => patchTolerance(index, field, { absolute: event.target.value })} /></Field>
          <Field label="Allowed percent"><Input required inputMode="decimal" value={row[field].percent} onChange={event => patchTolerance(index, field, { percent: event.target.value })} /></Field>
          <Field label="How limits combine"><Select required value={row[field].combination} onChange={event => patchTolerance(index, field, { combination: event.target.value as MatchTolerance["combination"] })}><option value="">Choose</option><option value="AllLimits">Both limits must pass</option><option value="AnyLimit">Either limit may pass</option></Select></Field>
        </div></div>)}</div>)}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={form.rows.length >= 64} onClick={() => setForm(current => ({ ...current, rows: [...current.rows, emptyMatchRow()] }))}>Add category</Button><Button type="submit">Save draft</Button><Button variant="secondary" onClick={() => setEditing(null)}>Close</Button></div>
    </fieldset></Panel></form>}
    {pending && <form onSubmit={event => void action(event)}><Panel title={pending.action === "review" ? "Send for independent review" : pending.action === "publish" ? "Publish invoice rules" : "Return invoice rules"}><fieldset className="space-y-4 p-5" disabled={working || guard !== "clear"}><p className="text-sm">Version {pending.item.policyVersionNumber}. Publication is separate from saving a draft. ERP checks the current worker and rule coverage again.</p><Field label="Reason"><Input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Confirm</Button><Button variant="secondary" onClick={() => setPending(null)}>Close</Button></div></fieldset></Panel></form>}
  </div>;
}
