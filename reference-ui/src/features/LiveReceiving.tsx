import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { getReceipt, getService, listReceiving, receivingQuantity, recoverReceiving, ReceivingError, sendReceiving,
  type ReceiptDetail, type ReceivingCandidate, type ReceivingCommand, type ReceivingOperation, type ReceivingPage, type ReceivingSummary, type ReceivingView, type ServiceDetail } from "../../../src/platform/procurement-receiving-api";
import { pendingReceivingCommands as pending } from "../lib/receiving-command-memory";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The delivery could not be loaded.";
const base = "/purchase-receives";
function target(row: ReceivingSummary, view: ReceivingView) {
  return `${base}/${row.receiptId ?? row.id}?kind=${view === "services" || view === "certification" ? "service" : "goods"}&purpose=${view}`;
}
export function LiveReceivingList() {
  const context = useLiveReadiness()!, branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  return <ReceivingList key={`${context.legalEntityId}:${branch}:${context.workerId}`} />;
}
function ReceivingList() {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const views: Array<{ code: ReceivingView; label: string }> = [];
  if (context.permissions.includes("procurement-receipt-view")) views.push({ code: "receipts", label: "Goods deliveries" }, { code: "services", label: "Services" });
  if (context.capabilities.receivingInspection && context.permissions.includes("procurement-receipt-inspect")) views.push({ code: "inspection", label: "My inspections" });
  if (context.capabilities.receivingServices && context.permissions.includes("procurement-service-certify")) views.push({ code: "certification", label: "Services to confirm" });
  const [view, setView] = useState<ReceivingView>(() => views[0]?.code ?? "receipts"), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<ReceivingPage<ReceivingSummary> | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const allowed = views.some((item) => item.code === view);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    listReceiving(company, view, page, controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, view, page, revision, allowed]);
  return <div className="p-5 sm:p-8"><PageHeader title="Purchase Receives" subtitle="Record deliveries, inspect goods and confirm completed services." actions={context.capabilities.receivingDrafts && context.permissions.includes("procurement-receipt-create") && context.permissions.includes("procurement-receipt-view") ? <Link className="text-sm text-primary hover:underline" to={`${base}/new`}>Add delivery</Link> : undefined} />
    {!views.length ? <p role="alert">You do not have access to delivery records or assigned tasks.</p> : <>
      <div role="tablist" aria-label="Receiving responsibilities" className="mb-5 flex flex-wrap gap-3">{views.map((item) => <Button role="tab" key={item.code} aria-selected={view === item.code} variant={view === item.code ? "primary" : "secondary"} onClick={() => { setData(null); setView(item.code); setPage(1); }}>{item.label}</Button>)}</div>
      <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh deliveries</Button>
      {error && <p role="alert" className="my-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="mt-5">Loading deliveries…</p> : data?.items.length ? <Panel><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Delivery / service</th><th>Order</th><th>Status</th><th>Date / period</th><th>Action</th></tr></thead><tbody>{data.items.map((row) => <tr key={`${row.receiptId ?? row.id}:${row.lineId ?? ""}`}><td>{row.number ?? row.deliverableRef ?? "Service"}</td><td>{row.orderNumber}</td><td><Badge>{row.status}</Badge></td><td>{row.receivedAt ? new Date(row.receivedAt).toLocaleString() : `${row.periodFrom ?? ""} – ${row.periodTo ?? ""}`}</td><td><Link className="text-sm text-primary hover:underline" to={target(row, view)}>Review delivery</Link></td></tr>)}</tbody></RecordTable></div></Panel> : !error && <EmptyState title="No deliveries need your attention" description="Records and tasks within your current company, branch and responsibilities will appear here." />}
      {data && data.total > data.pageSize && <div className="mt-5 flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous deliveries</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next deliveries</Button></div>}
    </>}
  </div>;
}
type Action = { operation: ReceivingOperation; label: string; lineId?: string; version: number; sourceVersion?: number; quantity?: string };
export function LiveReceivingDetail() {
  const { id = "" } = useParams(), [search] = useSearchParams(), context = useLiveReadiness()!;
  const kind = search.get("kind") === "service" ? "service" : "goods", purpose = search.get("purpose") ?? "receipts";
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  const scope = `${context.legalEntityId}:${branch}:${context.workerId}:${kind}:${id}`;
  return <ReceivingDetail key={`${scope}:${purpose}`} id={id} kind={kind} purpose={purpose} scopeKey={scope} />;
}
function ReceivingDetail({ id, kind, purpose, scopeKey }: { id: string; kind: string; purpose: string; scopeKey: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId, service = kind === "service", task = purpose === "inspection" || purpose === "certification";
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null), [record, setRecord] = useState<ServiceDetail | null>(null), [revision, setRevision] = useState(0);
  const [error, setError] = useState(""), [actionError, setActionError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null), [quantity, setQuantity] = useState(""), [evidence, setEvidence] = useState(""), [reason, setReason] = useState(""), [verified, setVerified] = useState(false);
  const [uncertain, setUncertain] = useState<ReceivingCommand | null>(() => pending.get(scopeKey) ?? null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const permission = service && task ? "procurement-service-certify" : !service && task ? "procurement-receipt-inspect" : "procurement-receipt-view";
  const allowed = context.permissions.includes(permission) && (!task || (service ? context.capabilities.receivingServices : context.capabilities.receivingInspection));
  useEffect(() => {
    const controller = new AbortController(); setReceipt(null); setRecord(null); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    const request = service ? getService(company, id, task, controller.signal) : getReceipt(company, id, task, controller.signal);
    request.then((result) => { if (!controller.signal.aborted) { if (service) setRecord(result as ServiceDetail); else setReceipt(result as ReceiptDetail); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id, service, task, allowed, revision]);
  const orderId = receipt?.purchaseOrderId ?? record?.sourcePurchaseOrderId;
  const open = (item: Action) => { setActionError(""); setAction(item); setQuantity(item.quantity ?? ""); setEvidence(""); setReason(""); setVerified(false); };
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!action || !orderId || uncertain || busy || !verified) return;
    let body: string;
    try {
      const cancellation = action.operation === "ReceivingCancel" || action.operation === "ServiceCancel";
      if (cancellation && !reason.trim() || !cancellation && !evidence.trim()) throw new Error("Enter the required evidence or reason.");
      body = JSON.stringify({ version: action.version, ...(cancellation ? { reason: reason.trim() } : { evidenceReference: evidence.trim(),
        ...(action.operation === "ReceivingRecord" ? {} : { sourceVersion: action.sourceVersion, quantity: receivingQuantity(quantity) }) }) });
    } catch (cause) { setActionError(message(cause)); return; }
    const command: ReceivingCommand = { operation: action.operation, orderId, targetId: id, lineId: action.lineId, key: crypto.randomUUID(), method: "POST", body };
    pending.set(scopeKey, command); setBusy(true);
    try {
      const result = await sendReceiving(company, command); pending.delete(scopeKey);
      if (alive.current) { setAction(null); setNotice(`Saved: ${result.status}. Review the updated delivery evidence below.`); setRevision((n) => n + 1); }
    } catch (cause) {
      if (cause instanceof ReceivingError && cause.status > 0 && cause.status < 500) pending.delete(scopeKey);
      if (alive.current) {
        setActionError(message(cause)); setAction(null);
        if (!(cause instanceof ReceivingError) || cause.status === 0 || cause.status >= 500) setUncertain(command);
        else if (cause.status === 409 || cause.status === 403 || cause.status === 404) { setReceipt(null); setRecord(null); setRevision((n) => n + 1); }
      }
    } finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (!uncertain || busy) return; setBusy(true); setActionError("");
    try { const result = await recoverReceiving(company, uncertain); pending.delete(scopeKey); if (alive.current) { setUncertain(null); setNotice(`Saved result found. Current status: ${result.status}.`); setRevision((n) => n + 1); } }
    catch (cause) { if (alive.current) setActionError(message(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  const candidates = (items: ReceivingCandidate[] | undefined, create: (item: ReceivingCandidate) => Action | null) => items?.map((item) => {
    const next = create(item); return next ? <div key={item.action}><Button disabled={!item.candidate || !!uncertain || busy} variant="secondary" onClick={() => open(next)}>{next.label}</Button>{item.blocker && <p className="mt-2 text-sm text-muted-foreground">{item.blocker}</p>}</div> : null;
  });
  const draftActions = receipt?.draftActionCandidates ?? record?.draftActionCandidates ?? [];
  return <div className="p-5 sm:p-8"><PageHeader title={receipt?.number ?? (service ? "Service confirmation" : "Delivery")} subtitle="Physical delivery, inspection and acceptance are separate records." />
    {!allowed ? <p role="alert">You do not have access to this delivery view.</p> : <>
      {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}{actionError && <p role="alert" className="mb-5 text-sm text-red-700">{actionError}</p>}{notice && <p role="status" className="mb-5 text-sm">{notice}</p>}
      {uncertain && <Panel title="Check the saved result"><div className="space-y-3 p-5"><p>The response was interrupted. Keep this page open and check the original command before another change.</p><p className="break-all text-sm">{uncertain.key}</p><Button disabled={busy} onClick={recover}>Check saved delivery</Button></div></Panel>}
      {loading ? <p role="status">Loading delivery evidence…</p> : receipt ? <>
        <Panel title="Delivery details"><div className="space-y-3 p-5"><Badge>{receipt.status}</Badge><p>Received: {new Date(receipt.receivedAt).toLocaleString()}</p><p>{receipt.physicalEvidenceRecorded ? "Arrival recorded. Acceptance is shown separately below." : receipt.executionVersion === 1 ? "Draft only. No goods have been accepted." : "Legacy record. Evidence needs reconciliation before new acceptance."}</p></div></Panel>
        {receipt.lines.map((line) => { const ready = receipt.lineReadiness.find((item) => item.lineId === line.id); return <Panel key={line.id} title={ready?.labels?.description ?? "Delivery line"}><div className="space-y-4 p-5"><p>{ready?.labels?.orderNumber ?? "Retained source"} · {ready?.labels?.unitCode ?? ""}</p><RecordTable><thead><tr><th>Physically received</th><th>Initial rejected</th><th>Inspection rejected</th><th>Accepted</th><th>Held</th></tr></thead><tbody><tr><td>{line.receivedQuantity}</td><td>{line.initiallyRejectedQuantity}</td><td>{line.inspection?.inspectionRejectedQuantity ?? "Not inspected"}</td><td>{line.acceptedQuantity}</td><td>{line.unacceptedHeldQuantity ?? "Not verified"}</td></tr></tbody></RecordTable>
          <p className="text-sm">{ready?.capacity.verified ? `Remaining order quantity: ${ready.capacity.orderRemainingQuantity ?? "Not verified"}. Available to accept: ${ready.capacity.acceptableQuantity ?? "Not yet qualified"}.` : "Acceptance capacity needs verification. Missing evidence is not zero history."}</p>
          <div className="flex flex-wrap gap-3">{candidates(ready?.actionCandidates, (item) => item.action === "Inspect" && context.capabilities.receivingInspection ? { operation: "ReceivingInspect", label: "Inspect delivery", lineId: line.id, version: line.version, sourceVersion: line.sourceVersion }
            : item.action === "Accept" && context.capabilities.receivingGoods ? { operation: "ReceivingAccept", label: "Accept goods", lineId: line.id, version: line.version, sourceVersion: line.sourceVersion } : null)}</div>
          {ready?.effects?.map((effect) => <p key={effect.id} className="text-sm">{effect.kind} · {effect.quantity} · {effect.netAmount} · {effect.evidenceReference}</p>)}
        </div></Panel>; })}
        {!task && context.capabilities.receivingGoods && receipt.lineReadiness.length > 0 && receipt.lineReadiness.every((line) => line.actionCandidates.some((item) => item.action === "Record" && item.candidate)) && <Button disabled={busy || !!uncertain} onClick={() => open({ operation: "ReceivingRecord", label: "Record arrival", version: receipt.version })}>Record arrival</Button>}
      </> : record ? <Panel title="Service details"><div className="space-y-4 p-5"><Badge>{record.status}</Badge><p>{record.labels?.description ?? record.deliverableRef}</p><p>{record.periodFrom} – {record.periodTo}</p><p>Deliverable: {record.deliverableRef}</p>{!task && record.notes && <p className="whitespace-pre-wrap">Notes: {record.notes}</p>}{!task && record.cancellationReason && <p className="whitespace-pre-wrap">Cancellation reason: {record.cancellationReason}</p>}<p>Intended quantity: {record.intendedQuantity ?? "Already certified"}</p><p>Accepted quantity: {record.acceptedQuantity} · Accepted value: {record.labels?.currencyCode ?? ""} {record.acceptedNetAmount}</p><p>{record.capacity.verified ? `Remaining authorized quantity: ${record.capacity.orderRemainingQuantity}` : "Acceptance capacity needs verification."}</p>
        {context.capabilities.receivingServices && candidates(record.actionCandidates, (item) => item.action === "Certify" ? { operation: "ServiceCertify", label: "Confirm service", version: record.version, sourceVersion: record.sourceVersion, quantity: record.intendedQuantity ?? undefined } : null)}
        {record.effects?.map((effect) => <p key={effect.id} className="text-sm">{effect.kind} · {effect.quantity} · {effect.netAmount} · {effect.evidenceReference}</p>)}
      </div></Panel> : null}
      {!task && draftActions.some((item) => item.action === "EditDraft" && item.candidate) && !uncertain && <Link className="text-sm text-primary hover:underline" to={`${base}/${id}/edit?kind=${kind}`}>Edit delivery draft</Link>}
      {candidates(draftActions, (item) => item.action === "CancelDraft" ? { operation: service ? "ServiceCancel" : "ReceivingCancel", label: "Cancel draft", version: (record ?? receipt)!.version } : null)}
      <div className="flex gap-3"><Link className="text-sm text-primary hover:underline" to={base}>Back to deliveries</Link><Button variant="secondary" disabled={busy} onClick={() => { setNotice(""); setActionError(""); setRevision((n) => n + 1); }}>Refresh delivery</Button></div>
    </>}
    <Modal open={!!action} title={action?.label ?? "Delivery action"} onClose={() => { if (!busy) setAction(null); }}><form className="space-y-4" onSubmit={confirm}>
      {action?.operation === "ReceivingCancel" || action?.operation === "ServiceCancel" ? <Field label="Reason for cancelling"><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} required /></Field> : <>
        {action?.operation !== "ReceivingRecord" && <Field label={action?.operation === "ReceivingInspect" ? "Qualified quantity" : "Quantity to accept"}><Input value={quantity} inputMode="decimal" readOnly={action?.operation === "ServiceCertify"} onChange={(event) => setQuantity(event.target.value)} required /></Field>}
        <Field label="Evidence reference"><Input value={evidence} maxLength={200} onChange={(event) => setEvidence(event.target.value)} required /></Field>
      </>}
      <Field label="I checked the delivery evidence"><Switch checked={verified} onChange={(event) => setVerified(event.target.checked)} /></Field><p className="text-sm text-muted-foreground">ERP checks your current access, site, policy and available quantity when you confirm.</p>
      <Button type="submit" disabled={!verified || busy || !!uncertain}>Confirm delivery action</Button>
    </form></Modal>
  </div>;
}
