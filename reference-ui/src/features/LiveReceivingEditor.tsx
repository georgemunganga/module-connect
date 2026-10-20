import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Modal, PageHeader, Panel, Select, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { ReceivingUnavailableAction, receivingVendorContext } from "./ReceivingPresentation";
import { pendingReceivingCommands as pending } from "../lib/receiving-command-memory";
import { getReceipt, getService, listReceivingSources, receivingQuantity, recoverReceiving, ReceivingError, sendReceiving,
  type ReceiptDraft, type ReceivingCommand, type ReceivingSource, type ReceivingPage, type ServiceDraft } from "../../../src/platform/procurement-receiving-api";
const nowLocal = () => { const at = new Date(); return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 23); };
const localTime = (value: string) => { const at = new Date(value); return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 23); };
const message = (cause: unknown) => cause instanceof Error ? cause.message : "This draft could not be saved.";
const base = "/purchase-receives";
type Line = { id?: string; purchaseOrderLineId: string; description: string; unitCode: string; receivedQuantity: string; rejectedQuantity: string };
export function LiveReceivingEditor() {
  const { id } = useParams(), [search] = useSearchParams(), context = useLiveReadiness()!;
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  const kind = search.get("kind") === "service" ? "service" : "goods";
  const back = receivingVendorContext(search, context.permissions.includes("procurement-vendor-read"));
  return <ReceivingEditor backPath={back.path} returnQuery={back.query} key={`${context.legalEntityId}:${branch}:${context.workerId}:${id ?? "new"}:${kind}`} id={id} kind={kind} scopeKey={`${context.legalEntityId}:${branch}:${context.workerId}:${kind}:${id ?? "new"}`} />;
}
function ReceivingEditor({ id, kind, scopeKey, backPath, returnQuery }: { id?: string; kind: string; scopeKey: string; backPath: string; returnQuery: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId, service = kind === "service", navigate = useNavigate();
  const [sources, setSources] = useState<ReceivingPage<ReceivingSource> | null>(null), [page, setPage] = useState(1), [selected, setSelected] = useState<ReceivingSource[]>([]);
  const [lines, setLines] = useState<Line[]>([]), [orderId, setOrderId] = useState(""), [issuedId, setIssuedId] = useState(""), [site, setSite] = useState(""), [version, setVersion] = useState(0);
  const [receivedAt, setReceivedAt] = useState(nowLocal), [deliveryNote, setDeliveryNote] = useState(""), [notes, setNotes] = useState(""), [deliverable, setDeliverable] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [quantity, setQuantity] = useState("1");
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [editable, setEditable] = useState(!id), [denied, setDenied] = useState(false), [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false);
  const [uncertain, setUncertain] = useState<ReceivingCommand | null>(() => pending.get(scopeKey) ?? null), alive = useRef(false);
  const allowed = context.capabilities.receivingDrafts && context.permissions.includes("procurement-receipt-view") && context.permissions.includes(id ? "procurement-receipt-edit" : "procurement-receipt-create");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    if (!id) listReceivingSources(company, page, controller.signal).then((result) => { if (!controller.signal.aborted) setSources(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else if (service) getService(company, id, false, controller.signal).then((record) => {
      if (controller.signal.aborted) return;
      const canEdit = record.draftActionCandidates?.some((item) => item.action === "EditDraft" && item.candidate) && Object.hasOwn(record, "notes");
      setEditable(!!canEdit); if (!canEdit) return;
      setOrderId(record.sourcePurchaseOrderId!); setIssuedId(record.issuedBindingId); setVersion(record.version); setNotes(record.notes ?? "");
      setDeliverable(record.deliverableRef); setFrom(record.periodFrom); setTo(record.periodTo); setQuantity(record.intendedQuantity ?? "");
      setLines([{ purchaseOrderLineId: record.purchaseOrderLineId, description: record.labels?.description ?? record.deliverableRef, unitCode: record.labels?.unitCode ?? "", receivedQuantity: "0", rejectedQuantity: "0" }]);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else getReceipt(company, id, false, controller.signal).then((record) => {
      if (controller.signal.aborted) return; const canEdit = record.draftActionCandidates.some((item) => item.action === "EditDraft" && item.candidate);
      setEditable(canEdit); if (!canEdit) return;
      setOrderId(record.purchaseOrderId); setIssuedId(record.issuedVersionId!); setSite(record.siteRef!); setVersion(record.version); setNotes(record.notes ?? ""); setDeliveryNote(record.deliveryNoteRef ?? ""); setReceivedAt(localTime(record.receivedAt));
      setLines(record.lines.map((line) => { const labels = record.lineReadiness.find((item) => item.lineId === line.id)?.labels; return { id: line.id, purchaseOrderLineId: line.purchaseOrderLineId, description: labels?.description ?? "Retained order line", unitCode: labels?.unitCode ?? "", receivedQuantity: line.receivedQuantity, rejectedQuantity: line.initiallyRejectedQuantity }; }));
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, company, id, service, page]);
  const cancel = () => { if (dirty || uncertain) setDiscard(true); else navigate(id ? `${base}/${id}?kind=${kind}${returnQuery}` : backPath); };
  function choose(source: ReceivingSource, checked: boolean) {
    setDirty(true);
    const next = checked ? [...selected, source] : selected.filter((item) => item.purchaseOrderLineId !== source.purchaseOrderLineId);
    setSelected(next); setOrderId(next[0]?.orderId ?? ""); setIssuedId(next[0]?.issuedVersionId ?? ""); setSite(next[0]?.branchRef ?? "");
    setLines(next.map((item) => lines.find((line) => line.purchaseOrderLineId === item.purchaseOrderLineId) ?? { purchaseOrderLineId: item.purchaseOrderLineId, description: item.description!, unitCode: item.unitCode!, receivedQuantity: "1", rejectedQuantity: "0" }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!allowed || !editable || saving || uncertain || denied) return;
    let body: string;
    try {
      if (!orderId || !issuedId || !lines.length) throw new Error("Choose an issued order source first.");
      const draft: ReceiptDraft | ServiceDraft = service ? { purchaseOrderId: orderId, issuedVersionId: issuedId, purchaseOrderLineId: lines[0].purchaseOrderLineId, deliverableReference: deliverable.trim(), periodFrom: from, periodTo: to, quantity: receivingQuantity(quantity), notes: notes.trim() || null }
        : { purchaseOrderId: orderId, issuedVersionId: issuedId, siteId: site, receivedAt: new Date(receivedAt).toISOString(), deliveryNoteRef: deliveryNote.trim() || null, notes: notes.trim() || null,
          lines: lines.map(({ id: lineId, purchaseOrderLineId, receivedQuantity, rejectedQuantity }) => ({ ...(lineId ? { id: lineId } : {}), purchaseOrderLineId, receivedQuantity: receivingQuantity(receivedQuantity), rejectedQuantity: receivingQuantity(rejectedQuantity) })) };
      body = JSON.stringify(id ? { version, draft } : draft);
    } catch (cause) { setError(message(cause)); return; }
    const command: ReceivingCommand = { operation: service ? "ServiceDraft" : "ReceivingDraft", targetId: id ?? null, orderId, key: crypto.randomUUID(), method: id ? "PUT" : "POST", body };
    pending.set(scopeKey, command); setSaving(true); setError("");
    try { const result = await sendReceiving(company, command); pending.delete(scopeKey); if (alive.current) navigate(`${base}/${result.id}?kind=${kind}${returnQuery}`); }
    catch (cause) {
      const known = cause instanceof ReceivingError && cause.status > 0 && cause.status < 500;
      if (known) pending.delete(scopeKey);
      if (alive.current) { setError(message(cause)); if (!known) setUncertain(command); else if (cause.status === 403) setDenied(true); else if (id && cause.status === 409) setEditable(false); }
    } finally { if (alive.current) setSaving(false); }
  }
  async function recover() {
    if (!uncertain || saving) return; setSaving(true); setError("");
    try { const result = await recoverReceiving(company, uncertain); pending.delete(scopeKey); if (alive.current) navigate(`${base}/${result.id}?kind=${kind}${returnQuery}`); }
    catch (cause) { if (alive.current) setError(message(cause)); }
    finally { if (alive.current) setSaving(false); }
  }
  return <div className="p-5 sm:p-8"><PageHeader title={id ? "Edit delivery draft" : "Add delivery"} subtitle="Start with an issued order and retain what was actually delivered." actions={<Button variant="ghost" aria-label="Close editor" disabled={saving} onClick={cancel}>Close</Button>} />
    {!allowed ? <p role="alert">You do not have access to save delivery drafts.</p> : <>
      {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}
      {uncertain && <Panel title="Check the saved draft"><div className="space-y-3 p-5"><p>The response was interrupted. Check this original command before saving another draft.</p><p className="break-all text-sm">{uncertain.key}</p><Button disabled={saving} onClick={recover}>Check saved draft</Button></div></Panel>}
      {loading ? <p role="status">Loading issued sources…</p> : !editable ? <p role="alert">This draft needs a fresh review before editing. Open its current details.</p> : <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-5"><fieldset disabled={saving || !!uncertain || denied} className="space-y-5">
        {!id && <Panel title="Issued order source"><div className="space-y-4 p-5"><Field label="Delivery type"><Select value={kind} onChange={(event) => navigate(`${base}/new?kind=${event.target.value}${returnQuery}`)}><option value="goods">Goods delivery</option><option value="service">Service completion</option></Select></Field>
          <RecordTable><thead><tr><th>Select</th><th>Order</th><th>Description</th><th>Ordered quantity</th><th>Source review</th></tr></thead><tbody>{sources?.items.map((source) => { const checked = selected.some((item) => item.purchaseOrderLineId === source.purchaseOrderLineId), unavailable = !!source.blocker || source.kind !== (service ? "Service" : "Goods") || !source.branchRef || !!selected.length && !checked && (service || source.orderId !== orderId || source.issuedVersionId !== issuedId); return <tr key={`${source.issuedVersionId}:${source.purchaseOrderLineId}`}><td><Switch aria-label={`Select ${source.orderNumber} ${source.description ?? "source"}`} checked={checked} disabled={unavailable} onChange={(event) => choose(source, event.target.checked)} /></td><td>{source.orderNumber}</td><td>{source.description ?? "Source needs review"}</td><td>{source.orderedQuantity ?? "Not verified"} {source.unitCode}</td><td>{source.blocker ? "Receiving setup needs review" : "Acceptance is checked separately"}</td></tr>; })}</tbody></RecordTable>
          {!sources?.items.length && <p>No eligible issued sources are available in this scope.</p>}{sources && sources.total > sources.pageSize && <div className="flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous sources</Button><span>Page {page}</span><Button variant="secondary" disabled={page * sources.pageSize >= sources.total} onClick={() => setPage(page + 1)}>Next sources</Button></div>}
        </div></Panel>}
        <div className="-mx-5 grid gap-4 bg-muted/30 px-5 py-5 sm:grid-cols-2"><Field label="Vendor"><Input readOnly value="Retained from the issued purchase order" /><p className="mt-2 text-xs text-muted-foreground">The vendor cannot be replaced while recording delivery.</p></Field><Field label="Purchase Receive reference"><Input readOnly value={id ?? "Assigned when saved"} /></Field><Field label="Transaction title"><Input disabled placeholder="Use Receiving Notes for this delivery" /><p className="mt-2 text-xs text-muted-foreground">A separate transaction title is not supported for receiving records.</p></Field></div>
        {service ? <Panel title="Service completion"><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Deliverable reference"><Input value={deliverable} onChange={(event) => setDeliverable(event.target.value)} required maxLength={200} /></Field><Field label="Service quantity"><Input value={quantity} inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} required /></Field><Field label="Service period from"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field><Field label="Service period to"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></Field><p className="text-sm text-muted-foreground sm:col-span-2">The service owner confirms completion separately. Its accepted value comes from the issued order.</p></div></Panel>
          : <Panel title="Physical delivery"><div className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Date and time received"><Input type="datetime-local" step="0.001" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required /></Field><Field label="Delivery note reference"><Input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} maxLength={200} /></Field></div><RecordTable><thead><tr><th>Description</th><th>Account</th><th>Unit</th><th>Physically received</th><th>Initially rejected</th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.purchaseOrderLineId}><td>{line.description}</td><td className="text-xs text-muted-foreground">Retained on issued order</td><td>{line.unitCode}</td><td><Input aria-label={`Received quantity ${index + 1}`} value={line.receivedQuantity} inputMode="decimal" onChange={(event) => setLines((current) => current.map((item, at) => at === index ? { ...item, receivedQuantity: event.target.value } : item))} required /></td><td><Input aria-label={`Initially rejected quantity ${index + 1}`} value={line.rejectedQuantity} inputMode="decimal" onChange={(event) => setLines((current) => current.map((item, at) => at === index ? { ...item, rejectedQuantity: event.target.value } : item))} required /></td></tr>)}</tbody></RecordTable><p className="text-sm text-muted-foreground">Record the actual delivery, including excess goods. Inspection and authorized acceptance are checked separately.</p></div></Panel>}
        <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2"><Field label="Receiving Notes"><Textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></Field><div><ReceivingUnavailableAction label="Attach files" reason="Secure document upload is not connected for receiving records yet. Use the evidence reference after saving the draft." /></div></div>
        <footer className="sticky bottom-10 z-10 flex flex-wrap items-center gap-3 border-y border-border bg-background/95 px-5 py-4 backdrop-blur"><Button type="submit" disabled={!lines.length}>Save delivery draft</Button><ReceivingUnavailableAction label={service ? "Confirm service" : "Record Receive"} reason="Save the draft first, then review its current evidence and available actions. Draft saving does not record arrival or accept a delivery." /><Button variant="ghost" onClick={cancel}>Cancel</Button></footer>
      </fieldset></form>}
    </>}
    {discard && <Modal title="Discard unsaved changes?" onClose={() => setDiscard(false)}><p className="text-sm">{uncertain ? "A saved result still needs checking. Your original command reference stays in this browser; check it before another change." : "Your unsaved form changes will be discarded."}</p><div className="mt-5 flex gap-3"><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="danger" onClick={() => navigate(id ? `${base}/${id}?kind=${kind}${returnQuery}` : backPath)}>Discard changes</Button></div></Modal>}
  </div>;
}
