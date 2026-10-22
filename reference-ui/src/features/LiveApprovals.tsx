import { useRequestApprovalOperation } from "../lib/RequestApprovalJournal";
import { approvalPayloadFingerprint, type ApprovalLocator } from "../lib/request-approval-journal";
import { readBoundApprovalResult } from "../../../src/platform/procurement-approval-acknowledgements-api";
import { requestApprovalsAvailable } from "../lib/request-approval-availability";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import { LiveOrderApprovalQueue } from "./LiveOrderApprovalQueue";
import { InvoiceUnitReviewQueue } from "./InvoiceUnitReviewTasks";
import { ApprovalOpeningPanel } from "./ApprovalOpeningPanel";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { ApprovalApiError, decideApproval, getApproval, getApprovalHistory, listAssignedApprovals, openApproval,
  type ApprovalAction, type ApprovalCommand, type ApprovalDetail, type ApprovalHistory, type ApprovalQueue } from "../../../src/platform/procurement-approvals-api";
const message = (error: unknown) => error instanceof Error ? error.message : "The approval action could not be confirmed.";
const stateLabel = (value: string) => value === "ReturnPendingFinanceRelease" ? "Waiting for Finance to release funds"
  : value === "ReturnedForChanges" ? "Changes requested" : value;
const date = (value: string) => new Date(value).toLocaleString();
function useApprovalContext() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Approvals need ERP company context.");
  return readiness;
}
export function LiveApprovalQueue() {
  const context = useApprovalContext();
  const requests = requestApprovalsAvailable(context.capabilities) && (context.permissions.includes("procurement-approval-read") || context.permissions.includes("procurement-approval-open"));
  const orders = context.capabilities.orders && context.permissions.includes("procurement-po-approve");
  const units = context.capabilities.invoiceOriginalUnitReview && context.permissions.includes("procurement-invoice-unit-review");
  const available = ([requests && "requests", orders && "orders", units && "units"].filter(Boolean) as ("requests" | "orders" | "units")[]);
  const [type, setType] = useState<"requests" | "orders" | "units">(() => available[0] ?? "requests");
  const selected = available.includes(type) ? type : available[0];
  if (!selected) return <div className="p-5 sm:p-8" role="alert">You do not have access to an available approval queue.</div>;
  const queue = selected === "orders" ? <LiveOrderApprovalQueue /> : selected === "units" ? <InvoiceUnitReviewQueue /> : <RequestApprovalQueue />;
  if (available.length === 1) return queue;
  return <><div className="flex gap-3 px-5 pt-5 sm:px-8" role="tablist" aria-label="Approval records">
    {requests && <Button role="tab" aria-selected={selected === "requests"} variant={selected === "requests" ? "primary" : "secondary"} onClick={() => setType("requests")}>Purchase requests</Button>}
    {orders && <Button role="tab" aria-selected={selected === "orders"} variant={selected === "orders" ? "primary" : "secondary"} onClick={() => setType("orders")}>Purchase orders</Button>}
    {units && <Button role="tab" aria-selected={selected === "units"} variant={selected === "units" ? "primary" : "secondary"} onClick={() => setType("units")}>Original invoice units</Button>}
  </div>{queue}</>;
}
function RequestApprovalQueue() {
  const { legalEntityId, permissions } = useApprovalContext();
  const canRead = permissions.includes("procurement-approval-read");
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const [data, setData] = useState<ApprovalQueue | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController(); setLoading(true); setError(""); setData(null);
    listAssignedApprovals(legalEntityId, offset, abort.signal)
      .then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [legalEntityId, offset, revision, canRead]);
  return <div className="p-5 sm:p-8"><PageHeader title="Approvals" subtitle="Requests waiting for your decision." actions={<Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh</Button>} />
    {!canRead ? <p role="alert">You do not have access to the assigned approval queue.</p> : <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status">Loading approvals…</p> : data?.records.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Request</th><th>Purpose</th><th>Amount</th><th>Step</th><th>Waiting since</th><th>Action</th></tr></thead>
        <tbody>{data.records.map((row) => <tr key={row.caseId}><td>{row.requestNumber}</td><td>{row.purpose}</td><td>{row.currencyCode} {row.amount.toLocaleString()}</td><td>{row.stage.code}</td><td>{date(row.openedAt)}</td><td><Link className="text-primary hover:underline" to={`/approvals/${row.caseId}`}>Review request</Link></td></tr>)}</tbody>
      </RecordTable></div> : data && <EmptyState title="You're all caught up" description="No requests are waiting for your decision." />}
      {data && data.count > data.limit && <div className="mt-4 flex items-center gap-3"><Button variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous</Button><span className="text-sm">{offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}</span><Button variant="secondary" disabled={offset + data.limit >= data.count} onClick={() => setOffset(offset + data.limit)}>Next</Button></div>}
    </div></Panel>}
    <ApprovalOpeningPanel />
  </div>;
}

type PendingDecision = { assignmentId: string; action: ApprovalAction; reason: string; key?: string; command?: ApprovalCommand; uncertain?: boolean; locator?: ApprovalLocator; scopeKey?: string };
export function LiveApprovalDetail() {
  const { id } = useParams(); const { legalEntityId, permissions } = useApprovalContext();
  const [data, setData] = useState<ApprovalDetail | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const journal = useRequestApprovalOperation(`decision:${id ?? ""}`);
  const write = journal.state("Decide");
  const priorRecoveryBlocked = useRef(write.blocked);
  const canRead = permissions.includes("procurement-approval-read");
  async function refresh() {
    if (!id) return;
    const captured = journal;
    try { const refreshed = await getApproval(legalEntityId, id); if (captured.current()) setData(refreshed); }
    catch (cause) { if (captured.current()) { setData(null); setError(message(cause)); } }
  }
  useEffect(() => {
    if (!id || !canRead) return;
    const abort = new AbortController(); setData(null); setLoading(true); setError(""); setPending(null); setNotice("");
    getApproval(legalEntityId, id, abort.signal).then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [legalEntityId, id, canRead]);
  async function decide() {
    if (!data || !pending || busy || !permissions.includes("procurement-approval-decide") || !journal.scope
      || !journal.current() || write.blocked && !pending.locator) return;
    const assignment = data.stages.flatMap((s) => s.assignments).find((a) => a.id === pending.assignmentId);
    if (!assignment || !assignment.isMine || !assignment.allowedActions.includes(pending.action)) return;
    const command = pending.command ?? { action: pending.action, reason: pending.reason.trim() || null,
      expectedCaseVersion: data.caseVersion, expectedAssignmentVersion: assignment.version, expectedRequestVersion: data.requestVersion };
    const captured = journal;
    setBusy(true); setError("");
    let saved = pending;
    try {
      if (!saved.locator) {
        const locator: ApprovalLocator = { locatorSchemaVersion: 1, operation: "Decide", key: crypto.randomUUID(),
          requestId: data.requestId, caseId: data.caseId, assignmentId: assignment.id,
          expectedRequestVersion: command.expectedRequestVersion, expectedCaseVersion: command.expectedCaseVersion,
          expectedAssignmentVersion: command.expectedAssignmentVersion, fingerprint: await approvalPayloadFingerprint(command) };
        if (!captured.current() || !captured.claim(locator)) throw new Error("An earlier approval decision must be checked before sending another.");
        saved = { ...pending, command, key: locator.key, locator, scopeKey: captured.scopeKey }; setPending(saved);
      }
      if (!captured.current() || saved.scopeKey !== captured.scopeKey || !saved.key || !saved.locator
        || captured.state("Decide").pending?.key !== saved.key || !captured.reserve(saved.locator)) return;
      const receipt = await decideApproval(legalEntityId, data.caseId, assignment.id, saved.command!, saved.key, captured.scope!.branchId);
      readBoundApprovalResult(receipt, saved.locator);
      if (!captured.current()) return;
      if (!captured.confirm(saved.locator)) throw new Error("The result was returned but its recovery reference remains blocked. Check the saved result.");
      setPending(null); setNotice(receipt.requestState === "ReturnPendingFinanceRelease"
        ? "Request returned. Editing will open after Finance confirms the funds are released."
        : receipt.state === "Pending" ? "Your decision was saved. Other approvals are still needed." : `Decision saved. ${stateLabel(receipt.requestState)}.`);
      await refresh();
    } catch (cause) {
      if (captured.current()) { setPending({ ...saved, uncertain: !!saved.locator }); setError(message(cause)); }
    } finally { if (saved.locator) captured.settled(saved.locator); if (captured.current()) setBusy(false); }
  }
  useEffect(() => {
    const blocked = journal.state("Decide").blocked;
    if (priorRecoveryBlocked.current && !blocked) { setPending(null); void refresh(); }
    priorRecoveryBlocked.current = blocked;
  }, [journal.revision]);
  if (!canRead) return <div className="p-5 sm:p-8" role="alert">You do not have access to this approval.</div>;
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading approval…</div>;
  if (!data) return <div className="p-5 sm:p-8"><p role="alert">{error || "Approval not found."}</p><Link to="/approvals">Back to approvals</Link></div>;
  const rawLines = data.requestSnapshot.lines ?? data.requestSnapshot.Lines;
  const lines = Array.isArray(rawLines) ? rawLines.filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object")) : [];
  return <div className="p-5 sm:p-8"><PageHeader title={data.requestNumber} subtitle={data.purpose} actions={<Badge>{stateLabel(data.requestState)}</Badge>} />
    {error && !pending && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    <Panel title="Request for approval"><div className="space-y-3 p-5"><p className="font-medium">{data.currencyCode} {data.amount.toLocaleString()}</p><p className="text-sm text-muted-foreground">Amount before discounts, tax and delivery. Submitted version {data.submittedVersion}.</p>
      {data.requestState === "ReturnPendingFinanceRelease" && <p className="text-sm">Finance must confirm the release of reserved funds before this request can be edited.</p>}
      {lines.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit price</th></tr></thead><tbody>{lines.map((line, index) => <tr key={String(line.Id ?? line.id ?? index)}><td>{String(line.Description ?? line.description ?? "Item")}</td><td>{String(line.quantity ?? line.RequestedQuantity ?? "—")}</td><td>{String(line.unitPrice ?? line.EstimatedUnitPrice ?? "—")}</td></tr>)}</tbody></RecordTable></div>}
    </div></Panel>
    <Panel title="Approval steps" className="mt-5"><div className="space-y-4 p-5">{data.stages.map((stage) => <div key={stage.id} className="space-y-2"><p className="font-medium">{stage.code} · {stage.state}</p>{stage.assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{assignment.isMine ? "Your decision" : "Other approver"}: {assignment.state}</span>
      {permissions.includes("procurement-approval-decide") && assignment.isMine && assignment.allowedActions.map((action) => <Button key={action} variant={action === "Approve" ? "primary" : "secondary"} disabled={busy || !!pending || write.blocked || !journal.scope} onClick={() => { setError(""); setPending({ assignmentId: assignment.id, action, reason: "" }); }}>{action === "Return" ? "Return for changes" : action}</Button>)}
    </div>)}</div>)}{data.blockers.length > 0 && <p className="text-sm text-muted-foreground">Some approval checks need attention. You can still use the actions shown.</p>}</div></Panel>
    <Panel title="Decision history" className="mt-5"><div className="space-y-3 p-5">{data.decisions.length ? data.decisions.map((decision) => <div key={decision.id} className="text-sm"><p className="font-medium">{decision.action} · {date(decision.decidedAt)}</p>{decision.reason && <p>{decision.reason}</p>}</div>) : <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>}</div></Panel>
    <Link className="mt-5 inline-block text-sm text-primary hover:underline" to="/approvals">Back to approvals</Link>
    {pending && <ApprovalDecisionDialog action={pending.action} recordLabel="request" reason={pending.reason} busy={busy} error={error}
      locked={!!pending.key} uncertain={!!pending.uncertain} canRetrySameCommand={permissions.includes("procurement-approval-decide") && !!pending.key && !!pending.command && !!pending.locator && pending.scopeKey === journal.scopeKey} onReason={(reason) => setPending({ ...pending, reason })}
      onConfirm={() => void decide()} onCancel={() => setPending(null)} />}
  </div>;
}

export function RequestApprovalPanel({ requestId, version, status, onChanged }: { requestId: string; version: number; status: string; onChanged: () => Promise<void> }) {
  const { legalEntityId, permissions, capabilities } = useApprovalContext();
  const requestApprovalAvailable = requestApprovalsAvailable(capabilities);
  const journal = useRequestApprovalOperation(`opening:${requestId}`);
  const write = journal.state("Open");
  const priorRecoveryBlocked = useRef(write.blocked);
  const [history, setHistory] = useState<ApprovalHistory | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [command, setCommand] = useState<{ key: string; version: number; locator: ApprovalLocator; scopeKey: string } | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!requestApprovalAvailable) return;
    const abort = new AbortController(); setLoading(true); setHistory(null); setError(""); setCommand(null); setOpened(false);
    getApprovalHistory(legalEntityId, requestId, abort.signal).then((result) => { if (!abort.signal.aborted) setHistory(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [legalEntityId, requestId, requestApprovalAvailable]);
  async function open() {
    if (busy || !permissions.includes("procurement-approval-open") || !requestApprovalAvailable
      || !journal.scope || !journal.current() || write.blocked && !command) return;
    const captured = journal;
    setBusy(true); setError("");
    let intent = command;
    try {
      if (!intent) {
        const locator: ApprovalLocator = { locatorSchemaVersion: 1, operation: "Open", key: crypto.randomUUID(), requestId,
          caseId: null, assignmentId: null, expectedRequestVersion: version, expectedCaseVersion: null,
          expectedAssignmentVersion: null, fingerprint: await approvalPayloadFingerprint({ expectedRequestVersion: version }) };
        if (!captured.current() || !captured.claim(locator)) throw new Error("An earlier approval action must be checked before starting another.");
        intent = { key: locator.key, version, locator, scopeKey: captured.scopeKey }; setCommand(intent);
      }
      if (!captured.current() || intent.scopeKey !== captured.scopeKey || captured.state("Open").pending?.key !== intent.key || !captured.reserve(intent.locator)) return;
      const result = await openApproval(legalEntityId, requestId, intent.version, intent.key, captured.scope!.branchId);
      readBoundApprovalResult(result, intent.locator);
      if (!captured.current()) return;
      if (!captured.confirm(intent.locator)) throw new Error("The result was returned but its recovery reference remains blocked. Check the saved result.");
      setOpened(true); setCommand(null);
      const history = await getApprovalHistory(legalEntityId, requestId);
      if (captured.current()) { setHistory(history); await onChanged(); }
    } catch (cause) { if (captured.current()) setError(message(cause)); }
    finally { if (intent) captured.settled(intent.locator); if (captured.current()) setBusy(false); }
  }
  useEffect(() => {
    const blocked = journal.state("Open").blocked;
    if (priorRecoveryBlocked.current && !blocked) {
      const captured = journal; setCommand(null); setOpened(true);
      if (captured.current()) void onChanged();
      void getApprovalHistory(legalEntityId, requestId).then(history => { if (captured.current()) setHistory(history); })
        .catch(cause => { if (captured.current()) setError(message(cause)); });
    }
    priorRecoveryBlocked.current = blocked;
  }, [journal.revision]);
  if (!requestApprovalAvailable) return null;
  const pendingCase = history?.records.some((row) => row.state === "Pending");
  return <Panel title="Approvals" className="mt-5"><div className="space-y-3 p-5">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {status === "ReturnPendingFinanceRelease" && <p className="text-sm">Waiting for Finance to release the reserved funds. You can edit after release is confirmed.</p>}
    {permissions.includes("procurement-approval-open") && status === "Submitted" && (history || command) && ((!pendingCase && !opened) || command) && <Button disabled={busy || loading || !journal.scope || write.blocked && !command} onClick={() => void open()}>{busy ? "Starting…" : command ? "Retry starting approvals" : "Start approvals"}</Button>}
    {loading ? <p role="status">Loading approval history…</p> : history?.records.length ? history.records.map((row) => <div key={row.caseId} className="space-y-1 text-sm"><p className="font-medium">Submission {row.submittedVersion} · {stateLabel(row.state)}</p>{row.financeRelease && <p>{row.financeRelease.state === "Confirmed" ? "Finance release confirmed" : "Waiting for Finance release confirmation"}</p>}{row.decisions.map((decision) => <p key={decision.id}>{decision.action} · {date(decision.decidedAt)}{decision.reason ? ` · ${decision.reason}` : ""}</p>)}</div>) : history && <p className="text-sm text-muted-foreground">No approvals have started yet.</p>}
  </div></Panel>;
}
