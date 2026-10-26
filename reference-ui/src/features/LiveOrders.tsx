import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { LiveOrderExecutionList, LiveOrderExecutionDetail } from "./LiveOrderExecution";
import { LiveOrderSourceEditor } from "./LiveOrderSourceEditor";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingBag, X } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { ActivityTimeline, DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  OrderDraftError, cancelOwnOrderDraft, createOwnOrderDraft, getOwnOrderDraft, listOwnOrderDrafts,
  updateOwnOrderDraft, type OrderDetail, type OrderDraftInput, type OrderDraftLine,
  type OrderPage,
} from "../../../src/platform/procurement-orders-api";
import { listPrincipalOrders, type PrincipalOrderPage } from "../../../src/platform/procurement-principal-drafts-api";
import { LivePrincipalOrderEditor } from "./LivePrincipalOrderEditor";
import { LivePrincipalOrderDetail } from "./LivePrincipalOrderDetail";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Try again. The order was not confirmed.";
const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankLine = (): OrderDraftLine => ({ description: "", unitCode: "EA", quantity: 1, unitPrice: 0, taxAmount: 0 });
const blankDraft = (currencyCode: string): OrderDraftInput => ({ supplierId: "", currencyCode,
  shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null,
  lines: [blankLine()] });

function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Purchase orders need an ERP company.");
  return readiness;
}

export function LiveOrderList() {
  const context = useCompany(); const { selection, authEpoch } = useErpShell();
  const [params] = useSearchParams();
  if (selection.entityId && selection.entityId !== context.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  if (params.get("workflow") === "principal")
    return <PrincipalDraftList key={[authEpoch, context.tenantId, context.legalEntityId,
      selection.branch ?? "all", context.principalId].join(":")} />;
  const entry = context.capabilities.principalDirectOrderDrafts
    && context.permissions.includes("procurement-po-read")
    ? <div className="px-5 pt-4 sm:px-8"><Link to="/purchase-orders?workflow=principal" className="text-sm text-primary underline">Orders from approved requests</Link></div>
    : null;
  return <>{entry}{context.capabilities.orders
    ? <LiveOrderExecutionList key={[context.tenantId, context.legalEntityId, selection.branch, context.principalId].join(":")} />
    : <LegacyOrderList key={[authEpoch, context.tenantId, context.legalEntityId, selection.branch, context.principalId, context.permissions.join("|")].join(":")} />}</>;
}
function PrincipalDraftList() {
  const context = useCompany(), navigate = useNavigate();
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<PrincipalOrderPage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const canRead = context.capabilities.principalDirectOrderDrafts && context.permissions.includes("procurement-po-read");
  const canCreate = canRead && context.permissions.includes("procurement-po-convert") && context.effectiveBranchId !== null;
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setLoading(true); setError(""); setData(null);
    listPrincipalOrders(context.legalEntityId, page, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, context.legalEntityId, page, revision]);
  if (!canRead) return <div className="p-5 sm:p-8" role="alert">Orders from approved requests are unavailable for this account.</div>;
  return <div className="p-5 sm:p-8"><LiveRecordDirectory key={page} title="Purchase Orders" entity="orders"
    subtitle="Review internal drafts from approved requests. Submitting, issuing, supplier sending, and Finance posting are unavailable here."
    columns={[{ key: "date", label: "Created", width: 125 }, { key: "number", label: "Order", width: 230 },
      { key: "currency", label: "Currency", width: 90 }, { key: "status", label: "Status", width: 110 }]}
    rows={(data?.items ?? []).map(order => ({ id: order.id, number: order.number, title: order.number,
      status: order.status, path: `/purchase-orders/${order.id}?workflow=principal`,
      fields: { date: order.createdAt?.slice(0, 10) || "", currency: order.currencyCode } }))}
    loading={loading} error={error} total={data?.total ?? 0} page={page} pageSize={data?.pageSize || 25}
    onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
    action={canCreate ? <Button onClick={() => navigate("/purchase-orders/new?workflow=principal")}>Order from approved request</Button> : undefined}
    emptyTitle="No orders from approved requests yet"
    emptyDescription="Select approved request lines to prepare an internal draft." />
    <Link to="/purchase-orders" className="mt-4 inline-block text-sm text-primary underline">Back to all purchase orders</Link>
  </div>;
}
function LegacyOrderList() {
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCreate = permissions.includes("procurement-po-create");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listOwnOrderDrafts(legalEntityId, page, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page, revision]);
  const action = canCreate ? <Button onClick={() => navigate("/purchase-orders/new")}>New order draft</Button> : undefined;
  return <div className="p-5 sm:p-8"><LiveRecordDirectory key={page} title="Purchase Orders" entity="orders"
    subtitle="Prepare orders here. Approval and sending to vendors happen after the buying controls are connected."
    columns={[{ key: "date", label: "Created", width: 125 }, { key: "number", label: "Order", width: 230 }, { key: "vendor", label: "Vendor", width: 180 }, { key: "currency", label: "Currency", width: 90 }, { key: "delivery", label: "Expected delivery", width: 140 }, { key: "status", label: "Status", width: 110 }]}
    rows={(data?.items ?? []).map(order => ({ id: order.id, number: order.number, title: order.supplierName || "Vendor", status: order.status,
      path: `/purchase-orders/${order.id}`, fields: { date: order.createdAt?.slice(0, 10) || "", vendor: order.supplierName || "Vendor", currency: order.currencyCode, delivery: order.expectedDeliveryOn || "" } }))}
    loading={loading} error={error} total={data?.total ?? 0} page={page} pageSize={data?.pageSize || 25}
    onPage={setPage} onRefresh={() => setRevision(value => value + 1)} action={action}
    emptyTitle="No purchase orders yet" emptyDescription="Create an internal draft to prepare the vendor and order lines." /></div>;
}

export function LiveOrderEditor() {
  const { id } = useParams(); const readiness = useCompany(); const { selection } = useErpShell();
  const [params] = useSearchParams();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  if (params.get("workflow") === "principal") return <LivePrincipalOrderEditor />;
  if (readiness.capabilities.orders) return <LiveOrderSourceEditor />;
  return <LiveOrderEditorRecord key={[readiness.tenantId, readiness.legalEntityId, selection.branch,
    readiness.principalId, id ?? "new"].join(":")} />;
}
function LiveOrderEditorRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode, permissions } = useCompany();
  const [draft, setDraft] = useState<OrderDraftInput>(() => blankDraft(defaultCurrencyCode));
  const [version, setVersion] = useState<number | null>(null);
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const recordKey = `${legalEntityId}:${id ?? "new"}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setLoadedKey(null); setVersion(null); setOriginalLineIds([]);
    setDraft(blankDraft(defaultCurrencyCode)); setReason("");
    (id ? getOwnOrderDraft(legalEntityId, id, controller.signal) : Promise.resolve(null))
      .then((record) => {
        if (controller.signal.aborted || !alive.current) return;
        if (!record) { if (!id) setLoadedKey(recordKey); return; }
        if (record.id !== id || record.status !== "Draft" || !Number.isSafeInteger(record.version) || record.version < 1)
          { setError("This order is unavailable for editing. Open its saved details."); return; }
        setVersion(record.version); setLoadedKey(recordKey);
        setOriginalLineIds(record.lines.map((line) => line.id));
        setDraft({ supplierId: record.supplierId, currencyCode: record.currencyCode,
          shipToRef: record.shipToRef, billToRef: record.billToRef,
          paymentTermRef: record.paymentTermRef, expectedDeliveryOn: record.expectedDeliveryOn,
          lines: record.lines.map((line) => ({ ...line })) });
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingVendors(true);
      listVendorDrafts(legalEntityId, { search: vendorSearch.trim() || undefined,
        pageSize: 100, signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted && alive.current) setVendors(page.items.filter((vendor) =>
          (vendor.status === "Active" || vendor.status === "Approved") && vendor.isOrderable)); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
        .finally(() => { if (!controller.signal.aborted) setLoadingVendors(false); });
    }, vendorSearch ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [legalEntityId, vendorSearch]);
  const field = <K extends keyof OrderDraftInput>(key: K, value: OrderDraftInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const lineField = (index: number, changes: Partial<OrderDraftLine>) =>
    setDraft((current) => ({ ...current, lines: current.lines.map((line, at) =>
      at === index ? { ...line, ...changes } : line) }));
  const total = draft.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice + line.taxAmount, 0);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || uncertain || stale || !alive.current
      || !permissions.includes(id ? "procurement-po-edit" : "procurement-po-create")) return;
    setError("");
    if (loadedKey !== recordKey || id && version === null) { setError("This draft is unavailable. Return to the order list."); return; }
    if (!draft.supplierId) { setError("Choose an active vendor."); return; }
    if (!draft.lines.length) { setError("Add at least one order line."); return; }
    if (id && !reason.trim() && originalLineIds.some((lineId) =>
      draft.lines.every((line) => line.id !== lineId))) {
      setError("Give a reason for removing a saved line."); return;
    }
    setSaving(true);
    try {
      const record = id && version !== null
        ? await updateOwnOrderDraft(legalEntityId, id, version, draft, reason.trim() || undefined)
        : await createOwnOrderDraft(legalEntityId, draft);
      if (alive.current) navigate(`/purchase-orders/${record.id}`);
    } catch (cause) {
      if (!alive.current) return;
      setError(errorText(cause));
      if (cause instanceof OrderDraftError && cause.status === 409) setStale(true);
      if (!(cause instanceof OrderDraftError) || cause.status === 0 || cause.status >= 500) setUncertain(true);
    }
    finally { if (alive.current) setSaving(false); }
  }
  if (!permissions.includes(id ? "procurement-po-edit" : "procurement-po-create"))
    return <div className="p-5 sm:p-8" role="alert">You do not have access to edit purchase orders for this company.</div>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background pb-20">
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-5 sm:px-8">
      <div className="min-w-0"><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={23} strokeWidth={1.4} className="shrink-0" />{id ? "Edit order draft" : "New purchase order draft"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">This stays internal until approvals and budget checks are available.</p></div>
      <Button type="button" variant="ghost" aria-label="Close editor" disabled={saving} onClick={() => navigate(id ? `/purchase-orders/${id}` : "/purchase-orders")}><X size={20} /></Button>
    </header>
    <div className="max-w-[1260px] space-y-7 px-5 py-6 sm:px-8">
    {loading ? <p role="status">Loading order…</p> : loadedKey !== recordKey || id && version === null
      ? <p role="alert">{error || "This draft is unavailable. Return to the order list."}</p>
      : <form onSubmit={save} className="space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <fieldset disabled={saving || uncertain || stale} className="contents">
      <Panel title="Order details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Find vendor"><Input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Search vendor name" /></Field>
        <Field label="Vendor"><Select required value={draft.supplierId} disabled={loadingVendors}
          onChange={(event) => field("supplierId", event.target.value)}>
          <option value="">{loadingVendors ? "Loading vendors…" : "Choose vendor"}</option>
          {draft.supplierId && !vendors.some((vendor) => vendor.id === draft.supplierId)
            && <option value={draft.supplierId}>Selected vendor</option>}
          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}
        </Select></Field>
        <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode}
          onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Expected delivery"><Input type="date" value={draft.expectedDeliveryOn || ""}
          onChange={(event) => field("expectedDeliveryOn", event.target.value || null)} /></Field>
        <Field label="Deliver to"><Input maxLength={500} value={draft.shipToRef || ""}
          onChange={(event) => field("shipToRef", event.target.value)} /></Field>
        <Field label="Bill to"><Input maxLength={500} value={draft.billToRef || ""}
          onChange={(event) => field("billToRef", event.target.value)} /></Field>
        <Field label="Payment terms"><Input maxLength={500} value={draft.paymentTermRef || ""}
          onChange={(event) => field("paymentTermRef", event.target.value)} /></Field>
      </div></Panel>
      <Panel title="What are you ordering?"><div className="space-y-4 p-5">
        {draft.lines.map((line, index) => <div key={line.id || `new-${index}`} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
          <Field label={`Description ${index + 1}`} className="sm:col-span-2"><Input required maxLength={500} value={line.description}
            onChange={(event) => lineField(index, { description: event.target.value })} /></Field>
          <Field label="Unit"><Input required maxLength={20} value={line.unitCode}
            onChange={(event) => lineField(index, { unitCode: event.target.value })} /></Field>
          <Field label="Quantity"><Input required type="number" min="0.0001" max="1000000" step="any" value={line.quantity}
            onChange={(event) => lineField(index, { quantity: Number(event.target.value) })} /></Field>
          <Field label="Unit price"><Input required type="number" min="0" max="1000000000" step="any" value={line.unitPrice}
            onChange={(event) => lineField(index, { unitPrice: Number(event.target.value) })} /></Field>
          <Field label="Tax amount"><Input required type="number" min="0" max="1000000000000" step="any" value={line.taxAmount}
            onChange={(event) => lineField(index, { taxAmount: Number(event.target.value) })} /></Field>
          {draft.lines.length > 1 && <Button type="button" variant="secondary" onClick={() =>
            field("lines", draft.lines.filter((_, at) => at !== index))}>Remove line</Button>}
        </div>)}
        <Button type="button" variant="secondary" disabled={draft.lines.length >= 100} onClick={() =>
          field("lines", [...draft.lines, blankLine()])}>Add line</Button>
        <p className="text-right text-sm font-semibold">Estimated total {money(total, draft.currencyCode)}</p>
      </div></Panel>
      {id && <Field label="Reason for removing a saved line" hint="Required if you remove a line from an existing draft."><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>}
      <Panel title="Notes and attachments"><div className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Notes and attachments cannot be saved on this order draft yet. Add the order details and lines above, then review the saved record.</p><Button type="button" variant="secondary" disabled>Add attachment</Button></div></Panel>
      </fieldset>
      {stale && <p role="alert">This saved order changed. Your entries stay here. Open the saved draft to compare before making another correction. <Link to={`/purchase-orders/${id}`}>Open saved draft</Link></p>}
      {uncertain && <p role="alert">This save is unconfirmed. Check the order list before making another change; the save will not be repeated automatically. <Link to="/purchase-orders">Open purchase orders</Link></p>}
      <footer className="sticky bottom-8 z-10 flex flex-wrap items-center gap-3 border-y border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <Button type="submit" disabled={saving || uncertain || stale}>{saving ? "Saving…" : "Save draft"}</Button>
        <Button type="button" variant="secondary" disabled title="Approval and vendor sending are separate workflows.">Save and send</Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => navigate(id ? `/purchase-orders/${id}` : "/purchase-orders")}>Cancel</Button>
        <span className="ml-auto text-xs text-muted-foreground">Draft only · sending and payment are separate actions</span>
      </footer>
    </form>}
    </div>
  </div>;
}

export function LiveOrderDetail() {
  const context = useCompany(); const { selection } = useErpShell();
  const [params] = useSearchParams();
  if (selection.entityId && selection.entityId !== context.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  if (params.get("workflow") === "principal") return <LivePrincipalOrderDetail />;
  return context.capabilities.orders ? <LiveOrderExecutionDetail /> : <LegacyOrderDetail />;
}
function LegacyOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, permissions } = useCompany();
  const [record, setRecord] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnOrderDraft(legalEntityId, id, controller.signal).then(setRecord)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  async function cancel() {
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this draft."); return; }
    setBusy(true); setError("");
    try { setRecord(await cancelOwnOrderDraft(legalEntityId, record.id, record.version, reason.trim())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading order…</div>;
  if (!record) return <div className="p-5 sm:p-8" role="alert">{error || "Order not found."}</div>;
  const canEdit = record.status === "Draft" && permissions.includes("procurement-po-edit");
  return <div className="min-h-[calc(100dvh-5rem)] bg-background">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur sm:px-8">
      <div className="min-w-0"><Link className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to="/purchase-orders"><ArrowLeft size={13} />Purchase Orders</Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 title={record.number} className="max-w-3xl break-all text-2xl font-semibold line-clamp-2">{record.number}</h1><Badge>{record.status}</Badge></div>
        <p className="mt-1 text-xs text-muted-foreground">{record.supplierName || "Vendor"} · {record.currencyCode}</p></div>
      {canEdit && <Button onClick={() => navigate(`/purchase-orders/${record.id}/edit`)}>Edit draft</Button>}
    </header>
    <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "items", label: `Items (${record.lines.length})` }, { key: "related", label: "Related" },
      { key: "comments", label: "Comments" }, { key: "history", label: "History" }]} active={activeTab} onChange={setActiveTab} />
    <div className="space-y-5 px-5 py-6 sm:px-8">
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {activeTab === "overview" && <><p className="rounded-lg border border-border bg-surface-muted p-4 text-sm">{record.nextStep}</p>
    <DetailSection title="Purchase Order Overview" action={<Badge>{record.status}</Badge>}><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <DetailValue label="Status" value={record.status} /><DetailValue label="Expected delivery" value={record.expectedDeliveryOn || "—"} />
      <DetailValue label="Deliver to" value={record.shipToRef || "—"} /><DetailValue label="Bill to" value={record.billToRef || "—"} />
      <DetailValue label="Payment terms" value={record.paymentTermRef || "—"} /><DetailValue label="Currency" value={record.currencyCode} />
      {record.closureReason && <DetailValue label="Cancellation reason" value={record.closureReason} />}
    </dl></DetailSection>
    {canEdit && <Panel title="Cancel draft"><div className="space-y-3 p-5">
      <Field label="Cancellation reason"><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button>
    </div></Panel>}</>}
    {activeTab === "items" && <DetailSection title="Items / Line Details"><div className="overflow-x-auto"><RecordTable variant="compact">
      <thead><tr><th>Line</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
      <tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td>
        <td>{line.unitCode}</td><td>{line.quantity}</td><td>{money(line.unitPrice, record.currencyCode)}</td>
        <td>{money(line.taxAmount, record.currencyCode)}</td></tr>)}</tbody>
    </RecordTable></div><p className="mt-4 text-right font-semibold">Estimated total {money(record.total, record.currencyCode)}</p></DetailSection>}
    {activeTab === "related" && <DetailSection title="Related Records"><p className="text-sm text-muted-foreground">Related receipts and bills are not connected to this draft view yet. Open their own ERP pages to review saved records.</p></DetailSection>}
    {activeTab === "comments" && <DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments cannot be saved on this purchase order yet.</p></DetailSection>}
    {activeTab === "history" && <DetailSection title="History"><ActivityTimeline items={[]} /><p className="mt-3 text-sm text-muted-foreground">Detailed order change history is not available from the draft API.</p></DetailSection>}
    </div>
  </div>;
}
