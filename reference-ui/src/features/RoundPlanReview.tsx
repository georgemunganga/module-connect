import { useEffect, useState } from "react";
import { Badge, Button, Field, Modal, Textarea } from "../components/ui";
import { DetailSection } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { useRoundPlanContext } from "../lib/RoundPlanContext";
import { roundReviewActionAvailable, roundReviewReadAvailable } from "../lib/round-plan-access";
import { roundReviewJournal } from "../lib/round-plan-review-journal";
import { RoundPlanContentEvidence } from "./RoundPlanEvidence";
import { RoundPlanError, type RoundRecord, type RoundScope } from "../../../src/platform/procurement-round-plan-api";
import { getRoundReviewDetail, getRoundSubmitContext, listRoundReviewTasks, recoverRoundReview, roundDecisionCommand, roundSubmitCommand, sendRoundReview,
  type RoundDecision, type RoundReviewDetail, type RoundReviewReceipt, type RoundReviewTask, type RoundSubmitContext } from "../../../src/platform/procurement-round-plan-review-api";
const explain = (e: unknown) => e instanceof Error ? e.message : "Evaluation-plan review is unavailable.";
export function RoundReviewRecovery({ scope, onRecovered }: { scope: RoundScope; onRecovered: (receipt: RoundReviewReceipt) => void }) {
  const journal = roundReviewJournal(scope), state = journal.state(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!state.blocked) return null;
  return <div role="alert" className="space-y-3 rounded-lg border border-border p-4"><p className="font-medium">Check the previous evaluation-plan review action</p>
    <p className="text-sm">Its result was not confirmed. No command will be repeated. Check the original saved result before another review action.</p>
    {state.pending ? <><p className="break-all text-sm">Save reference: {state.pending.key}</p><Button variant="secondary" disabled={busy} onClick={() => {
      if (busy || !state.pending) return; setBusy(true); setError(""); const locator = state.pending;
      void recoverRoundReview(scope, locator).then(result => { if (scope.current() && journal.confirm(locator, result)) onRecovered(result); })
        .catch(e => { if (scope.current()) setError(explain(e)); }).finally(() => { if (scope.current()) setBusy(false); });
    }}>{busy ? "Checking…" : "Check saved review result"}</Button></> : <p className="text-sm">The saved reference cannot be read. Ask Procurement to reconcile it before another review action.</p>}
    {error && <p role="alert">{error}</p>}</div>;
}
export function RoundSubmitAction({ record, onChanged }: { record: RoundRecord; onChanged: () => void }) {
  const { scope, readiness, key } = useRoundPlanContext(), [opened, setOpened] = useState(false);
  if (!roundReviewActionAvailable(readiness, scope, record.allowedActions, "Submit") || !record.applicableReviewPolicy) return null;
  return <><Button disabled={roundReviewJournal(scope).state().blocked} onClick={() => setOpened(true)}>Send evaluation plan for review</Button>
    {opened && <RoundSubmitDialog key={key} record={record} scope={scope} canSubmit={() => roundReviewActionAvailable(readiness, scope, record.allowedActions, "Submit")} onClose={() => setOpened(false)} onChanged={() => { setOpened(false); onChanged(); }} />}</>;
}
function RoundSubmitDialog({ record, scope, canSubmit, onClose, onChanged }: { record: RoundRecord; scope: RoundScope; canSubmit: () => boolean; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<RoundSubmitContext | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), journal = roundReviewJournal(scope);
  useEffect(() => { const abort = new AbortController();
    getRoundSubmitContext(scope, record.source.id, abort.signal).then(value => {
      if (abort.signal.aborted || !scope.current()) return;
      if (value.eventVersion !== record.source.version || value.planId !== record.plan?.id || value.planVersion !== record.plan?.version
        || value.revisionId !== record.revision?.id || value.contentSha256 !== record.revision?.contentSha256) { setError("The saved plan changed. Close this action and refresh the RFQ before reviewing it again."); return; }
      setData(value);
    }).catch(e => { if (!abort.signal.aborted && scope.current()) setError(explain(e)); });return () => abort.abort();
  }, [record.source.id]);
  async function submit() {
    if (busy || !data || !canSubmit() || journal.state().blocked) return;
    const command = roundSubmitCommand(data, crypto.randomUUID()), { body: _, ...locator } = command;
    if (!journal.claim(locator)) { setError("Keep the earlier save reference before another action."); return; }
    setBusy(true); setError("");
    try { const result = await sendRoundReview(scope, command); if (scope.current() && journal.confirm(locator, result)) onChanged(); }
    catch (e) { if (scope.current()) { if (e instanceof RoundPlanError) journal.rejectValidation(locator, e.status); setError(explain(e)); } }
    finally { if (scope.current()) setBusy(false); }
  }
  return <Modal title="Send evaluation plan for review" onClose={() => { if (!busy) onClose(); }}><div className="space-y-4">
    <p className="text-sm">Send this saved version to the currently configured independent reviewers. This does not publish the RFQ to suppliers.</p>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Checking the current saved version and review rule…</p>}
    {data && <p className="text-sm">Saved version {data.planVersion} · Review rule version {data.applicableReviewPolicy?.policyVersionNumber ?? "unavailable"}.</p>}
    <RoundReviewRecovery scope={scope} onRecovered={onChanged} />
    <div className="flex gap-3"><Button disabled={busy || !data?.allowedActions.includes("Submit") || !data?.applicableReviewPolicy || journal.state().blocked || !canSubmit()} onClick={() => void submit()}>{busy ? "Sending…" : "Confirm review submission"}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Back to RFQ</Button></div>
  </div></Modal>;
}
export function RoundReviewDialog(props: { eventId: string; submissionId: string; onClose: () => void; onChanged?: () => void }) {
  const { key } = useRoundPlanContext(); return <RoundReviewDialogRecord key={key + props.submissionId} {...props} />;
}
function RoundReviewDialogRecord({ eventId, submissionId, onClose, onChanged }: { eventId: string; submissionId: string; onClose: () => void; onChanged?: () => void }) {
  const { scope, readiness, key } = useRoundPlanContext(), [data, setData] = useState<RoundReviewDetail | null>(null), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [action, setAction] = useState<RoundDecision | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const journal = roundReviewJournal(scope), canRead = roundReviewReadAvailable(readiness) && readiness.permissions.includes("procurement-round-plan-review");
  useEffect(() => { setData(null); setAction(null); setError(""); if (!canRead) return; const abort = new AbortController();
    getRoundReviewDetail(scope, eventId, submissionId, abort.signal).then(value => { if (!abort.signal.aborted && scope.current()) setData(value); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setError(explain(e)); }); return () => abort.abort();
  }, [key, eventId, submissionId, revision, canRead]);
  const refresh = () => { setRevision(x => x + 1); onChanged?.(); };
  async function decide() {
    if (!data || !action || busy || !roundReviewActionAvailable(readiness, scope, data.allowedActions, action) || journal.state().blocked) return;
    let command; try { command = roundDecisionCommand(data, action, reason, crypto.randomUUID()); } catch (e) { setError(explain(e)); return; }
    const { body: _, ...locator } = command; if (!journal.claim(locator)) { setError("Check the previous review result first."); return; }
    setBusy(true); setError("");
    try { const result = await sendRoundReview(scope, command); if (scope.current() && journal.confirm(locator, result)) { setAction(null); setReason(""); refresh(); } }
    catch (e) { if (scope.current()) { if (e instanceof RoundPlanError) journal.rejectValidation(locator, e.status); setAction(null); setError(explain(e)); } }
    finally { if (scope.current()) setBusy(false); }
  }
  return <Modal title="Submitted evaluation plan" onClose={() => { if (!busy) onClose(); }}><div className="space-y-5">
    {!canRead ? <p role="alert">This submitted plan is unavailable with your current access.</p> : <>
      <RoundReviewRecovery scope={scope} onRecovered={refresh} />{error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading the submitted version…</p>}
      {data && <><DetailSection title={`${data.eventHeader.number} · ${data.eventHeader.title}`}><div className="space-y-2 text-sm"><Badge>{data.currentStatus === "Published" ? "Plan approved" : data.currentStatus === "InReview" ? "Under review" : data.currentStatus}</Badge>
        <p>Submitted version {data.submittedVersion} · Current version {data.currentPlanVersion} · Review rule version {data.policyVersionNumber}.</p><p>{data.eventHeader.method} · {data.eventHeader.currencyCode}</p>
        <p className="break-all text-muted-foreground">Submitted content reference: {data.contentSha256}</p>
        {!data.currentRound && <p role="status">This is retained review evidence. No decision can be made on this historical or completed task.</p>}
        <p>This internal review does not contact suppliers, open bids or award work.</p></div></DetailSection>
        <RoundPlanContentEvidence content={data.submittedSnapshot} />
        <div className="flex flex-wrap gap-3">{(["Approve", "Return", "Reject"] as const).filter(a => roundReviewActionAvailable(readiness, scope, data.allowedActions, a)).map(a => <Button key={a} variant={a === "Reject" ? "danger" : "secondary"} disabled={busy || journal.state().blocked} onClick={() => { setAction(a); setReason(""); }}>{a === "Approve" ? "Approve evaluation plan" : a === "Return" ? "Return for changes" : "Reject evaluation plan"}</Button>)}</div>
        {action && <DetailSection title={action === "Approve" ? "Confirm evaluation-plan approval" : action === "Return" ? "Return evaluation plan" : "Reject evaluation plan"}>
          {action !== "Approve" && <Field label="Decision reason"><Textarea required maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></Field>}
          <p className="my-3 text-sm">ERP rechecks current scope, independence and the saved version. Approval can remain pending until the configured quorum is met.</p>
          <Button disabled={busy || journal.state().blocked || action !== "Approve" && (!reason.trim() || reason.trim().length > 2000)} onClick={() => void decide()}>{busy ? "Saving…" : "Confirm evaluation decision"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>Close decision</Button>
        </DetailSection>}
      </>}
      <Button variant="secondary" disabled={busy} onClick={refresh}>Refresh submitted plan</Button>
    </>}
  </div></Modal>;
}
export function RoundReviewQueue() {
  const { key } = useRoundPlanContext(); return <RoundReviewQueueRecord key={key} />;
}
function RoundReviewQueueRecord() {
  const { scope, readiness, key } = useRoundPlanContext(), canRead = roundReviewReadAvailable(readiness) && readiness.permissions.includes("procurement-round-plan-review");
  const [page, setPage] = useState<{ items: RoundReviewTask[]; nextCursor: string | null } | null>(null), [after, setAfter] = useState<string | null>(null), [previous, setPrevious] = useState<(string | null)[]>([]);
  const [error, setError] = useState(""), [revision, setRevision] = useState(0), [selected, setSelected] = useState<RoundReviewTask | null>(null);
  useEffect(() => { setPage(null); setError(""); setSelected(null); if (!canRead) return; const abort = new AbortController();
    listRoundReviewTasks(scope, after, abort.signal).then(value => { if (!abort.signal.aborted && scope.current()) setPage(value); }).catch(e => { if (!abort.signal.aborted && scope.current()) setError(explain(e)); });
    return () => abort.abort();
  }, [key, after, revision, canRead]);
  const refresh = () => setRevision(n => n + 1);
  if (!canRead) return <p role="alert">Assigned evaluation-plan reviews are unavailable with your current access.</p>;
  return <div className="space-y-5"><RoundReviewRecovery scope={scope} onRecovered={refresh} />
    <DetailSection title="Evaluation plans assigned to you">{error ? <p role="alert">{error}</p> : !page ? <p role="status">Loading assigned reviews…</p> : page.items.length ? <div className="overflow-x-auto"><RecordTable>
      <thead><tr><th>Submitted version</th><th>Current version</th><th>Task</th></tr></thead><tbody>{page.items.map(row => <tr key={row.assignmentId}><td>{row.submittedVersion}</td><td>{row.currentPlanVersion}</td><td><Button variant="secondary" onClick={() => setSelected(row)}>Review submitted evaluation plan</Button></td></tr>)}</tbody>
    </RecordTable></div> : <p>No current pending evaluation-plan reviews on this page. Your company and branch scope still apply.</p>}
      <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={!previous.length} onClick={() => { setAfter(previous.at(-1)!); setPrevious(x => x.slice(0, -1)); }}>Previous reviews</Button><Button variant="secondary" disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious(x => [...x, after]); setAfter(page.nextCursor); } }}>More reviews</Button><Button variant="secondary" onClick={refresh}>Refresh assigned reviews</Button></div>
    </DetailSection>{selected && <RoundReviewDialog key={key + selected.submissionId} eventId={selected.eventId} submissionId={selected.submissionId} onClose={() => setSelected(null)} onChanged={refresh} />}
  </div>;
}
