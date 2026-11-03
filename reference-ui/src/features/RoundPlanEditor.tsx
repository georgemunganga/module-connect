import type { RoundScheduleEdits } from "../../../shared/procurement-round-schedule";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Modal, Textarea } from "../components/ui";
import { RoundPlanDraftFields, emptyRoundDraft } from "./RoundPlanDraftFields";
import { draftFromRound } from "./RoundPlanEvidence";
import { roundCommand, sendRoundPlan, recoverRoundPlan, RoundPlanError, type RoundDraft, type RoundRecord, type RoundScope, type RoundReceipt } from "../../../src/platform/procurement-round-plan-api";
import { roundPlanJournal } from "../lib/round-plan-journal";
export type RoundPeopleProvider = (search: string, offset: number, signal: AbortSignal) => Promise<{ items: { principalId: string; displayName: string }[]; nextOffset: number | null }>;
const explain = (e: unknown) => e instanceof Error ? e.message : "The evaluation plan is unavailable.";
const trimmed = (text: string | null) => text?.trim() || null;
function cleanDraft(draft: RoundDraft): RoundDraft {
  return { ...draft, requirements: trimmed(draft.requirements), proposedPolicyReference: trimmed(draft.proposedPolicyReference), disclosureProposal: trimmed(draft.disclosureProposal), documentRequirements: trimmed(draft.documentRequirements),
    opensAt: trimmed(draft.opensAt), closesAt: trimmed(draft.closesAt), technicalReleaseAt: trimmed(draft.technicalReleaseAt), commercialReleaseAt: trimmed(draft.commercialReleaseAt),
    criteria: draft.criteria.map(c => ({ ...c, code: c.code.trim(), description: trimmed(c.description), rubric: trimmed(c.rubric), weight: trimmed(c.weight), minimumScore: trimmed(c.minimumScore), maximumScore: trimmed(c.maximumScore) })),
    participants: draft.participants.map(p => ({ ...p, conflictNote: trimmed(p.conflictNote) })) };
}
export function RoundPlanRecovery({ scope, eventId, onRecovered }: { scope: RoundScope; eventId: string; onRecovered: (receipt: RoundReceipt) => void }) {
  const journal = roundPlanJournal(scope, eventId), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const state = journal.state(); if (!state.blocked) return null;
  return <div className="space-y-3 rounded-lg border border-border p-4" role="alert"><p className="font-medium">Check the previous evaluation-plan action</p><p className="text-sm">Its response was not confirmed. Check the original saved result before another action.</p>
    {state.pending ? <><p className="break-all text-sm text-muted-foreground">Save reference: {state.pending.key}</p><Button variant="secondary" disabled={busy} onClick={() => {
      if (busy || !state.pending) return; setBusy(true); setError("");
      void recoverRoundPlan(scope, state.pending).then(result => { if (scope.current() && journal.confirm(state.pending!, result)) onRecovered(result); })
        .catch(e => { if (scope.current()) setError(explain(e)); }).finally(() => { if (scope.current()) setBusy(false); });
    }}>{busy ? "Checking…" : "Check saved result"}</Button></> : <p className="text-sm">The original reference cannot be read. Ask Procurement to reconcile the saved plan before another change.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
export function RoundPlanEditor({ scope, record, eventVersion, operation, peopleProvider, canAct, onClose, onSaved }: {
  scope: RoundScope; record: RoundRecord; eventVersion: number; operation: "Create" | "Revise" | "Cancel";
  peopleProvider: RoundPeopleProvider; canAct: () => boolean; onClose: () => void; onSaved: (receipt: RoundReceipt) => void;
}) {
  // Keep CAS bound to the content opened for editing; a background read must not silently rebase it.
  const [base] = useState(() => ({ eventId: record.source.id, eventVersion, planVersion: record.plan?.version ?? null }));
  const [draft, setDraft] = useState<RoundDraft>(() => operation === "Create" ? emptyRoundDraft() : draftFromRound(record));
  const [scheduleEdits, setScheduleEdits] = useState<RoundScheduleEdits>({});
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [searchBusy, setSearchBusy] = useState(false), [searchError, setSearchError] = useState(""), [offset, setOffset] = useState(0);
  const [people, setPeople] = useState<{ principalId: string; displayName: string }[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null);
  const journal = roundPlanJournal(scope, record.source.id);
  useEffect(() => {
    const controller = new AbortController(); setSearchError(""); setSearchBusy(false); setNextOffset(null);
    if (!canAct() || operation === "Cancel" || search.trim().length < 2) { setPeople([]); return; }
    const timer = window.setTimeout(() => {
      setSearchBusy(true);
      peopleProvider(search.trim(), offset, controller.signal).then(page => { if (!controller.signal.aborted && scope.current()) { setPeople(page.items); setNextOffset(page.nextOffset); } })
        .catch(e => { if (!controller.signal.aborted && scope.current()) setSearchError(explain(e)); }).finally(() => { if (!controller.signal.aborted && scope.current()) setSearchBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, offset, operation]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy || journal.state().blocked || !scope.current() || !canAct()) return;
    let command;
    try { command = roundCommand(base.eventId, base.eventVersion, base.planVersion, operation, crypto.randomUUID(), operation === "Cancel" ? undefined : cleanDraft(draft), operation === "Cancel" ? reason.trim() : undefined, scheduleEdits); }
    catch (e) { setError(explain(e)); return; }
    const { body: _, ...locator } = command;
    if (!journal.claim(locator)) { setError("The original save reference must be kept before changing this plan."); return; }
    setBusy(true); setError("");
    try { const receipt = await sendRoundPlan(scope, command); if (scope.current() && journal.confirm(locator, receipt)) onSaved(receipt); }
    catch (e) { if (scope.current()) { if (e instanceof RoundPlanError) journal.discardRejectedValidation(locator, e.status); setError(explain(e)); } }
    finally { if (scope.current()) setBusy(false); }
  };
  const knownPeople = [...people, ...(record.people ?? []).filter(p => !people.some(person => person.principalId === p.id)).map(p => ({ principalId: p.id, displayName: p.displayName }))];
  return <Modal title={operation === "Create" ? "Set up an evaluation plan" : operation === "Cancel" ? "Cancel evaluation plan" : "Revise evaluation plan"} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void save(event)} className="space-y-5">
      {error && <p role="alert">{error}</p>}<RoundPlanRecovery scope={scope} eventId={record.source.id} onRecovered={onSaved} />
      {operation === "Cancel" ? <><p className="text-sm">This retains the plan and its saved versions. It does not cancel the RFQ or release its reserved quantities. Use the existing RFQ cancellation after cancelling this plan if the source is no longer needed.</p><Field label="Plan cancellation reason"><Textarea required maxLength={2000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></Field></>
        : <><RoundPlanDraftFields scheduleEdits={scheduleEdits} onScheduleChange={(field, value) => setScheduleEdits(current => ({ ...current, [field]: value }))} draft={draft} onChange={setDraft} disabled={busy || journal.state().blocked} people={knownPeople} search={search} onSearch={text => { setSearch(text); setOffset(0); setPeople([]); }} searchBusy={searchBusy} searchError={searchError} hasMore={nextOffset !== null} onMore={() => { if (nextOffset !== null) setOffset(nextOffset); }} />
          {operation === "Create" && <p role="status" className="text-sm">Saving explicitly enrolls this RFQ in evaluation planning. Its existing review and publication actions will be unavailable until the next controlled workflow is connected.</p>}</>}
      <div className="flex flex-wrap gap-3"><Button type="submit" variant={operation === "Cancel" ? "danger" : "primary"} disabled={busy || journal.state().blocked || !canAct() || operation === "Cancel" && (!reason.trim() || reason.trim().length > 2000)}>{busy ? "Saving…" : operation === "Cancel" ? "Cancel evaluation plan" : "Save proposed plan"}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Back to RFQ</Button></div>
    </form>
  </Modal>;
}
