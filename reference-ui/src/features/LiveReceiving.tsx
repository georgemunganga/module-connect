import { receivingAdapter } from "./receiving-live-adapter";
import { ReturnTabs } from "./LiveGoodsReturns";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Select, Switch, Textarea } from "../components/ui";
import { StandardDataTable } from "../components/data/StandardDataTable";
import { ListTools, type ListColumn } from "../components/data/ListTools";
import { ActiveFilterChips } from "../components/data/ActiveFilterChips";
import { DetailTabs, DetailSection } from "../components/data/DetailPrimitives";
import { ReceivingActivity, ReceivingComments, ReceivingDocumentsSection, ReceivingRelated, ReceivingUnavailableAction, receivingVendorContext } from "./ReceivingPresentation";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { receivingQuantity, ReceivingError,
  type ReceiptDetail, type ReceivingCandidate, type ReceivingCommand, type ReceivingOperation, type ReceivingPage, type ReceivingSummary, type ReceivingView, type ServiceDetail } from "../../../src/platform/procurement-receiving-api";
import { pendingReceivingCommands as pending } from "../lib/receiving-command-memory";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The delivery could not be loaded.";
const base = "/purchase-receives";
const blockerMessages: Record<string, string> = { ReceivingCurrentPermissionRequired: "Your current access does not allow this action.", QualifiedInspectionRequired: "Complete the delivery inspection first.", ReceivingLegacyAcceptanceReconciliationRequired: "Earlier acceptance records need to be checked first.", ReceivingNoRemainingAcceptance: "No authorized quantity remains to accept." };
const blockerText = (code: string) => blockerMessages[code] ?? "Review this delivery’s current access and receiving rules before continuing.";
function target(row: ReceivingSummary, view: ReceivingView, legacy = false) {
  return `${base}/${row.receiptId ?? row.id}?kind=${view === "services" || view === "certification" ? "service" : "goods"}&purpose=${view}${legacy ? "&receivingProtocol=legacy" : ""}`;
}
export function LiveReceivingList() {
  const context = useLiveReadiness()!, [search] = useSearchParams(), branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  return <ReceivingList key={`${context.tenantId}:${context.legalEntityId}:${branch}:${context.principalId}:${search.get("receivingProtocol") ?? "current"}`} />;
}
function ReceivingList() {
  const context = useLiveReadiness()!, [search, setSearch] = useSearchParams(), company = context.legalEntityId,
    principal = context.capabilities.principalReceiving === true && search.get("receivingProtocol") !== "legacy", api = receivingAdapter(principal);
  const legacyAvailable = context.capabilities.receivingDrafts || context.capabilities.receivingGoods || context.capabilities.receivingInspection || context.capabilities.receivingServices;
  const active = principal || legacyAvailable;
  const views: Array<{ code: ReceivingView; label: string }> = [];
  if (active && context.permissions.includes("procurement-receipt-view")) views.push({ code: "receipts", label: "Goods deliveries" }, { code: "services", label: "Services" });
  if ((principal || context.capabilities.receivingInspection) && context.permissions.includes("procurement-receipt-inspect")) views.push({ code: "inspection", label: "My inspections" });
  if (principal && context.permissions.includes("procurement-receipt-accept")) views.push({ code: "acceptance", label: "Goods to accept" });
  if ((principal || context.capabilities.receivingServices) && context.permissions.includes("procurement-service-certify")) views.push({ code: "certification", label: "Services to confirm" });
  const [view, setView] = useState<ReceivingView>(() => views[0]?.code ?? "receipts"), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [data, setData] = useState<ReceivingPage<ReceivingSummary> | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]), [visibleColumns, setVisibleColumns] = useState(["number", "order", "status", "date"]), [widths, setWidths] = useState<Record<string, number>>({}), [clip, setClip] = useState(false), [filters, setFilters] = useState<Record<string, string>>({}), [toolNotice, setToolNotice] = useState(""), [preview, setPreview] = useState<ReceivingSummary | null>(null);
  const columns: ListColumn[] = [{ key: "number", label: "Delivery / service", width: 230 }, { key: "order", label: "Order", width: 210 }, { key: "status", label: "Status", width: 150 }, { key: "date", label: "Date / period", width: 230 }];
  const statusFields = [{ key: "status", label: "Status", type: "select" as const, options: principal ? view === "services" ? ["Draft", "Certified", "Cancelled"] : ["Draft", "Recorded", "Cancelled"] : view === "services" ? ["PendingCertification", "Accepted", "Cancelled"] : ["Draft", "Recorded", "Held", "Inspected", "Partially Accepted", "Accepted", "Rejected", "Cancelled"] }];
  const status = filters.status ?? "";
  const allowed = views.some((item) => item.code === view);
  const chooseSort = (key: string) => {
    if (!principal || (view !== "receipts" && view !== "services") || (key !== "newest" && key !== "oldest")) {
      setToolNotice("Sorting this delivery view is not connected yet. The list keeps the server's current order."); return;
    }
    setSort(key); setPage(1); setToolNotice(key === "oldest" ? "Showing oldest deliveries first." : "Showing newest deliveries first.");
  };
  useEffect(() => {
    const controller = new AbortController(); setData(null); setSelected([]); setPreview(null); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    api.listReceiving(company, view, page, controller.signal, status, sort).then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, view, page, revision, allowed, status, sort, api]);
  return <div className="p-5 sm:p-8"><PageHeader title="Purchase Receives" subtitle="Record deliveries, inspect goods and confirm completed services." actions={(principal || context.capabilities.receivingDrafts) && context.permissions.includes("procurement-receipt-create") && context.permissions.includes("procurement-receipt-view") ? <Link className="text-sm text-primary hover:underline" to={`${base}/new${principal ? "" : "?receivingProtocol=legacy"}`}>Add delivery</Link> : undefined} />
    {context.capabilities.principalGoodsReturnDrafts === true && context.permissions.includes("procurement-return-read") && <ReturnTabs active="deliveries" />}
    {context.capabilities.principalReceiving && <Field label="Receiving records"><Select value={principal ? "current" : "legacy"} onChange={(event) => { const next = new URLSearchParams(search); if (event.target.value === "legacy") next.set("receivingProtocol", "legacy"); else next.delete("receivingProtocol"); setSearch(next); }}><option value="current">Current deliveries</option><option value="legacy" disabled={!legacyAvailable}>Earlier deliveries</option></Select></Field>}
    {!views.length ? <p role="alert">You do not have access to delivery records or assigned tasks.</p> : <>
      <div role="tablist" aria-label="Receiving responsibilities" className="mb-5 flex flex-wrap gap-3">{views.map((item) => <Button role="tab" key={item.code} aria-selected={view === item.code} variant={view === item.code ? "primary" : "secondary"} onClick={() => { setData(null); setView(item.code); setFilters({}); setSelected([]); setPreview(null); setToolNotice(""); setSort("newest"); setPage(1); }}>{item.label}</Button>)}</div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><ListTools entity="Purchase Receives" columns={columns} visibleColumns={visibleColumns} onVisibleColumnsChange={setVisibleColumns} columnWidths={widths} onColumnWidthsChange={setWidths} clipText={clip} onClipTextChange={setClip}
        sortOptions={principal && (view === "receipts" || view === "services") ? [{ key: "newest", label: "Newest first" }, { key: "oldest", label: "Oldest first" }] : [{ key: "newest", label: "Newest first" }, { key: "oldest", label: "Oldest first" }, { key: "number", label: "Number" }]} onSort={chooseSort}
        filterFields={view === "receipts" || view === "services" ? statusFields : []} activeFilters={filters} onApplyFilters={(next) => { setFilters(next); setPage(1); }} showSavedView={false}
        onExport={() => setToolNotice("Secure receiving exports are not connected yet. No file was downloaded.")} selectedCount={selected.length}
        onRefresh={() => setRevision((n) => n + 1)} onResetWidths={() => setWidths({})} notify={setToolNotice} />
        <div className="flex flex-wrap items-center gap-3"><Input aria-label="Search Purchase Receives" placeholder="Search number, description or vendor" disabled /><ReceivingUnavailableAction label="Search options" reason="Search by number, description, vendor, date or value is not connected yet. You can use the supported status filter and paging." /><Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh deliveries</Button></div></div>
      {toolNotice && <p role="status" className="mb-4 text-sm">{toolNotice}</p>}
      <ActiveFilterChips fields={statusFields} filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />
      {selected.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><span>{selected.length} selected</span><Button variant="secondary" onClick={() => setToolNotice("Secure receiving exports are not connected yet. No file was downloaded.")}>Export selected</Button><Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>}
      {error && <p role="alert" className="my-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="mt-5">Loading deliveries…</p> : data?.items.length ? <Panel><StandardDataTable rows={data.items.map((row) => ({ ...row, id: `${row.receiptId ?? row.id}:${row.lineId ?? ""}` }))} columns={columns} visibleColumns={visibleColumns} columnWidths={widths} clipText={clip} selected={selected} onSelectedChange={setSelected}
        onSort={(key) => chooseSort(key === "newest" && principal && (view === "receipts" || view === "services") ? sort === "newest" ? "oldest" : "newest" : key)} onOpen={(row) => setPreview(data.items.find((item) => `${item.receiptId ?? item.id}:${item.lineId ?? ""}` === row.id) ?? null)} rowLabel={(row) => row.number ?? row.deliverableRef ?? "Service"}
        renderCell={(row, column) => column.key === "number" ? row.number ?? row.deliverableRef ?? "Service" : column.key === "order" ? row.orderNumber : column.key === "status" ? <Badge>{row.status}</Badge> : row.receivedAt ? new Date(row.receivedAt).toLocaleString() : `${row.periodFrom ?? ""} – ${row.periodTo ?? ""}`}
        renderActions={(row) => { const original = data.items.find((item) => `${item.receiptId ?? item.id}:${item.lineId ?? ""}` === row.id)!; return <Link className="text-sm text-primary hover:underline" to={target(original, view, !principal)}>Review delivery</Link>; }} /></Panel> : !error && <EmptyState title="No deliveries need your attention" description="Records and tasks within your current company, branch and responsibilities will appear here." />}
      {data && data.total > data.pageSize && <div className="mt-5 flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous deliveries</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next deliveries</Button></div>}
    </>}
    {preview && <Modal title="Delivery summary" onClose={() => setPreview(null)}>{preview && <div className="space-y-4"><p>{preview.number ?? preview.deliverableRef ?? "Service"}</p><p>{preview.orderNumber}</p><Badge>{preview.status}</Badge><div><Link className="text-primary hover:underline" to={target(preview, view, !principal)}>Review delivery</Link></div></div>}</Modal>}
  </div>;
}
type Action = { operation: ReceivingOperation; label: string; lineId?: string; version: number; sourceVersion?: number; quantity?: string };
export function LiveReceivingDetail() {
  const { id = "" } = useParams(), [search] = useSearchParams(), context = useLiveReadiness()!;
  const kind = search.get("kind") === "service" ? "service" : "goods", purpose = search.get("purpose") ?? "receipts";
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  const selectedBack = receivingVendorContext(search, context.permissions.includes("procurement-vendor-read"));
  const legacy = search.get("receivingProtocol") === "legacy";
  const back = { path: selectedBack.path === base && legacy ? `${base}?receivingProtocol=legacy` : selectedBack.path,
    query: `${selectedBack.query}${legacy ? "&receivingProtocol=legacy" : ""}` };
  const scope = `${context.tenantId}:${context.legalEntityId}:${branch}:${context.principalId}:${kind}:${id}:${context.capabilities.principalReceiving === true && !legacy ? "principal2" : "worker1"}`;
  return <ReceivingDetail key={`${scope}:${purpose}`} id={id} kind={kind} purpose={purpose} principal={context.capabilities.principalReceiving === true && !legacy} scopeKey={scope} backPath={back.path} returnQuery={back.query} />;
}
function ReceivingDetail({ id, kind, purpose, principal, scopeKey, backPath, returnQuery }: { id: string; kind: string; purpose: string; principal: boolean; scopeKey: string; backPath: string; returnQuery: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId, api = receivingAdapter(principal), service = kind === "service", task = purpose === "inspection" || purpose === "acceptance" || purpose === "certification";
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null), [record, setRecord] = useState<ServiceDetail | null>(null), [revision, setRevision] = useState(0);
  const [error, setError] = useState(""), [actionError, setActionError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [action, setAction] = useState<Action | null>(null), [quantity, setQuantity] = useState(""), [evidence, setEvidence] = useState(""), [reason, setReason] = useState(""), [verified, setVerified] = useState(false);
  const [uncertain, setUncertain] = useState<ReceivingCommand | null>(() => pending.get(scopeKey) ?? null);
  const alive = useRef(false), busyRef = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const permission = service && task ? "procurement-service-certify" : !service && task ? purpose === "acceptance" ? "procurement-receipt-accept" : "procurement-receipt-inspect" : "procurement-receipt-view";
  const active = principal || context.capabilities.receivingDrafts || context.capabilities.receivingGoods || context.capabilities.receivingInspection || context.capabilities.receivingServices;
  const allowed = active && (purpose !== "acceptance" || principal) && context.permissions.includes(permission) && (!task || (service ? (principal || context.capabilities.receivingServices) : (principal || context.capabilities.receivingInspection)));
  const canPerform = (operation: ReceivingOperation) => context.permissions.includes(
    operation === "ReceivingRecord" ? "procurement-receipt-record"
      : operation === "ReceivingInspect" ? "procurement-receipt-inspect"
      : operation === "ReceivingAccept" ? "procurement-receipt-accept"
      : operation === "ServiceCertify" ? "procurement-service-certify"
      : "procurement-receipt-edit");
  useEffect(() => {
    const controller = new AbortController(); setReceipt(null); setRecord(null); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => controller.abort(); }
    const request = service ? api.getService(company, id, task, controller.signal) : api.getReceipt(company, id, task, controller.signal, purpose === "acceptance");
    request.then((result) => { if (!controller.signal.aborted) { if (service) setRecord(result as ServiceDetail); else setReceipt(result as ReceiptDetail); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id, service, task, purpose, allowed, revision, api]);
  const orderId = receipt?.purchaseOrderId ?? record?.sourcePurchaseOrderId;
  const open = (item: Action) => { if (!canPerform(item.operation)) return; setActionError(""); setAction(item); setQuantity(item.quantity ?? ""); setEvidence(""); setReason(""); setVerified(false); };
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!alive.current || busyRef.current || !allowed || !action || !canPerform(action.operation) || !orderId || uncertain || busy || !verified) return;
    let body: string;
    try {
      const cancellation = action.operation === "ReceivingCancel" || action.operation === "ServiceCancel";
      if (cancellation && !reason.trim() || !cancellation && !evidence.trim()) throw new Error("Enter the required evidence or reason.");
      body = JSON.stringify({ version: action.version, ...(cancellation ? { reason: reason.trim() } : { evidenceReference: evidence.trim(),
        ...(action.operation === "ReceivingRecord" ? {} : { sourceVersion: action.sourceVersion, quantity: receivingQuantity(quantity) }) }) });
    } catch (cause) { setActionError(message(cause)); return; }
    const command: ReceivingCommand = { ...(principal ? { protocol: "Principal2" as const } : {}), operation: action.operation, orderId, targetId: id, lineId: action.lineId, key: crypto.randomUUID(), method: "POST", body };
    busyRef.current = true; pending.set(scopeKey, command); setBusy(true);
    try {
      const result = await api.sendReceiving(company, command); pending.delete(scopeKey);
      if (alive.current) {
        setAction(null);
        if (principal && task && action.operation === "ServiceCertify") { setRecord(null); setNotice(`Saved: ${result.status}. This task is complete. Return to deliveries for your remaining work.`); }
        else { setNotice(`Saved: ${result.status}. Review the updated delivery evidence below.`); setRevision((n) => n + 1); }
      }
    } catch (cause) {
      if (cause instanceof ReceivingError && cause.status > 0 && cause.status < 500) pending.delete(scopeKey);
      if (alive.current) {
        setActionError(message(cause)); setAction(null);
        if (!(cause instanceof ReceivingError) || cause.status === 0 || cause.status >= 500) setUncertain(command);
        else if (cause.status === 409 || cause.status === 403 || cause.status === 404) { setReceipt(null); setRecord(null); setRevision((n) => n + 1); }
      }
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (!alive.current || busyRef.current || !uncertain || busy) return; busyRef.current = true; setBusy(true); setActionError("");
    try { const result = await api.recoverReceiving(company, uncertain); pending.delete(scopeKey); if (alive.current) { setUncertain(null); setNotice(`Saved result found. Status when saved: ${result.status}.`); setRevision((n) => n + 1); } }
    catch (cause) { if (alive.current) setActionError(message(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const candidates = (items: ReceivingCandidate[] | undefined, create: (item: ReceivingCandidate) => Action | null) => items?.map((item) => {
    const next = create(item); return next && canPerform(next.operation) ? <div key={item.action}><Button disabled={!item.candidate || !!uncertain || busy} variant="secondary" onClick={() => open(next)}>{next.label}</Button>{item.blocker && <p className="mt-2 text-sm text-muted-foreground">{blockerText(item.blocker)}</p>}</div> : null;
  });
  const draftActions = receipt?.draftActionCandidates ?? record?.draftActionCandidates ?? [];
  const effects = receipt?.lineReadiness.flatMap((line) => line.effects ?? []) ?? record?.effects ?? [];
  const documents = receipt?.documents ?? record?.documents;
  const sourceOrderNumber = receipt?.lineReadiness.find((line) => line.labels)?.labels?.orderNumber ?? record?.labels?.orderNumber;
  const tabs = [{ key: "overview", label: "Overview" }, { key: "items", label: service ? "Service details" : `Items (${receipt?.lines.length ?? 0})` }, { key: "related", label: "Related" }, ...(!task ? [{ key: "comments", label: "Comments" }, { key: "documents", label: "Documents" }] : []), { key: "history", label: "History" }];
  return <div className="p-5 sm:p-8"><PageHeader title={receipt?.number ?? (service ? "Service confirmation" : "Delivery")} subtitle="Physical delivery, inspection and acceptance are separate records." actions={!task && (receipt || record) ? <><ReceivingUnavailableAction label="Create bill" reason="Creating a bill directly from a delivery is not connected yet. No invoice or matching approval is created here." /><ReceivingUnavailableAction label="Delete delivery" reason="Saved delivery records are retained for audit. An unrecorded draft can be cancelled using its permitted Cancel draft action." /></> : undefined} />
    {!allowed ? <p role="alert">You do not have access to this delivery view.</p> : <>
      {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}{actionError && <p role="alert" className="mb-5 text-sm text-red-700">{actionError}</p>}{notice && <p role="status" className="mb-5 text-sm">{notice}</p>}
      {uncertain && <Panel title="Check the saved result"><div className="space-y-3 p-5"><p>The response was interrupted. Keep this page open and check the original command before another change.</p><p className="break-all text-sm">{uncertain.key}</p><Button disabled={busy} onClick={recover}>Check saved delivery</Button></div></Panel>}
      {(receipt || record) && <DetailTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />}
      <div hidden={activeTab !== "overview" && activeTab !== "items"} className={activeTab === "overview" ? "grid items-start gap-4 pt-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(270px,0.85fr)]" : "pt-5"}><div className="min-w-0 space-y-4">
      {loading ? <p role="status">Loading delivery evidence…</p> : receipt ? <>
        <Panel title="Delivery details"><div className="space-y-3 p-5"><Badge>{receipt.status}</Badge><p>Received: {new Date(receipt.receivedAt).toLocaleString()}</p><p>{receipt.physicalEvidenceRecorded ? "Arrival recorded. Acceptance is shown separately below." : receipt.executionVersion === 1 || receipt.executionVersion === 2 ? "Draft only. No goods have been accepted." : "Legacy record. Evidence needs reconciliation before new acceptance."}</p></div></Panel>
        {receipt.lines.map((line) => { const ready = receipt.lineReadiness.find((item) => item.lineId === line.id); return <Panel key={line.id} title={ready?.labels?.description ?? "Delivery line"}><div className="space-y-4 p-5"><p>{ready?.labels?.orderNumber ?? "Retained source"} · {ready?.labels?.unitCode ?? ""}</p><p className="text-xs text-muted-foreground">Rates and account details are retained on the purchase order. Use Related to open it when your access permits.</p><div className="max-w-full overflow-x-auto"><RecordTable><thead><tr><th>Physically received</th><th>Initial rejected</th><th>Inspection rejected</th><th>Accepted</th><th>Held</th></tr></thead><tbody><tr><td>{line.receivedQuantity}</td><td>{line.initiallyRejectedQuantity}</td><td>{line.inspection?.inspectionRejectedQuantity ?? "Not inspected"}</td><td>{line.acceptedQuantity}</td><td>{line.unacceptedHeldQuantity ?? "Not verified"}</td></tr></tbody></RecordTable></div>
          {ready?.capacity.blocker && <p className="text-sm" role="status">{blockerText(ready.capacity.blocker)}</p>}
          <p className="text-sm">{ready?.capacity.verified ? `Remaining order quantity: ${ready.capacity.orderRemainingQuantity ?? "Not verified"}. Available to accept: ${ready.capacity.acceptableQuantity ?? "Not yet qualified"}.` : principal && task ? "This task shows delivery evidence. ERP checks the current controls when you confirm." : "Acceptance capacity needs verification. Missing evidence is not zero history."}</p>
          <div className="flex flex-wrap gap-3">{candidates(ready?.actionCandidates, (item) => item.action === "Inspect" && (principal || context.capabilities.receivingInspection) ? { operation: "ReceivingInspect", label: "Inspect delivery", lineId: line.id, version: line.version, sourceVersion: line.sourceVersion }
            : item.action === "Accept" && (principal || context.capabilities.receivingGoods) ? { operation: "ReceivingAccept", label: "Accept goods", lineId: line.id, version: line.version, sourceVersion: line.sourceVersion } : null)}</div>
          {ready?.effects?.map((effect) => <p key={effect.id} className="text-sm">{effect.kind} · {effect.quantity}{effect.netAmount !== null ? ` · ${effect.netAmount}` : ""} · {effect.evidenceReference}</p>)}
        </div></Panel>; })}
        {!task && (principal || context.capabilities.receivingGoods) && canPerform("ReceivingRecord") && receipt.lineReadiness.length > 0 && receipt.lineReadiness.every((line) => line.actionCandidates.some((item) => item.action === "Record" && item.candidate)) && <Button disabled={busy || !!uncertain} onClick={() => open({ operation: "ReceivingRecord", label: "Record arrival", version: receipt.version })}>Record arrival</Button>}
      </> : record ? <Panel title="Service details"><div className="space-y-4 p-5"><Badge>{record.status}</Badge><p>{record.labels?.description ?? record.deliverableRef}</p><p>{record.periodFrom} – {record.periodTo}</p><p>Deliverable: {record.deliverableRef}</p>{!task && record.notes && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">Notes: {record.notes}</p>}{!task && record.cancellationReason && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">Cancellation reason: {record.cancellationReason}</p>}<p>Intended quantity: {record.intendedQuantity ?? "Already certified"}</p><p>Accepted quantity: {record.acceptedQuantity ?? "Not provided in this task"} · Accepted value: {record.labels?.currencyCode ?? ""} {record.acceptedNetAmount ?? "Not provided in this task"}</p><p>{record.capacity.verified ? `Remaining authorized quantity: ${record.capacity.orderRemainingQuantity}` : principal && task ? "ERP checks the current source capacity and controls when you confirm." : "Acceptance capacity needs verification."}</p>
        {(principal || context.capabilities.receivingServices) && candidates(record.actionCandidates, (item) => item.action === "Certify" ? { operation: "ServiceCertify", label: "Confirm service", version: record.version, sourceVersion: record.sourceVersion, quantity: record.intendedQuantity ?? undefined } : null)}
        {record.effects?.map((effect) => <p key={effect.id} className="text-sm">{effect.kind} · {effect.quantity}{effect.netAmount !== null ? ` · ${effect.netAmount}` : ""} · {effect.evidenceReference}</p>)}
      </div></Panel> : null}
      {!task && canPerform("ReceivingCancel") && draftActions.some((item) => item.action === "EditDraft" && item.candidate) && !uncertain && <Link className="text-sm text-primary hover:underline" to={`${base}/${id}/edit?kind=${kind}${returnQuery}`}>Edit delivery draft</Link>}
      {candidates(draftActions, (item) => item.action === "CancelDraft" ? { operation: service ? "ServiceCancel" : "ReceivingCancel", label: "Cancel draft", version: (record ?? receipt)!.version } : null)}
      </div>{activeTab === "overview" && (receipt || record) && <DetailSection title="Record Activity"><ReceivingActivity effects={effects} recordedAt={receipt?.recordedAt} /><p className="mt-4 text-xs text-muted-foreground">Recorded delivery and acceptance evidence. A complete audit export is not connected here.</p></DetailSection>}</div>
      {(receipt || record) && activeTab === "related" && <div className="pt-5"><ReceivingRelated orderId={orderId} orderNumber={sourceOrderNumber} canReadOrder={context.permissions.includes("procurement-po-read")} allowBillAction={!task} /></div>}
      {(receipt || record) && activeTab === "comments" && !task && <div className="pt-5"><ReceivingComments /></div>}
      {(receipt || record) && activeTab === "documents" && !task && <div className="pt-5"><ReceivingDocumentsSection documents={documents} /></div>}
      {(receipt || record) && activeTab === "history" && <div className="pt-5"><DetailSection title="History"><ReceivingActivity effects={effects} recordedAt={receipt?.recordedAt} /><div className="mt-4"><ReceivingUnavailableAction label="Full activity history" reason="Complete delivery audit and comment history are not connected here yet. Only recorded delivery and acceptance evidence is shown." /></div></DetailSection></div>}
      <div className="flex gap-3"><Link className="text-sm text-primary hover:underline" to={backPath}>{backPath === base ? "Back to deliveries" : "Back to vendor"}</Link><Button variant="secondary" disabled={busy} onClick={() => { setNotice(""); setActionError(""); setRevision((n) => n + 1); }}>Refresh delivery</Button></div>
    </>}
    {action && <Modal title={action?.label ?? "Delivery action"} onClose={() => { if (!busy) setAction(null); }}><form className="space-y-4" onSubmit={confirm}>
      {action?.operation === "ReceivingCancel" || action?.operation === "ServiceCancel" ? <Field label="Reason for cancelling"><Textarea value={reason} maxLength={principal ? 1000 : 2000} onChange={(event) => setReason(event.target.value)} required /></Field> : <>
        {action?.operation !== "ReceivingRecord" && <Field label={action?.operation === "ReceivingInspect" ? "Qualified quantity" : "Quantity to accept"}><Input value={quantity} inputMode="decimal" readOnly={action?.operation === "ServiceCertify"} onChange={(event) => setQuantity(event.target.value)} required /></Field>}
        <Field label="Evidence reference"><Input value={evidence} maxLength={principal ? 500 : 200} onChange={(event) => setEvidence(event.target.value)} required /></Field>
      </>}
      <Field label="I checked the delivery evidence"><Switch checked={verified} onChange={(event) => setVerified(event.target.checked)} /></Field><p className="text-sm text-muted-foreground">ERP checks your current access, site, policy and available quantity when you confirm.</p>
      <Button type="submit" disabled={!verified || busy || !!uncertain}>Confirm delivery action</Button>
    </form></Modal>}
  </div>;
}
