import { roundInstantToLocal, roundBrowserTimeZone, type RoundScheduleEdits, type RoundScheduleField } from "../../../shared/procurement-round-schedule";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { DetailSection } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import type { RoundDraft, RoundCriterion, RoundParticipant } from "../../../src/platform/procurement-round-plan-api";
export const emptyRoundDraft = (): RoundDraft => ({ requirements: null, proposedPolicyReference: null, disclosureProposal: null, documentRequirements: null,
  opensAt: null, closesAt: null, technicalReleaseAt: null, commercialReleaseAt: null, criteria: [], participants: [] });
const optional = (text: string) => text || null;
export const roundDutyLabel = (duty: string) => ({ Planner: "Planner", Reviewer: "Plan reviewer", OpeningOfficer: "Opening officer", TechnicalEvaluator: "Technical evaluator", CommercialEvaluator: "Commercial evaluator", ConflictReviewer: "Conflict reviewer" }[duty] ?? duty);
export function RoundPlanDraftFields({ draft, onChange, disabled, people, participantNames, search, onSearch, searchBusy, searchError, hasMore, onMore, scheduleEdits, onScheduleChange }: {
  draft: RoundDraft; onChange: (draft: RoundDraft) => void; disabled: boolean;
  participantNames: { principalId: string; displayName: string }[];
  people: { principalId: string; displayName: string }[]; search: string; onSearch: (text: string) => void;
  scheduleEdits: RoundScheduleEdits; onScheduleChange: (field: RoundScheduleField, value: string) => void;
  searchBusy: boolean; searchError: string; hasMore: boolean; onMore: () => void;
}) {
  const field = <K extends keyof RoundDraft>(key: K, value: RoundDraft[K]) => onChange({ ...draft, [key]: value });
  const criterion = (id: string, patch: Partial<RoundCriterion>) => field("criteria", draft.criteria.map(c => c.logicalId === id ? { ...c, ...patch } : c));
  const participant = (id: string, patch: Partial<RoundParticipant>) => field("participants", draft.participants.map(p => p.logicalId === id ? { ...p, ...patch } : p));
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">This saves an incomplete planning proposal. It does not approve criteria, assign ERP permissions, invite suppliers or publish the RFQ. Enter your own proposed weights and thresholds; none are preapproved here.</p>
    <div className="grid gap-5 lg:grid-cols-2">
      <DetailSection title="Requirement"><Field label="Requirements"><Textarea maxLength={10000} disabled={disabled} value={draft.requirements ?? ""} onChange={e => field("requirements", optional(e.target.value))} /></Field></DetailSection>
      <DetailSection title="Eligibility and terms"><div className="space-y-4"><Field label="Proposed policy reference"><Input maxLength={200} disabled={disabled} value={draft.proposedPolicyReference ?? ""} onChange={e => field("proposedPolicyReference", optional(e.target.value))} /></Field>
        <Field label="Proposed disclosure terms"><Textarea maxLength={10000} disabled={disabled} value={draft.disclosureProposal ?? ""} onChange={e => field("disclosureProposal", optional(e.target.value))} /></Field></div></DetailSection>
      <DetailSection title="Response documents required"><Field label="Proposed document requirements"><Textarea maxLength={10000} disabled={disabled} value={draft.documentRequirements ?? ""} onChange={e => field("documentRequirements", optional(e.target.value))} /></Field><p className="mt-2 text-sm text-muted-foreground">Describe requirements only. Supporting files will be added in a later step.</p></DetailSection>
      <DetailSection title="Proposed schedule"><div className="space-y-3">{([
        ["opensAt", "Opening time"], ["closesAt", "Closing time"], ["technicalReleaseAt", "Technical release time"], ["commercialReleaseAt", "Commercial release time"],
      ] as const).map(([key, label]) => <Field key={key} label={label}><Input type="datetime-local" step="0.001" disabled={disabled} value={scheduleEdits[key] ?? roundInstantToLocal(draft[key])} onChange={e => onScheduleChange(key, e.target.value)} /></Field>)}<p className="text-sm text-muted-foreground">Times use your browser’s local time zone ({roundBrowserTimeZone()}). The saved proposal also records the company’s time zone for reference. Saving does not schedule a release.</p></div></DetailSection>
    </div>
    <DetailSection title="Evaluation criteria (proposed)"><div className="space-y-4">{draft.criteria.map((c, index) => <div key={c.logicalId} className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-3"><Field label={`Criterion ${index + 1} code`}><Input disabled={disabled} maxLength={80} value={c.code} onChange={e => criterion(c.logicalId, { code: e.target.value })} /></Field>
        <Field label="Stage"><Select disabled={disabled} value={c.stage} onChange={e => criterion(c.logicalId, { stage: e.target.value as RoundCriterion["stage"] })}><option value="Mandatory">Mandatory checks</option><option value="Technical">Technical</option><option value="Commercial">Commercial</option></Select></Field>
        <Field label="Assessment"><Select disabled={disabled} value={c.kind} onChange={e => criterion(c.logicalId, e.target.value === "PassFail" ? { kind: "PassFail", weight: null, maximumScore: null, minimumScore: null } : { kind: "Weighted" })}><option value="PassFail">Pass or fail</option><option value="Weighted">Weighted score</option></Select></Field></div>
      <Field label="Description"><Textarea disabled={disabled} maxLength={2000} value={c.description ?? ""} onChange={e => criterion(c.logicalId, { description: optional(e.target.value) })} /></Field>
      <Field label="Scoring guidance"><Textarea disabled={disabled} maxLength={10000} value={c.rubric ?? ""} onChange={e => criterion(c.logicalId, { rubric: optional(e.target.value) })} /></Field>
      {c.kind === "Weighted" && <div className="grid gap-3 sm:grid-cols-3">{([["weight", "Proposed weight"], ["minimumScore", "Proposed minimum score"], ["maximumScore", "Proposed maximum score"]] as const).map(([key, label]) => <Field key={key} label={label}><Input type="text" inputMode="decimal" disabled={disabled} value={c[key] ?? ""} onChange={e => criterion(c.logicalId, { [key]: optional(e.target.value) })} /></Field>)}</div>}
      <Button variant="ghost" disabled={disabled} onClick={() => field("criteria", draft.criteria.filter(row => row.logicalId !== c.logicalId).map((row, at) => ({ ...row, order: at + 1 })))}>Remove criterion {index + 1}</Button>
    </div>)}{!draft.criteria.length && <p className="text-sm">No proposed criteria yet.</p>}
      <Button variant="secondary" disabled={disabled || draft.criteria.length >= 100} onClick={() => field("criteria", [...draft.criteria, { logicalId: crypto.randomUUID(), order: draft.criteria.length + 1, code: "", stage: "Mandatory", kind: "PassFail", description: null, rubric: null, weight: null, maximumScore: null, minimumScore: null }])}>Add criterion</Button>
    </div></DetailSection>
    <DetailSection title="Internal colleagues"><div className="space-y-4"><p className="text-sm text-muted-foreground">Planning participants only. ERP permissions and approval routing remain separate. Select a current ERP account. An employee record is not required.</p>
      <Field label="Find a colleague"><Input disabled={disabled} maxLength={100} value={search} onChange={e => onSearch(e.target.value)} /></Field>
      {searchBusy && <p role="status">Finding current colleagues…</p>}{searchError && <p role="alert">{searchError}</p>}
      {!!people.length && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Colleague</th><th>Action</th></tr></thead><tbody>{people.map(p => <tr key={p.principalId}><td>{p.displayName}</td><td><Button variant="secondary" disabled={disabled || draft.participants.length >= 100 || draft.participants.some(row => row.principalId === p.principalId && row.duty === "Planner")} onClick={() => field("participants", [...draft.participants, { logicalId: crypto.randomUUID(), order: draft.participants.length + 1, principalId: p.principalId, duty: "Planner", conflictNote: null }])}>Add colleague</Button></td></tr>)}</tbody></RecordTable></div>}
      {hasMore && <Button variant="secondary" disabled={disabled || searchBusy} onClick={onMore}>More colleagues</Button>}
      {draft.participants.map((p, index) => <div key={p.logicalId} className="space-y-3 rounded-lg border border-border p-4"><p className="text-sm font-medium">{participantNames.find(person => person.principalId === p.principalId)?.displayName ?? p.principalId}</p>
        <Field label={`Colleague ${index + 1} duty`}><Select disabled={disabled} value={p.duty} onChange={e => participant(p.logicalId, { duty: e.target.value as RoundParticipant["duty"] })}>{["Planner", "Reviewer", "OpeningOfficer", "TechnicalEvaluator", "CommercialEvaluator", "ConflictReviewer"].map(duty => <option key={duty} value={duty}>{roundDutyLabel(duty)}</option>)}</Select></Field>
        <Field label="Declared conflict note"><Textarea disabled={disabled} maxLength={2000} value={p.conflictNote ?? ""} onChange={e => participant(p.logicalId, { conflictNote: optional(e.target.value) })} /></Field>
        <Button variant="ghost" disabled={disabled} onClick={() => field("participants", draft.participants.filter(row => row.logicalId !== p.logicalId).map((row, at) => ({ ...row, order: at + 1 })))}>Remove colleague {index + 1}</Button>
      </div>)}
    </div></DetailSection>
  </div>;
}
