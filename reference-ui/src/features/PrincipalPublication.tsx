import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { RfqDetailLayout } from "./RfqPresentation";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { readPublicationRecovery, writePublicationRecovery } from "../lib/rfq-publication-command-journal";
import { readRfqRecovery, writeRfqRecovery } from "../lib/rfq-command-journal";
import { pendingRfqCommands } from "../lib/rfq-command-memory";
import { cancelRfqCommand, recoverRfqCommand, rfqRecoveryReference, RfqExecutionError, sendRfqCommand,
  type RfqCommand, type RfqRecoveryReference } from "../../../src/platform/procurement-sourcing-execution-api";
import { PublicationApiError, decidePublicationReview, getPublication, listAssignedPublicationReviews,
  openPublicationReview, recoverPublicationCommand, searchPublicationSuppliers,
  type PublicationCommand, type PublicationDetail, type SupplierChoice } from "../../../src/platform/procurement-sourcing-publication-api";

const explain = (error: unknown) => error instanceof Error ? error.message : "The RFQ action could not be confirmed.";
const detailLink = (id: string) => `/rfqs/${id}?source=principal-approved`;

/** Assigned reviews share the original RFQ list; no parallel workflow page. */
export function PrincipalAssignedReviews({ company }: { company: string }) {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof listAssignedPublicationReviews>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    listAssignedPublicationReviews(company, page, controller.signal)
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); });
    return () => controller.abort();
  }, [company, page, revision]);
  return <Panel title="Publication reviews assigned to me" className="mt-5"><div className="space-y-3 p-5">
    <div className="flex justify-end"><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Refresh assignments</Button></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading assigned reviews…</p>
      : !data.items.length ? <EmptyState title="No publication review is assigned here" description="Assigned RFQs for your current company and branch appear here." />
        : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Quote request</th><th>State</th><th>Action</th></tr></thead><tbody>{data.items.map(row =>
          <tr key={row.caseId}><td>{row.state === "VerifiedAssignedReview" ? <><span className="font-semibold">{row.number}</span><span className="block text-sm text-muted-foreground">{row.title}</span></> : "Needs review"}</td>
            <td><Badge>{row.state === "VerifiedAssignedReview" ? "Pending review" : "Unavailable"}</Badge></td>
            <td>{row.state === "VerifiedAssignedReview" ? <Link className="text-primary" to={detailLink(row.eventId)}>Review RFQ</Link> : "Ask Procurement to reconcile"}</td></tr>)}</tbody></RecordTable></div>}
    {data && <div className="flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
  </div></Panel>;
}
function PendingResult({ value, busy, error, check }: { value: { key: string }; busy: boolean; error: string; check: () => void }) {
  return <Panel title="Check the saved result"><div className="space-y-3 p-5"><p role="alert">{error || "The last save has not been confirmed. Check its original reference before another action."}</p>
    <p className="break-all text-sm text-muted-foreground">Save reference: {value.key}</p>
    <Button variant="secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check saved result"}</Button>
    <p className="text-sm text-muted-foreground">This reads the recorded result. It does not repeat the save or contact a supplier.</p></div></Panel>;
}
export function PrincipalPublicationDetail({ id }: { id: string }) {
  const readiness = useLiveReadiness(); const { selection, authEpoch } = useErpShell();
  if (!readiness) throw new Error("Select an ERP company before opening this RFQ.");
  const identity = [readiness.tenantId, readiness.legalEntityId, readiness.principalId, selection.branch ?? "", id];
  return <PublicationRecord key={JSON.stringify([authEpoch, ...identity])} id={id} company={readiness.legalEntityId}
    permissions={readiness.permissions} newWorkEnabled={readiness.capabilities.principalSourcingPublication === true}
    slot={JSON.stringify(identity)}
    cancelSlot={JSON.stringify([readiness.tenantId, readiness.legalEntityId, readiness.principalId,
      selection.branch ?? "", `Cancel:${id}`, "principal"])} />;
}
function PublicationRecord({ id, company, permissions, newWorkEnabled, slot, cancelSlot }: {
  id: string; company: string; permissions: string[]; newWorkEnabled: boolean; slot: string; cancelSlot: string;
}) {
  const [record, setRecord] = useState<PublicationDetail | null>(null), [loadError, setLoadError] = useState("");
  const [error, setError] = useState(""), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const running = useRef(false), live = useRef(true), searchGeneration = useRef(0);
  const [initial] = useState(() => { try { return { value: readPublicationRecovery(slot), error: "" }; }
    catch (cause) { return { value: null, error: explain(cause) }; } });
  const [pending, setPending] = useState<PublicationCommand | null>(initial.value);
  const [cancelInitial] = useState(() => { try { return { value: readRfqRecovery(cancelSlot), error: "" }; }
    catch (cause) { return { value: null, error: explain(cause) }; } });
  const [cancelPending, setCancelPending] = useState<RfqRecoveryReference | null>(cancelInitial.value);
  const [supplierSearch, setSupplierSearch] = useState(""), [supplierPage, setSupplierPage] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]), [supplierTotal, setSupplierTotal] = useState(0);
  const [selected, setSelected] = useState<SupplierChoice[]>([]), [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setRecord(null); setLoadError("");
    getPublication(company, id, controller.signal).then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(cause => { if (!controller.signal.aborted) setLoadError(explain(cause)); });
    return () => controller.abort();
  }, [company, id, revision]);
  const canSubmit = newWorkEnabled && permissions.includes("procurement-sourcing-submit");
  const canReview = newWorkEnabled && permissions.includes("procurement-sourcing-publish");
  const blocked = busy || pending !== null || cancelPending !== null || Boolean(initial.error || cancelInitial.error);
  function store(value: PublicationCommand | null) { writePublicationRecovery(slot, value); if (live.current) setPending(value); }
  async function perform(reference: PublicationCommand, execute: () => Promise<unknown>) {
    if (blocked || running.current) return;
    try { store(reference); } catch (cause) { setError(explain(cause)); return; }
    running.current = true; setBusy(true); setError("");
    try { await execute(); store(null); if (live.current) { searchGeneration.current++; setSelected([]); setSuppliers([]);
      setRecord(null); setRevision(value => value + 1); } }
    catch (cause) {
      if (cause instanceof PublicationApiError && (cause.status === 400 || cause.status === 422)) {
        try { store(null); } catch (storageError) { setError(explain(storageError)); return; }
      }
      if (live.current) setError(explain(cause));
    } finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || running.current) return;
    running.current = true; setBusy(true); setError("");
    try { await recoverPublicationCommand(company, pending); store(null);
      if (live.current) { searchGeneration.current++; setSelected([]); setSuppliers([]);
        setRecord(null); setRevision(value => value + 1); } }
    catch (cause) { if (live.current) setError(explain(cause)); }
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
    catch (cause) { setError(explain(cause)); return; }
    running.current = true; setBusy(true); setError("");
    try { await sendRfqCommand(company, command); storeCancellation(null);
      if (live.current) { setRecord(null); setRevision(value => value + 1); } }
    catch (cause) {
      if (cause instanceof RfqExecutionError && (cause.status === 400 || cause.status === 422)) {
        try { storeCancellation(null); } catch (storageError) { setError(explain(storageError)); return; }
      }
      if (live.current) setError(explain(cause));
    } finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function recoverCancellation() {
    if (!cancelPending || running.current) return;
    running.current = true; setBusy(true); setError("");
    try { await recoverRfqCommand(company, cancelPending); storeCancellation(null);
      if (live.current) { setRecord(null); setRevision(value => value + 1); } }
    catch (cause) { if (live.current) setError(explain(cause)); }
    finally { running.current = false; if (live.current) setBusy(false); }
  }
  async function searchSuppliers(page = supplierPage) {
    if (!record || record.status !== "Draft" || !canSubmit || blocked) return;
    const generation = ++searchGeneration.current;
    setError("");
    try { const found = await searchPublicationSuppliers(company, id, supplierSearch, page);
      if (live.current && generation === searchGeneration.current) { setSuppliers(found.items); setSupplierTotal(found.total); } }
    catch (cause) { if (live.current && generation === searchGeneration.current) setError(explain(cause)); }
  }
  if (initial.error || cancelInitial.error) return <div className="p-5 sm:p-8" role="alert">{initial.error || cancelInitial.error}</div>;
  if (!record) return <div className="p-5 sm:p-8">{loadError ? <p role="alert">{loadError}</p> : <p role="status">Loading quote request…</p>}
    {pending && <PendingResult value={pending} busy={busy} error={error} check={() => void recover()} />}
    {cancelPending && <PendingResult value={cancelPending} busy={busy} error={error} check={() => void recoverCancellation()} />}</div>;
  const assignment = record.publication?.assignments.find(value => value.state === "Pending");
  return <RfqDetailLayout title={record.title} number={record.number} method={record.method} currency={record.currencyCode}
    status={record.status} back="/rfqs?source=principal-approved"
    actions={<Button variant="secondary" disabled title="Supplier delivery is a later controlled step">Send to suppliers</Button>}
    itemCount={record.lines.length} items={<div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Approved estimate</th><th>Source balance</th></tr></thead><tbody>{record.lines.map(line =>
      <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitCode}</td><td>{record.currencyCode} {line.approvedUnitEstimate}</td>
        <td>{line.allocationState === "Reserved" ? "Held for this RFQ" : "Released"}</td></tr>)}</tbody></RecordTable></div>}
    overview={<div className="space-y-5">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {pending && <PendingResult value={pending} busy={busy} error={error} check={() => void recover()} />}
      {cancelPending && <PendingResult value={cancelPending} busy={busy} error={error} check={() => void recoverCancellation()} />}
      <div className="grid gap-5 lg:grid-cols-3"><DetailSection title="Quote details" className="lg:col-span-2"><dl className="grid gap-4 sm:grid-cols-2">
        <DetailValue label="Reference" value={record.number} /><DetailValue label="Method" value={record.method} />
        <DetailValue label="Currency" value={record.currencyCode} /><DetailValue label="Status" value={record.status} />
      </dl></DetailSection><DetailSection title="Source"><p className="text-sm text-muted-foreground">Approved request quantities stay reserved during review and after internal publication.</p></DetailSection></div>
      {record.status === "Draft" && permissions.includes("procurement-sourcing-cancel") && <Panel title="Cancel this internal draft"><div className="space-y-3 p-5">
        <Field label="Reason"><Textarea value={cancelReason} maxLength={2000} onChange={event => setCancelReason(event.target.value)} /></Field>
        <Button variant="danger" disabled={blocked || !cancelReason.trim()} onClick={() => void cancelDraft()}>Cancel draft and release its quantities</Button>
      </div></Panel>}
      {record.status === "Draft" && canSubmit && <Panel title="Bidding preferences · approved suppliers"><div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">Select approved suppliers for an independent internal review. This does not contact them.</p>
        <div className="flex flex-wrap items-end gap-3"><Field label="Find an approved supplier" className="min-w-60 flex-1"><Input value={supplierSearch} maxLength={100}
          onChange={event => { searchGeneration.current++; setSupplierSearch(event.target.value); setSupplierPage(1); setSuppliers([]); }} /></Field>
          <Button variant="secondary" disabled={blocked || supplierSearch.trim().length < 2} onClick={() => void searchSuppliers()}>Search suppliers</Button></div>
        {suppliers.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Supplier</th><th>Reference</th><th>Action</th></tr></thead><tbody>{suppliers.map(supplier =>
          <tr key={supplier.supplierId}><td>{supplier.displayName}</td><td>{supplier.number}</td><td><Button variant="secondary"
            disabled={blocked || selected.length >= 100 || selected.some(value => value.supplierId === supplier.supplierId)}
            onClick={() => setSelected(value => [...value, supplier])}>Add</Button></td></tr>)}</tbody></RecordTable></div>}
        {supplierTotal > 25 && <div className="flex items-center gap-3 text-sm"><Button variant="secondary" disabled={supplierPage <= 1 || blocked}
          onClick={() => { const next = supplierPage - 1; setSupplierPage(next); void searchSuppliers(next); }}>Previous</Button>
          <span>Page {supplierPage}</span><Button variant="secondary" disabled={supplierPage * 25 >= supplierTotal || blocked}
            onClick={() => { const next = supplierPage + 1; setSupplierPage(next); void searchSuppliers(next); }}>Next</Button></div>}
        <p className="text-sm">Selected {selected.length} of 100: {selected.length ? selected.map(value => value.displayName).join(", ") : "None"}</p>
        {selected.map(value => <Button key={value.supplierId} variant="ghost" disabled={blocked}
          onClick={() => setSelected(current => current.filter(item => item.supplierId !== value.supplierId))}>Remove {value.displayName}</Button>)}
        <Button disabled={blocked || !selected.length} onClick={() => {
          const key = crypto.randomUUID(); void perform({ action: "open", key, eventId: id },
            () => openPublicationReview(company, record, selected.map(value => value.supplierId), key));
        }}>Send RFQ for review</Button>
      </div></Panel>}
      {record.status === "PublicationReview" && <Panel title="Independent publication review"><div className="space-y-3 p-5">
        <p className="text-sm">Core case {record.publication?.coreCaseId} · Policy version {record.publication?.policyVersionNumber}. Supplier delivery has not started.</p>
        {canReview && record.publication?.reviewer && assignment ? <><Field label="Reason for return or rejection"><Textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">{(["Approve", "Return", "Reject"] as const).map(action => <Button key={action}
            variant={action === "Approve" ? "primary" : "secondary"} disabled={blocked || action !== "Approve" && !reason.trim()}
            onClick={() => { const key = crypto.randomUUID(); void perform({ action: "decide", key, eventId: id, targetId: assignment.id },
              () => decidePublicationReview(company, record, assignment, action, reason, key)); }}>{action}</Button>)}</div></>
          : <p className="text-sm text-muted-foreground">Waiting for the assigned independent reviewer.</p>}
      </div></Panel>}
      {record.status === "Published" && <Panel title="Internal publication"><div className="space-y-2 p-5"><p>Approved for internal RFQ publication and ready for manual delivery.</p>
        <p className="text-sm text-muted-foreground">No email, portal invitation, supplier bid or award was created by this approval.</p></div></Panel>}
      {record.status === "Cancelled" && record.cancellationReason && <Panel title="Cancellation reason"><p className="p-5">{record.cancellationReason}</p></Panel>}
    </div>}
    related={<div className="space-y-5"><DetailSection title="Approved purchase requests"><ul className="space-y-1 text-sm">{[...new Set(record.lines.map(line => line.purchaseRequestId))].map(sourceId =>
      <li key={sourceId}>{permissions.includes("procurement-request-read") ? <Link className="text-primary underline" to={`/requests/${sourceId}`}>{sourceId}</Link> : sourceId}</li>)}</ul></DetailSection>
      {record.status === "Published" && <DetailSection title="Shortlisted suppliers"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Supplier ID</th><th>Internal state</th></tr></thead><tbody>{record.invitations.map(invitation =>
        <tr key={invitation.id}><td className="break-all">{invitation.supplierId}</td><td><Badge>Ready for manual delivery</Badge></td></tr>)}</tbody></RecordTable></div></DetailSection>}
    </div>}
    activity={<DetailSection title="Verified workflow state"><p className="text-sm">{record.status === "Published" ? "Internal publication approved." : record.status === "PublicationReview" ? "Core publication review is pending." : "No active publication decision."}</p>
      {record.publication && <p className="mt-2 break-all text-xs text-muted-foreground">Core case {record.publication.coreCaseId} · Policy version {record.publication.policyVersionNumber}</p>}
      <p className="mt-2 text-sm text-muted-foreground">Detailed decision comments and supplier messages are not exposed by this view.</p></DetailSection>}
  />;
}
