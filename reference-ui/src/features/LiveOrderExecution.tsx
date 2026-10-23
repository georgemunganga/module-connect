import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Select, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { ActivityTimeline, DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import type { ApprovalAction } from "../../../src/platform/procurement-approvals-api";
import { pendingOrderCommands as pendingCommands } from "../lib/order-command-memory";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import { getOrderExecution, listOrderExecution, orderCommandBody, OrderExecutionError, recoverOrderCommand, sendOrderCommand,
  selectCurrentCommercialEvidence, type ExecutionOrderDetail, type ExecutionOrderPage, type OrderAction, type OrderCommand, type OrderCommandOperation, type WorklistView } from "../../../src/platform/procurement-order-execution-api";
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The order could not be confirmed.";
const labels: Record<OrderAction, string> = { Finance: "Record Finance confirmation", DraftFinanceRelease: "Record draft funds release",
  FinanceRelease: "Record funds release", Submit: "Send order for approval", Issue: "Authorise sending", Delivery: "Record sending outcome" };
const supported = (code: string): code is OrderAction => Object.hasOwn(labels, code);
const needsCurrentEvidence = (action: OrderCommandOperation) => ["Finance", "DraftFinanceRelease", "FinanceRelease", "Delivery"].includes(action);
// Unconfirmed payloads survive detail navigation in this signed-in browser lifetime.
// They are scoped to company, branch, canonical worker and order; never auto-replayed.
const localNow = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23); };

export function LiveOrderExecutionList() {
  const context = useLiveReadiness()!;
  const views: Array<{ code: WorklistView; label: string; permission: string }> = [
    { code: "buyer", label: "My buying work", permission: "procurement-po-read" },
    { code: "finance", label: "Finance review", permission: "procurement-po-finance-confirm" },
    { code: "dispatch", label: "Sending orders", permission: "procurement-po-dispatch-confirm" },
  ].filter((view) => context.permissions.includes(view.permission)) as Array<{ code: WorklistView; label: string; permission: string }>;
  const [view, setView] = useState<WorklistView>(() => views[0]?.code ?? "buyer");
  const [status, setStatus] = useState(""), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<ExecutionOrderPage | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const allowed = views.some((item) => item.code === view);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError(""); setLoading(true);
    if (!allowed) { setLoading(false); return () => abort.abort(); }
    listOrderExecution(context.legalEntityId, view, page, status, abort.signal)
      .then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [context.legalEntityId, view, page, status, revision, allowed]);
  return <div className="p-5 sm:p-8"><PageHeader title="Purchase Orders" subtitle="Review the orders assigned to your buying, Finance or sending responsibilities." actions={context.permissions.includes("procurement-po-convert") ? <Link className="text-sm text-primary hover:underline" to="/purchase-orders/new">Create from approved requests</Link> : undefined} />
    {!views.length ? <p role="alert">You do not have access to an order worklist.</p> : <>
      <div role="tablist" aria-label="Order responsibilities" className="mb-5 flex flex-wrap gap-3">{views.map((item) => <Button key={item.code} role="tab" aria-selected={view === item.code}
        variant={view === item.code ? "primary" : "secondary"} onClick={() => { setData(null); setView(item.code); setPage(1); }}>{item.label}</Button>)}</div>
      <div className="mb-5 flex flex-wrap items-end gap-3"><Field label="Order status"><Select value={status} onChange={(event) => { setData(null); setStatus(event.target.value); setPage(1); }}>
        <option value="">All statuses</option>{["Draft", "PendingApproval", "Approved", "Returned", "Rejected", "IssuePending", "Issued", "Cancelled"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh orders</Button></div>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status">Loading your order work…</p> : data?.items.length ? <Panel><div className="overflow-x-auto p-5"><RecordTable>
        <thead><tr><th>Order</th><th>Vendor</th><th>Currency</th><th>Expected delivery</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((order) => <tr key={order.id}><td>{order.number}</td><td>{order.supplierName || "Vendor"}</td><td>{order.currencyCode}</td><td>{order.expectedDeliveryOn || "—"}</td><td><Badge>{order.status}</Badge></td>
          <td><Link className="text-sm text-primary hover:underline" to={`/purchase-orders/${order.id}`}>Review order</Link></td></tr>)}</tbody>
      </RecordTable></div></Panel> : !error && <EmptyState title="No orders need your attention" description="Orders within your current company, branch and responsibilities will appear here." />}
      {data && data.total > data.pageSize && <div className="mt-5 flex items-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => { setData(null); setPage(page - 1); }}>Previous orders</Button><span>Page {page}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => { setData(null); setPage(page + 1); }}>Next orders</Button></div>}
    </>}
  </div>;
}

export function LiveOrderExecutionDetail() {
  const { id = "" } = useParams(), context = useLiveReadiness()!;
  const branch = procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "";
  return <ExecutionDetail key={`${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}:${id}`} id={id} scopeKey={`${context.tenantId}:${context.legalEntityId}:${context.principalId}:${branch}:${id}`} />;
}
function ExecutionDetail({ id, scopeKey }: { id: string; scopeKey: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const [data, setData] = useState<ExecutionOrderDetail | null>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [action, setAction] = useState<OrderAction | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [pending, setPending] = useState<OrderCommand | null>(() => pendingCommands.get(scopeKey) ?? null);
  const [decision, setDecision] = useState<{ assignmentId: string; caseVersion: number; assignmentVersion: number; action: ApprovalAction; reason: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setLoading(true); setError(""); setAction(null); setDecision(null);
    getOrderExecution(company, id, abort.signal).then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, id, revision]);
  async function execute(body: string, operation: OrderCommandOperation, assignmentId?: string) {
    if (pending || pendingCommands.has(scopeKey) || busy) return;
    if (needsCurrentEvidence(operation) && (!data || !canUseEvidence(operation))) {
      setError("Current Finance or sending evidence is unavailable. Refresh the order before recording this action."); return;
    }
    const command: OrderCommand = { orderId: id, operation, key: crypto.randomUUID(), body, assignmentId };
    pendingCommands.set(scopeKey, command); setPending(command); setBusy(true); setError("");
    try {
      const reply = await sendOrderCommand(company, command);
      pendingCommands.delete(scopeKey);
      if (alive.current) { setPending(null); setAction(null); setDecision(null); setNotice(`Saved: ${reply.status}. ${reply.nextStep || "Refresh to review the current order."}`); setRevision((n) => n + 1); }
    } catch (cause) {
      if (alive.current) {
        setError(errorText(cause)); setAction(null); setDecision(null);
        if (cause instanceof OrderExecutionError && [400, 401, 403, 404, 409, 422].includes(cause.status)) {
          pendingCommands.delete(scopeKey); setPending(null); setData(null); setNotice(errorText(cause)); setRevision((n) => n + 1);
        }
      }
    } finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || busy) return; setBusy(true); setError("");
    try {
      const result = await recoverOrderCommand(company, pending);
      pendingCommands.delete(scopeKey);
      if (alive.current) { setPending(null); setNotice(`Saved result found: ${result.historicalStatus}. Current order: ${result.currentStatus}. This does not authorise repeating the action.`); setRevision((n) => n + 1); }
    } catch (cause) { if (alive.current) { setError(`${errorText(cause)} Keep this command reference. No new command has been sent.`);
      if (cause instanceof OrderExecutionError && [403, 404].includes(cause.status)) setData(null);
    } }
    finally { if (alive.current) setBusy(false); }
  }
  const evidenceSelection = data ? selectCurrentCommercialEvidence(data) : null;
  function canUseEvidence(operation: OrderCommandOperation): boolean {
    if (!needsCurrentEvidence(operation)) return true;
    if (!evidenceSelection) return false;
    if (operation === "FinanceRelease" || operation === "DraftFinanceRelease") return !!evidenceSelection.finance && !evidenceSelection.finance.releaseConfirmed;
    if (operation === "Delivery") return !!evidenceSelection.issued;
    return true;
  }
  const recovery = pending && <Panel title="Check an unconfirmed action" className="mb-5"><div className="space-y-3 p-5"><p>The saved result is not confirmed. New actions are paused to avoid recording it twice.</p>
    <p className="text-sm">Command reference: <code>{pending.key}</code>. Keep this browser tab open until the result is reconciled.</p>
    <details className="text-sm"><summary>Original action details</summary><pre className="overflow-auto whitespace-pre-wrap">{pending.operation}{"\n"}{pending.body}</pre></details>
    <Button disabled={busy} onClick={() => void recover()}>{busy ? "Checking…" : "Check saved result"}</Button></div></Panel>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur sm:px-8"><div className="min-w-0">
      <Link className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to="/purchase-orders"><ArrowLeft size={13} />Purchase Orders</Link>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 title={data?.order.number ?? "Purchase order"} className="max-w-3xl break-all text-2xl font-semibold line-clamp-2">{data?.order.number ?? "Purchase order"}</h1>{data && <Badge>{data.order.status}</Badge>}</div>
      {data && <p className="mt-1 text-xs text-muted-foreground">{data.order.supplierName || "Vendor"} · {data.order.currencyCode}</p>}
    </div></header>
    {data && <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "items", label: `Items (${data.order.lines.length})` }, { key: "related", label: "Related" },
      { key: "comments", label: "Comments" }, { key: "history", label: "History" }]} active={activeTab} onChange={setActiveTab} />}
    <div className="space-y-5 px-5 py-6 sm:px-8">
    {notice && <p role="status" className="mb-5 text-sm">{notice}</p>}{error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}{recovery}
    {loading ? <p role="status">Loading order review…</p> : data ? <>
      {activeTab === "overview" && <><DetailSection title="Purchase Order Overview" action={<Badge>{data.order.status}</Badge>}><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <DetailValue label="Status" value={data.order.status} /><DetailValue label="Finance" value={data.financeStatus === "CommitmentHeld" ? "Funds reserved for this order" : "No confirmed funds held"} />
        <DetailValue label="Deliver to" value={data.order.shipToRef || "—"} /><DetailValue label="Bill to" value={data.order.billToRef || "—"} />
        <DetailValue label="Payment terms" value={data.order.paymentTermRef || "—"} /><DetailValue label="Commercial revision" value={data.order.currentRevision} /></dl>
        {(data.order.status === "Returned" || data.order.status === "Rejected") && data.financeStatus === "CommitmentHeld" && <p className="px-5 pb-5 text-sm">Finance must confirm the release or restoration of held funds before this order can be changed.</p>}
      </DetailSection>
      <Panel title="Next actions"><div className="space-y-3 p-5"><p className="text-sm">ERP checks your current access, amounts, approvals and evidence when you confirm. An available form does not guarantee approval.</p>
        {!evidenceSelection && <p role="status" className="text-sm">Current Finance and sending evidence is unavailable in this order view. Those actions are paused; approval and order history remain available.</p>}
        <div className="flex flex-wrap gap-3">{!pending && data.actionCandidates.some((candidate) => candidate.code === "SourceEdit" && candidate.canStart && context.permissions.includes(candidate.permission)) && <Link className="text-sm text-primary hover:underline" to={`/purchase-orders/${id}/edit`}>Edit linked draft</Link>}{data.actionCandidates.filter((candidate) => supported(candidate.code) && context.permissions.includes(candidate.permission)).map((candidate) => <div key={candidate.code}>
          <Button variant="secondary" disabled={busy || !!pending || !candidate.canStart || !canUseEvidence(candidate.code as OrderAction)} onClick={() => setAction(candidate.code as OrderAction)}>{labels[candidate.code as OrderAction]}</Button>
          {!candidate.canStart && <p className="mt-2 text-sm text-muted-foreground">Current requirements are not met. Review funding, policy and assigned responsibilities.</p>}</div>)}</div>
        {!data.actionCandidates.some((candidate) => supported(candidate.code) && context.permissions.includes(candidate.permission)) && <p className="text-sm text-muted-foreground">There are no connected actions for your current responsibilities.</p>}
      </div></Panel>
      {context.permissions.includes("procurement-po-approve") && <Panel title="Your order approval"><div className="space-y-3 p-5">
        <p className="text-sm">Decide only on your active assignment. ERP rechecks current authority, funding and all source controls.</p>
        {data.actionCandidates.some((candidate) => candidate.code === "Decide" && candidate.canStart && context.permissions.includes(candidate.permission))
          ? data.cases.filter((workflow) => workflow.state === "Pending" && workflow.sourceVersion === data.order.currentRevision).flatMap((workflow) => workflow.stages.filter((stage) => stage.state === "Active")
            .flatMap((stage) => stage.assignments.filter((assignment) => assignment.assignedToMe && assignment.state === "Pending").map((assignment) => <div key={assignment.id} className="space-y-2"><p className="text-sm">Your decision · {stage.code}</p><div className="flex flex-wrap gap-3">{(["Approve", "Reject", "Return"] as const).map((action) => <Button key={action} variant={action === "Approve" ? "primary" : "secondary"}
              disabled={busy || !!pending || !!decision} onClick={() => { setError(""); setDecision({ assignmentId: assignment.id, caseVersion: workflow.version, assignmentVersion: assignment.version, action, reason: "" }); }}>{action === "Return" ? "Return for changes" : action}</Button>)}</div></div>)))
          : <p className="text-sm text-muted-foreground">No active decision is available for your current assignment and permissions.</p>}
      </div></Panel>}</>}
      {activeTab === "items" && <DetailSection title="Items / Line Details"><div className="overflow-x-auto"><RecordTable variant="compact"><thead><tr><th>Description</th><th>Unit</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Received</th><th>Invoiced</th></tr></thead>
        <tbody>{data.order.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.unitCode}</td><td>{line.quantity}</td><td>{data.order.currencyCode} {line.unitPrice}</td><td>{data.order.currencyCode} {line.taxAmount}</td><td>{line.acceptedQuantity}</td><td>{line.invoicedQuantity}</td></tr>)}</tbody></RecordTable>
        <p className="mt-4 text-right">Before tax: {data.order.currencyCode} {data.totals.lineBaseAmount}</p><p className="text-right font-semibold">Total: {data.order.currencyCode} {data.totals.grossAmount}</p></div></DetailSection>}
      {activeTab === "related" && <><Panel title="Finance evidence"><div className="space-y-3 p-5"><p className="text-sm">Evidence records Finance decisions; this page does not move money or create a Finance ledger entry.</p>
        {data.financeEvidence.length ? data.financeEvidence.map((entry) => <p key={entry.id} className="text-sm">{entry.commitmentReference} · {entry.currencyCode} {entry.confirmedGrossAmount} · {entry.releaseConfirmed ? "Released" : "Held"} · {entry.evidenceReference}</p>) : <p>No Finance confirmation recorded.</p>}
        {data.financeResolutions.map((entry) => <p key={entry.id} className="text-sm">{entry.outcome} · {entry.currencyCode} {entry.releasedGrossAmount} · {entry.evidenceReference} · {entry.reason}</p>)}
      </div></Panel><DetailSection title="Related Records"><p className="text-sm text-muted-foreground">Receipt and invoice records are available in their own ERP workspaces. This view does not claim a linked payment.</p></DetailSection></>}
      {activeTab === "comments" && <DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments cannot be saved on this purchase order yet.</p></DetailSection>}
      {activeTab === "history" && <Panel title="Approval and sending history"><div className="space-y-3 p-5">
        {data.cases.map((entry) => <div key={entry.id}><p>Revision {entry.sourceVersion} · {entry.state}</p>{entry.stages.map((stage) => <p key={stage.id} className="text-sm">{stage.code}: {stage.state}</p>)}</div>)}
        {data.decisions.map((entry) => <p key={entry.id} className="text-sm">{entry.action} · {entry.reason || "No comment"} · {new Date(entry.decidedAt).toLocaleString()}</p>)}
        {data.issued.map((entry) => <p key={entry.id} className="text-sm">Revision {entry.revisionNumber} authorised for sending · {new Date(entry.authorizedAt).toLocaleString()}</p>)}
        {data.deliveries.map((entry) => <p key={entry.id} className="text-sm">{entry.outcome} · {entry.channel} · {entry.evidenceReference} · {new Date(entry.observedAt).toLocaleString()}</p>)}
        {!data.cases.length && !data.issued.length && <ActivityTimeline items={[]} />}
      </div></Panel>}
      {decision && !pending && <ApprovalDecisionDialog action={decision.action} recordLabel="order" reason={decision.reason} busy={busy} error={error}
        onReason={(reason) => setDecision({ ...decision, reason })} onCancel={() => setDecision(null)} onConfirm={() => {
          if (decision.action !== "Approve" && !decision.reason.trim()) return;
          void execute(orderCommandBody({ action: decision.action, reason: decision.reason.trim() || null, expectedOrderVersion: data.order.version,
            expectedCaseVersion: decision.caseVersion, expectedAssignmentVersion: decision.assignmentVersion }), "Decide", decision.assignmentId);
        }} />}
      {action && !pending && canUseEvidence(action) && <OrderActionForm key={`${action}:${data.order.version}`} action={action} data={data} selection={evidenceSelection} busy={busy} onClose={() => setAction(null)} onConfirm={execute} />}
    </> : !loading && !error && <p role="alert">This order is unavailable in your current scope.</p>}
    <div className="flex gap-3"><Link className="text-sm text-primary hover:underline" to="/purchase-orders">Back to purchase orders</Link><Button variant="secondary" disabled={busy} onClick={() => setRevision((n) => n + 1)}>Refresh order</Button></div>
    </div>
  </div>;
}
function OrderActionForm({ action, data, selection, busy, onClose, onConfirm }: { action: OrderAction; data: ExecutionOrderDetail; selection: ReturnType<typeof selectCurrentCommercialEvidence>; busy: boolean; onClose: () => void; onConfirm: (body: string, action: OrderAction) => Promise<void> }) {
  const [reference, setReference] = useState(""), [evidence, setEvidence] = useState(""), [reason, setReason] = useState("");
  const [timestamp, setTimestamp] = useState(localNow), [verified, setVerified] = useState(false), [error, setError] = useState("");
  const [channel, setChannel] = useState(""), [outcome, setOutcome] = useState("Delivered");
  const finance = action === "Finance", release = action === "FinanceRelease" || action === "DraftFinanceRelease", delivery = action === "Delivery";
  const previous = selection?.finance, issued = selection?.issued;
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!verified || busy) return; setError("");
    const fields: Record<string, unknown> = { expectedOrderVersion: data.order.version };
    try {
      let decimals: Record<string, string> = {};
      if (finance || release || delivery) {
        const date = new Date(timestamp); if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid evidence date and time.");
        fields.evidenceReference = evidence.trim(); fields[delivery ? "observedAt" : "confirmedAt"] = date.toISOString();
      }
      if (finance) {
        Object.assign(fields, { commercialRevision: data.nextCommercialRevision, commitmentReference: reference.trim(), currencyCode: data.order.currencyCode,
          sourceReservationReferences: [...data.sourceReservationReferences], replacesCommitmentReference: previous?.commitmentReference ?? null });
        decimals = { confirmedGrossAmount: data.totals.grossAmount };
      } else if (release) {
        if (!previous) throw new Error("The Finance confirmation is missing. Refresh this order.");
        Object.assign(fields, { reason: reason.trim(), currencyCode: previous.currencyCode, restoredReservationReferences: [...data.sourceReservationReferences] });
        decimals = { releasedGrossAmount: previous.confirmedGrossAmount };
      } else if (delivery) {
        if (!issued || !data.configuredDeliveryChannels.includes(channel)) throw new Error("Choose a configured sending channel.");
        Object.assign(fields, { issuedVersionId: issued.id, deliveryReference: reference.trim(), outcome, channel });
      }
      await onConfirm(orderCommandBody(fields, decimals), action);
    } catch (cause) { setError(errorText(cause)); }
  }
  return <Modal title={labels[action]} onClose={() => { if (!busy) onClose(); }}><form onSubmit={(event) => void confirm(event)} className="space-y-4">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm">{finance || release ? "Record independently verified Finance evidence under the configured manual policy. No payment is executed." : delivery ? "Record the actual sending outcome. Authorising an order does not prove the vendor received it." : action === "Issue" ? "Authorise this approved revision for sending. Delivery is confirmed separately." : "Submit this order for the configured approval steps. ERP will recheck its sources and funding."}</p>
    <fieldset disabled={busy} className="space-y-4">
      {(finance || delivery) && <Field label={finance ? "Finance commitment reference" : "Sending reference"}><Input required maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>}
      {(finance || release || delivery) && <><Field label="Evidence reference"><Input required maxLength={500} value={evidence} onChange={(event) => setEvidence(event.target.value)} /></Field>
        <Field label="Evidence date and time"><Input type="datetime-local" step="0.001" required value={timestamp} onChange={(event) => setTimestamp(event.target.value)} /></Field></>}
      {(finance || release) && <><p className="text-sm">Amount: {release ? `${previous?.currencyCode ?? ""} ${previous?.confirmedGrossAmount ?? "Unavailable"}` : `${data.order.currencyCode} ${data.totals.grossAmount}`}</p>
        <p className="text-sm">Source reservation references: {data.sourceReservationReferences.join(", ") || "None supplied by ERP"}</p></>}
      {release && <Field label="Reason for releasing funds"><Textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>}
      {delivery && <><Field label="Sending channel"><Select required value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Choose a configured channel</option>{data.configuredDeliveryChannels.map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Sending outcome"><Select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="Delivered">Delivered to vendor</option><option value="Failed">Sending failed</option><option value="Unknown">Outcome unknown</option></Select></Field></>}
      <label className="flex items-center gap-3 text-sm"><Switch checked={verified} onChange={(event) => setVerified(event.target.checked)} />{finance || release ? "I independently verified the amount, references and Finance evidence" : delivery ? "I verified this sending outcome and evidence" : "I reviewed this order and want to continue"}</label>
    </fieldset><div className="flex gap-3"><Button type="submit" disabled={busy || !verified}>{busy ? "Saving…" : "Confirm action"}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
  </form></Modal>;
}
