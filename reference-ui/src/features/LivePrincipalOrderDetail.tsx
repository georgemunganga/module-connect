import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Badge, Button, Field, Panel, Textarea } from "../components/ui";
import { DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalDraftJournal, principalDraftScope } from "../lib/principal-draft-command-journal";
import { cancelPrincipalBody, confirmPrincipalCommand, getPrincipalOrder, PrincipalDraftError, recoverPrincipalCommand,
  sendPrincipalCommand, type PrincipalCommand, type PrincipalOrder } from "../../../src/platform/procurement-principal-drafts-api";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "The order result could not be confirmed.";

export function LivePrincipalOrderDetail() {
  const context = useLiveReadiness()!, shell = useErpShell(), { id } = useParams();
  const scope = principalDraftScope(context.tenantId, context.legalEntityId, context.principalId);
  const key = [shell.authEpoch, context.tenantId, context.legalEntityId, context.principalId,
    shell.selection.branch ?? "all", id ?? ""].join(":");
  return <PrincipalDetail key={key} id={id ?? ""} journalScope={scope} />;
}
function PrincipalDetail({ id, journalScope }: { id: string; journalScope: string }) {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const canRead=context.capabilities.principalDirectOrderDrafts&&context.permissions.includes("procurement-po-read");
  const [record, setRecord] = useState<PrincipalOrder | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [reason, setReason] = useState(""), [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PrincipalCommand | null>(null);
  const [activeTab, setActiveTab] = useState("overview"), [revision, setRevision] = useState(0);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try { setPending(principalDraftJournal.read(journalScope)); }
    catch (cause) { lock.current = true; setError(message(cause)); }
    return () => { alive.current = false; };
  }, [journalScope]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setLoading(true); setError(""); setRecord(null);
    getPrincipalOrder(company, id, controller.signal).then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id, revision, canRead]);
  const canCancel = record?.status === "Draft" && context.permissions.includes("procurement-po-edit")
    && context.permissions.includes("procurement-po-read") && context.effectiveBranchId !== null;
  async function recover() {
    if (!pending || pending.operation !== "Cancel" || pending.orderId !== id || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await recoverPrincipalCommand(company, pending);
      await confirmPrincipalCommand(company,pending,result);
      principalDraftJournal.clear(journalScope, pending);
      if (alive.current) { setPending(null); setNotice(`Saved order result confirmed: ${result.status}.`); setRevision(value => value + 1); }
    } catch (cause) { if (alive.current) setError(`${message(cause)} Keep command reference ${pending.key}.`); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!record || !canCancel || !reason.trim() || pending || busy || lock.current) return;
    let command: PrincipalCommand;
    try {
      command = { operation: "Cancel", key: crypto.randomUUID(), orderId: id,
        body: cancelPrincipalBody(record, reason) };
      principalDraftJournal.claim(journalScope, command);
      setPending(command);
    } catch (cause) { setError(message(cause)); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await sendPrincipalCommand(company, command);
      const savedReceipt=await recoverPrincipalCommand(company,command);
      if(savedReceipt.orderId!==result.orderId||savedReceipt.version!==result.version
        ||savedReceipt.originalDirectSourceSha256!==result.originalDirectSourceSha256)
        throw new Error("The saved result does not match this command. Keep its reference and check again.");
      await confirmPrincipalCommand(company,command,result);
      principalDraftJournal.clear(journalScope, command);
      if (alive.current) { setPending(null); setConfirming(false); setNotice(`${result.status} order saved.`); setRevision(value => value + 1); }
    } catch (cause) {
      if (cause instanceof PrincipalDraftError && [400, 403, 404, 422].includes(cause.status)) {
        try { principalDraftJournal.clear(journalScope, command); if (alive.current) setPending(null); }
        catch { /* Preserve the recovery lock if storage changed. */ }
      }
      if (alive.current) setError(message(cause));
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  if (!canRead)
    return <div className="p-5 sm:p-8" role="alert">Approved request order drafts are unavailable for this account.</div>;
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading order draft…</div>;
  if (!record) return <div className="p-5 sm:p-8"><p role="alert">{error || "This order is unavailable in your company and branch."}</p>
    <Link to="/purchase-orders?workflow=principal">Back to purchase orders</Link></div>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background pb-20">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-5 sm:px-8">
      <div className="min-w-0"><Link className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground" to="/purchase-orders?workflow=principal"><ArrowLeft size={13} />Purchase Orders</Link>
        <h1 className="flex min-w-0 items-center gap-2 truncate text-2xl font-semibold"><ShoppingBag size={23} />{record.number}</h1>
        <p className="text-sm text-muted-foreground">Internal purchasing · {record.currencyCode} · version {record.version}</p></div>
      <Badge>{record.status}</Badge>
    </header>
    <div className="max-w-[1260px] space-y-6 px-5 py-6 sm:px-8">
      <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "related", label: "Related" },
        { key: "history", label: "History" }]} active={activeTab} onChange={setActiveTab} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && <Panel title="Check previous action"><div className="space-y-3 p-5">
        <p>This order action may have saved. Keep command reference {pending.key} before another action.</p>
        {pending.operation === "Cancel" && pending.orderId === id
          ? <Button disabled={busy} onClick={() => void recover()}>Check saved result</Button>
          : <Link to="/purchase-orders/new?workflow=principal" className="text-primary underline">Check the earlier order draft</Link>}
      </div></Panel>}
      {activeTab === "overview" && <>
        <DetailSection title="Order"><div className="grid gap-4 sm:grid-cols-3">
          <DetailValue label="Order number" value={record.number} />
          <DetailValue label="Status" value={record.status} />
          <DetailValue label="Currency" value={record.currencyCode} />
          <DetailValue label="Supplier" value={record.supplierDisplayName || "Selected supplier"} />
          <DetailValue label="Branch" value={record.branchDisplayName || "Selected branch"} />
        </div></DetailSection>
        <Panel title="Order lines"><div className="overflow-x-auto p-5"><RecordTable>
          <thead><tr><th>Item or service</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Request</th><th>Allocation</th></tr></thead>
          <tbody>{record.lines.map(line => <tr key={line.id}>
            <td>{line.description}</td><td>{line.quantity} {line.unitCode}</td>
            <td>{line.unitPrice}</td><td>{line.taxAmount}</td>
            <td><Link to={`/requests/${line.purchaseRequestId}`} className="text-primary underline">Open approved request</Link></td>
            <td>{line.allocationStatus}</td>
          </tr>)}</tbody>
        </RecordTable></div></Panel>
        <p className="text-sm text-muted-foreground">This internal draft has not been submitted, issued, sent to the supplier, or posted to Finance.</p>
        {canCancel && !pending && <Panel title="Next action"><div className="space-y-4 p-5">
          {!confirming ? <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>Cancel internal draft</Button>
            : <form onSubmit={cancel} className="space-y-4"><Field label="Reason"><Textarea value={reason} onChange={event => setReason(event.target.value)} /></Field>
                <div className="flex gap-3"><Button type="submit" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Confirm cancellation"}</Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Close</Button></div>
              </form>}
        </div></Panel>}
        {record.status === "Draft" && !canCancel && <p role="status">Cancellation is unavailable with your current permissions or branch selection.</p>}
      </>}
      {activeTab === "related" && <DetailSection title="Related records"><p className="text-sm text-muted-foreground">Approved request sources are linked in the order lines. Receipts, supplier responses, and Finance entries belong to their own controlled workflows.</p></DetailSection>}
      {activeTab === "history" && <DetailSection title="Recorded activity"><p className="text-sm">Current saved state: {record.status}, version {record.version}.</p>
        {record.closureReason && <p className="mt-2 text-sm">Cancellation reason: {record.closureReason}</p>}
        <p className="mt-2 text-sm text-muted-foreground">The complete audit trail is held by ERP. This view shows only the current verified order draft.</p></DetailSection>}
      <div className="flex gap-3"><Link to="/purchase-orders?workflow=principal" className="text-sm text-primary">Back to purchase orders</Link>
        <Button variant="secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh order</Button></div>
    </div>
  </div>;
}
