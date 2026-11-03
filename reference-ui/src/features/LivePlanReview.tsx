import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Modal, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { ActivityTimeline } from "../components/data/DetailPrimitives";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import { formatBudgetAmount } from "../../../src/platform/procurement-budget-amount";
import { getPlanRound, getPlanReviewHistory, listPlanReviewTasks, recoverPlanReview, sendPlanReview, planDecisionCommand, planWithdrawCommand, validPlanWithdrawalReason,
  type PlanReviewCommand, type PlanReviewReceipt, type PlanRound, type PlanTaskPage, type PlanHistory } from "../../../src/platform/procurement-plan-review-api";
import type { PlanDetail } from "../../../src/platform/procurement-plans-api";
import { usePlanReviewContext, PlanContextBoundary } from "../lib/PlanReviewContext";
import { planReviewWritesAvailable, canPlanReviewAction } from "../lib/plan-review-access";
import { planReviewJournal } from "../lib/plan-review-journal";
const message = (e: unknown) => e instanceof Error ? e.message : "Plan review is unavailable.";
export const planStatusLabel = (s: string) => ({ Draft: "Draft", Submitted: "Awaiting review", Reviewed: "Awaiting final approval",
  Returned: "Changes requested", Approved: "Approved", Rejected: "Rejected", Withdrawn: "Withdrawn", Cancelled: "Cancelled", Pending: "In progress" }[s] ?? s);

export function PlanReviewRecovery({ onRecovered }: { onRecovered?: (r: PlanReviewReceipt) => void }) {
  const { readiness, scope } = usePlanReviewContext(); const journal = planReviewJournal(scope);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!readiness.capabilities.planReviewRead || !journal.state().blocked) return null;
  const pending = journal.state().pending;
  return <Panel className="mb-5"><div className="space-y-3 p-5" role="alert"><p className="font-semibold">Check the previous plan action</p>
    <p className="text-sm">Its response was not confirmed. Check the original saved result before another review action.</p>
    {pending ? <Button variant="secondary" disabled={busy} onClick={() => {
      if (busy) return; setBusy(true); setError("");
      void recoverPlanReview(scope, pending).then(result => {
        if (scope.current() && journal.confirm(pending, result)) onRecovered?.(result);
        else if (scope.current()) throw new Error("The original result still needs review.");
      }).catch(e => { if (scope.current()) setError(message(e)); }).finally(() => { if (scope.current()) setBusy(false); });
    }}>{busy ? "Checking…" : "Check saved result"}</Button> : <p className="text-sm">The saved reference cannot be read. Ask Procurement to reconcile this plan before another change.</p>}
    {error && <p className="text-sm" role="alert">{error}</p>}
  </div></Panel>;
}

export function PlanReviewQueue({ openSubmission }: { openSubmission?: (id: string) => void }) {
  return <PlanContextBoundary><PlanReviewQueueRecord openSubmission={openSubmission} /></PlanContextBoundary>;
}
function PlanReviewQueueRecord({ openSubmission }: { openSubmission?: (id: string) => void }) {
  const { scope, readiness, key } = usePlanReviewContext();
  const [data, setData] = useState<PlanTaskPage | null>(null), [error, setError] = useState("");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const canRead = readiness.capabilities.planReviewRead && readiness.permissions.includes("procurement-plan-review-read");
  useEffect(() => {
    if (!canRead) return; const abort = new AbortController(); setData(null); setError(""); setLoading(true);
    listPlanReviewTasks(scope, page, abort.signal).then(x => { if (!abort.signal.aborted && scope.current()) setData(x); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setError(message(e)); })
      .finally(() => { if (!abort.signal.aborted && scope.current()) setLoading(false); });
    return () => abort.abort();
  }, [key, page, revision, canRead]);
  if (!canRead) return <p role="alert" className="p-5">Plan review tasks are not available for this account and company.</p>;
  return <><PlanReviewRecovery onRecovered={() => setRevision(x => x + 1)} /><Panel title="Plans to review"><div className="space-y-4 p-5">
    <p className="text-sm text-muted-foreground">Review the saved submitted forecast. A plan does not approve spending or reserve funds.</p>
    <Button variant="secondary" onClick={() => setRevision(x => x + 1)}>Refresh plan tasks</Button>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading plan tasks…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
      <thead><tr><th>Plan</th><th>Currency</th><th>Stage</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{data.items.map(row => <tr key={row.assignmentId}><td>{row.plan.number}</td><td>{row.plan.currencyCode}</td><td>{row.code === "Final" ? "Final approval" : "Review"}</td><td><Badge>{planStatusLabel(row.plan.status)}</Badge></td>
        <td><Button variant="secondary" onClick={() => openSubmission ? openSubmission(row.submissionId) : setSelected(row.submissionId)}>Review submitted plan</Button></td></tr>)}</tbody>
    </RecordTable></div> : !error && <EmptyState title="No plans waiting for you" description="Your current assigned plan reviews will appear here." />}
    {data?.capped && <p role="status">This task list reached its reviewed limit. Complete current tasks and refresh; it is not a complete count of all company plans.</p>}
    {data && data.total > data.pageSize && <div className="flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(x => x + 1)}>Next</Button></div>}
  </div></Panel>{selected && <PlanRoundDialog submissionId={selected} onClose={() => { setSelected(null); setRevision(x => x + 1); }} />}</>;
}

export function PlanHistoryPanel({ planId, openSubmission }: { planId: string; openSubmission: (id: string) => void }) {
  const { scope, readiness, key } = usePlanReviewContext(); const [data, setData] = useState<PlanHistory | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!readiness.capabilities.planReviewRead || !readiness.permissions.includes("procurement-plan-read")) return;
    const abort = new AbortController(); setData(null); setError("");
    getPlanReviewHistory(scope, planId, abort.signal).then(x => { if (!abort.signal.aborted && scope.current()) setData(x); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setError(message(e)); });
    return () => abort.abort();
  }, [key, planId]);
  if (!readiness.capabilities.planReviewRead) return null;
  return <Panel title="Review history" className="mt-5"><div className="space-y-4 p-5">
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading review history…</p> : !data.rounds.length ? <p>No review rounds yet.</p> : <>
      <div className="overflow-x-auto"><RecordTable><thead><tr><th>Submitted version</th><th>State</th><th>Submitted</th><th>Original forecast</th></tr></thead><tbody>{data.rounds.map(r => <tr key={r.id}><td>{r.submittedPlanVersion}</td><td><Badge>{planStatusLabel(r.state)}</Badge></td><td>{new Date(r.submittedAt).toLocaleString()}</td><td><Button variant="secondary" onClick={() => openSubmission(r.id)}>Open submitted version</Button></td></tr>)}</tbody></RecordTable></div>
      <ActivityTimeline items={data.decisions.map(d => ({ id: d.id, title: d.action === "Return" ? "Sent back for changes" : d.action, detail: d.reason ?? "", date: d.decidedAt }))} />
    </>}
  </div></Panel>;
}

export function PlanOwnerReviewActions({ record, onChanged, openSubmission }: { record: PlanDetail; onChanged: () => void; openSubmission: (id: string) => void }) {
  const { readiness, scope } = usePlanReviewContext(); const journal = planReviewJournal(scope);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reason, setReason] = useState(""), [currency, setCurrency] = useState("");
  const allowed = record.allowedActions ?? [];
  const canWrite = planReviewWritesAvailable(readiness, scope);
  const submit = canPlanReviewAction(readiness, scope, allowed, "Submit", "procurement-plan-submit");
  const claim = ["procurement-plan-edit", "procurement-plan-claim-scope-all"].some(permission => canPlanReviewAction(readiness, scope, allowed, "ClaimScope", permission));
  const perform = async (operation: "Submit" | "ClaimScope") => {
    if (busy || journal.state().blocked || !(operation === "Submit" ? submit : claim)) return;
    const command: PlanReviewCommand = { key: crypto.randomUUID(), planId: record.id, operation, submissionId: null, assignmentId: null,
      body: operation === "Submit" ? JSON.stringify({ expectedPlanVersion: record.version }) : JSON.stringify({ version: record.version, confirmStoredCurrencyCode: currency.trim(), reason: reason.trim() }) };
    const { body: _, ...locator } = command;
    if (!journal.claim(locator)) return;
    setBusy(true); setError("");
    try { const receipt = await sendPlanReview(scope, command); if (scope.current() && journal.confirm(locator, receipt)) { onChanged(); if (receipt.submissionId) openSubmission(receipt.submissionId); } }
    catch (e) { if (scope.current()) setError(message(e)); } finally { if (scope.current()) setBusy(false); }
  };
  return <><PlanReviewRecovery onRecovered={() => onChanged()} />{error && <p role="alert">{error}</p>}
    {submit && <Button className="my-4" disabled={busy || journal.state().blocked} onClick={() => void perform("Submit")}>Send plan for review</Button>}
    {allowed.includes("Withdraw") && canWrite && <p className="mt-4 text-sm">Open the current submitted version in Review history to withdraw it using its current review version.</p>}
    {claim && <Panel title="Assign this legacy plan to the selected branch" className="mt-5"><div className="space-y-3 p-5"><p className="text-sm">The plan's saved currency is {record.currencyCode}. Confirm it without converting or changing the estimates. This assigns the plan to the branch selected in Organisation context.</p>
      <Field label="Confirm saved currency"><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></Field>
      <Field label="Branch assignment reason"><Textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <Button disabled={busy || journal.state().blocked || currency.trim() !== record.currencyCode || !reason.trim()} onClick={() => void perform("ClaimScope")}>Assign selected branch</Button>
    </div></Panel>}
  </>;
}

export function PlanRoundDialog({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  const { scope, readiness, key } = usePlanReviewContext(); const journal = planReviewJournal(scope);
  const [data, setData] = useState<PlanRound | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false), [reason, setReason] = useState(""), [intent, setIntent] = useState<{ action: "Approve" | "Return" | "Reject"; assignmentId: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError(""); setLoading(true); setIntent(null); setWithdrawing(false);
    getPlanRound(scope, submissionId, abort.signal).then(x => { if (!abort.signal.aborted && scope.current()) setData(x); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setError(message(e)); })
      .finally(() => { if (!abort.signal.aborted && scope.current()) setLoading(false); });
    return () => abort.abort();
  }, [key, submissionId, revision]);
  const writable = planReviewWritesAvailable(readiness, scope);
  const execute = async (withdraw: boolean) => {
    if (!data || busy || !writable || journal.state().blocked || withdraw && !validPlanWithdrawalReason(reason)) return;
    const assignment = data.stages.flatMap(s => s.assignments).find(a => a.id === intent?.assignmentId);
    if (withdraw ? !data.allowedActions.includes("Withdraw") || !readiness.permissions.includes("procurement-plan-withdraw")
      : !intent || !assignment || assignment.assigneeSubjectId !== scope.identity.principalId || !assignment.allowedActions.includes(intent.action)) return;
    const stage = data.stages.find(s => s.assignments.some(a => a.id === assignment?.id));
    if (!withdraw && (!stage || !readiness.permissions.includes(stage.code === "Final" ? "procurement-plan-approve" : "procurement-plan-review"))) return;
    const command = withdraw ? planWithdrawCommand(data, reason, crypto.randomUUID())
      : planDecisionCommand(data, assignment!.id, intent!.action, reason, crypto.randomUUID());
    const { body: _, ...locator } = command;
    if (!journal.claim(locator)) return; setBusy(true); setError("");
    try { const saved = await sendPlanReview(scope, command); if (scope.current() && journal.confirm(locator, saved)) setRevision(x => x + 1); }
    catch (e) { if (scope.current()) setError(message(e)); }
    finally { if (scope.current()) { setBusy(false); setIntent(null); setWithdrawing(false); } }
  };
  return <Modal title="Submitted purchase plan" onClose={() => { if (!busy) onClose(); }}>
    <PlanReviewRecovery onRecovered={() => setRevision(x => x + 1)} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {loading ? <p role="status">Loading submitted plan…</p> : data ? <div className="space-y-5">
      <Panel title={data.submittedSnapshot.financialPeriodRef}><div className="space-y-3 p-5 text-sm"><p>{data.planNumber} · Submitted version {data.submittedPlanVersion}</p><Badge>{planStatusLabel(data.state)}</Badge>
        <p>This is the verified submitted forecast. Current plan version: {data.planVersion}. Later edits do not replace this submitted version.</p>
        <p>{formatBudgetAmount(data.submittedSnapshot.estimatedAmount, data.currencyCode)} · {data.submittedSnapshot.fundingSourceRef || "No funding reference"}</p>
      </div></Panel>
      <Panel title="Submitted planned needs"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Need</th><th>Quantity</th><th>Unit</th><th>Estimated amount</th><th>Expected</th></tr></thead><tbody>{data.submittedSnapshot.lines.map(l => <tr key={l.id}><td>{l.description}</td><td>{l.estimatedQuantity}</td><td>{l.unitCode}</td><td>{formatBudgetAmount(l.estimatedAmount, data.currencyCode)}</td><td>{l.expectedOn || "—"}</td></tr>)}</tbody></RecordTable></div></Panel>
      {data.stages.map(stage => <Panel key={stage.id} title={stage.code === "Final" ? "Final approval" : "Plan review"}><div className="space-y-3 p-5"><Badge>{planStatusLabel(stage.state)}</Badge>
        {stage.assignments.filter(a => a.assigneeSubjectId === scope.identity.principalId).map(a => <div key={a.id} className="flex flex-wrap gap-3">{writable && readiness.permissions.includes(stage.code === "Final" ? "procurement-plan-approve" : "procurement-plan-review") && a.allowedActions.filter((x): x is "Approve" | "Return" | "Reject" => ["Approve", "Return", "Reject"].includes(x)).map(action => <Button key={action} variant={action === "Reject" ? "danger" : "secondary"} disabled={busy || journal.state().blocked} onClick={() => { setReason(""); setIntent({ action, assignmentId: a.id }); }}>{action === "Return" ? "Send back" : action === "Approve" ? stage.code === "Final" ? "Approve plan" : "Mark as reviewed" : "Reject"}</Button>)}</div>)}
      </div></Panel>)}
      {writable && data.allowedActions.includes("Withdraw") && readiness.permissions.includes("procurement-plan-withdraw") && <Button variant="secondary" disabled={busy || journal.state().blocked} onClick={() => { setReason(""); setWithdrawing(true); }}>Withdraw from review</Button>}
      <Panel title="Review decisions"><div className="p-5"><ActivityTimeline items={data.decisions.map(d => ({ id: d.id, title: d.action === "Return" ? "Sent back for changes" : d.action, detail: d.reason ?? "", date: d.decidedAt }))} /></div></Panel>
      {!writable && <p className="text-sm">Review changes are unavailable. You can still read the submitted evidence and decisions.</p>}
    </div> : null}
    {intent && <ApprovalDecisionDialog recordLabel="plan" action={intent.action} reason={reason} busy={busy} onReason={setReason}
      onConfirm={() => void execute(false)} onCancel={() => setIntent(null)} />}
    {withdrawing && <Modal title="Withdraw plan from review" onClose={() => { if (!busy) setWithdrawing(false); }}><Field label="Withdrawal reason"><Textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field><Button disabled={busy || journal.state().blocked || !validPlanWithdrawalReason(reason)} onClick={() => void execute(true)}>Confirm withdrawal</Button></Modal>}
  </Modal>;
}
