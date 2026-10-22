import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { claimRecurringWrite, confirmRecurringWrite, recurringWriteLocked } from "../lib/recurring-write-lock";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import { listOwnContractDrafts, type ContractSummary } from "../../../src/platform/procurement-contracts-api";
import {
  RecurringPurchaseError, isDefiniteRecurringRejection, closeRecurringPurchase, createRecurringPurchase, getRecurringPurchase,
  listRecurringPurchases, recurringPurchaseForPrincipal, updateRecurringPurchase, validateRecurringPurchase,
  type RecurringPurchase, type RecurringPurchaseDraft, type RecurringPurchasePage,
} from "../../../src/platform/procurement-recurring-purchases-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The recurring purchase could not be loaded.";
function useRecurringScope() {
  const readiness = useLiveReadiness();
  const shell = useErpShell();
  if (!readiness) throw new Error("Recurring purchases require an ERP company.");
  const writeScope = JSON.stringify([readiness.tenantId, readiness.legalEntityId,
    readiness.principalId, shell.selection.branch ?? ""]);
  return { ...readiness, selectedBranch: shell.selection.branch, writeScope, key: JSON.stringify([writeScope, shell.authEpoch]) };
}
function emptyDraft(currency: string): RecurringPurchaseDraft {
  return { supplierId: "", supplierContractId: null, title: "", frequency: "Monthly",
    firstCycleOn: "", lastCycleOn: null, nextCycleOn: "", currencyCode: currency,
    expectedAmount: "" };
}
function canRead(scope: ReturnType<typeof useRecurringScope>) {
  return scope.capabilities.recurringPurchaseDraft && scope.permissions.includes("procurement-recurring-read");
}
function canCreate(scope: ReturnType<typeof useRecurringScope>) {
  return canRead(scope) && scope.permissions.includes("procurement-recurring-create");
}
function canEdit(scope: ReturnType<typeof useRecurringScope>) {
  return canRead(scope) && scope.permissions.includes("procurement-recurring-edit");
}

export function LiveRecurringPurchaseList() {
  const scope = useRecurringScope();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data: RecurringPurchasePage } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { setPage(1); }, [scope.key]);
  useEffect(() => {
    if (!canRead(scope)) return;
    const controller = new AbortController();
    setResult(null); setError(""); setLoading(true);
    listRecurringPurchases(scope.legalEntityId, page, controller.signal)
      .then((data) => {
        data.items.forEach(record => recurringPurchaseForPrincipal(record, scope.principalId, scope.selectedBranch));
        if (!controller.signal.aborted) setResult({ key: scope.key, data });
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope.key, page, scope.legalEntityId]);
  const data = result?.key === scope.key ? result.data : null;
  return <div className="p-5 sm:p-8">
    <PageHeader title="Recurring purchases" subtitle="Plan purchases that repeat. This schedule does not create a bill or payment." actions={canCreate(scope) ? <Link to="/recurring-bills/new"><Button><Plus size={16} className="mr-2 inline" />New recurring purchase</Button></Link> : undefined} />
    {!canRead(scope) ? <p role="alert">You cannot view recurring purchases for this company.</p> :
      <Panel><div className="p-5">
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        {loading ? <p role="status">Loading recurring purchases…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
          <thead><tr><th>Reference</th><th>Purchase</th><th>Repeats</th><th>Next expected</th><th>Expected each time</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/recurring-bills/${item.id}`} className="font-medium text-primary hover:underline">{item.title}</Link></td><td>{item.frequency}</td><td>{item.nextCycleOn}</td><td>{item.currencyCode} {item.exactExpectedAmount}</td><td><Badge>{item.status}</Badge></td><td><Link to={`/recurring-bills/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
        </RecordTable></div> : data ? <EmptyState title="No recurring purchases yet" description="Add an expected schedule for repeat goods or services." action={canCreate(scope) ? <Link to="/recurring-bills/new"><Button>New recurring purchase</Button></Link> : undefined} /> : null}
        {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </div></Panel>}
  </div>;
}

export function LiveRecurringPurchaseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const scope = useRecurringScope();
  const context = `${scope.key}:${id ?? "new"}`;
  const writeScope = `${scope.writeScope}:${id ?? "new"}`;
  const current = useRef(context); current.current = context;
  const generation = useRef(0);
  const pending = useRef(false);
  const [draft, setDraft] = useState(() => emptyDraft(scope.defaultCurrencyCode));
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [recordStatus, setRecordStatus] = useState<"Draft" | "Closed" | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [saveBlock, setSaveBlock] = useState<"unknown" | "stale" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    setLoaded(null); setVersion(null); setRecordStatus(null); setSaving(false); setError(""); setSaveBlock(recurringWriteLocked(writeScope) ? "unknown" : null); setLoading(Boolean(id));
    setVendors([]); setContracts([]); setDraft(emptyDraft(scope.defaultCurrencyCode));
    if (id) getRecurringPurchase(scope.legalEntityId, id, controller.signal)
      .then((record) => { if (!controller.signal.aborted) {
        recurringPurchaseForPrincipal(record, scope.principalId, scope.selectedBranch);
        setDraft({ supplierId: record.supplierId, supplierContractId: record.supplierContractId,
          title: record.title, frequency: record.frequency, firstCycleOn: record.firstCycleOn,
          lastCycleOn: record.lastCycleOn, nextCycleOn: record.nextCycleOn,
          expectedAmount: record.exactExpectedAmount, currencyCode: record.currencyCode });
        setVersion(record.version); setRecordStatus(record.status); setLoaded(context);
      } }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); generation.current += 1; };
  }, [context, id, scope.legalEntityId, scope.defaultCurrencyCode]);
  useEffect(() => {
    if (!canRead(scope) || !scope.permissions.includes("procurement-vendor-read")) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      listVendorDrafts(scope.legalEntityId, { search: search.trim() || undefined, pageSize: 100, signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted) setVendors(page.items.filter((v) => v.status === "Draft"
          || ((v.status === "Active" || v.status === "Approved") && v.isOrderable))); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); });
    }, search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [context, search, scope.legalEntityId]);
  useEffect(() => {
    if (!scope.permissions.includes("procurement-contract-read")) return;
    const controller = new AbortController();
    listOwnContractDrafts(scope.legalEntityId, 1, controller.signal)
      .then((page) => { if (!controller.signal.aborted) setContracts(page.items); })
      .catch(() => { /* Optional contract can be omitted. */ });
    return () => controller.abort();
  }, [context, scope.legalEntityId]);
  const field = <K extends keyof RecurringPurchaseDraft>(key: K, value: RecurringPurchaseDraft[K]) =>
    setDraft((before) => ({ ...before, [key]: value }));
  const writable = id ? canEdit(scope) : canCreate(scope);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!writable || pending.current || saveBlock) return;
    if (id && (loaded !== context || version === null || recordStatus !== "Draft")) { setError("This purchase cannot be edited. Open the saved record."); return; }
    const issue = validateRecurringPurchase(draft);
    if (issue) { setError(issue); return; }
    const captured = context, at = generation.current;
    const active = () => current.current === captured && generation.current === at;
    if (!claimRecurringWrite(writeScope)) { setSaveBlock("unknown"); return; }
    pending.current = true; setSaving(true); setError("");
    try {
      const saved = id && version !== null
        ? await updateRecurringPurchase(scope.legalEntityId, id, version, draft)
        : await createRecurringPurchase(scope.legalEntityId, draft);
      recurringPurchaseForPrincipal(saved, scope.principalId, scope.selectedBranch);
      confirmRecurringWrite(writeScope);
      if (active()) navigate(`/recurring-bills/${saved.id}`);
    } catch (cause) {
      if (isDefiniteRecurringRejection(cause))
        confirmRecurringWrite(writeScope);
      if (active()) {
        setError(errorText(cause));
        if (cause instanceof RecurringPurchaseError && cause.status === 409) setSaveBlock("stale");
        else if (!isDefiniteRecurringRejection(cause)) setSaveBlock("unknown");
      }
    } finally { pending.current = false; if (active()) setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit recurring purchase" : "New recurring purchase"} subtitle="Record an expected repeat purchase. Bills and payments stay with Finance." />
    {!writable ? <p role="alert">You cannot {id ? "edit" : "create"} recurring purchases for this company.</p>
      : loading ? <p role="status">Loading recurring purchase…</p>
        : id && loaded !== context ? <p role="alert">{error || "This purchase is unavailable. Return to the list."}</p>
          : id && recordStatus !== "Draft" ? <p role="status">This recurring purchase is closed. <Link className="text-primary underline" to={`/recurring-bills/${id}`}>Open its saved history</Link>.</p>
          : <form onSubmit={save} className="max-w-5xl space-y-5">
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {saveBlock && <p role="status" className="rounded-lg border p-3 text-sm">{saveBlock === "unknown" ? "The save result was not confirmed." : "This purchase changed."} Review the saved {id ? "purchase" : "list"} to confirm the outcome. Unconfirmed writes stay blocked for this browser session. <Link className="text-primary underline" to={id ? `/recurring-bills/${id}` : "/recurring-bills"}>Review saved records</Link></p>}
            <Panel title="Purchase schedule"><div className="grid gap-4 p-5 sm:grid-cols-2">
              {!scope.permissions.includes("procurement-vendor-read") && <p className="sm:col-span-2 text-sm">Supplier browsing is not assigned to your account. A saved supplier link remains unchanged.</p>}
              <Field label="Search suppliers" className="sm:col-span-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier name" /></Field>
              <Field label="Supplier" className="sm:col-span-2"><Select required value={draft.supplierId} onChange={(e) => { field("supplierId", e.target.value); field("supplierContractId", null); }}><option value="">Choose a supplier</option>{draft.supplierId && !vendors.some((v) => v.id === draft.supplierId) && <option value={draft.supplierId}>Selected supplier</option>}{vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName} ({v.status})</option>)}</Select></Field>
              <Field label="Purchase name" className="sm:col-span-2"><Input required maxLength={300} value={draft.title} onChange={(e) => field("title", e.target.value)} placeholder="For example, monthly cleaning" /></Field>
              <Field label="How often"><Select value={draft.frequency} onChange={(e) => field("frequency", e.target.value as RecurringPurchaseDraft["frequency"])}><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option><option value="Yearly">Yearly</option></Select></Field>
              <Field label="Expected each time"><Input required inputMode="decimal" value={draft.expectedAmount} onChange={(e) => field("expectedAmount", e.target.value)} placeholder="0.00" /></Field>
              <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode} onChange={(e) => field("currencyCode", e.target.value.toUpperCase())} /></Field>
              <Field label="First expected date"><Input required type="date" value={draft.firstCycleOn} onChange={(e) => { field("firstCycleOn", e.target.value); if (!draft.nextCycleOn) field("nextCycleOn", e.target.value); }} /></Field>
              <Field label="Next expected date"><Input required type="date" value={draft.nextCycleOn} onChange={(e) => field("nextCycleOn", e.target.value)} /></Field>
              <Field label="Last expected date (optional)"><Input type="date" value={draft.lastCycleOn || ""} onChange={(e) => field("lastCycleOn", e.target.value || null)} /></Field>
              <Field label="Related contract (optional)" className="sm:col-span-2"><Select value={draft.supplierContractId || ""} onChange={(e) => field("supplierContractId", e.target.value || null)}><option value="">No contract selected</option>{draft.supplierContractId && !contracts.some((c) => c.id === draft.supplierContractId) && <option value={draft.supplierContractId}>Selected contract</option>}{contracts.filter((c) => c.supplierId === draft.supplierId && c.status !== "Cancelled").map((c) => <option key={c.id} value={c.id}>{c.title} ({c.status})</option>)}</Select></Field>
            </div></Panel>
            <div className="flex gap-3"><Button type="submit" disabled={saving || !!saveBlock}>{saving ? "Saving…" : "Save recurring purchase"}</Button><Link to="/recurring-bills"><Button variant="secondary">Back to list</Button></Link></div>
          </form>}
  </div>;
}

export function LiveRecurringPurchaseDetail() {
  const { id } = useParams();
  const scope = useRecurringScope();
  const context = `${scope.key}:${id ?? ""}`;
  const writeScope = `${scope.writeScope}:${id ?? ""}`;
  const current = useRef(context); current.current = context;
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [loaded, setLoaded] = useState<{ key: string; record: RecurringPurchase } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    generation.current += 1;
    if (!id || !canRead(scope)) return;
    const controller = new AbortController();
    setLoaded(null); setLoading(true); setBusy(false); setReason(""); setError("");
    getRecurringPurchase(scope.legalEntityId, id, controller.signal)
      .then((record) => { if (!controller.signal.aborted) { setLoaded({ key: context, record: recurringPurchaseForPrincipal(record, scope.principalId, scope.selectedBranch) }); setBlocked(recurringWriteLocked(writeScope)); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); generation.current += 1; };
  }, [context, id, scope.legalEntityId, refresh]);
  const record = loaded?.key === context ? loaded.record : null;
  async function close() {
    if (!id || !record || !canEdit(scope) || busyRef.current || blocked) return;
    if (!reason.trim()) { setError("Give a reason for closing this schedule."); return; }
    const captured = context, at = generation.current;
    const active = () => current.current === captured && generation.current === at;
    if (!claimRecurringWrite(writeScope)) { setBlocked(true); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const saved = await closeRecurringPurchase(scope.legalEntityId, id, record.version, reason);
      recurringPurchaseForPrincipal(saved, scope.principalId, scope.selectedBranch);
      confirmRecurringWrite(writeScope);
      if (active()) setLoaded({ key: context, record: saved });
    } catch (cause) {
      if (isDefiniteRecurringRejection(cause))
        confirmRecurringWrite(writeScope);
      if (active()) {
        setError(errorText(cause));
        if (!isDefiniteRecurringRejection(cause) || cause.status === 409) setBlocked(true);
      }
    } finally { busyRef.current = false; if (active()) setBusy(false); }
  }
  return <div className="p-5 sm:p-8">
    {!canRead(scope) ? <p role="alert">You cannot view recurring purchases for this company.</p>
      : loading ? <p role="status">Loading recurring purchase…</p>
        : record ? <>
          <PageHeader title={record.title} subtitle={`${record.number} · Planned repeat purchase`} actions={canEdit(scope) && record.status === "Draft" ? <Link to={`/recurring-bills/${record.id}/edit`}><Button>Edit</Button></Link> : undefined} />
          {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
          {blocked && <p role="status" className="mb-4">The close result is uncertain or this version changed. Reloading does not retry the close action. <Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Reload saved purchase</Button></p>}
          <Panel title="Schedule"><dl className="grid gap-5 p-5 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Status</dt><dd><Badge>{record.status}</Badge></dd></div>
            <div><dt className="text-muted-foreground">Owner</dt><dd>You</dd></div>
            <div><dt className="text-muted-foreground">Supplier</dt><dd><Link className="text-primary underline" to={`/vendors/${record.supplierId}`}>Open supplier</Link></dd></div>
            <div><dt className="text-muted-foreground">Related contract</dt><dd>{record.supplierContractId ? <Link className="text-primary underline" to={`/contracts/${record.supplierContractId}`}>Open contract</Link> : "None"}</dd></div>
            <div><dt className="text-muted-foreground">Repeats</dt><dd>{record.frequency}</dd></div>
            <div><dt className="text-muted-foreground">Expected each time</dt><dd>{record.currencyCode} {record.exactExpectedAmount}</dd></div>
            <div><dt className="text-muted-foreground">First expected</dt><dd>{record.firstCycleOn}</dd></div>
            <div><dt className="text-muted-foreground">Next expected</dt><dd>{record.nextCycleOn}</dd></div>
            <div><dt className="text-muted-foreground">Last expected</dt><dd>{record.lastCycleOn || "No end date"}</dd></div>
            {record.closedReason && <div className="sm:col-span-2"><dt className="text-muted-foreground">Closure reason</dt><dd>{record.closedReason}</dd></div>}
          </dl></Panel>
          {canEdit(scope) && record.status === "Draft" && <Panel title="Close recurring purchase" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason"><Textarea maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Button variant="danger" disabled={busy || blocked || !reason.trim()} onClick={() => void close()}>{busy ? "Closing…" : "Close schedule"}</Button></div></Panel>}
        </> : <p role="alert">{error || "Recurring purchase not found."}</p>}
    <Link to="/recurring-bills" className="mt-5 inline-block text-sm text-primary hover:underline">Back to recurring purchases</Link>
  </div>;
}
