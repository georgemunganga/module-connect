import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Save } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Panel, Select, Textarea } from "../components/ui";
import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { ActivityTimeline, DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { compareExactDecimal } from "../lib/decimal-comparison";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { createManualPaymentRecoveryJournal, type ManualPaymentRecoveryLocator } from "../lib/manual-payment-command-journal";
import { RecordDetailFrame } from "./RecordDetail";
import { TransactionEditorFrame } from "./TransactionEditor";
import { manualPaymentStatusLabels as statusLabels, manualPaymentVisibleActions } from "./manual-payment-view";
import {
  captureManualPaymentScope, getManualPayment, listManualPayments, lookupManualPaymentAssignees,
  lookupManualPaymentBranches, lookupManualPaymentInvoices, recoverManualPaymentCommand, recoverManualPaymentCreate,
  sendManualPaymentCommand, isDefiniteManualPaymentRejection, manualPaymentActionAvailability,
  type ManualPaymentAction, type ManualPaymentAssignee, type ManualPaymentBranch, type ManualPaymentCommand,
  type ManualPaymentDetail, type ManualPaymentIdentity, type ManualPaymentInvoiceChoice,
  type ManualPaymentPage, type ManualPaymentReceipt, type ManualPaymentScope, type ManualPaymentStatus,
} from "../../../src/platform/procurement-manual-payments-api";

const statuses = Object.keys(statusLabels) as ManualPaymentStatus[];
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Payment information is unavailable. Try again.";
type PaymentContext = { scope: ManualPaymentScope; readiness: NonNullable<ReturnType<typeof useLiveReadiness>>;
  branchId: string | null; key: string };

function usePaymentContext(): PaymentContext {
  const readiness = useLiveReadiness();
  const shell = useErpShell();
  if (!readiness) throw new Error("Choose an ERP company first.");
  const identity: ManualPaymentIdentity = { tenantId: readiness.tenantId,
    legalEntityId: readiness.legalEntityId, principalId: readiness.principalId,
    branchId: shell.selection.branch || null, authEpoch: shell.authEpoch };
  const current = useRef(identity); current.current = identity;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return { scope: captureManualPaymentScope(identity, () => alive.current ? current.current : null), readiness,
    branchId: identity.branchId,
    key: JSON.stringify([identity.tenantId, identity.legalEntityId, identity.principalId,
      identity.branchId, identity.authEpoch, readiness.permissions, readiness.capabilities.manualPaymentWorkflow]) };
}

function PaymentBoundary({ children }: { children: ReactNode }) {
  const readiness = useLiveReadiness(); const shell = useErpShell();
  if (!readiness || shell.procurementScopeStatus !== "ready" || shell.selection.entityId && shell.selection.entityId !== readiness.legalEntityId)
    return <div className="p-5 sm:p-8" role="status">Checking the selected company and branch…</div>;
  if (shell.selection.entityId !== readiness.legalEntityId)
    return <div className="p-5 sm:p-8" role="status">Choose your company from Organisation context to open Payments Made.</div>;
  if (!readiness.capabilities.manualPaymentWorkflow || !readiness.permissions.includes("procurement-payment-read"))
    return <div className="p-5 sm:p-8" role="alert">Manual payment review is not available for this account and company.</div>;
  return <div key={JSON.stringify([shell.authEpoch, readiness.tenantId, readiness.legalEntityId,
    shell.selection.branch ?? "", readiness.principalId, readiness.permissions])}>{children}</div>;
}

async function sendOnce(scope: ManualPaymentScope,
  journal: ReturnType<typeof createManualPaymentRecoveryJournal>, command: ManualPaymentCommand) {
  const locator: ManualPaymentRecoveryLocator = { key: command.key, action: command.action,
    id: command.action === "Create" ? null : command.id };
  if (!journal.claim(locator)) throw new Error("Check the saved command before starting another payment action.");
  try {
    const receipt = await sendManualPaymentCommand(scope, command);
    if (!journal.confirm(locator, receipt)) throw new Error("The payment result needs recovery before another action.");
    return receipt;
  } catch (cause) {
    if (isDefiniteManualPaymentRejection(cause)) journal.reject(locator, cause);
    throw cause;
  }
}

function RecoveryNotice({ scope, onRecovered }: { scope: ManualPaymentScope;
  onRecovered: (receipt: ManualPaymentReceipt) => void }) {
  const journal = createManualPaymentRecoveryJournal(scope);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = journal.state();
  if (!pending.blocked) return null;
  const recover = async () => {
    if (!pending.pending || busy) return;
    setBusy(true); setMessage("");
    try {
      const receipt = pending.pending.action === "Create"
        ? (await recoverManualPaymentCreate(scope, pending.pending.key)).receipt
        : await recoverManualPaymentCommand(scope, { key: pending.pending.key,
          action: pending.pending.action, id: pending.pending.id! });
      if (!journal.confirm(pending.pending, receipt)) throw new Error("The saved command still needs review.");
      onRecovered(receipt);
    } catch (cause) { setMessage(errorText(cause)); }
    finally { setBusy(false); }
  };
  return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
    <p className="font-semibold">Check the previous payment command</p>
    <p className="mt-1">Its response was not confirmed. Check its saved result before another change.</p>
    {pending.pending ? <Button type="button" variant="secondary" disabled={busy} className="mt-3" onClick={() => void recover()}>
      {busy ? "Checking…" : "Check saved result"}</Button>
      : <p className="mt-2">The saved recovery key cannot be read in this tab. Ask an administrator to review the payment.</p>}
    {message && <p className="mt-2" role="alert">{message}</p>}
  </div>;
}

const columns = [
  { key: "date", label: "Date", width: 130 }, { key: "number", label: "Payment request", width: 250 },
  { key: "invoice", label: "Bill", width: 170 }, { key: "vendor", label: "Vendor", width: 190 },
  { key: "status", label: "Status", width: 190 }, { key: "amount", label: "Amount", width: 160 },
];

export function LivePaymentList() { return <PaymentBoundary><PaymentListRecord /></PaymentBoundary>; }
function PaymentListRecord() {
  const { scope, readiness, key } = usePaymentContext(); const navigate = useNavigate();
  const [params] = useSearchParams(); const invoiceId = params.get("invoiceId") ?? undefined;
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [search, setSearch] = useState(""), [status, setStatus] = useState<ManualPaymentStatus | "">("");
  const [data, setData] = useState<{ key: string; value: ManualPaymentPage } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { setPage(1); }, [invoiceId, search, status, key]);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setLoading(true); setError("");
    listManualPayments(scope, page, { search, status: status || undefined,
      invoiceId: invoiceId || undefined }, controller.signal)
      .then(value => { if (!controller.signal.aborted && scope.current()) setData({ key, value }); })
      .catch(cause => { if (!controller.signal.aborted && scope.current()) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted && scope.current()) setLoading(false); });
    return () => controller.abort();
  }, [key, page, revision, search, status, invoiceId]);
  const pageData = data?.key === key ? data.value : null;
  const canCreate = readiness.permissions.includes("procurement-payment-create")
    && !createManualPaymentRecoveryJournal(scope).state().blocked;
  const rows = (pageData?.items ?? []).map(row => ({ id: row.id, number: row.id.slice(0, 8).toUpperCase(),
    title: row.title || row.invoiceNumber, status: statusLabels[row.status], path: `/payments/${row.id}`,
    fields: { date: row.createdAt.slice(0, 10), invoice: row.invoiceNumber,
      vendor: row.supplierDisplayName, amount: `${row.currencyCode} ${row.amountExact}`,
      currency: row.currencyCode, amountValue: row.amountExact } }));
  return <div className="p-5 sm:p-8">
    <RecoveryNotice scope={scope} onRecovered={receipt => navigate(`/payments/${receipt.id}`)} />
    <LiveRecordDirectory key={`${key}:${invoiceId ?? ""}`} title="Payments Made" entity="manual payment requests"
      subtitle="Review externally reported payments. Finance remains the source of payment and posting status."
      columns={columns} rows={rows} loading={loading} error={error} total={pageData?.total ?? 0}
      page={page} pageSize={pageData?.pageSize ?? 25} onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
      action={canCreate ? <Link to={invoiceId ? `/payments/new?invoiceId=${encodeURIComponent(invoiceId)}` : "/payments/new"}>
        <Button><Plus size={16} /> New manual payment request</Button></Link> : undefined}
      contextControls={invoiceId ? <p className="mb-3 text-sm text-muted-foreground">Showing requests for one bill. <Link to="/payments" className="text-primary underline">Show all</Link></p> : undefined}
      serverQuery={{ search, onSearch: setSearch, status, statuses: statuses.map(value =>
        ({ value, label: statusLabels[value] })), onStatusChange: value => setStatus(value as ManualPaymentStatus | "") }}
      sortComparators={{ amount: (left, right) => left.fields.currency.localeCompare(right.fields.currency)
        || compareExactDecimal(left.fields.amountValue, right.fields.amountValue) }}
      emptyTitle="No manual payment requests yet" emptyDescription="Create a request against a supplier bill to begin independent review." />
  </div>;
}

type Draft = { branchId: string; invoiceId: string; amountExact: string; title: string; purpose: string;
  approverPrincipalId: string; recorderPrincipalId: string; confirmerPrincipalId: string };
const blank = (branchId: string): Draft => ({ branchId, invoiceId: "", amountExact: "", title: "",
  purpose: "", approverPrincipalId: "", recorderPrincipalId: "", confirmerPrincipalId: "" });
type AssigneeRole = "approve" | "record" | "confirm";

export function LivePaymentEditor() {
  const location = useLocation();
  return <PaymentBoundary><PaymentEditorRecord key={`${location.pathname}${location.search}`} /></PaymentBoundary>;
}
function PaymentEditorRecord() {
  const { id } = useParams(); const navigate = useNavigate(); const [params] = useSearchParams();
  const { scope, readiness, branchId, key } = usePaymentContext();
  const selectedInvoiceId = params.get("invoiceId") || "";
  const journal = createManualPaymentRecoveryJournal(scope);
  const [draft, setDraft] = useState<Draft>(() => blank(branchId ?? ""));
  const [record, setRecord] = useState<ManualPaymentDetail | null>(null);
  const [invoices, setInvoices] = useState<ManualPaymentInvoiceChoice[]>([]);
  const [invoiceCursor, setInvoiceCursor] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [assignees, setAssignees] = useState<Record<AssigneeRole, ManualPaymentAssignee[]>>({ approve: [], record: [], confirm: [] });
  const [branchChoices, setBranchChoices] = useState<ManualPaymentBranch[]>([]);
  const [branchLoading, setBranchLoading] = useState(true), [branchError, setBranchError] = useState("");
  const [nameSearch, setNameSearch] = useState<Record<AssigneeRole, string>>({ approve: "", record: "", confirm: "" });
  const [loading, setLoading] = useState(Boolean(id)), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false);
  const [stale, setStale] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const routeHref = window.location.pathname + window.location.search;
  const editorKey = JSON.stringify([id ?? "new", key, selectedInvoiceId, routeHref]);
  const current = useRef(editorKey); current.current = editorKey;
  const lookup = useRef("");
  lookup.current = JSON.stringify([key, draft.branchId, invoiceSearch, selectedInvoiceId]);
  const update = (change: Partial<Draft>) => { setDraft(previous => ({ ...previous, ...change })); setDirty(true); };
  useEffect(() => {
    const abort = new AbortController(); setBranchLoading(true); setBranchError(""); setBranchChoices([]);
    lookupManualPaymentBranches(scope, abort.signal)
      .then(value => { if (!abort.signal.aborted && scope.current()) setBranchChoices(value); })
      .catch(cause => { if (!abort.signal.aborted && scope.current()) setBranchError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted && scope.current()) setBranchLoading(false); });
    return () => abort.abort();
  }, [key]);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController(); setLoading(true); setError(""); setRecord(null); setLoadedKey("");
    getManualPayment(scope, id, abort.signal).then(value => { if (!abort.signal.aborted && scope.current()) {
      if (current.current !== editorKey || value.request.id !== id) return;
      setRecord(value); setLoadedKey(editorKey); setDraft({ branchId: value.request.branchId, invoiceId: value.request.supplierInvoiceId,
        amountExact: value.request.amountExact, title: value.request.title || "", purpose: value.request.purpose || "",
        approverPrincipalId: value.request.approverPrincipalId, recorderPrincipalId: value.request.recorderPrincipalId,
        confirmerPrincipalId: value.request.confirmerPrincipalId }); setDirty(false);
    } }).catch(cause => { if (!abort.signal.aborted && scope.current()) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted && scope.current()) setLoading(false); });
    return () => abort.abort();
  }, [id, key, editorKey]);
  useEffect(() => {
    if (!draft.branchId || id || branchLoading || !branchChoices.some(row => row.id === draft.branchId)) return;
    const abort = new AbortController();
    const lookupKey = lookup.current;
    lookupManualPaymentInvoices(scope, { branchId: draft.branchId, q: invoiceSearch,
      invoiceId: selectedInvoiceId || undefined }, abort.signal)
      .then(value => { if (!abort.signal.aborted && scope.current() && lookup.current === lookupKey) {
        setInvoices(value.items); setInvoiceCursor(value.nextCursor);
        if (selectedInvoiceId && value.items.length === 1) setDraft(previous => ({ ...previous, invoiceId: value.items[0].invoiceId }));
      } }).catch(cause => { if (!abort.signal.aborted && scope.current()) setError(errorText(cause)); });
    return () => abort.abort();
  }, [key, draft.branchId, invoiceSearch, selectedInvoiceId, id, branchLoading, branchChoices]);
  useEffect(() => {
    if (!draft.branchId || branchLoading || !branchChoices.some(row => row.id === draft.branchId)) return;
    const abort = new AbortController();
    for (const role of ["approve", "record", "confirm"] as const) {
      if (role === "confirm" && !draft.recorderPrincipalId) { setAssignees(previous => ({ ...previous, confirm: [] })); continue; }
      lookupManualPaymentAssignees(scope, { role, branchId: draft.branchId, q: nameSearch[role],
        recorderPrincipalId: role === "confirm" ? draft.recorderPrincipalId : undefined }, abort.signal)
        .then(value => { if (!abort.signal.aborted && scope.current()) setAssignees(previous => ({ ...previous, [role]: value.items })); })
        .catch(cause => { if (!abort.signal.aborted && scope.current()) setError(errorText(cause)); });
    }
    return () => abort.abort();
  }, [key, draft.branchId, draft.recorderPrincipalId, nameSearch.approve, nameSearch.record, nameSearch.confirm, branchLoading, branchChoices]);
  const invoice = invoices.find(value => value.invoiceId === draft.invoiceId);
  const canSave = readiness.permissions.includes(id ? "procurement-payment-edit" : "procurement-payment-create")
    && (!id || record !== null && record.request.id === id && loadedKey === editorKey
      && record.request.status === "Draft" && record.request.creatorPrincipalId === readiness.principalId);
  const close = () => { if (busy || journal.state().blocked) return;
    if (dirty) setDiscard(true); else navigate(id ? `/payments/${id}` : "/payments"); };
  const save = async () => {
    if (!canSave || busy || stale || loading || journal.state().blocked
      || current.current !== editorKey || window.location.pathname + window.location.search !== routeHref
      || id && (record?.request.id !== id || loadedKey !== editorKey)) return;
    if (branchLoading || !branchChoices.some(row => row.id === draft.branchId)) {
      setError("Choose a transaction branch available to your account."); return;
    }
    if (!draft.branchId || !draft.invoiceId || !draft.amountExact || !draft.approverPrincipalId
      || !draft.recorderPrincipalId || !draft.confirmerPrincipalId) {
      setError("Choose a branch, one bill, an exact amount, and three named participants."); return;
    }
    setBusy(true); setError("");
    const command: ManualPaymentCommand = id && record
      ? { action: "Revise", key: crypto.randomUUID(), id, input: { expectedVersion: record.request.version,
        amountExact: draft.amountExact, title: draft.title || null, purpose: draft.purpose || null,
        approverPrincipalId: draft.approverPrincipalId, recorderPrincipalId: draft.recorderPrincipalId,
        confirmerPrincipalId: draft.confirmerPrincipalId } }
      : { action: "Create", key: crypto.randomUUID(), input: { branchId: draft.branchId,
        invoiceId: draft.invoiceId, amountExact: draft.amountExact, title: draft.title || null,
        purpose: draft.purpose || null, approverPrincipalId: draft.approverPrincipalId,
        recorderPrincipalId: draft.recorderPrincipalId, confirmerPrincipalId: draft.confirmerPrincipalId } };
    try { const saved = await sendOnce(scope, journal, command); if (scope.current() && current.current === editorKey
      && window.location.pathname + window.location.search === routeHref) navigate(`/payments/${saved.id}`); }
    catch (cause) { if (scope.current() && current.current === editorKey
      && window.location.pathname + window.location.search === routeHref) {
      setError(errorText(cause)); if (isDefiniteManualPaymentRejection(cause) && cause.status === 409) setStale(true);
    } } finally { if (scope.current() && current.current === editorKey
      && window.location.pathname + window.location.search === routeHref) setBusy(false); }
  };
  if (loading || id && record && (record.request.id !== id || loadedKey !== editorKey))
    return <p className="p-5 sm:p-8" role="status">Loading payment request…</p>;
  if (id && !record) return <div className="p-5 sm:p-8" role="alert">{error || "Payment request not found."} <Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button></div>;
  if (!canSave) return <div className="p-5 sm:p-8" role="alert">This draft is not available to edit with your current account. <Link to={id ? `/payments/${id}` : "/payments"}>Back to payments</Link></div>;
  const selectedBill = invoice ?? (id && record ? { invoiceId: record.request.supplierInvoiceId,
    invoiceNumber: record.request.invoiceNumber, supplierId: record.request.supplierId,
    supplierDisplayName: record.request.supplierDisplayName, currencyCode: record.request.currencyCode,
    grossExact: record.sourceInvoice?.grossExact ?? "", invoiceDate: record.sourceInvoice?.invoiceDate ?? "",
    branchId: record.request.branchId } : null);
  return <TransactionEditorFrame title={`${id ? "Edit" : "New"} Manual Payment Request`} close={close}
    closeDisabled={busy || journal.state().blocked} footer={<>
      <Button type="button" disabled={busy || stale || journal.state().blocked} onClick={() => void save()}><Save size={14} /> Save as Draft</Button>
      <Button type="button" variant="secondary" disabled={busy || journal.state().blocked} onClick={close}>Cancel</Button>
      <span className="ml-auto text-xs text-muted-foreground">Submit for review from the saved request. Recording happens after approval.</span>
    </>}>
    <RecoveryNotice scope={scope} onRecovered={receipt => navigate(`/payments/${receipt.id}`)} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {stale && <p role="alert" className="text-sm">The saved draft changed. Your entries remain here. Review the current request before saving again.</p>}
    <div className="-mx-5 bg-muted px-5 py-5 sm:-mx-8 sm:px-8"><div className="max-w-xl space-y-4">
      <Field label="Transaction branch *"><Select value={draft.branchId} disabled={Boolean(id) || Boolean(branchId) || branchLoading || Boolean(branchError)} onChange={event => {
        update({ branchId: event.target.value, invoiceId: "", approverPrincipalId: "", recorderPrincipalId: "", confirmerPrincipalId: "" });
        setInvoices([]); setInvoiceCursor(null); setInvoiceSearch("");
        setAssignees({ approve: [], record: [], confirm: [] });
        setNameSearch({ approve: "", record: "", confirm: "" });
      }}><option value="">Choose branch</option>{branchChoices.map(row => <option key={row.id} value={row.id}>{row.name}{row.code ? ` (${row.code})` : ""}</option>)}</Select></Field>
      {branchError && <p role="alert" className="text-sm">Could not load your transaction branches. {branchError}</p>}
      {!branchLoading && !branchError && branchChoices.length === 0 && <p role="alert" className="text-sm">No transaction branches are available to your account.</p>}
      <Field label="Vendor Name *"><Input value={selectedBill?.supplierDisplayName ?? "Select a bill first"} readOnly /></Field>
      <Field label="Bill to Pay *"><Input aria-label="Search supplier bills" placeholder="Search bill number or supplier" value={invoiceSearch}
        disabled={Boolean(id) || !draft.branchId || Boolean(selectedInvoiceId)} onChange={event => setInvoiceSearch(event.target.value)} />
        <Select aria-label="Bill to Pay *" value={draft.invoiceId} disabled={Boolean(id) || !draft.branchId || Boolean(selectedInvoiceId)}
          onChange={event => update({ invoiceId: event.target.value })}><option value="">Choose one bill</option>
          {selectedBill && !invoices.some(row => row.invoiceId === selectedBill.invoiceId) && <option value={selectedBill.invoiceId}>{selectedBill.invoiceNumber} · {selectedBill.supplierDisplayName}</option>}
          {invoices.map(row => <option key={row.invoiceId} value={row.invoiceId}>{row.invoiceNumber} · {row.supplierDisplayName}</option>)}</Select>
      </Field>
      {invoiceCursor && !selectedInvoiceId && <Button type="button" variant="secondary" onClick={() => {
        const lookupKey = lookup.current;
        lookupManualPaymentInvoices(scope, { branchId: draft.branchId, q: invoiceSearch, cursor: invoiceCursor })
          .then(value => { if (scope.current() && lookup.current === lookupKey) {
            setInvoices(previous => [...previous, ...value.items]); setInvoiceCursor(value.nextCursor); } })
          .catch(cause => { if (scope.current() && lookup.current === lookupKey) setError(errorText(cause)); });
      }}>More bills</Button>}
      {selectedInvoiceId && !selectedBill && <p role="alert" className="text-sm">This bill is not available in the selected branch. <Link className="text-primary underline" to="/payments/new">Choose another bill</Link></p>}
      {selectedBill && <div className="rounded-md border border-border bg-card p-3 text-sm">
        <p>{selectedBill.supplierDisplayName} · {selectedBill.currencyCode}</p>
        {selectedBill.grossExact && <p className="mt-1 text-muted-foreground">Original bill gross: {selectedBill.currencyCode} {selectedBill.grossExact}. Available capacity is checked when saving.</p>}
      </div>}
    </div></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Date"><Input value="Recorded by the server when saved" disabled /></Field>
      <Field label="Request title"><Input maxLength={200} value={draft.title} onChange={event => update({ title: event.target.value })} /></Field>
      <Field label="Payment #"><Input value={id ?? "Assigned after saving"} disabled /></Field>
      <Field label="Exact amount *"><Input inputMode="decimal" type="text" value={draft.amountExact}
        onChange={event => update({ amountExact: event.target.value })} placeholder="0.0000" /></Field>
      <Field label="Purpose / notes" className="sm:col-span-2"><Textarea maxLength={1000} value={draft.purpose} onChange={event => update({ purpose: event.target.value })} /></Field>
    </div>
    <Panel title="Payment details after approval"><div className="grid gap-5 p-5 sm:grid-cols-2">
      <Field label="Payment Mode"><Input value="Recorded after independent approval" disabled /></Field>
      <Field label="Paid Through"><Input value="Finance controlled — unavailable here" disabled /></Field>
      <Field label="External payment reference"><Input value="Recorded after independent approval" disabled /></Field>
      <Field label="External payment date"><Input value="Recorded after independent approval" disabled /></Field>
    </div></Panel>
    <Panel title="Independent review and confirmation"><div className="grid gap-5 p-5 sm:grid-cols-3">
      {(["approve", "record", "confirm"] as const).map(role => {
        const field = role === "approve" ? "approverPrincipalId" : role === "record" ? "recorderPrincipalId" : "confirmerPrincipalId";
        const chosen = draft[field]; const choices = assignees[role];
        return <Field key={role} label={role === "approve" ? "Approver *" : role === "record" ? "Recorder *" : "Confirmer *"}>
          <Input aria-label={`Search ${role} assignees`} placeholder="Search current accounts" value={nameSearch[role]}
            disabled={!draft.branchId || role === "confirm" && !draft.recorderPrincipalId}
            onChange={event => setNameSearch(previous => ({ ...previous, [role]: event.target.value }))} />
          <Select aria-label={role === "approve" ? "Approver *" : role === "record" ? "Recorder *" : "Confirmer *"}
            value={chosen} disabled={!draft.branchId || role === "confirm" && !draft.recorderPrincipalId}
            onChange={event => update(role === "record" ? { recorderPrincipalId: event.target.value, confirmerPrincipalId: "" }
              : { [field]: event.target.value } as Partial<Draft>)}>
            <option value="">Choose current account</option>
            {chosen && !choices.some(item => item.principalId === chosen) && <option value={chosen}>{chosen} · rechecked on save</option>}
            {choices.map(item => <option key={item.principalId} value={item.principalId}>{item.displayName}</option>)}
          </Select>
        </Field>;
      })}
      <p className="sm:col-span-3 text-xs text-muted-foreground">Named accounts must hold their current Core actions and branch access. The server checks independence again when the request is saved and submitted.</p>
    </div></Panel>
    <div className="rounded-md border border-border p-4 text-sm"><p className="font-medium">Payment evidence attachment</p>
      <Button type="button" variant="secondary" disabled title={manualPaymentActionAvailability("payment-upload").reason}>Attach document unavailable</Button>
      <p className="mt-2 text-muted-foreground">Record the external reference after approval. Finance owns bank execution and posting.</p></div>
    {discard && <Modal title="Leave this request?" onClose={() => setDiscard(false)}>
      <p className="text-sm">Unsaved entries will be lost.</p><div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button>
        <Button variant="danger" onClick={() => navigate(id ? `/payments/${id}` : "/payments")}>Discard entries</Button></div>
    </Modal>}
  </TransactionEditorFrame>;
}

export function LivePaymentDetail() { return <PaymentBoundary><PaymentDetailRecord /></PaymentBoundary>; }
function PaymentDetailRecord() {
  const { id } = useParams(); const { scope, readiness, key } = usePaymentContext();
  const journal = createManualPaymentRecoveryJournal(scope);
  const [detail, setDetail] = useState<ManualPaymentDetail | null>(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false), [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [tab, setTab] = useState("overview"), [action, setAction] = useState<ManualPaymentAction | null>(null);
  const [reason, setReason] = useState(""), [paidOn, setPaidOn] = useState(""), [method, setMethod] = useState(""), [reference, setReference] = useState("");
  const fetchKey = JSON.stringify([id, key, revision]);
  const currentFetch = useRef(fetchKey); currentFetch.current = fetchKey;
  useEffect(() => {
    if (!id) return; const abort = new AbortController(); setLoading(true); setError("");
    setDetail(null); setLoadedKey(""); setBusy(false); setAction(null); setReason(""); setPaidOn(""); setMethod(""); setReference("");
    getManualPayment(scope, id, abort.signal).then(value => { if (!abort.signal.aborted && scope.current() && currentFetch.current === fetchKey) {
      setDetail(value); setLoadedKey(fetchKey); setUncertain(false); setStale(false);
    } }).catch(cause => { if (!abort.signal.aborted && scope.current() && currentFetch.current === fetchKey) { setError(errorText(cause)); setStale(true); } })
      .finally(() => { if (!abort.signal.aborted && scope.current() && currentFetch.current === fetchKey) setLoading(false); });
    return () => abort.abort();
  }, [id, key, revision]);
  if (loading || detail && (loadedKey !== fetchKey || detail.request.id !== id))
    return <div className="p-5 sm:p-8" role="status">Loading payment request…</div>;
  if (!detail) return <div className="p-5 sm:p-8" role="alert">{error || "Payment request not found."} <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>;
  const request = detail.request, current = readiness.principalId, permissions = readiness.permissions;
  const available = manualPaymentVisibleActions(request, current, permissions);
  const writeBlocked = busy || stale || uncertain || loading || loadedKey !== fetchKey
    || request.id !== id || journal.state().blocked;
  const person = (principalId: string) => detail.people.find(value => value.principalId === principalId)?.displayName ?? principalId;
  const openAction = (next: ManualPaymentAction) => {
    if (writeBlocked) return;
    setReason(""); setMethod(""); setReference("");
    setPaidOn(next === "Record" ? detail.companyClock?.date ?? "" : "");
    setAction(next);
  };
  const execute = async () => {
    if (!action || !available.includes(action) || writeBlocked) return;
    const input = action === "Record" ? { expectedVersion: request.version, paidOn,
      externalMethod: method, externalReference: reference, amountExact: request.approvedAmountExact || "" }
      : { expectedVersion: request.version, reason: ["Return", "Reject", "Dispute", "Cancel"].includes(action) ? reason : undefined };
    const command = { action, key: crypto.randomUUID(), id: request.id, input } as ManualPaymentCommand;
    setBusy(true); setError("");
    try {
      await sendOnce(scope, journal, command);
      const fresh = await getManualPayment(scope, request.id);
      if (scope.current() && currentFetch.current === fetchKey) { setDetail(fresh); setAction(null); setReason(""); setPaidOn(""); setMethod(""); setReference(""); setStale(false); setUncertain(false); }
    } catch (cause) { if (scope.current() && currentFetch.current === fetchKey) {
      setError(errorText(cause)); if (isDefiniteManualPaymentRejection(cause) && cause.status === 409) setStale(true);
      if (journal.state().blocked || !isDefiniteManualPaymentRejection(cause)) setUncertain(true);
    } } finally { if (scope.current() && currentFetch.current === fetchKey) setBusy(false); }
  };
  const tabs = [{ key: "overview", label: "Overview" }, { key: "items", label: "Bill" },
    { key: "related", label: "Related" }, { key: "comments", label: "Comments" }, { key: "history", label: "History" }];
  return <RecordDetailFrame back="/payments" backLabel="Payments Made" title={request.title || `Payment request ${request.id.slice(0, 8)}`}
    status={statusLabels[request.status]} subtitle={`${request.invoiceNumber} · ${request.supplierDisplayName} · ${request.currencyCode} · Revision ${request.version}`}
    tabs={tabs} active={tab} onTab={setTab} actions={<>
      {request.status === "Draft" && current === request.creatorPrincipalId && permissions.includes("procurement-payment-edit") && !writeBlocked
        && <Link to={`/payments/${request.id}/edit`}><Button variant="secondary">Edit draft</Button></Link>}
      {available.filter(value => value !== "Cancel").map(value => <Button key={value} disabled={writeBlocked}
        variant={value === "Reject" || value === "Dispute" ? "danger" : "secondary"} onClick={() => openAction(value)}>
        {value === "Submit" ? "Submit for review" : value === "Record" ? "Record external payment" : value === "Confirm" ? "Confirm manually" : value}
      </Button>)}
      {available.includes("Cancel") && <Button variant="ghost" disabled={writeBlocked} onClick={() => openAction("Cancel")}>Cancel request</Button>}
    </>}>
    <RecoveryNotice scope={scope} onRecovered={() => setRevision(value => value + 1)} />
    {error && !action && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {(stale || uncertain) && <Button variant="secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh saved request</Button>}
    {tab === "overview" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(270px,0.85fr)]">
      <DetailSection title="Payment request overview" action={<Badge>{statusLabels[request.status]}</Badge>}>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailValue label="Bill" value={request.invoiceNumber} /><DetailValue label="Vendor" value={request.supplierDisplayName} />
          <DetailValue label="Requested amount" value={`${request.currencyCode} ${request.amountExact}`} />
          <DetailValue label="Approved amount" value={request.approvedAmountExact ? `${request.currencyCode} ${request.approvedAmountExact}` : undefined} />
          <DetailValue label="Recorded amount" value={request.recordedAmountExact ? `${request.currencyCode} ${request.recordedAmountExact}` : undefined} />
          <DetailValue label="External payment date" value={request.paidOn} /><DetailValue label="External method" value={request.externalMethod} />
          <DetailValue label="External reference" value={request.externalReference} /><DetailValue label="Branch ID" value={request.branchId} />
          <DetailValue label="Requested by" value={person(request.creatorPrincipalId)} />
          <DetailValue label="Approver" value={person(request.approverPrincipalId)} />
          <DetailValue label="Recorder" value={person(request.recorderPrincipalId)} />
          <DetailValue label="Confirmer" value={person(request.confirmerPrincipalId)} />
        </dl>{request.purpose && <p className="mt-5 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{request.purpose}</p>}
      </DetailSection><div className="space-y-4">
        <DetailSection title="Record Activity"><ActivityTimeline items={detail.transitions.map(value => ({ id: value.id,
          title: value.action === "Record" ? "External payment recorded" : value.action === "Confirm" ? "Manually confirmed" : value.action,
          detail: value.reason || `${value.fromStatus} → ${value.toStatus}`, date: value.occurredAt }))} /></DetailSection>
        <DetailSection title="Workflow context"><p className="text-sm">Approval and confirmation are independent Core tasks. Finance still owns payment posting and bank reconciliation.</p>
          <p className="mt-2 text-xs text-muted-foreground">Manual confirmation does not mark the Finance bill paid.</p></DetailSection>
      </div></div>}
    {tab === "items" && <DetailSection title="Supplier bill"><dl className="grid gap-4 sm:grid-cols-2">
      <DetailValue label="Bill number" value={request.invoiceNumber} /><DetailValue label="Vendor" value={request.supplierDisplayName} />
      <DetailValue label="Invoice ID" value={request.supplierInvoiceId} /><DetailValue label="Currency" value={request.currencyCode} />
      {detail.sourceInvoice && <DetailValue label="Original bill gross" value={`${request.currencyCode} ${detail.sourceInvoice.grossExact}`} />}
    </dl></DetailSection>}
    {tab === "related" && <DetailSection title="Related records"><p className="text-sm">This request is linked to one supplier bill and its Core approval cases.</p>
      {permissions.includes("procurement-invoice-read") && <Link className="mt-2 inline-block text-primary underline" to={`/bills/${request.supplierInvoiceId}`}>Open supplier bill</Link>}
      <dl className="mt-4 grid gap-3">{detail.coreCases.map(value => <div key={value.id}><dt className="text-xs text-muted-foreground">{value.purpose} case</dt><dd className="text-sm">{value.state} · Stage {value.coreApprovalStageId}</dd></div>)}</dl>
    </DetailSection>}
    {tab === "comments" && <DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments are not available for manual payment requests yet. Reasons appear in History.</p></DetailSection>}
    {tab === "history" && <div className="space-y-4"><DetailSection title="Request history"><ActivityTimeline items={detail.transitions.map(value => ({ id: value.id, title: value.action,
      detail: value.reason || `${value.fromStatus} → ${value.toStatus}`, date: value.occurredAt }))} /></DetailSection>
      <DetailSection title="Core review history"><ActivityTimeline items={detail.coreDecisions.map(value => ({ id: value.id,
        title: `${value.manualAction} · ${value.coreAction}`, detail: `Case decision ${value.coreApprovalDecisionId}`, date: value.decidedAt }))} /></DetailSection></div>}
    {action && <Modal title={action === "Record" ? "Record external payment" : `${action} payment request`} onClose={() => { if (!busy) setAction(null); }}>
      <div className="space-y-4">{action === "Record" ? <>
        <p className="text-sm">Approved amount: {request.currencyCode} {request.approvedAmountExact || "—"}. This records evidence; it does not execute a payment.</p>
        <Field label="External payment date *"><Input type="date" value={paidOn} onChange={event => setPaidOn(event.target.value)} /></Field>
        {detail.companyClock && <p className="text-xs text-muted-foreground">Company date: {detail.companyClock.date} ({detail.companyClock.timeZoneId}). The server checks its current company date when recording.</p>}
        <Field label="External method *"><Input maxLength={100} value={method} onChange={event => setMethod(event.target.value)} /></Field>
        <Field label="External reference *"><Input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></Field>
        <Button variant="secondary" disabled title={manualPaymentActionAvailability("payment-upload").reason}>Attach evidence unavailable</Button>
      </> : ["Return", "Reject", "Dispute", "Cancel"].includes(action) ? <Field label="Reason *"><Textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>
        : <p className="text-sm">The server checks the current assignment, invoice and Core approval case before applying this decision.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button disabled={writeBlocked || action === "Record" && (!request.approvedAmountExact || !paidOn || !method.trim() || !reference.trim())
          || ["Return", "Reject", "Dispute", "Cancel"].includes(action) && !reason.trim()} onClick={() => void execute()}>
          {busy ? "Saving…" : action === "Record" ? "Record evidence" : action === "Submit" ? "Submit for review" : action}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>Keep reviewing</Button></div>
      </div>
    </Modal>}
  </RecordDetailFrame>;
}
