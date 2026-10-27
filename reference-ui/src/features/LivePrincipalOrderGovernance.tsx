import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalDraftJournal, principalDraftScope } from "../lib/principal-draft-command-journal";
import { principalOrderGovernanceJournal, principalOrderGovernanceScope,
  recoverJournaledGovernanceCommand, sendNewJournaledGovernanceCommand } from "../lib/principal-order-governance-journal";
import { canCreateApprovedSourceOrder, governedActions, legacyDraftBlocksGovernance,
  type GovernedDetail, type GovernedTask } from "../lib/principal-order-governance-ui-rules";
import { LivePrincipalOrderDetail } from "./LivePrincipalOrderDetail";
import { encodeGovernanceBody, getGovernedBuyerOrder, getGovernanceOperationDetail,
  getPrincipalFinanceDetail, getPrincipalReview, listGovernedBuyerOrders,
  listGovernanceOperationWork, listPrincipalAssignedReviews, listPrincipalFinanceWork,
  type AssignedOrderReview, type FinanceOrderDetail, type GovernedBuyerOrder,
  GovernanceApiError, type GovernanceCommand, type GovernanceOperation, type GovernanceReply,
  type OrderReviewDetail } from "../../../src/platform/procurement-principal-governance-api";

export type { GovernedTask } from "../lib/principal-order-governance-ui-rules";
const guid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const operations: GovernanceOperation[] = ["Funding", "Submit", "Decide", "Issue", "Ack", "ReleaseRequest", "ReleaseConfirm"];
const labels: Record<GovernedTask, string> = { buyer: "Purchase Orders", finance: "Order Finance work",
  review: "Purchase order approvals", issue: "Orders ready to authorize", ack: "Supplier responses to record" };
const permission: Record<GovernedTask, string> = { buyer: "procurement-po-read", finance: "procurement-po-finance-confirm",
  review: "procurement-po-approve", issue: "procurement-po-issue", ack: "procurement-po-dispatch-confirm" };
const pathFor = (id: string, task: GovernedTask, assignmentId?: string) =>
  `/purchase-orders/${id}?workflow=principal${task === "buyer" ? "" : `&task=${task}`}`
  + (assignmentId ? `&assignment=${assignmentId}` : "");
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The order result could not be confirmed.";
const taskOf = (value: string | null): GovernedTask =>
  value === "finance" || value === "review" || value === "issue" || value === "ack" ? value : "buyer";
const taskForOperation = (operation: GovernanceOperation): GovernedTask =>
  operation === "Funding" || operation === "ReleaseConfirm" ? "finance"
    : operation === "Decide" ? "review" : operation === "Issue" ? "issue"
      : operation === "Ack" ? "ack" : "buyer";

type TaskRow = { id: string; number: string; status: string; currency: string; assignmentId?: string };
export function LiveGovernedOrderList({ task }: { task: GovernedTask }) {
  const context = useLiveReadiness()!, shell = useErpShell();
  const navigate = useNavigate();
  const location = useLocation();
  const completion = location.state?.orderCompletion;
  const completionNotice = typeof completion?.number === "string" && typeof completion?.message === "string"
    ? `${completion.number}: ${completion.message}` : null;
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<TaskRow[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const canRead = context.capabilities.principalOrderGovernanceRead
    && context.permissions.includes(permission[task]);
  const canCreate = task === "buyer" && canCreateApprovedSourceOrder(
    context.capabilities.principalDirectOrderDrafts, context.permissions, context.effectiveBranchId ?? null);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); setLoading(true); setError(""); setRows([]);
    const company = context.legalEntityId;
    const request = task === "buyer" ? listGovernedBuyerOrders(company, page, undefined, controller.signal)
      : task === "finance" ? listPrincipalFinanceWork(company, page, controller.signal)
        : task === "review" ? listPrincipalAssignedReviews(company, page, controller.signal)
          : listGovernanceOperationWork(company, task === "issue" ? "Issue" : "Ack", page, controller.signal);
    request.then(result => {
      if (controller.signal.aborted) return;
      setTotal(result.total);
      if (task === "review") setRows((result.items as AssignedOrderReview[]).map(item => ({
        id: item.orderId, number: item.number, status: item.status, currency: `${item.currencyCode} ${item.grossAmountExact}`,
        assignmentId: item.assignmentId })));
      else setRows((result.items as { id: string; number: string; status: string; currencyCode: string }[])
        .map(item => ({ id: item.id, number: item.number, status: item.status,
        currency: item.currencyCode })));
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, context.legalEntityId, task, page, revision]);
  if (!canRead) return <div className="p-5 sm:p-8" role="alert">This order task is unavailable for your account.</div>;
  return <div className="p-5 sm:p-8">{completionNotice && <p role="status" className="mb-4 text-sm">{completionNotice}</p>}
    <LiveRecordDirectory key={`${task}:${page}`} title={labels[task]} entity="orders"
    subtitle={task === "buyer" ? "Orders linked to approved purchase requests."
      : "Work available to you in the selected company and branch."}
    columns={[{ key: "number", label: "Order", width: 220 }, { key: "status", label: "Status", width: 150 },
      { key: "currency", label: task === "review" ? "Amount" : "Currency", width: 130 }]}
    rows={rows.map(row => ({ id: row.assignmentId ?? row.id, number: row.number, title: row.number,
      status: row.status, path: pathFor(row.id, task, row.assignmentId), fields: { currency: row.currency } }))}
    loading={loading} error={error} total={total} page={page} pageSize={25}
    onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
    action={canCreate ? <Button onClick={() => navigate("/purchase-orders/new?workflow=principal")}>Order from approved request</Button> : undefined}
    emptyTitle="No order tasks in this scope" emptyDescription="Choose a permitted company or branch, or refresh after a new assignment." />
    {shell.selection.branchScope === "all" && <p className="mt-3 text-sm text-muted-foreground">All branches is for scoped reads. Choose one permitted branch before saving an action.</p>}
  </div>;
}

type Detail = GovernedDetail;
const sourceOf = (value: { originalDirectSourceSha256: string }) => value.originalDirectSourceSha256;
function loadDetail(company: string, id: string, task: GovernedTask, assignment: string | null, signal?: AbortSignal): Promise<Detail> {
  if (task === "finance") return getPrincipalFinanceDetail(company, id, signal);
  if (task === "review") {
    if (!assignment || !guid.test(assignment)) return Promise.reject(Error("Choose your assigned approval task."));
    return getPrincipalReview(company, id, assignment, signal);
  }
  if (task === "issue" || task === "ack")
    return getGovernanceOperationDetail(company, id, task === "issue" ? "Issue" : "Ack", signal);
  return getGovernedBuyerOrder(company, id, signal);
}
function readPending(tenant: string, company: string, actor: string, branch: string, id: string) {
  for (const operation of operations) {
    const scope = principalOrderGovernanceScope(tenant, company, actor, branch, id, operation);
    const command = principalOrderGovernanceJournal.read(scope);
    if (command) return command;
  }
  return null;
}
export function LiveGovernedOrderDetail() {
  const context = useLiveReadiness()!, shell = useErpShell(), { id = "" } = useParams();
  const [params] = useSearchParams(), task = taskOf(params.get("task"));
  const assignment = params.get("assignment");
  const key = [shell.authEpoch, context.tenantId, context.legalEntityId,
    context.principalId, shell.selection.branch ?? "all", id, task, assignment ?? ""].join(":");
  return <GovernedDetail key={key} id={id} task={task} assignment={assignment} />;
}
function GovernedDetail({ id, task, assignment }: { id: string; task: GovernedTask; assignment: string | null }) {
  const context = useLiveReadiness()!, company = context.legalEntityId;
  const navigate = useNavigate();
  const canRead = context.capabilities.principalOrderGovernanceRead
    && context.permissions.includes(permission[task]);
  const branch = context.effectiveBranchId && guid.test(context.effectiveBranchId) ? context.effectiveBranchId : null;
  const [record, setRecord] = useState<Detail | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GovernanceCommand | null>(null);
  const [revision, setRevision] = useState(0), [activeTab, setActiveTab] = useState("overview");
  const [action, setAction] = useState<GovernanceOperation | null>(null);
  const [reference, setReference] = useState(""), [external, setExternal] = useState("");
  const [reason, setReason] = useState(""), [channel, setChannel] = useState("");
  const [outcome, setOutcome] = useState<"Accepted" | "Rejected">("Accepted");
  const [decisionAction, setDecisionAction] = useState<"Approve" | "Return" | "Reject">("Approve");
  const alive = useRef(true), lock = useRef(false);
  const scopeFor = (operation: GovernanceOperation) => {
    if (!branch) throw Error("Choose a permitted branch before this action.");
    return principalOrderGovernanceScope(context.tenantId, company, context.principalId, branch, id, operation);
  };
  useEffect(() => {
    alive.current = true;
    if (branch) try { setPending(readPending(context.tenantId, company, context.principalId, branch, id)); }
    catch (cause) { lock.current = true; setError(message(cause)); }
    return () => { alive.current = false; };
  }, [context.tenantId, company, context.principalId, branch, id]);
  useEffect(() => {
    if (!canRead || !guid.test(id)) return;
    const controller = new AbortController(); setLoading(true); setError(""); setRecord(null); setAction(null);
    loadDetail(company, id, task, assignment, controller.signal)
      .then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id, task, assignment, canRead, revision]);
  useEffect(() => {
    if (!record || !("canApprove" in record)) return;
    if (!record.canApprove && !record.canReturn && !record.canReject) return;
    if (decisionAction === "Approve" && !record.canApprove)
      setDecisionAction(record.canReturn ? "Return" : "Reject");
    if (decisionAction === "Return" && !record.canReturn)
      setDecisionAction(record.canApprove ? "Approve" : "Reject");
    if (decisionAction === "Reject" && !record.canReject)
      setDecisionAction(record.canApprove ? "Approve" : "Return");
  }, [record, decisionAction]);
  async function verifyCurrent(command: GovernanceCommand, receipt: GovernanceReply) {
    if (receipt.originalDirectSourceSha256 !== command.expectedOriginalDirectSourceSha256) throw Error("The original source changed.");
    if (task === "buyer") {
      const current = await getGovernedBuyerOrder(company, id);
      if (current.version < receipt.version || sourceOf(current) !== sourceOf(receipt)) throw Error("The order state needs review.");
      if (command.operation === "Submit" && current.submission?.id !== receipt.evidenceId
        || command.operation === "ReleaseRequest" && current.release?.id !== receipt.evidenceId)
        throw Error("The saved action is not linked to the current order evidence.");
    } else if (task === "finance") {
      if (command.operation === "Funding") {
        try {
          const current = await getPrincipalFinanceDetail(company, id);
          if (current.version < receipt.version || sourceOf(current) !== sourceOf(receipt)) throw Error("The Finance result needs review.");
          if (current.funding?.id !== receipt.evidenceId)
            throw Error("The saved funding is not linked to this order.");
        } catch (cause) {
          // The purpose-only Finance detail closes once the funded Draft is
          // submitted. The immutable actor-owned receipt remains recoverable.
          if (!(cause instanceof GovernanceApiError && cause.status === 404)) throw cause;
        }
      } else try { await getPrincipalFinanceDetail(company, id);
        throw Error("The release task still appears. Check its current state."); }
      catch (cause) { if (!(cause instanceof GovernanceApiError && cause.status === 404)) throw cause; }
    } else if (task === "review") {
      const current = await getPrincipalReview(company, id, assignment ?? "");
      if (current.assignmentState === "Pending" || current.version < receipt.version
        || sourceOf(current) !== sourceOf(receipt))
        throw Error("The decision task still appears. Check its current state.");
    } else try { await getGovernanceOperationDetail(company, id, task === "issue" ? "Issue" : "Ack");
      throw Error("The operation task still appears. Check its current state."); }
    catch (cause) { if (!(cause instanceof GovernanceApiError && cause.status === 404)) throw cause; }
  }
  async function finish(command: GovernanceCommand, receipt: GovernanceReply) {
    const scope = scopeFor(command.operation);
    const historical = await recoverJournaledGovernanceCommand(company, scope);
    if (historical.evidenceId !== receipt.evidenceId || historical.version !== receipt.version
      || historical.status !== receipt.status || historical.number !== receipt.number)
      throw Error("The saved result differs from the original command. Keep its reference.");
    await verifyCurrent(command, receipt);
    principalOrderGovernanceJournal.clear(scope, command);
    if (alive.current) {
      setPending(null); setAction(null);
      // These purpose-only detail endpoints deliberately close after completion.
      // Return to their current work queue instead of reloading a now-missing task.
      if (task === "issue" || task === "ack" || task === "finance" && command.operation === "ReleaseConfirm") {
        navigate(`/purchase-orders?workflow=principal&task=${task}`, { replace: true,
          state: { orderCompletion: { number: receipt.number,
            message: task === "issue" ? "Internal issue saved." : task === "ack" ? "Supplier response saved." : "Release confirmed." } } });
        return;
      }
      setNotice(`${receipt.status} saved. Original command ${command.key} confirmed.`);
      setRevision(value => value + 1);
    }
  }
  async function recover() {
    if (!pending || !canRecoverHere || busy || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const receipt = await recoverJournaledGovernanceCommand(company, scopeFor(pending.operation));
      await finish(pending, receipt); }
    catch (cause) { if (alive.current) setError(`${message(cause)} Keep original command ${pending.key}.`); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function bodyFor(operation: GovernanceOperation, current: Detail) {
    if (operation === "Funding" && "sourceReservationReferences" in current)
      return encodeGovernanceBody("Funding", { expectedOrderVersion: current.version,
        manualCommitmentReference: reference.trim(), externalEvidenceReference: external.trim(),
        currencyCode: current.currencyCode, attestedGrossAmount: current.grossAmountExact,
        sourceReservationReferences: current.sourceReservationReferences, observedAt: new Date().toISOString() });
    if (operation === "Submit" || operation === "Issue")
      return encodeGovernanceBody(operation, { expectedOrderVersion: current.version });
    if (operation === "Decide" && "assignmentVersion" in current) {
      if (!(decisionAction === "Approve" && current.canApprove
        || decisionAction === "Return" && current.canReturn
        || decisionAction === "Reject" && current.canReject)) throw Error("This decision is not currently available.");
      return encodeGovernanceBody("Decide", { action: decisionAction,
        reason: reason.trim() || null, expectedOrderVersion: current.version,
        expectedCaseVersion: current.caseVersion, expectedAssignmentVersion: current.assignmentVersion });
    }
    if (operation === "Ack" && "issuedVersion" in current && current.issuedVersion)
      return encodeGovernanceBody("Ack", { expectedOrderVersion: current.version,
        issuedVersionId: current.issuedVersion.id, outcome, channel, supplierReference: reference.trim(),
        evidenceReference: external.trim(), observedAt: new Date().toISOString() });
    if (operation === "ReleaseRequest") return encodeGovernanceBody("ReleaseRequest", {
      expectedOrderVersion: current.version, originalDirectSourceSha256: sourceOf(current), reason: reason.trim() });
    if (operation === "ReleaseConfirm" && "sourceReservationReferences" in current && current.release)
      return encodeGovernanceBody("ReleaseConfirm", { expectedOrderVersion: current.version,
        releaseRequestId: current.release.id, externalReleaseEvidenceReference: external.trim(),
        currencyCode: current.currencyCode, releasedGrossAmount: current.grossAmountExact,
        restoredSourceReservationReferences: current.sourceReservationReferences,
        confirmedAt: new Date().toISOString() });
    throw Error("This action is unavailable for the current order state.");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || !action || !available.includes(action) || !branch || !context.capabilities.principalOrderGovernance
      || pending || busy || lock.current) return;
    let command: GovernanceCommand;
    try { command = { operation: action, key: crypto.randomUUID(), orderId: id,
      assignmentId: action === "Decide" ? assignment : null,
      expectedOriginalDirectSourceSha256: sourceOf(record), body: bodyFor(action, record) };
      setPending(command); }
    catch (cause) { setError(message(cause)); return; }
    lock.current = true; setBusy(true); setError("");
    try { const receipt = await sendNewJournaledGovernanceCommand(company, scopeFor(action), command);
      await finish(command, receipt); }
    catch (cause) { if (alive.current) {
      let saved: GovernanceCommand | null = null;
      try { saved = branch ? readPending(context.tenantId, company, context.principalId, branch, id) : null;
        setPending(saved); }
      catch { lock.current = true; }
      setError(saved ? `${message(cause)} Check saved result with original command ${saved.key}.` : message(cause));
    } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  let olderCommand: ReturnType<typeof principalDraftJournal.read> = null;
  let legacyJournalError = false;
  try { olderCommand = principalDraftJournal.read(principalDraftScope(
    context.tenantId, company, context.principalId)); }
  catch { legacyJournalError = true; }
  const olderCreatePending = olderCommand?.operation === "Create";
  const olderCancelPending = olderCommand?.operation === "Cancel" && olderCommand.orderId === id;
  const legacyBlocks = legacyDraftBlocksGovernance(olderCommand?.operation ?? null,
    olderCommand?.orderId ?? null, id, legacyJournalError);
  const writes = context.capabilities.principalOrderGovernance && branch !== null && !pending
    && !busy && !lock.current && !legacyBlocks;
  const buyer = task === "buyer" && record && "canSubmit" in record ? record : null;
  const finance = task === "finance" && record && "canRecordFunding" in record ? record : null;
  const reviewer = task === "review" && record && "canApprove" in record ? record : null;
  const available = governedActions(task, record, writes);
  const pendingTask = pending ? taskForOperation(pending.operation) : null;
  const canRecoverHere = pendingTask === task && (pendingTask !== "review" || pending?.assignmentId === assignment);
  const olderCancel = task === "buyer" && branch && buyer?.status === "Draft" && buyer.funding === null
    && buyer.canCancelDraft && context.capabilities.principalDirectOrderDrafts && !pending
    && !legacyJournalError && !olderCreatePending;
  if (task === "buyer" && olderCancelPending && !pending && context.capabilities.principalDirectOrderDrafts)
    return <LivePrincipalOrderDetail />;
  if (olderCancel) return <LivePrincipalOrderDetail />;
  if (!canRead) return <div className="p-5 sm:p-8" role="alert">This order task is unavailable for your account.</div>;
  const back = task === "review" ? "/approvals" : `/purchase-orders?workflow=principal${task === "buyer" ? "" : `&task=${task}`}`;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background pb-20">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-5 sm:px-8">
      <div><Link to={back} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft size={13} />{labels[task]}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={22} />{record?.number ?? "Purchase order"}</h1>
        <p className="text-sm text-muted-foreground">Internal order · {record?.status ?? "Checking"}</p></div>
      {record && <Badge>{record.status}</Badge>}
    </header>
    <div className="max-w-[1260px] space-y-6 px-5 py-6 sm:px-8">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {legacyJournalError && <p role="alert">A saved draft command needs support review before another order action.</p>}
      {olderCreatePending && <p role="alert">Check the original order creation result before starting another action. <Link className="text-primary underline" to="/purchase-orders/new?workflow=principal">Open original draft recovery</Link></p>}
      {olderCancelPending && task !== "buyer" && <p role="alert">Check the saved draft cancellation before another order action.</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && <Panel title="Check saved action"><div className="space-y-3 p-5">
        <p>The response may have been lost. Keep original command {pending.key}. No action will be sent again automatically.</p>
        {canRecoverHere ? <Button disabled={busy || !branch} onClick={() => void recover()}>Check saved result</Button>
          : <Link className="text-primary underline" to={pathFor(id, pendingTask!, pending.assignmentId ?? undefined)}>
            Open the original {labels[pendingTask!].toLowerCase()} task to check this command
          </Link>}
      </div></Panel>}
      {loading && <p role="status">Loading order evidence…</p>}
      {!loading && !record && <p role="alert">{error || "This order or task is unavailable in your current scope."}</p>}
      {record && <>
        <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "related", label: "Related" },
          { key: "history", label: "History" }]} active={activeTab} onChange={setActiveTab} />
        {activeTab === "overview" && <>
          <DetailSection title="Order"><div className="grid gap-4 sm:grid-cols-3">
            <DetailValue label="Order number" value={record.number} /><DetailValue label="Status" value={record.status} />
            <DetailValue label="Version" value={String(record.version)} />
            {"currencyCode" in record && <DetailValue label="Currency" value={record.currencyCode} />}
            {"supplierDisplayName" in record && <DetailValue label="Supplier" value={record.supplierDisplayName || "Selected supplier"} />}
            {"branchDisplayName" in record && <DetailValue label="Branch" value={record.branchDisplayName || "Selected branch"} />}
            {"grossAmountExact" in record && <DetailValue label="Total" value={record.grossAmountExact} />}
          </div></DetailSection>
          {"lines" in record && <Panel title="Approved source lines"><div className="overflow-x-auto p-5"><RecordTable>
            <thead><tr><th>Item or service</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Request</th><th>Allocation</th></tr></thead>
            <tbody>{record.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity} {line.unitCode}</td>
              <td>{line.unitPrice}</td><td>{line.taxAmount}</td>
              <td>{"purchaseRequestId" in line && context.permissions.includes("procurement-request-read")
                ? <Link to={`/requests/${line.purchaseRequestId}`} className="text-primary underline">Open approved request</Link>
                : "Approved request"}</td>
              <td>{"allocationStatus" in line ? line.allocationStatus : "Approved source"}</td></tr>)}</tbody>
          </RecordTable></div></Panel>}
          <p className="text-sm text-muted-foreground">Funding and supplier response are recorded as manual evidence. This ERP view does not post Finance entries or send orders to suppliers.</p>
          {!branch && <p role="status">All branches permits scoped reads. Choose a permitted branch before saving.</p>}
          {available.length > 0 && <Panel title="Next action"><div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">{[...new Set(available)].map(operation =>
              <Button key={operation} variant={action === operation ? "primary" : "secondary"}
                onClick={() => { setAction(operation); setError(""); }}>{operation === "ReleaseRequest" ? "Request external release"
                  : operation === "ReleaseConfirm" ? "Confirm external release" : operation === "Funding" ? "Record manual funding"
                    : operation === "Issue" ? "Authorize internal issue" : operation === "Ack" ? "Record supplier response"
                      : operation === "Decide" ? "Record decision" : "Submit for approval"}</Button>)}</div>
            {action && available.includes(action) && <form onSubmit={save} className="space-y-4">
              {(action === "Funding" || action === "Ack") && <Field label={action === "Funding" ? "Manual commitment reference" : "Supplier response reference"}>
                <Input value={reference} onChange={event => setReference(event.target.value)} required /></Field>}
              {(action === "Funding" || action === "Ack" || action === "ReleaseConfirm") && <Field label="External evidence reference">
                <Input value={external} onChange={event => setExternal(event.target.value)} required /></Field>}
              {(action === "Decide" || action === "ReleaseRequest") && <Field label="Reason">
                <Textarea value={reason} onChange={event => setReason(event.target.value)}
                  required={action === "ReleaseRequest" || decisionAction !== "Approve"} /></Field>}
              {action === "Decide" && reviewer && <Field label="Decision"><Select value={decisionAction}
                onChange={event => setDecisionAction(event.target.value as "Approve" | "Return" | "Reject")}>
                {reviewer.canApprove && <option value="Approve">Approve</option>}
                {reviewer.canReturn && <option value="Return">Return for changes</option>}
                {reviewer.canReject && <option value="Reject">Reject</option>}
              </Select></Field>}
              {action === "Ack" && <Field label="Observed outcome"><Select value={outcome}
                onChange={event => setOutcome(event.target.value as "Accepted" | "Rejected")}>
                <option value="Accepted">Accepted by supplier</option>
                <option value="Rejected">Rejected by supplier</option>
              </Select></Field>}
              {action === "Ack" && "allowedDeliveryChannels" in record && <Field label="Approved manual channel">
                <Select value={channel} onChange={event => setChannel(event.target.value)} required>
                  <option value="">Choose channel</option>{record.allowedDeliveryChannels.map(value => <option key={value} value={value}>{value}</option>)}
                </Select></Field>}
              <Button type="submit" disabled={busy || !!pending}>{busy ? "Saving…" : "Save one action"}</Button>
            </form>}
          </div></Panel>}
        </>}
        {activeTab === "related" && <DetailSection title="Related evidence"><div className="space-y-2 text-sm">
          <p>Original direct-source digest: <span className="break-all font-mono">{record.originalDirectSourceSha256}</span></p>
          {"funding" in record && record.funding && <p>Manual commitment: {record.funding.manualCommitmentReference}</p>}
          {"manualCommitmentReference" in record && <p>Manual commitment: {record.manualCommitmentReference}</p>}
          {"submission" in record && record.submission && <p>Core case: {record.submission.coreApprovalCaseId}</p>}
          {"issuedVersion" in record && record.issuedVersion && <p>Internal issued version: {record.issuedVersion.id}</p>}
          {"release" in record && record.release && <p>External release request: {record.release.id}</p>}
        </div></DetailSection>}
        {activeTab === "history" && <DetailSection title="Recorded activity"><p className="text-sm">Current retained state: {record.status}, version {record.version}.</p>
          <p className="mt-2 text-sm text-muted-foreground">The full audit remains in ERP. A saved command receipt describes its original result, which may predate this state.</p>
        </DetailSection>}
      </>}
      <div className="flex gap-3"><Link to={back} className="text-sm text-primary">Back to {labels[task].toLowerCase()}</Link>
        <Button variant="secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh</Button></div>
    </div>
  </div>;
}
