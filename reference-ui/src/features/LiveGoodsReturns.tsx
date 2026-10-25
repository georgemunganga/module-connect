import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Field, Input, Modal, PageHeader, Panel, Textarea } from "../components/ui";
import { DetailSection, DetailTabs } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { TransactionEditorFrame } from "./TransactionEditor";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { assertReturnScope, getReturnDraft, listEligibleGoods, listReturnDrafts, recoverReturnCommand, returnQuantity, returnText, sendReturnCommand,
  GoodsReturnError, type ReturnCommand, type ReturnDetail, type ReturnEligible, type ReturnPage } from "../lib/principal-goods-return-api";

const base = "/purchase-receives/returns";
const pending = new Map<string, ReturnCommand>();
const text = (error: unknown) => error instanceof Error ? error.message : "Returns are unavailable. Refresh before continuing.";
function scopeKey(tenant: string, company: string, actor: string, branch: string, id: string) { return `${tenant}:${company}:${actor}:${branch}:${id}`; }
function useReturnContext() {
  const context = useLiveReadiness()!;
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  return { context, branch,
    enabled: context.capabilities.principalGoodsReturnDrafts === true && !!branch };
}
function SourceLabel({ labels }: { labels: ReturnDetail["labels"] }) {
  return <><strong>{labels.purchaseOrderNumber}</strong> · Line {labels.lineNumber} · {labels.description} · {labels.unitCode}<span className="block text-xs text-muted-foreground">{labels.supplierDisplayName ?? "Supplier from the retained order"} · Received {new Date(labels.receivedAt).toLocaleString()} · Delivery note {labels.deliveryNoteReference}</span></>;
}
export function ReturnTabs({ active }: { active: "deliveries" | "returns" }) {
  return <div role="tablist" aria-label="Purchase Receives" className="mb-5 flex flex-wrap gap-3"><Link role="tab" aria-selected={active === "deliveries"} className="rounded-full border border-border px-4 py-2 text-sm" to="/purchase-receives">Deliveries</Link><Link role="tab" aria-selected={active === "returns"} className="rounded-full border border-border px-4 py-2 text-sm" to={base}>Return drafts</Link></div>;
}
export function LiveGoodsReturnList() {
  const { context, branch, enabled } = useReturnContext();
  return <ReturnList key={`${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}`} enabled={enabled} />;
}
function ReturnList({ enabled }: { enabled: boolean }) {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const canRead = enabled && context.permissions.includes("procurement-return-read");
  const canCreate = canRead && context.permissions.includes("procurement-return-create");
  const [offset, setOffset] = useState(0), [page, setPage] = useState<ReturnPage<ReturnDetail> | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError(""); setLoading(true);
    if (canRead) listReturnDrafts(company, offset, controller.signal).then((result) => { if (!controller.signal.aborted) setPage(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(text(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else setLoading(false);
    return () => controller.abort();
  }, [company, offset, revision, canRead]);
  return <div className="p-5 sm:p-8"><PageHeader title="Purchase Receives" subtitle="Draft proposals for goods already accepted by Receiving. No stock or financial adjustment is made." actions={canCreate ? <Link className="text-sm text-primary hover:underline" to={`${base}/new`}>Add return draft</Link> : undefined} />
    <ReturnTabs active="returns" />
    {!canRead ? <p role="alert">Select a permitted branch and obtain current return access to view drafts.</p> : <>
      <div className="mb-4"><Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh return drafts</Button></div>
      {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading return drafts…</p> : page?.items.length ? <Panel><div className="overflow-x-auto"><RecordTable><thead><tr><th>Source purchase order</th><th>Goods</th><th>Proposed quantity</th><th>Status</th><th>Action</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.id}><td>{item.labels.purchaseOrderNumber}</td><td>{item.labels.description} · {item.labels.unitCode}</td><td>{item.quantityExact}</td><td><Badge>{item.status}</Badge></td><td><Link className="text-primary hover:underline" to={`${base}/${item.id}`}>View return draft</Link></td></tr>)}</tbody></RecordTable></div></Panel> : <p>No return drafts are available in this branch.</p>}
      <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button variant="secondary" disabled={!page?.hasMore || loading || page?.nextOffset === null} onClick={() => { if (page?.nextOffset != null) setOffset(page.nextOffset); }}>Next</Button></div>
    </>}
  </div>;
}
export function LiveGoodsReturnDetail() {
  const { id = "" } = useParams(), { context, branch, enabled } = useReturnContext();
  return <ReturnDetailPage key={`${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}:${id}`} id={id} enabled={enabled} />;
}
function ReturnDetailPage({ id, enabled }: { id: string; enabled: boolean }) {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const branch = procurementScopeHeaders(company)["X-Shell-Location"] ?? "";
  const key = scopeKey(context.tenantId, company, context.principalId, branch, id);
  const canRead = enabled && context.permissions.includes("procurement-return-read");
  const [detail, setDetail] = useState<ReturnDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview"), [refresh, setRefresh] = useState(0), [cancelOpen, setCancelOpen] = useState(false), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState<ReturnCommand | null>(() => pending.get(key) ?? null);
  const alive = useRef(true), busyRef = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setLoading(true); setError("");
    if (canRead) getReturnDraft(company, id, controller.signal).then((item) => { if (!controller.signal.aborted) setDetail(item); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(text(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else setLoading(false);
    return () => controller.abort();
  }, [canRead, company, id, refresh]);
  async function recover() {
    if (!uncertain || busyRef.current) return;
    try { assertReturnScope(company, branch); } catch (cause) { setError(text(cause)); return; }
    busyRef.current = true; setBusy(true); setError("");
    try { await recoverReturnCommand(company, uncertain); const current = await getReturnDraft(company, id); if (alive.current) { setDetail(current); setUncertain(null); pending.delete(key); setRefresh((n) => n + 1); } }
    catch (cause) { if (alive.current) setError(text(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function cancel(event: FormEvent) {
    event.preventDefault(); if (!detail || !detail.allowedActions.includes("Cancel") || !enabled || uncertain || busyRef.current) return;
    try { assertReturnScope(company, branch); } catch (cause) { setError(text(cause)); return; }
    let clean: string;
    try { clean = returnText(reason).reason; } catch (cause) { setError(text(cause)); return; }
    const command: ReturnCommand = { operation: "Cancel", targetId: id, key: crypto.randomUUID(), method: "POST", body: JSON.stringify({ expectedRevision: detail.version, reason: clean }) };
    busyRef.current = true; setBusy(true); setError(""); pending.set(key, command);
    let acknowledged = false;
    try { await sendReturnCommand(company, command); acknowledged = true; const current = await getReturnDraft(company, id); if (alive.current) { setDetail(current); pending.delete(key); setCancelOpen(false); setRefresh((n) => n + 1); } }
    catch (cause) { if (alive.current) { if (!acknowledged && cause instanceof GoodsReturnError && cause.status > 0 && cause.status < 500 && cause.status !== 408) pending.delete(key); else setUncertain(command); setError(text(cause)); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="p-5 sm:p-8"><PageHeader title="Return draft" subtitle="This is a draft proposal only. No goods are returned, and no credit or refund is created." /><ReturnTabs active="returns" />
    {!canRead ? <p role="alert">Select a permitted branch and obtain current return access.</p> : <>
      {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading return evidence…</p> : detail ? <>
        <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "related", label: "Related" }]} active={activeTab} onChange={setActiveTab} />
        {activeTab === "overview" && <div className="space-y-5 pt-5"><Panel title="Retained accepted goods"><div className="space-y-3 p-5"><SourceLabel labels={detail.labels} /><p>Accepted in selected fact: {detail.acceptedFactQuantityExact} {detail.labels.unitCode}</p><p>Proposed quantity: {detail.quantityExact} {detail.labels.unitCode}</p><p>Reason: {detail.reason}</p><p>Evidence reference: {detail.evidenceReference ?? "None"}</p><Badge>{detail.status}</Badge></div></Panel>
          <DetailSection title="Draft controls"><p>Draft only · Stock unchanged · Finance unchanged · Supplier not contacted.</p><p className="mt-2 text-sm">Revision {detail.version}. ERP checks current access and the original accepted goods fact again for each change.</p></DetailSection>
          <div className="flex gap-3">{!uncertain && detail.allowedActions.includes("Edit") && <Link className="text-primary hover:underline" to={`${base}/${id}/edit`}>Edit return draft</Link>}{!uncertain && detail.allowedActions.includes("Cancel") && <Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel draft</Button>}</div></div>}
        {activeTab === "related" && <DetailSection title="Related records"><p>Source purchase order: {context.permissions.includes("procurement-po-read") ? <Link className="text-primary hover:underline" to={`/purchase-orders/${detail.purchaseOrderId}`}>{detail.labels.purchaseOrderNumber}</Link> : detail.labels.purchaseOrderNumber}</p><p>Delivery note: {detail.labels.deliveryNoteReference}</p><p>The accepted goods fact remains unchanged.</p></DetailSection>}
      </> : null}
      {uncertain && <Panel title="Check the saved result"><div className="space-y-3 p-5"><p>The response was interrupted. Check this original command before another change.</p><Button disabled={busy} onClick={recover}>Check saved return</Button></div></Panel>}
      <div className="mt-5 flex gap-3"><Link className="text-primary hover:underline" to={base}>Back to return drafts</Link><Button variant="secondary" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>Refresh</Button></div>
    </>}
    {cancelOpen && <Modal title="Cancel return draft" onClose={() => { if (!busy) setCancelOpen(false); }}><form className="space-y-4" onSubmit={cancel}><Field label="Cancellation reason"><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} required /></Field><Button type="submit" disabled={busy || !!uncertain}>Cancel draft</Button></form></Modal>}
  </div>;
}
export function LiveGoodsReturnEditor() {
  const { id } = useParams(), { context, branch, enabled } = useReturnContext();
  return <ReturnEditor key={`${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}:${id ?? "new"}`} id={id} enabled={enabled} branch={branch} />;
}
function ReturnEditor({ id, enabled, branch }: { id?: string; enabled: boolean; branch: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId, navigate = useNavigate();
  const canCreate = enabled && context.permissions.includes("procurement-return-read") && context.permissions.includes("procurement-return-create");
  const canEdit = enabled && context.permissions.includes("procurement-return-edit");
  const key = scopeKey(context.tenantId, company, context.principalId, branch, id ?? "new");
  const [detail, setDetail] = useState<ReturnDetail | null>(null), [eligible, setEligible] = useState<ReturnPage<ReturnEligible> | null>(null), [offset, setOffset] = useState(0), [selected, setSelected] = useState<ReturnEligible | null>(null);
  const [quantity, setQuantity] = useState(""), [reason, setReason] = useState(""), [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const [uncertain, setUncertain] = useState<ReturnCommand | null>(() => pending.get(key) ?? null);
  const alive = useRef(false), busyRef = useRef(false);
  const allowed = id ? canEdit && context.permissions.includes("procurement-return-read") : canCreate;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    if (id) getReturnDraft(company, id, controller.signal).then((item) => { if (!controller.signal.aborted) { setDetail(item); if (item.allowedActions.includes("Edit")) { setQuantity(item.quantityExact); setReason(item.reason); setReference(item.evidenceReference ?? ""); } } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(text(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else listEligibleGoods(company, offset, controller.signal).then((page) => { if (!controller.signal.aborted) setEligible(page); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(text(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, company, id, offset]);
  function close() { if (dirty || uncertain) setDiscard(true); else navigate(id ? `${base}/${id}` : base); }
  async function recover() {
    if (!uncertain || busyRef.current) return;
    try { assertReturnScope(company, branch); } catch (cause) { setError(text(cause)); return; }
    busyRef.current = true; setBusy(true); setError("");
    try { const ack = await recoverReturnCommand(company, uncertain); const current = await getReturnDraft(company, ack.id); if (alive.current) { pending.delete(key); setUncertain(null); navigate(`${base}/${current.id}`); } }
    catch (cause) { if (alive.current) setError(text(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!allowed || busyRef.current || uncertain || id && !detail?.allowedActions.includes("Edit") || !id && !selected) return;
    try { assertReturnScope(company, branch); } catch (cause) { setError(text(cause)); return; }
    let clean: { quantity: string; reason: string; evidenceReference: string | null };
    try { const textFields = returnText(reason, reference); const limit = id ? detail!.acceptedFactQuantityExact : selected!.acceptedFactQuantityExact;
      clean = { quantity: returnQuantity(quantity, limit), ...textFields }; }
    catch (cause) { setError(text(cause)); return; }
    const command: ReturnCommand = { operation: id ? "Revise" : "Create", key: crypto.randomUUID(), targetId: id ?? null, method: id ? "PUT" : "POST",
      body: JSON.stringify(id ? { expectedRevision: detail!.version, ...clean } : { acceptanceFactId: selected!.acceptanceFactId, ...clean }) };
    busyRef.current = true; setBusy(true); setError(""); pending.set(key, command);
    let acknowledged = false;
    try { const ack = await sendReturnCommand(company, command); acknowledged = true; const current = await getReturnDraft(company, ack.id); if (alive.current) { pending.delete(key); navigate(`${base}/${current.id}`); } }
    catch (cause) { if (alive.current) { if (!acknowledged && cause instanceof GoodsReturnError && cause.status > 0 && cause.status < 500 && cause.status !== 408) pending.delete(key); else setUncertain(command); setError(text(cause)); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  return <TransactionEditorFrame title={id ? "Edit return draft" : "Add return draft"} close={close} closeDisabled={busy} footer={<><Button form="goods-return-form" type="submit" disabled={!allowed || loading || busy || !!uncertain || !!id && !detail?.allowedActions.includes("Edit") || !id && !selected}>Save return draft</Button><Button variant="ghost" onClick={close}>Cancel</Button></>}>
    <p className="text-sm text-muted-foreground">Propose a draft against one verified accepted goods fact. No stock, supplier, credit or Finance action is performed.</p>
    {!allowed ? <p role="alert">Select a permitted branch and obtain current return access.</p> : <>
      {error && <p role="alert">{error}</p>}{loading && <p role="status">Loading accepted goods evidence…</p>}
      {id && detail && !detail.allowedActions.includes("Edit") && <p role="alert">This draft cannot be edited with your current access or state.</p>}
      {uncertain && <Panel title="Check the saved draft"><div className="space-y-3 p-5"><p>The response was interrupted. Check the original command before any further change.</p><Button disabled={busy} onClick={recover}>Check saved return</Button></div></Panel>}
      <form id="goods-return-form" onSubmit={save} onChange={() => setDirty(true)} className="space-y-5"><fieldset disabled={busy || !!uncertain || !allowed || !!id && !detail?.allowedActions.includes("Edit")} className="space-y-5">
        {!id && <Panel title="Accepted goods source"><div className="space-y-3 p-5"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Select</th><th>Purchase order and goods</th><th>Accepted fact quantity</th></tr></thead><tbody>{eligible?.items.map((item) => <tr key={item.acceptanceFactId}><td><Input type="radio" name="accepted-goods" aria-label={`Select ${item.labels.purchaseOrderNumber} line ${item.labels.lineNumber}`} checked={selected?.acceptanceFactId === item.acceptanceFactId} onChange={() => { setSelected(item); setQuantity(item.acceptedFactQuantityExact); setDirty(true); }} /></td><td><SourceLabel labels={item.labels} /></td><td>{item.acceptedFactQuantityExact} {item.labels.unitCode}</td></tr>)}</tbody></RecordTable></div>{!eligible?.items.length && <p>No accepted goods facts are available in this branch.</p>}<div className="flex gap-3"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button variant="secondary" disabled={!eligible?.hasMore || eligible?.nextOffset === null} onClick={() => { if (eligible?.nextOffset != null) setOffset(eligible.nextOffset); }}>Next</Button></div></div></Panel>}
        {id && detail && <Panel title="Retained accepted goods"><div className="p-5"><SourceLabel labels={detail.labels} /><p>Accepted fact quantity: {detail.acceptedFactQuantityExact} {detail.labels.unitCode}</p></div></Panel>}
        <Panel title="Draft proposal"><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Proposed quantity"><Input value={quantity} inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} required /></Field><Field label="Evidence reference"><Input value={reference} maxLength={300} onChange={(event) => setReference(event.target.value)} /></Field><Field label="Reason"><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} required /></Field></div></Panel>
      </fieldset></form>
    </>}
    {discard && <Modal title="Leave return draft?" onClose={() => setDiscard(false)}><p>{uncertain ? "The original command still needs checking. Returning later will keep its reference in this browser session." : "Unsaved changes will be discarded."}</p><div className="mt-5 flex gap-3"><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="danger" onClick={() => navigate(id ? `${base}/${id}` : base)}>Leave draft</Button></div></Modal>}
  </TransactionEditorFrame>;
}
