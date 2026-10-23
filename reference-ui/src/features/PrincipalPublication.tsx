import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { RfqDetailLayout } from "./RfqPresentation";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { readPublicationRecovery, writePublicationRecovery, type PublicationRecovery } from "../lib/rfq-publication-command-journal";
import { readRfqRecovery, writeRfqRecovery } from "../lib/rfq-command-journal";
import { pendingRfqCommands } from "../lib/rfq-command-memory";
import { cancelRfqCommand, recoverRfqCommand, rfqRecoveryReference, RfqExecutionError, sendRfqCommand,
  type RfqCommand, type RfqRecoveryReference } from "../../../src/platform/procurement-sourcing-execution-api";
import {
  PublicationApiError, cancelManualQuote, createManualQuote, decidePublicationReview,
  getManualQuote, getPublication, listAssignedPublicationReviews, listManualQuotes,
  openPublicationReview, recordManualContact, recoverPublicationCommand,
  reviseManualQuote, searchPublicationSuppliers, quoteInput,
  type PublicationDetail, type PublicationInvitation, type QuoteDraft, type QuoteLineInput,
  type SupplierChoice,
} from "../../../src/platform/procurement-sourcing-publication-api";

const explain = (error: unknown) => error instanceof Error ? error.message : "The quote action could not be confirmed.";
const detailLink = (id: string) => `/rfqs/${id}?source=principal-approved`;

/** Same RFQ list shell: only real current Core assignments are displayed. */
export function PrincipalAssignedReviews({ company }: { company: string }) {
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof listAssignedPublicationReviews>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    listAssignedPublicationReviews(company, page, controller.signal)
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); });
    return () => controller.abort();
  }, [company, page, refresh]);
  return <Panel title="Publication reviews assigned to me" className="mt-5"><div className="space-y-3 p-5">
    <div className="flex justify-end"><Button type="button" variant="secondary" onClick={() => setRefresh(value => value + 1)}>Refresh assignments</Button></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading assigned reviews…</p>
      : data.items.length === 0 ? <EmptyState title="No publication review is assigned here" description="Assigned RFQs for your current company and branch appear here." />
        : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Quote request</th><th>State</th><th>Action</th></tr></thead><tbody>{data.items.map(row =>
          <tr key={row.caseId}><td>{row.state === "VerifiedAssignedReview" ? <><span className="font-semibold">{row.number}</span><span className="block text-sm text-muted-foreground">{row.title}</span></> : "Needs review"}</td>
            <td><Badge>{row.state === "VerifiedAssignedReview" ? "Pending review" : "Unavailable"}</Badge></td>
            <td>{row.state === "VerifiedAssignedReview" ? <Link className="text-primary" to={detailLink(row.eventId)}>Review RFQ</Link> : <span className="text-muted-foreground">Ask Procurement to reconcile</span>}</td></tr>)}</tbody></RecordTable></div>}
    {data && <div className="flex items-center gap-3 text-sm"><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span>Page {page}</span><Button type="button" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
  </div></Panel>;
}

type Pending = PublicationRecovery | null;
function PendingResult({ value, busy, error, check }: { value: { key: string }; busy: boolean; error: string; check: () => void }) {
  return <Panel title="Check the saved result"><div className="space-y-3 p-5"><p role="alert">{error || "The last save has not been confirmed. Check its original reference before another action."}</p>
    <p className="break-all text-sm text-muted-foreground">Save reference: {value.key}</p>
    <Button type="button" variant="secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check saved result"}</Button>
    <p className="text-sm text-muted-foreground">This reads the recorded result. It does not repeat the save or contact a supplier.</p>
  </div></Panel>;
}

export function PrincipalPublicationDetail({ id }: { id: string }) {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Select an ERP company before opening this quote request.");
  return <PublicationRecord key={[readiness.tenantId, readiness.legalEntityId,
    readiness.principalId, selection.branch ?? "", id].join(":")}
    id={id} company={readiness.legalEntityId} permissions={readiness.permissions}
    slot={JSON.stringify([readiness.tenantId, readiness.legalEntityId,
      selection.branch ?? "", readiness.principalId, id])}
    cancelSlot={JSON.stringify([readiness.tenantId, readiness.legalEntityId,
      readiness.principalId, selection.branch ?? "", `Cancel:${id}`, "principal"])} />;
}

function PublicationRecord({ id, company, permissions, slot, cancelSlot }: {
  id: string; company: string; permissions: string[]; slot: string; cancelSlot: string;
}) {
  const [record, setRecord] = useState<PublicationDetail | null>(null);
  const [loadError, setLoadError] = useState(""), [actionError, setActionError] = useState("");
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  const running = useRef(false), live = useRef(true);
  const [journal] = useState(() => { try { return { value: readPublicationRecovery(slot), error: "" }; }
    catch (error) { return { value: null, error: explain(error) }; } });
  const [pending, setPending] = useState<Pending>(journal.value);
  const [cancelJournal] = useState(() => { try { return { value: readRfqRecovery(cancelSlot), error: "" }; }
    catch (error) { return { value: null, error: explain(error) }; } });
  const [cancelPending, setCancelPending] = useState<RfqRecoveryReference | null>(cancelJournal.value);
  const [cancelReason, setCancelReason] = useState("");
  const [supplierSearch, setSupplierSearch] = useState(""), [supplierPage, setSupplierPage] = useState(1);
  const [supplierResults, setSupplierResults] = useState<SupplierChoice[]>([]), [supplierTotal, setSupplierTotal] = useState(0);
  const [selected, setSelected] = useState<SupplierChoice[]>([]), [reason, setReason] = useState("");
  const [channel, setChannel] = useState(""), [contactRef, setContactRef] = useState(""), [reportedAt, setReportedAt] = useState("");
  const [contactInvitation, setContactInvitation] = useState<PublicationInvitation | null>(null);
  const [quoteRows, setQuoteRows] = useState<Awaited<ReturnType<typeof listManualQuotes>>["items"]>([]);
  const [quoteCursor, setQuoteCursor] = useState<number | null>(null);
  const [quote, setQuote] = useState<QuoteDraft | null>(null), [quoteInvitation, setQuoteInvitation] = useState<string | null>(null);
  const [quoteLines, setQuoteLines] = useState<QuoteLineInput[]>([]), [quoteError, setQuoteError] = useState("");
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setRecord(null); setLoadError("");
    getPublication(company, id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(explain(error)); });
    return () => controller.abort();
  }, [company, id, refresh]);
  useEffect(() => {
    if (record?.status !== "Published" || !permissions.includes("procurement-sourcing-submit")) return;
    const controller = new AbortController();
    listManualQuotes(company, id, 0, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setQuoteRows(value.items); setQuoteCursor(value.nextCursor); } })
      .catch(error => { if (!controller.signal.aborted) setQuoteError(explain(error)); });
    return () => controller.abort();
  }, [company, id, record?.status, refresh, permissions]);
  const canSubmit = permissions.includes("procurement-sourcing-submit");
  const canReview = permissions.includes("procurement-sourcing-publish");
  const blocked = busy || pending !== null || cancelPending !== null || Boolean(journal.error || cancelJournal.error);
  function store(value: Pending) {
    writePublicationRecovery(slot, value);
    if (live.current) setPending(value);
  }
  async function perform(reference: PublicationRecovery, execute: (key: string) => Promise<unknown>) {
    if (blocked || running.current) return;
    try { store(reference); } catch (error) { setActionError(explain(error)); return; }
    running.current = true; setBusy(true); setActionError("");
    try {
      await execute(reference.key); store(null);
      if (live.current) { setRefresh(value => value + 1); setQuote(null); setQuoteInvitation(null); }
    } catch (error) {
      if (error instanceof PublicationApiError && (error.status === 400 || error.status === 422)) {
        try { store(null); } catch (storageError) { setActionError(explain(storageError)); return; }
      }
      if (live.current) setActionError(explain(error));
    } finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || running.current) return;
    running.current = true; setBusy(true); setActionError("");
    try {
      await recoverPublicationCommand(company, pending);
      store(null); if (live.current) setRefresh(value => value + 1);
    } catch (error) { if (live.current) setActionError(explain(error)); }
    finally { running.current = false; if (live.current) setBusy(false); }
  }
  function storeCancellation(command: RfqCommand | null) {
    const reference = command ? rfqRecoveryReference(command) : null;
    writeRfqRecovery(cancelSlot, reference);
    if (command) pendingRfqCommands.set(cancelSlot, command); else pendingRfqCommands.delete(cancelSlot);
    if (live.current) setCancelPending(reference);
  }
  async function cancelDraft() {
    if (!record || record.status !== "Draft" || blocked || running.current) return;
    let command: RfqCommand;
    try { command = cancelRfqCommand({ ...record, status: "Draft", cancellationReason: record.cancellationReason ?? null },
      cancelReason, crypto.randomUUID(), "principal"); storeCancellation(command); }
    catch (error) { setActionError(explain(error)); return; }
    running.current = true; setBusy(true); setActionError("");
    try { await sendRfqCommand(company, command); storeCancellation(null); if (live.current) setRefresh(value => value + 1); }
    catch (error) {
      if (error instanceof RfqExecutionError && (error.status === 400 || error.status === 422)) {
        try { storeCancellation(null); } catch (failure) { setActionError(explain(failure)); return; }
      }
      if (live.current) setActionError(explain(error));
    } finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function recoverCancellation() {
    if (!cancelPending || running.current) return;
    running.current = true; setBusy(true); setActionError("");
    try { await recoverRfqCommand(company, cancelPending); storeCancellation(null); if (live.current) setRefresh(value => value + 1); }
    catch (error) { if (live.current) setActionError(explain(error)); }
    finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function searchSuppliers() {
    if (!record || record.status !== "Draft" || !canSubmit || supplierSearch.trim().length < 2) return;
    setActionError("");
    try { const found = await searchPublicationSuppliers(company, id, supplierSearch, supplierPage);
      if (live.current) { setSupplierResults(found.items); setSupplierTotal(found.total); } }
    catch (error) { if (live.current) setActionError(explain(error)); }
  }
  const submittedSuppliers = useMemo(() => selected.map(x => x.supplierId), [selected]);
  function startQuote(invitation: PublicationInvitation) {
    if (!record || blocked) return;
    setQuote(null); setQuoteInvitation(invitation.id); setQuoteError("");
    setQuoteLines(record.lines.map(line => ({ sourcingLineId: line.id, quantity: line.quantity,
      unitPrice: "", taxAmount: "0", deliveryAmount: "0", leadTimeText: "", notes: "" })));
  }
  async function openQuote(bidId: string) {
    if (blocked) return;
    setQuoteError("");
    try { const found = await getManualQuote(company, id, bidId);
      if (live.current) { setQuote(found); setQuoteInvitation(found.invitationId); setQuoteLines(found.lines); } }
    catch (error) { if (live.current) setQuoteError(explain(error)); }
  }
  function saveContact() {
    const invitation = contactInvitation;
    if (!invitation || !reportedAt || !Number.isFinite(Date.parse(reportedAt))) {
      setActionError("Enter a valid contact date and time."); return;
    }
    const observed = new Date(reportedAt).toISOString();
    void perform({ type: "contact", action: "contact", key: crypto.randomUUID(), eventId: id,
      targetId: invitation.id }, key => recordManualContact(company, id, invitation,
      channel, contactRef, observed, key));
  }
  function saveQuote() {
    const invitationId = quoteInvitation, current = quote;
    if (!invitationId) return;
    try { quoteInput(quoteLines); } catch (error) { setQuoteError(explain(error)); return; }
    setQuoteError("");
    void perform({ type: "quote", action: current ? "quote-revise" : "quote-create",
      key: crypto.randomUUID(), eventId: id, ...(current ? { targetId: current.bidId } : {}) },
    key => current ? reviseManualQuote(company, current, quoteLines, key)
      : createManualQuote(company, id, invitationId, quoteLines, key));
  }
  function cancelQuote() {
    const current = quote;
    if (!current || current.status !== "Draft") return;
    void perform({ type: "quote", action: "quote-cancel", key: crypto.randomUUID(), eventId: id,
      targetId: current.bidId }, key => cancelManualQuote(company, current, key));
  }
  if (journal.error || cancelJournal.error) return <div className="p-5 sm:p-8"><p role="alert">{journal.error || cancelJournal.error}</p></div>;
  if (!record) return <div className="p-5 sm:p-8">{loadError ? <p role="alert">{loadError}</p> : <p role="status">Loading quote request…</p>}
    {pending && <PendingResult value={pending} busy={busy} error={actionError} check={() => void recover()} />}</div>;
  const activeAssignment = record.publication?.assignments.find(x => x.state === "Pending");
  return <RfqDetailLayout title={record.title} number={record.number} method={record.method}
    currency={record.currencyCode} status={record.status} back="/rfqs?source=principal-approved"
    actions={<Button variant="secondary" disabled title={record.status === "Draft"
      ? "Choose approved suppliers and request independent publication review below"
      : "Supplier dispatch and award are not available"}>{record.status === "Draft" ? "Publish" : "Send to suppliers"}</Button>}
    relatedFootnote="Purchase orders, supplier submissions, evaluation and awards are not available yet."
    itemCount={record.lines.length}
    items={<div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Approved estimate</th><th>Source balance</th></tr></thead><tbody>{record.lines.map(line =>
      <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitCode}</td>
        <td>{record.currencyCode} {line.approvedUnitEstimate}</td><td>{line.allocationState === "Reserved" ? "Held for this RFQ" : "Released"}</td></tr>)}</tbody></RecordTable></div>}
    overview={<div className="space-y-5">
      {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
      {pending && <PendingResult value={pending} busy={busy} error={actionError} check={() => void recover()} />}
      {cancelPending && <PendingResult value={cancelPending} busy={busy} error={actionError} check={() => void recoverCancellation()} />}
      <div className="grid gap-5 lg:grid-cols-3"><DetailSection title="Quote details" className="lg:col-span-2"><dl className="grid gap-4 sm:grid-cols-2">
        <DetailValue label="Reference" value={record.number} /><DetailValue label="Method" value={record.method} />
        <DetailValue label="Currency" value={record.currencyCode} /><DetailValue label="Status" value={record.status} />
      </dl></DetailSection><DetailSection title="Source"><p className="text-sm text-muted-foreground">These approved request quantities remain reserved while publication is reviewed and after internal publication.</p></DetailSection></div>
      {record.status === "Draft" && permissions.includes("procurement-sourcing-cancel") && <Panel title="Cancel this internal draft"><div className="space-y-3 p-5">
        <Field label="Reason"><Textarea value={cancelReason} maxLength={2000} onChange={event => setCancelReason(event.target.value)} /></Field>
        <Button type="button" variant="danger" disabled={blocked || !cancelReason.trim()} onClick={() => void cancelDraft()}>Cancel draft and release its quantities</Button>
      </div></Panel>}
      {record.status === "Draft" && canSubmit && <Panel title="Bidding preferences · approved suppliers"><div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">Select suppliers for an independent publication review. Opening a review does not contact them.</p>
        <div className="flex flex-wrap items-end gap-3"><Field label="Find an approved supplier" className="min-w-60 flex-1"><Input value={supplierSearch} maxLength={100}
          onChange={event => { setSupplierSearch(event.target.value); setSupplierPage(1); setSupplierResults([]); }} /></Field>
          <Button type="button" variant="secondary" disabled={blocked || supplierSearch.trim().length < 2} onClick={() => void searchSuppliers()}>Search suppliers</Button></div>
        {supplierResults.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Supplier</th><th>Reference</th><th>Action</th></tr></thead><tbody>{supplierResults.map(supplier =>
          <tr key={supplier.supplierId}><td>{supplier.displayName}</td><td>{supplier.number}</td><td><Button type="button" variant="secondary"
            disabled={blocked || selected.length >= 100 || selected.some(x => x.supplierId === supplier.supplierId)} onClick={() => setSelected(value => [...value, supplier])}>Add</Button></td></tr>)}</tbody></RecordTable></div>}
        {supplierTotal > 25 && <div className="flex items-center gap-3 text-sm"><Button variant="secondary" disabled={supplierPage <= 1 || blocked} onClick={() => setSupplierPage(value => value - 1)}>Previous</Button><span>Page {supplierPage}</span>
          <Button variant="secondary" disabled={supplierPage * 25 >= supplierTotal || blocked} onClick={() => setSupplierPage(value => value + 1)}>Next</Button></div>}
        <p className="text-sm">Selected {selected.length} of 100: {selected.length ? selected.map(x => x.displayName).join(", ") : "None"}</p>
        {selected.map(supplier => <Button key={supplier.supplierId} type="button" variant="ghost" disabled={blocked}
          onClick={() => setSelected(value => value.filter(x => x.supplierId !== supplier.supplierId))}>Remove {supplier.displayName}</Button>)}
        <Button disabled={blocked || !selected.length} onClick={() => void perform({ type: "publication", action: "open", key: crypto.randomUUID(), eventId: id },
          key => openPublicationReview(company, record, submittedSuppliers, key))}>Request publication review</Button>
      </div></Panel>}
      {record.status === "PublicationReview" && <Panel title="Independent publication review"><div className="space-y-3 p-5">
        <p className="text-sm">Core case {record.publication?.coreCaseId} · Policy version {record.publication?.policyVersionNumber}. Supplier delivery has not started.</p>
        {canReview && record.publication?.reviewer && activeAssignment ? <><Field label="Reason for return or rejection"><Textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">{(["Approve", "Return", "Reject"] as const).map(action => <Button key={action} type="button" variant={action === "Approve" ? "primary" : "secondary"}
            disabled={blocked || action !== "Approve" && !reason.trim()} onClick={() => void perform({ type: "publication", action: "decide", key: crypto.randomUUID(), eventId: id, targetId: activeAssignment.id },
              key => decidePublicationReview(company, record, activeAssignment, action, reason, key))}>{action}</Button>)}</div></>
          : <p className="text-sm text-muted-foreground">Waiting for the assigned independent reviewer.</p>}
      </div></Panel>}
      {record.status === "Published" && <Panel title="Internal publication"><div className="space-y-2 p-5"><p>Approved for internal RFQ publication. Supplier contact is recorded separately.</p>
        <p className="text-sm text-muted-foreground">No email, portal invitation, supplier bid or award was created by the approval.</p></div></Panel>}
      {record.status === "Cancelled" && record.cancellationReason && <Panel title="Cancellation reason"><p className="p-5">{record.cancellationReason}</p></Panel>}
    </div>}
    related={<div className="space-y-5">
      <DetailSection title="Approved purchase requests"><ul className="space-y-1 text-sm">{[...new Set(record.lines.map(line => line.purchaseRequestId))].map(sourceId =>
        <li key={sourceId}>{permissions.includes("procurement-request-read") ? <Link className="text-primary underline" to={`/requests/${sourceId}`}>{sourceId}</Link> : sourceId}</li>)}</ul></DetailSection>
      {record.status === "Published" && <><DetailSection title="Shortlisted suppliers"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Supplier ID</th><th>Contact state</th><th>Action</th></tr></thead><tbody>{record.invitations.map(invitation =>
        <tr key={invitation.id}><td className="break-all">{invitation.supplierId}</td><td><Badge>{invitation.status === "ReadyForManualDelivery" ? "Ready for manual contact" : "Manual contact recorded"}</Badge></td>
          <td>{invitation.status === "ReadyForManualDelivery" && canSubmit ? <Button type="button" variant="secondary" disabled={blocked}
            onClick={() => { setContactInvitation(invitation); setQuoteInvitation(null); }}>Record manual contact</Button>
            : invitation.status === "ManualContactRecorded" && canSubmit ? (() => {
              const existing = quoteRows.find(row => row.invitationId === invitation.id && row.status === "Draft");
              return <Button type="button" variant="secondary" disabled={blocked} onClick={() => existing ? void openQuote(existing.bidId) : startQuote(invitation)}>{existing ? "Open quotation Draft" : "Enter quotation Draft"}</Button>;
            })() : "—"}</td></tr>)}</tbody></RecordTable></div></DetailSection>
        {contactInvitation && <Panel title="Record external supplier contact"><div className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Record a contact that happened outside ERP. This action sends nothing.</p>
          <Field label="Channel"><Select value={channel} onChange={event => setChannel(event.target.value)}><option value="">Choose channel</option><option value="EmailOutsideSystem">Email outside ERP</option><option value="Physical">Physical delivery</option><option value="Telephone">Telephone</option><option value="Other">Other</option></Select></Field>
          <Field label="External reference"><Input value={contactRef} maxLength={200} onChange={event => setContactRef(event.target.value)} /></Field>
          <Field label="When contact occurred (your local time)"><Input type="datetime-local" value={reportedAt} onChange={event => setReportedAt(event.target.value)} /></Field>
          <div className="flex gap-2"><Button type="button" disabled={blocked || !channel || !contactRef.trim() || !reportedAt}
            onClick={saveContact}>Record contact</Button>
            <Button type="button" variant="secondary" disabled={blocked} onClick={() => setContactInvitation(null)}>Close</Button></div></div></Panel>}
        {canSubmit && <DetailSection title="Buyer-entered quotation Drafts"><div className="space-y-3">
          {quoteError && <p role="alert">{quoteError}</p>}
          {!quoteRows.length ? <p className="text-sm text-muted-foreground">No quotation Draft has been entered. A supplier submission has not been recorded.</p>
            : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Supplier ID</th><th>Draft state</th><th>Action</th></tr></thead><tbody>{quoteRows.map(row =>
              <tr key={row.bidId}><td className="break-all">{row.supplierId}</td><td><Badge>{row.status}</Badge></td><td><Button variant="secondary" disabled={blocked} onClick={() => void openQuote(row.bidId)}>Open Draft</Button></td></tr>)}</tbody></RecordTable></div>}
          {quoteCursor !== null && <Button variant="secondary" disabled={blocked} onClick={() => void listManualQuotes(company, id, quoteCursor).then(value => { setQuoteRows(current => [...current, ...value.items]); setQuoteCursor(value.nextCursor); }).catch(error => setQuoteError(explain(error)))}>More Drafts</Button>}
        </div></DetailSection>}
        {canSubmit && quoteInvitation && <Panel title={quote ? `Quotation Draft revision ${quote.draftRevision}` : "New buyer-entered quotation Draft"}><div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">This is an internal Draft. No supplier bid is submitted and no award is made.</p>
          {quoteLines.map((line, index) => <div key={line.sourcingLineId} className="rounded-xl border border-border p-4"><p className="mb-3 font-medium">{record.lines.find(x => x.id === line.sourcingLineId)?.description || "RFQ line"}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([ ["quantity", "Quantity"], ["unitPrice", "Unit price"], ["taxAmount", "Tax"], ["deliveryAmount", "Delivery"] ] as const).map(([field, label]) =>
              <Field key={field} label={label}><Input inputMode="decimal" value={line[field]} onChange={event => setQuoteLines(value => value.map((item, at) => at === index ? { ...item, [field]: event.target.value } : item))} /></Field>)}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Lead time"><Input value={line.leadTimeText ?? ""} maxLength={200} onChange={event => setQuoteLines(value => value.map((item, at) => at === index ? { ...item, leadTimeText: event.target.value } : item))} /></Field>
              <Field label="Notes"><Input value={line.notes ?? ""} maxLength={2000} onChange={event => setQuoteLines(value => value.map((item, at) => at === index ? { ...item, notes: event.target.value } : item))} /></Field></div></div>)}
          {quote && <p className="text-sm">Recorded total: {record.currencyCode} {quote.totalExact}</p>}
          <div className="flex flex-wrap gap-2"><Button disabled={blocked || quote?.status === "Cancelled"} onClick={saveQuote}>{quote ? "Save Draft revision" : "Create quotation Draft"}</Button>
            {quote?.status === "Draft" && <Button variant="danger" disabled={blocked} onClick={cancelQuote}>Cancel Draft</Button>}
            <Button variant="secondary" disabled={blocked} onClick={() => { setQuote(null); setQuoteInvitation(null); }}>Close</Button></div></div></Panel>}
      </>}
    </div>}
    activity={<DetailSection title="Verified workflow state"><p className="text-sm">{record.status === "Published" ? "Internal publication approved." : record.status === "PublicationReview" ? "Core publication review is pending." : "No publication decision is active."}</p>
      {record.publication && <p className="mt-2 break-all text-xs text-muted-foreground">Core case {record.publication.coreCaseId} · Policy version {record.publication.policyVersionNumber}</p>}
      <p className="mt-2 text-sm text-muted-foreground">Detailed decision comments and supplier messages are not exposed by this view yet.</p></DetailSection>}
  />;
}
