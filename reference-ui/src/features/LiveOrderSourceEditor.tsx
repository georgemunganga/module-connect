import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShoppingBag, X } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Select, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { pendingOrderCommands } from "../lib/order-command-memory";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import { getOrderExecution, listApprovedOrderSources, OrderExecutionError, recoverOrderCommand, sendOrderCommand, sourceOrderCommandBody,
  type ApprovedOrderSource, type ApprovedOrderSourcePage, type ExactOrderDraft, type ExactOrderDraftLine, type OrderCommand } from "../../../src/platform/procurement-order-execution-api";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Saving was not confirmed.";
const empty = (currency: string): ExactOrderDraft => ({ supplierId: "", currencyCode: currency, shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null, lines: [] });
export function LiveOrderSourceEditor() {
  const { id } = useParams(), context = useLiveReadiness()!;
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  const scopeKey = `${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}:${id ?? "new"}`;
  return <SourceEditor key={scopeKey} id={id} scopeKey={scopeKey} />;
}
function SourceEditor({ id, scopeKey }: { id?: string; scopeKey: string }) {
  const context = useLiveReadiness()!, navigate = useNavigate(), company = context.legalEntityId;
  const canWrite = context.permissions.includes(id ? "procurement-po-edit" : "procurement-po-convert");
  const canReadVendors = context.permissions.includes("procurement-vendor-read");
  const [draft, setDraft] = useState<ExactOrderDraft>(() => empty(context.defaultCurrencyCode)), [sources, setSources] = useState<ApprovedOrderSource[]>([]);
  const [version, setVersion] = useState<number | null>(null), [supplierName, setSupplierName] = useState(""), [loading, setLoading] = useState(!!id), [error, setError] = useState("");
  const [vendors, setVendors] = useState<VendorSummary[]>([]), [vendorSearch, setVendorSearch] = useState(""), [vendorError, setVendorError] = useState("");
  const [sourcePage, setSourcePage] = useState<ApprovedOrderSourcePage | null>(null), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [sourcesLoading, setSourcesLoading] = useState(!id);
  const [sourceError, setSourceError] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState<OrderCommand | null>(() => pendingOrderCommands.get(scopeKey) ?? null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!id || !canWrite) return;
    const abort = new AbortController(); setLoading(true); setVersion(null); setError("");
    getOrderExecution(company, id, abort.signal).then((detail) => {
      if (abort.signal.aborted) return;
      if (!detail.actionCandidates.some((candidate) => candidate.code === "SourceEdit" && candidate.canStart && context.permissions.includes(candidate.permission))) {
        setBlocked(true); setError("This linked draft cannot currently be edited. Review its funds, status and access first."); return;
      }
      if (!detail.order.lines.length || detail.order.lines.some((line) => !line.sourcePurchaseRequestLineId)) throw new Error("Every saved line must retain an approved request source.");
      setVersion(detail.order.version); setSupplierName(detail.order.supplierName || "Current vendor");
      setDraft({ supplierId: detail.order.supplierId, currencyCode: detail.order.currencyCode, shipToRef: detail.order.shipToRef || "", billToRef: detail.order.billToRef || "",
        paymentTermRef: detail.order.paymentTermRef || "", expectedDeliveryOn: detail.order.expectedDeliveryOn,
        lines: detail.order.lines.map((line) => ({ id: line.id, description: line.description, unitCode: line.unitCode, quantity: line.quantity, unitPrice: line.unitPrice,
          taxAmount: line.taxAmount, costCenterRef: line.costCenterRef, projectRef: line.projectRef, expectedDeliveryOn: line.expectedDeliveryOn })) });
    }).catch((cause: unknown) => { if (!abort.signal.aborted) { setError(message(cause)); setBlocked(true); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, id, canWrite]);
  useEffect(() => {
    if (id || !canWrite) return;
    const abort = new AbortController(); setSourcesLoading(true); setSourcePage(null); setSourceError("");
    listApprovedOrderSources(company, page, abort.signal).then((result) => { if (!abort.signal.aborted) setSourcePage(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setSourceError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setSourcesLoading(false); });
    return () => abort.abort();
  }, [company, id, page, refresh, canWrite]);
  useEffect(() => {
    if (!canWrite || !canReadVendors) return;
    const abort = new AbortController(); setVendorError("");
    const timer = setTimeout(() => {
      listVendorDrafts(company, { search: vendorSearch.trim() || undefined, pageSize: 100, signal: abort.signal })
        .then((result) => { if (!abort.signal.aborted) setVendors(result.items.filter((vendor) => (vendor.status === "Active" || vendor.status === "Approved") && vendor.isOrderable)); })
        .catch((cause: unknown) => { if (!abort.signal.aborted) setVendorError(message(cause)); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [company, vendorSearch, canWrite, canReadVendors]);
  function select(source: ApprovedOrderSource, checked: boolean) {
    if (pending || busy || id) return;
    if (!checked) {
      const index = sources.findIndex((item) => item.lineId === source.lineId); setSources((current) => current.filter((item) => item.lineId !== source.lineId));
      setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) })); return;
    }
    if (sources.length >= 100 || sources.some((item) => item.lineId === source.lineId) || source.eligibility !== "Available"
      || !source.availableQuantityExact || !source.approvedUnitPriceExact || !source.unitCode || !source.currencyCode) return;
    if (sources[0] && (sources[0].currencyCode !== source.currencyCode || (sources[0].branchRef ?? null) !== (source.branchRef ?? null))) return;
    setSources((current) => [...current, source]);
    setDraft((current) => ({ ...current, currencyCode: source.currencyCode!, lines: [...current.lines, { description: source.description || "", unitCode: source.unitCode!, quantity: source.availableQuantityExact!, unitPrice: source.approvedUnitPriceExact!, taxAmount: "0" }] }));
  }
  const field = <K extends keyof ExactOrderDraft>(key: K, value: ExactOrderDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  function lineField(at: number, change: Partial<ExactOrderDraftLine>) { field("lines", draft.lines.map((line, index) => index === at ? { ...line, ...change } : line)); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || pending || pendingOrderCommands.has(scopeKey) || blocked) return; setError("");
    if (!draft.supplierId || !draft.lines.length || id && version === null || !id && sources.length !== draft.lines.length) { setError("Choose an active vendor and approved request lines before saving."); return; }
    if (id && !reason.trim()) { setError("Give a reason for changing this linked draft."); return; }
    let body: string;
    try { body = sourceOrderCommandBody(draft, id ? version! : sources, reason); } catch (cause) { setError(message(cause)); return; }
    const command: OrderCommand = { orderId: id ?? null, operation: id ? "SourceEdit" : "Convert", key: crypto.randomUUID(), body };
    pendingOrderCommands.set(scopeKey, command); setPending(command); setBusy(true);
    try {
      const result = await sendOrderCommand(company, command); pendingOrderCommands.delete(scopeKey);
      if (alive.current) { setPending(null); navigate(`/purchase-orders/${result.id}`); }
    } catch (cause) {
      if (alive.current) {
        setError(message(cause));
        if (cause instanceof OrderExecutionError && [400, 401, 403, 404, 409, 422].includes(cause.status)) {
          pendingOrderCommands.delete(scopeKey); setPending(null);
          if ([401, 403, 404].includes(cause.status) || id && cause.status === 409) setBlocked(true);
          if (!id && cause.status === 409) setSourceError("Review the current source list. Remove and select changed lines again to pin their current versions.");
        }
      }
    } finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || busy) return; setBusy(true); setError("");
    try { const result = await recoverOrderCommand(company, pending); pendingOrderCommands.delete(scopeKey);
      if (alive.current) { setPending(null); navigate(`/purchase-orders/${result.orderId}`); }
    } catch (cause) { if (alive.current) setError(`${message(cause)} No new conversion or update has been sent.`); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!canWrite) return <div className="p-5 sm:p-8" role="alert">You do not have access to {id ? "edit linked order drafts" : "create orders from approved requests"}.</div>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background pb-20">
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-5 sm:px-8"><div className="min-w-0">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={23} strokeWidth={1.4} className="shrink-0" />{id ? "Edit linked order draft" : "Create order from approved requests"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Each line keeps its approved request. ERP rechecks sources, prices, quantities and access when you save.</p></div>
      <Button type="button" variant="ghost" aria-label="Close editor" disabled={busy} onClick={() => navigate(id ? `/purchase-orders/${id}` : "/purchase-orders")}><X size={20} /></Button>
    </header><div className="max-w-[1260px] space-y-7 px-5 py-6 sm:px-8">
    {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}
    {pending && <Panel title="Check an unconfirmed save" className="mb-5"><div className="space-y-3 p-5"><p>New saves are paused. Keep this tab open and check the original result before creating or changing another order.</p>
      <p className="text-sm">Command reference: <code>{pending.key}</code></p><details className="text-sm"><summary>Original save details</summary><pre className="overflow-auto whitespace-pre-wrap">{pending.operation}{"\n"}{pending.body}</pre></details>
      <Button disabled={busy} onClick={() => void recover()}>{busy ? "Checking…" : "Check saved order"}</Button></div></Panel>}
    {loading ? <p role="status">Loading linked draft…</p> : id && (version === null || blocked) ? <p className="mb-5 text-sm">Return to the order to review its latest state before editing.</p> : <form onSubmit={(event) => void save(event)} className="min-w-0 space-y-5">
      <fieldset disabled={busy || !!pending || blocked} className="min-w-0 space-y-5">
        {!id && <Panel title="Approved request lines"><div className="space-y-4 p-5"><p className="text-sm">Choose available lines from the same branch and currency. You may order part of an available quantity. Server eligibility remains final.</p>
          <Button variant="secondary" onClick={() => setRefresh((n) => n + 1)}>Refresh source list</Button>{sourceError && <p role="alert" className="text-sm text-red-700">{sourceError}</p>}
          {sourcesLoading ? <p role="status">Loading approved request lines…</p> : sourcePage?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Select</th><th>Request</th><th>Description</th><th>Available</th><th>Approved unit price</th><th>Status</th></tr></thead>
            <tbody>{sourcePage.items.map((source) => { const selected = sources.some((item) => item.lineId === source.lineId), mixed = !!sources[0] && (sources[0].currencyCode !== source.currencyCode || (sources[0].branchRef ?? null) !== (source.branchRef ?? null));
              return <tr key={source.lineId}><td><Switch aria-label={`Select ${source.requestNumber} ${source.description || source.lineId}`} checked={selected} disabled={!selected && (source.eligibility !== "Available" || mixed || sources.length >= 100)} onChange={(event) => select(source, event.target.checked)} /></td>
                <td>{source.requestNumber}</td><td>{source.description || "Source needs review"}</td><td>{source.availableQuantityExact || "—"}</td><td>{source.currencyCode} {source.approvedUnitPriceExact || "—"}</td><td><Badge>{source.eligibility}</Badge>{mixed && <p className="text-sm">Different branch or currency</p>}</td></tr>; })}</tbody></RecordTable></div> : !sourceError && <p>No approved request lines are currently available.</p>}
          {sourcePage && sourcePage.total > sourcePage.pageSize && <div className="flex items-center gap-3"><Button variant="secondary" disabled={page <= 1 || sourcesLoading} onClick={() => setPage(page - 1)}>Previous source lines</Button><span>Page {page}</span><Button variant="secondary" disabled={page * sourcePage.pageSize >= sourcePage.total || sourcesLoading} onClick={() => setPage(page + 1)}>Next source lines</Button></div>}
        </div></Panel>}
        <Panel title="Order details"><div className="grid gap-4 p-5 sm:grid-cols-2">
          {canReadVendors ? <><Field label="Find vendor"><Input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} /></Field><Field label="Vendor"><Select required value={draft.supplierId} onChange={(event) => field("supplierId", event.target.value)}><option value="">Choose an active vendor</option>
            {draft.supplierId && !vendors.some((vendor) => vendor.id === draft.supplierId) && <option value={draft.supplierId}>{supplierName || "Selected vendor"}</option>}{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</Select></Field></>
            : id ? <Field label="Vendor"><Input readOnly value={supplierName} /></Field> : <p role="alert" className="text-sm">Vendor read access is needed to choose an active vendor. No additional access is granted here.</p>}
          {vendorError && <p role="alert" className="text-sm text-red-700">{vendorError}</p>}
          <Field label="Currency"><Input readOnly value={draft.currencyCode} /></Field><Field label="Expected delivery"><Input type="date" value={draft.expectedDeliveryOn || ""} onChange={(event) => field("expectedDeliveryOn", event.target.value || null)} /></Field>
          <Field label="Deliver to"><Input maxLength={500} value={draft.shipToRef} onChange={(event) => field("shipToRef", event.target.value)} /></Field><Field label="Bill to"><Input maxLength={500} value={draft.billToRef} onChange={(event) => field("billToRef", event.target.value)} /></Field>
          <Field label="Payment terms"><Input maxLength={500} value={draft.paymentTermRef} onChange={(event) => field("paymentTermRef", event.target.value)} /></Field>
        </div></Panel>
        <Panel title="Linked order lines"><div className="space-y-4 p-5"><p className="text-sm">Available quantities and approved prices are checked when you save. The order total is calculated by ERP.</p>
          {!draft.lines.length && <p>Select approved request lines above to prepare this order.</p>}
          {draft.lines.map((line, at) => <div key={line.id || sources[at]?.lineId} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
            {!id && <p className="text-sm sm:col-span-6">Source: {sources[at]?.requestNumber} · Available {sources[at]?.availableQuantityExact} · Approved unit price {sources[at]?.approvedUnitPriceExact}</p>}
            <Field label={`Description ${at + 1}`} className="sm:col-span-2"><Input required maxLength={500} value={line.description} onChange={(event) => lineField(at, { description: event.target.value })} /></Field>
            <Field label={`Unit ${at + 1}`}><Input readOnly value={line.unitCode} /></Field>
            <Field label={`Quantity ${at + 1}`}><Input required inputMode="decimal" value={line.quantity} onChange={(event) => lineField(at, { quantity: event.target.value })} /></Field>
            <Field label={`Unit price ${at + 1}`}><Input required inputMode="decimal" value={line.unitPrice} onChange={(event) => lineField(at, { unitPrice: event.target.value })} /></Field>
            <Field label={`Tax amount ${at + 1}`}><Input required inputMode="decimal" value={line.taxAmount} onChange={(event) => lineField(at, { taxAmount: event.target.value })} /></Field>
            {!id && <Button variant="secondary" onClick={() => select(sources[at], false)}>Remove {sources[at]?.requestNumber} line</Button>}
          </div>)}
        </div></Panel>
        {id && <Field label="Reason for changing this linked draft"><Textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>}
        <Panel title="Notes and attachments"><div className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Notes and attachments cannot be saved through this linked order form yet. The approved request sources and order lines above are retained.</p><Button type="button" variant="secondary" disabled>Add attachment</Button></div></Panel>
      </fieldset>
      <footer className="sticky bottom-8 z-10 flex flex-wrap items-center gap-3 border-y border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <Button type="submit" disabled={busy || !!pending || blocked || !draft.lines.length || !draft.supplierId || !id && !canReadVendors}>{busy ? "Saving…" : id ? "Save linked draft" : "Create linked order"}</Button>
        <Button type="button" variant="secondary" disabled title="Order approval and vendor sending are separate actions.">Save and send</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => navigate(id ? `/purchase-orders/${id}` : "/purchase-orders")}>Cancel</Button>
        <span className="ml-auto text-xs text-muted-foreground">Approved request lines stay linked · sending is separate</span>
      </footer>
    </form>}
    </div>
  </div>;
}
