import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimUnitReviewPending, clearUnitReviewPending, readUnitReviewPending, type UnitReviewPending } from "../lib/invoice-unit-review-command";
import { readManualReviewLink, rememberManualReviewLink } from "../lib/invoice-manual-review-link";
import { manualUnitBlockerText, manualUnitLineLabel, type InvoiceLineLabel } from "../lib/invoice-manual-unit-review-copy";
import { manualDecide, manualDetail, manualOpen, manualReadiness, manualRecover, manualRecoverOpenByInvoice, manualTasks, ManualReviewError,
  type ManualAction, type ManualDetail, type ManualReadiness, type ManualTaskPage } from "../../../src/platform/procurement-invoice-manual-unit-review-api";

const msg = (cause: unknown) => cause instanceof Error ? cause.message : "Manual unit review is unavailable.";
const selectedBranch = (value: string | undefined) => !!value && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
const base = "/approvals/manual-unit-review";
/** Maker entry inside the existing bill detail; schema-1 document review remains beside it. */
export function InvoiceManualUnitReviewOwner({ invoiceId, invoiceVersion, lines }: { invoiceId: string; invoiceVersion: number; lines: readonly InvoiceLineLabel[] }) {
  const context = useLiveReadiness()!, { selection } = useErpShell();
  const read = context.capabilities.invoiceManualUnitReviewRead && context.permissions.includes("procurement-invoice-unit-review-request")
    && context.permissions.includes("procurement-invoice-read");
  const write = read && context.capabilities.invoiceManualUnitReview && selection.branchScope !== "all" && selectedBranch(selection.branch);
  const scope = JSON.stringify([context.tenantId, context.legalEntityId, selection.branch ?? "", context.principalId, invoiceId, "ManualOpen"]);
  const [readiness, setReadiness] = useState<ManualReadiness | null>(null);
  const [recoveredReviewId, setRecoveredReviewId] = useState(() => readManualReviewLink(scope));
  const [pending, setPending] = useState(() => readUnitReviewPending(scope));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!read) return;
    const abort = new AbortController(); setLoading(true); setReadiness(null); setError("");
    manualReadiness(context.legalEntityId, invoiceId, abort.signal).then(value => { if (!abort.signal.aborted) setReadiness(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(msg(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [read, context.legalEntityId, invoiceId]);
  if (!read) return null;
  async function open() {
    if (!write || inFlight.current || busy || pending.blocked || !readiness?.canRequestReview || readiness.invoiceVersion !== invoiceVersion
      || !reason.trim()) return;
    const marker: UnitReviewPending = { operation: "Open", invoiceId, reviewId: null, key: crypto.randomUUID() };
    if (!claimUnitReviewPending(scope, marker)) { setPending(readUnitReviewPending(scope)); setError("Check the earlier review request before another one."); return; }
    inFlight.current = true; setPending(readUnitReviewPending(scope)); setBusy(true); setError("");
    try {
      const result = await manualOpen(context.legalEntityId, readiness, reason.trim(), marker.key, context.principalId);
      if (!rememberManualReviewLink(scope, result.reviewId)) throw new Error("The review was saved, but this browser could not retain its record link. Check the original command before another request.");
      clearUnitReviewPending(scope, marker); if (alive.current) { setPending(readUnitReviewPending(scope)); setRecoveredReviewId(result.reviewId); setNotice(`Manual unit review started: ${result.reviewState}.`);
        setReadiness(await manualReadiness(context.legalEntityId, invoiceId)); }
    } catch (cause) {
      if (cause instanceof ManualReviewError && [400, 422].includes(cause.status)) clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setError(msg(cause)); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    const marker = pending.pending; if (!marker || marker.operation !== "Open" || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await manualRecoverOpenByInvoice(context.legalEntityId, invoiceId, marker.key, context.principalId);
      if (!rememberManualReviewLink(scope, result.reviewId)) throw new Error("The saved review was found, but this browser could not retain its record link. Check the original command again.");
      clearUnitReviewPending(scope, marker); if (alive.current) { setPending(readUnitReviewPending(scope)); setRecoveredReviewId(result.reviewId);
        setNotice(`Saved manual review found: ${result.reviewState}.`); }
    } catch (cause) { if (alive.current) setError(msg(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return <Panel title="Check manually entered invoice units" className="mt-5"><div className="space-y-3 p-5 text-sm">
    <p>An independent person checks the entered unit names and original invoice values. This does not approve the bill or send it to Finance.</p>
    {loading && <p role="status">Checking manual unit review availability…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {(readiness?.existingReviewId ?? recoveredReviewId) && <p>Review <Badge>Recorded</Badge> <Link className="text-primary underline"
      to={`${base}/${readiness?.existingReviewId ?? recoveredReviewId}`}>Open review details</Link></p>}
    {readiness?.manualUnitLines?.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Invoice line</th><th>Entered unit</th></tr></thead>
      <tbody>{readiness.manualUnitLines.map(line => <tr key={line.invoiceLineId}><td>{manualUnitLineLabel(lines, line.invoiceLineId)}</td><td>{line.unitCode}</td></tr>)}</tbody></RecordTable></div> : null}
    {readiness?.blockers.length ? <ul className="list-disc pl-5">{readiness.blockers.map((code, index) => <li key={`${index}:${code}`}>{manualUnitBlockerText(code)}</li>)}</ul> : null}
    {pending.blocked ? <div className="space-y-2"><p role="alert">The previous manual review request has an unconfirmed result. Another request is blocked.</p>
      {pending.pending ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved review action</Button>
        : <p>Recovery information is unavailable in this browser. Ask an administrator to inspect saved history.</p>}</div>
      : write && readiness?.canRequestReview && readiness.invoiceVersion === invoiceVersion ? <>
        <Field label="Why do these entered units need review?"><Textarea required maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></Field>
        <Button disabled={busy || !reason.trim()} onClick={() => void open()}>Request manual unit review</Button></>
        : !write && <p>Saved manual reviews remain available. Choose a permitted branch and enable new work to request another review.</p>}
  </div></Panel>;
}

export function InvoiceManualUnitReviewQueue() {
  const context = useLiveReadiness()!, shell = useErpShell(), navigate = useNavigate();
  const enabled = context.capabilities.invoiceManualUnitReviewRead && context.permissions.includes("procurement-invoice-unit-review");
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [data, setData] = useState<ManualTaskPage | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    manualTasks(context.legalEntityId, page, abort.signal).then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(msg(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [enabled, context.legalEntityId, page, refresh]);
  if (!enabled) return <p role="alert">Manual unit review tasks are unavailable for this account.</p>;
  return <div className="p-5 sm:p-8"><PageHeader title="Manually entered invoice units" subtitle="Reviews assigned to you. These decisions do not approve an invoice or payment."
    actions={<Button variant="secondary" onClick={() => setRefresh(x => x + 1)}>Refresh</Button>} />
    <Panel><div className="p-5">{error && <p role="alert" className="text-destructive">{error}</p>}
      {loading ? <p role="status">Loading assigned manual reviews…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Invoice</th><th>Started</th><th>Action</th></tr></thead><tbody>{data.items.map(item => <tr key={item.reviewId}>
          <td>{item.invoiceNumber}</td><td>{new Date(item.openedAt).toLocaleString()}</td><td><Button variant="secondary" disabled={!item.branchId} onClick={() => {
            if (!item.branchId) return;
            shell.selectBranch(item.branchId, context.legalEntityId);
            navigate(`${base}/${item.reviewId}`);
          }}>Check entered units</Button></td></tr>)}</tbody></RecordTable></div>
        : data && <EmptyState title="No entered units to check" description="Assigned reviews appear here when an invoice owner requests a check." />}
      {data && data.total > data.pageSize && <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

type Choice = { action: ManualAction; reason: string; attested: boolean; assignmentId: string; assignmentVersion: number };
export function InvoiceManualUnitReviewDetail() {
  const context = useLiveReadiness()!, { selection, authEpoch } = useErpShell(), { id: reviewId = "" } = useParams();
  return <ManualDetailView key={JSON.stringify([authEpoch, context.tenantId, context.legalEntityId, selection.entityId ?? "",
    selection.branch ?? "", selection.branchScope ?? "", context.principalId, reviewId])} reviewId={reviewId} />;
}
function ManualDetailView({ reviewId }: { reviewId: string }) {
  const context = useLiveReadiness()!, { selection } = useErpShell();
  const read = context.capabilities.invoiceManualUnitReviewRead && context.permissions.some(p =>
    ["procurement-invoice-unit-review", "procurement-invoice-unit-review-request", "procurement-invoice-unit-review-read"].includes(p));
  const write = context.capabilities.invoiceManualUnitReview && selectedBranch(selection.branch) && selection.branchScope !== "all"
    && context.permissions.includes("procurement-invoice-unit-review");
  const scope = JSON.stringify([context.tenantId, context.legalEntityId, selection.branch ?? "", context.principalId, reviewId, "ManualDecision"]);
  const [data, setData] = useState<ManualDetail | null>(null), [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(() => readUnitReviewPending(scope)), [choice, setChoice] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!read) return;
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    manualDetail(context.legalEntityId, reviewId, abort.signal).then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(msg(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [read, context.legalEntityId, reviewId, refresh]);
  if (!read) return <p role="alert">Manual unit review is unavailable for this account.</p>;
  async function decide() {
    if (!write || !data || !choice || busy || pending.blocked || inFlight.current || !data.currentMapping || !data.originalDigestCurrent
      || !data.actionCandidates.includes(choice.action) || !choice.reason.trim() || choice.action === "Approve" && !choice.attested) return;
    const marker: UnitReviewPending = { operation: "Decision", invoiceId: data.invoiceId, reviewId, key: crypto.randomUUID() };
    if (!claimUnitReviewPending(scope, marker)) { setPending(readUnitReviewPending(scope)); setError("Check the earlier decision before another one."); return; }
    inFlight.current = true; setPending(readUnitReviewPending(scope)); setBusy(true); setError("");
    try {
      const result = await manualDecide(context.legalEntityId, data, choice.assignmentId, choice.assignmentVersion,
        choice.action, choice.reason.trim(), choice.attested, marker.key);
      clearUnitReviewPending(scope, marker); if (alive.current) { setPending(readUnitReviewPending(scope)); setChoice(null);
        setNotice(`Decision recorded: ${result.reviewState}. This does not approve the invoice.`); setRefresh(x => x + 1); }
    } catch (cause) {
      if (cause instanceof ManualReviewError && [400, 422].includes(cause.status)) clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setError(msg(cause)); setChoice(null); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    const marker = pending.pending; if (!marker || marker.operation !== "Decision" || marker.reviewId !== reviewId || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await manualRecover(context.legalEntityId, reviewId, marker.key, "Decision", marker.invoiceId, data?.makerPrincipalId);
      clearUnitReviewPending(scope, marker); if (alive.current) { setPending(readUnitReviewPending(scope)); setNotice(`Saved decision found: ${result.reviewState}.`);
        setRefresh(x => x + 1); }
    } catch (cause) { if (alive.current) setError(msg(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  const canDecide = !!data && write && !busy && !pending.blocked && data.currentMapping && data.originalDigestCurrent && data.assignments.length > 0;
  return <div className="p-5 sm:p-8"><PageHeader title="Check manually entered invoice units" subtitle="Compare the invoice values and entered units. Finance and payment are separate."
    actions={<Badge>{data?.reviewState ?? "Review"}</Badge>} />
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading manual review…</p> : !data ? <p role="alert">Review details are unavailable. Refresh before continuing.</p> : <>
      <Panel title="Original invoice"><div className="space-y-3 p-5 text-sm">
        {data.original ? <><p className="font-medium">{data.original.invoiceNumber} · {data.original.invoiceDate}</p>
          <p>{data.original.currencyCode} {data.original.grossAmount} total · Net {data.original.netAmount} · Tax {data.original.taxAmount}</p>
          <div className="overflow-x-auto"><RecordTable><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
            <tbody>{data.original.lines.map(line => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.taxAmount}</td></tr>)}</tbody></RecordTable></div></>
          : <p>The original invoice changed. This review is read-only until a new review is requested.</p>}
        {data.blockers.length > 0 && <ul className="list-disc pl-5">{data.blockers.map((code, index) => <li key={`${index}:${code}`}>{manualUnitBlockerText(code)}</li>)}</ul>}
      </div></Panel>
      <Panel title="Manually entered units" className="mt-5"><div className="space-y-3 p-5 text-sm">
        <p>Maker reason: {data.makerReason}</p><div className="overflow-x-auto"><RecordTable><thead><tr><th>Invoice line</th><th>Entered unit</th></tr></thead>
          <tbody>{data.manualUnitLines.map(line => <tr key={line.invoiceLineId}><td>{manualUnitLineLabel(data.original?.lines, line.invoiceLineId)}</td>
            <td>{line.unitCode}</td></tr>)}</tbody></RecordTable></div>
        <p>Confirm only the entered units and invoice values shown here. No document is represented by this review.</p>
      </div></Panel>
      <Panel title="Your decision" className="mt-5"><div className="space-y-3 p-5 text-sm">
        {pending.blocked ? <><p role="alert">A previous decision has an unconfirmed response. Another decision is blocked.</p>
          {pending.pending ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved decision</Button>
            : <p>Recovery information is unavailable in this browser. Ask an administrator to inspect saved history.</p>}</>
          : canDecide ? data.actionCandidates.map(action => <Button key={action} variant={action === "Approve" ? "primary" : "secondary"}
            onClick={() => setChoice({ action, reason: "", attested: false, assignmentId: data.assignments[0].assignmentId,
              assignmentVersion: data.assignments[0].assignmentVersion })}>{action === "Approve" ? "Confirm entered units" : action === "Return" ? "Return for changes" : "Reject"}</Button>)
            : <p>No current decision is available for your assignment.</p>}
      </div></Panel></>}
    <Link className="mt-5 inline-block text-primary underline" to="/approvals">Back to approvals</Link>
    {choice && !pending.blocked && <ApprovalDecisionDialog action={choice.action} recordLabel="manually entered invoice units" reason={choice.reason}
      busy={busy} error={error} attestationRequired approvalReasonRequired
      attestationLabel="I checked the manually entered unit names against this invoice and confirm the values shown for its lines."
      attested={choice.attested} onAttestation={checked => setChoice({ ...choice, attested: checked })}
      onReason={reason => setChoice({ ...choice, reason })} onConfirm={() => void decide()} onCancel={() => setChoice(null)} />}
  </div>;
}
